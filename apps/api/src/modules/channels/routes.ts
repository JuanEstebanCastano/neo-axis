/**
 * DIRECCIONES DE LAS SECCIONES
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Listar las secciones, crear una (con permiso), leer sus mensajes y
 * publicar en ellas.
 *
 * TENÉ EN CUENTA
 * Leer no pide sesión: la comunidad es pública. Escribir sí. Y crear una
 * sección pide el permiso 'channels.create', que hoy tienen administradores
 * y moderadores; para dárselo a otro rol mañana basta una fila en la base,
 * sin tocar este archivo.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { badRequest } from "../../lib/errors.js";
import { prettifyZodError } from "../../lib/validation.js";
import { PERMISSIONS } from "../../lib/rbac.js";
import { createChannelBody, createMessageBody, messagesQuery } from "./schemas.js";
import {
  createChannel,
  createMessage,
  getChannelBySlug,
  listChannels,
  listMessages,
} from "./service.js";

export const channelRoutes: FastifyPluginAsync = async (app) => {
  // Las secciones de la barra lateral. Pública: se lee sin sesión.
  app.get("/channels", async () => {
    const items = await listChannels(app.db);
    return { items };
  });

  // Una sección por su nombre corto; es lo que lleva la URL del front.
  app.get("/channels/:slug", async (req) => {
    const { slug } = z.object({ slug: z.string().min(1).max(100) }).parse(req.params);
    const channel = await getChannelBySlug(app.db, slug);
    return { channel };
  });

  app.post(
    "/channels",
    { preHandler: app.requirePermission(PERMISSIONS.channelsCreate) },
    async (req, reply) => {
      const session = app.requireAuth(req);
      const parsed = createChannelBody.safeParse(req.body);
      if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));

      const channel = await createChannel(app.db, {
        ...parsed.data,
        createdBy: session.userId,
      });
      return reply.code(201).send({ channel });
    },
  );

  // Los mensajes de una sección. ?before= para ir hacia atrás, ?after= para
  // traer lo nuevo (es lo que usa el refresco automático del front).
  app.get("/channels/:id/messages", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const q = messagesQuery.parse(req.query);
    return listMessages(app.db, { channelId: id, ...q });
  });

  app.post(
    "/channels/:id/messages",
    { preHandler: app.requirePermission(PERMISSIONS.postsCreate) },
    async (req, reply) => {
      const session = app.requireAuth(req);
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const parsed = createMessageBody.safeParse(req.body);
      if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));

      const message = await createMessage(app.db, {
        channelId: id,
        authorId: session.userId,
        ...parsed.data,
      });
      return reply.code(201).send({ message });
    },
  );
};
