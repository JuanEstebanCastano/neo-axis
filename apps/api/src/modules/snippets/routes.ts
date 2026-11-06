/**
 * DIRECCIONES DE SNIPPETS
 * Listar y compartir fragmentos de código.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { listSnippets, createSnippet } from "./service.js";
import { PERMISSIONS } from "../../lib/rbac.js";
import { badRequest } from "../../lib/errors.js";
import { prettifyZodError } from "../../lib/validation.js";

const createBody = z.object({
  title: z.string().min(1).max(240),
  language: z.string().min(1).max(80),
  sourceCode: z.string().min(1).max(20000),
  description: z.string().max(1000).nullish(),
  filename: z.string().max(255).nullish(),
});

export const snippetRoutes: FastifyPluginAsync = async (app) => {
  app.get("/snippets", async (req) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(req.query);
    const items = await listSnippets(app.db, q.limit);
    return { items };
  });

  app.post("/snippets", {
    preHandler: [async (req) => { await app.requirePermission(PERMISSIONS.postsCreate)(req); }],
  }, async (req, reply) => {
    const session = app.requireAuth(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));
    const snippet = await createSnippet(app.db, { authorId: session.userId, ...parsed.data });
    return reply.code(201).send({ snippet });
  });
};
