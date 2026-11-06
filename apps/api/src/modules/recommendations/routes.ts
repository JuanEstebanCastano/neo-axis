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
import { z } from "zod";
import { embedText, embeddingsEnabled } from "../../lib/embeddings.js";
import { recommendByEmbedding, backfillEmbeddings } from "../../lib/search.js";
import { AppError, badRequest, notFound } from "../../lib/errors.js";

const disabled = () =>
  new AppError(503, "embeddings_off", "Recomendaciones no configuradas (falta EMBEDDINGS_URL)");

export const recommendationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/recomendaciones", async (req) => {
    if (!embeddingsEnabled()) throw disabled();

    const q = z
      .object({
        entityId: z.string().uuid().optional(),
        q: z.string().min(2).max(500).optional(),
        limit: z.coerce.number().int().min(1).max(50).default(10),
      })
      .parse(req.query);

    let embedding: number[];
    let exclude: string | undefined;

    if (q.entityId) {
      const row = await app.db
        .selectFrom("searchDocuments")
        .select(["title", "content"])
        .where("entityId", "=", q.entityId)
        .executeTakeFirst();
      if (!row) throw notFound("Esa entidad no está indexada");
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

  // Genera los embeddings faltantes (backfill). Requiere sesión.
  app.post("/recomendaciones/reindex", async (req) => {
    if (!embeddingsEnabled()) throw disabled();
    app.requireAuth(req);
    const indexed = await backfillEmbeddings(app.db, embedText);
    return { indexed };
  });
};
