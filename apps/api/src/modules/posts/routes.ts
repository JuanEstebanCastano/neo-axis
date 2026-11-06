/**
 * DIRECCIONES DE PUBLICACIONES
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Define las URLs: ver el feed, ver una publicación, crear, borrar, buscar.
 *
 * TENÉ EN CUENTA
 * Fijate que este archivo es corto y no tiene lógica: sólo valida permisos y
 * datos, y después llama a service.ts. Esa separación es a propósito.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createPost, softDeletePost } from "./service.js";
import { canViewPost, PERMISSIONS } from "../../lib/rbac.js";
import { search } from "../../lib/search.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { prettifyZodError } from "../../lib/validation.js";

import { createBody, feedQuery, searchQuery } from "./schemas.js";

export const postRoutes: FastifyPluginAsync = async (app) => {
  // Feed de la comunidad. Usa posts_feed_idx tal cual está definido en el DDL:
  // created_at DESC WHERE deleted_at IS NULL AND status='published' AND hidden_at IS NULL.
  app.get("/posts", async (req) => {
    const q = feedQuery.parse(req.query);

    let query = app.db
      .selectFrom("posts as p")
      .innerJoin("users as u", "u.id", "p.authorId")
      // Los posts que son snippets viven en su propia sección: fuera del feed.
      .leftJoin("postSnippets as ps", "ps.postId", "p.id")
      .select([
        "p.id as id", "p.title as title", "p.slug as slug", "p.excerpt as excerpt",
        "p.createdAt as createdAt", "u.username as authorUsername",
        "u.displayName as authorDisplayName", "u.avatarUrl as authorAvatarUrl",
      ])
      .where("ps.id", "is", null)
      .where("p.deletedAt", "is", null)
      .where("p.status", "=", "published")
      .where("p.hiddenAt", "is", null)
      .where("p.visibility", "=", "community")
      .orderBy("p.createdAt", "desc")
      .orderBy("p.id", "desc")
      .limit(q.limit);

    if (q.cursor) query = query.where("p.createdAt", "<", new Date(q.cursor));

    const items = await query.execute();
    const last = items.at(-1);

    return {
      items,
      nextCursor: items.length === q.limit && last
        ? new Date(last.createdAt as string).toISOString()
        : null,
    };
  });

  app.get("/posts/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

    const allowed = await canViewPost(app.db, id, req.session?.userId ?? null);
    if (!allowed) throw notFound("El post no existe o no tenés acceso");

    const post = await app.db
      .selectFrom("posts")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!post) throw notFound();
    return { post };
  });

  app.post("/posts", {
    preHandler: [async (req) => { await app.requirePermission(PERMISSIONS.postsCreate)(req); }],
  }, async (req, reply) => {
    const session = app.requireAuth(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));

    const post = await createPost(app.db, { authorId: session.userId, ...parsed.data });
    return reply.code(201).send({ post });
  });

  app.delete("/posts/:id", {
    preHandler: [async (req) => { await app.requirePermission(PERMISSIONS.postsDeleteOwn)(req); }],
  }, async (req, reply) => {
    const session = app.requireAuth(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await softDeletePost(app.db, id, session.userId);
    return reply.code(204).send();
  });

  app.get("/search", async (req) => {
    const q = searchQuery.parse(req.query);

    return { hits: await search(app.db, q.q, { limit: q.limit, entityType: q.type }) };
  });
};
