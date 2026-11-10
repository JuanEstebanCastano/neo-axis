/**
 * DIRECCIONES DE RECOMENDACIONES
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * "Parecidos a esto": dado un texto (?q=) o una entidad ya indexada
 * (?entityId=), devuelve las entidades más cercanas por similitud semántica.
 *
 * TENÉ EN CUENTA
 * Necesita EMBEDDINGS_URL configurada (Edge Function gte-small). El reindex
 * genera los vectores que falten.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { FastifyPluginAsync } from "fastify";
import { embedText, embeddingsEnabled } from "../../lib/embeddings.js";
import { recommendByEmbedding, backfillEmbeddings } from "../../lib/search.js";
import { canViewPost, PERMISSIONS } from "../../lib/rbac.js";
import { AppError, badRequest, notFound } from "../../lib/errors.js";
import { recommendQuery } from "./schemas.js";

const disabled = () =>
  new AppError(503, "embeddings_off", "Recomendaciones no configuradas (falta EMBEDDINGS_URL)");

export const recommendationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/recomendaciones", async (req) => {
    if (!embeddingsEnabled()) throw disabled();

    const q = recommendQuery.parse(req.query);

    let embedding: number[];
    let exclude: string | undefined;

    if (q.entityId) {
      const row = await app.db
        .selectFrom("searchDocuments")
        .select(["entityType", "title", "content"])
        .where("entityId", "=", q.entityId)
        .executeTakeFirst();
      if (!row) throw notFound("Esa entidad no está indexada");
      // Si es un post, no revelar/usar entidades que el solicitante no puede ver.
      if (row.entityType === "post") {
        const ok = await canViewPost(app.db, q.entityId, req.session?.userId ?? null);
        if (!ok) throw notFound("Esa entidad no está indexada");
      }
      embedding = await embedText([row.title, row.content].filter(Boolean).join("\n"));
      exclude = q.entityId;
    } else if (q.q) {
      embedding = await embedText(q.q);
    } else {
      throw badRequest("Indicá 'entityId' o 'q'");
    }

    const hits = await recommendByEmbedding(app.db, embedding, {
      excludeEntityId: exclude,
      limit: q.limit,
    });
    return { hits };
  });

  // Backfill de embeddings: operación costosa (hasta N llamadas a la Edge
  // Function). Sólo admin (users.manage_roles) y acotada por rate limit.
  app.post("/recomendaciones/reindex", {
    config: { rateLimit: { max: 2, timeWindow: "1 hour" } },
  }, async (req) => {
    if (!embeddingsEnabled()) throw disabled();
    await app.requirePermission(PERMISSIONS.usersManageRoles)(req);
    const indexed = await backfillEmbeddings(app.db, embedText);
    return { indexed };
  });
};
