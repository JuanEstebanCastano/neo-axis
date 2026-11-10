/**
 * DIRECCIONES DE SNIPPETS
 * Listar, compartir y versionar fragmentos de código.
 *
 * Las direcciones que terminan en /gist, /sync o /revisions son las que hablan
 * con GitHub. Las demás funcionan igual aunque la integración esté apagada.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  createSnippet,
  getSnippetRevision,
  importSnippetFromGist,
  listSnippetRevisions,
  listSnippets,
  publishSnippetAsGist,
  syncSnippetFromGist,
  unlinkGist,
  updateSnippet,
} from "./service.js";
import { PERMISSIONS } from "../../lib/rbac.js";
import { badRequest } from "../../lib/errors.js";
import { prettifyZodError } from "../../lib/validation.js";

import {
  createBody,
  importBody,
  publishBody,
  revisionParams,
  snippetParams,
  updateBody,
} from "./schemas.js";

export const snippetRoutes: FastifyPluginAsync = async (app) => {
  const requiereCrear = [
    async (req: Parameters<ReturnType<typeof app.requirePermission>>[0]) => {
      await app.requirePermission(PERMISSIONS.postsCreate)(req);
    },
  ];
  const requiereEditar = [
    async (req: Parameters<ReturnType<typeof app.requirePermission>>[0]) => {
      await app.requirePermission(PERMISSIONS.postsEditOwn)(req);
    },
  ];

  app.get("/snippets", async (req) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(req.query);
    const items = await listSnippets(app.db, q.limit);
    return { items };
  });

  app.post("/snippets", { preHandler: requiereCrear }, async (req, reply) => {
    const session = app.requireAuth(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));
    const snippet = await createSnippet(app.db, { authorId: session.userId, ...parsed.data });
    return reply.code(201).send({ snippet });
  });

  // ── Edición: si el snippet está en GitHub, genera una revisión nueva ──
  app.put("/snippets/:id", { preHandler: requiereEditar }, async (req) => {
    const session = app.requireAuth(req);
    const { id } = snippetParams.parse(req.params);
    const parsed = updateBody.safeParse(req.body);
    if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));
    const snippet = await updateSnippet(app.db, { snippetId: id, userId: session.userId, ...parsed.data });
    return { snippet };
  });

  // ── Publicar en GitHub como gist ──
  app.post("/snippets/:id/gist", { preHandler: requiereEditar }, async (req, reply) => {
    const session = app.requireAuth(req);
    const { id } = snippetParams.parse(req.params);
    const parsed = publishBody.safeParse(req.body ?? {});
    if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));

    const gist = await publishSnippetAsGist(app.db, {
      snippetId: id,
      userId: session.userId,
      isPublic: parsed.data.public,
    });
    return reply.code(201).send({ gist });
  });

  // ── Desvincular (el gist sigue vivo en GitHub) ──
  app.delete("/snippets/:id/gist", { preHandler: requiereEditar }, async (req) => {
    const session = app.requireAuth(req);
    const { id } = snippetParams.parse(req.params);
    return unlinkGist(app.db, { snippetId: id, userId: session.userId });
  });

  // ── Traer desde GitHub la última versión ──
  app.post("/snippets/:id/sync", { preHandler: requiereEditar }, async (req) => {
    const session = app.requireAuth(req);
    const { id } = snippetParams.parse(req.params);
    const snippet = await syncSnippetFromGist(app.db, { snippetId: id, userId: session.userId });
    return { snippet };
  });

  // ── Historial de revisiones (lectura pública si el gist es público) ──
  app.get("/snippets/:id/revisions", async (req) => {
    const { id } = snippetParams.parse(req.params);
    const revisions = await listSnippetRevisions(app.db, id, req.session?.userId ?? null);
    return { revisions };
  });

  // ── Contenido de una revisión concreta ──
  app.get("/snippets/:id/revisions/:sha", async (req) => {
    const { id, sha } = revisionParams.parse(req.params);
    const revision = await getSnippetRevision(app.db, id, sha, req.session?.userId ?? null);
    return { revision };
  });

  // ── Importar un gist que ya existe ──
  app.post("/snippets/import", { preHandler: requiereCrear }, async (req, reply) => {
    const session = app.requireAuth(req);
    const parsed = importBody.safeParse(req.body);
    if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));
    const snippet = await importSnippetFromGist(app.db, {
      userId: session.userId,
      gistRef: parsed.data.gist,
    });
    return reply.code(201).send({ snippet });
  });
};
