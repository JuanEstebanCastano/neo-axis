/**
 * DIRECCIONES DE COMENTARIOS
 * ──────────────────────────────────────────────────────────────────────
 * Leer el hilo de una publicación, comentar y borrar lo propio.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { badRequest } from "../../lib/errors.js";
import { prettifyZodError } from "../../lib/validation.js";
import { PERMISSIONS } from "../../lib/rbac.js";
import { createCommentBody } from "./schemas.js";
import { createComment, listComments, softDeleteComment } from "./service.js";

export const commentRoutes: FastifyPluginAsync = async (app) => {
  // El hilo completo. Público: se lee sin sesión si el post es de comunidad.
  app.get("/posts/:id/comments", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return listComments(app.db, id, req.session?.userId ?? null);
  });

  app.post(
    "/posts/:id/comments",
    { preHandler: app.requirePermission(PERMISSIONS.commentsCreate) },
    async (req, reply) => {
      const session = app.requireAuth(req);
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const parsed = createCommentBody.safeParse(req.body);
      if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));

      const comment = await createComment(app.db, {
        postId: id,
        authorId: session.userId,
        ...parsed.data,
      });
      return reply.code(201).send({ comment });
    },
  );

  app.delete("/comments/:id", async (req) => {
    const session = app.requireAuth(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return softDeleteComment(app.db, id, session.userId);
  });
};
