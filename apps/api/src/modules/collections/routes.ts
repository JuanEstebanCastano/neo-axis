/**
 * DIRECCIONES DE COLECCIONES
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Crear una colección, verla con sus ítems, listarlas, agregar/quitar ítems
 * y borrarla. Igual que posts: valida y delega en service.ts.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  createCollection,
  getCollection,
  listCollections,
  addCollectionItem,
  removeCollectionItem,
  softDeleteCollection,
} from "./service.js";
import { badRequest } from "../../lib/errors.js";
import { prettifyZodError } from "../../lib/validation.js";

const createBody = z.object({
  title: z.string().min(1).max(240),
  slug: z.string().max(280).nullish(),
  description: z.string().nullish(),
  visibility: z.enum(["community", "restricted"]).default("community"),
});

const itemBody = z.object({
  itemType: z.enum(["book", "repository", "snippet", "post"]),
  bookId: z.string().uuid().optional(),
  repositoryId: z.string().uuid().optional(),
  snippetId: z.string().uuid().optional(),
  postId: z.string().uuid().optional(),
  note: z.string().max(500).nullish(),
  sortOrder: z.coerce.number().int().min(0).max(32767).optional(),
});

export const collectionRoutes: FastifyPluginAsync = async (app) => {
  // Listado: por defecto las de la comunidad; con ?owner=<uuid> las de alguien.
  app.get("/collections", async (req) => {
    const q = z
      .object({
        owner: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      })
      .parse(req.query);
    const items = await listCollections(app.db, { ownerId: q.owner, limit: q.limit });
    return { items };
  });

  // Ver una colección con sus ítems (respeta visibilidad).
  app.get("/collections/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const collection = await getCollection(app.db, id, req.session?.userId ?? null);
    return { collection };
  });

  app.post("/collections", async (req, reply) => {
    const session = app.requireAuth(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));

    const collection = await createCollection(app.db, { ownerId: session.userId, ...parsed.data });
    return reply.code(201).send({ collection });
  });

  app.post("/collections/:id/items", async (req, reply) => {
    const session = app.requireAuth(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const parsed = itemBody.safeParse(req.body);
    if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));

    const item = await addCollectionItem(app.db, {
      collectionId: id,
      actorId: session.userId,
      ...parsed.data,
    });
    return reply.code(201).send({ item });
  });

  app.delete("/collections/:id/items/:itemId", async (req, reply) => {
    const session = app.requireAuth(req);
    const { id, itemId } = z
      .object({ id: z.string().uuid(), itemId: z.string().uuid() })
      .parse(req.params);
    await removeCollectionItem(app.db, id, itemId, session.userId);
    return reply.code(204).send();
  });

  app.delete("/collections/:id", async (req, reply) => {
    const session = app.requireAuth(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await softDeleteCollection(app.db, id, session.userId);
    return reply.code(204).send();
  });
};
