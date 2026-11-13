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
import { canonicalizarRepo } from "../repos/canonical.js";
import { upsertRepositoryByUrl } from "../repos/service.js";
import { addAttachment, removeAttachment } from "./attachments.js";
import { attachmentBody, createChannelBody, createMessageBody, messagesQuery } from "./schemas.js";
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

  // Colgarle algo a un mensaje: un libro, un fragmento de código o un repo.
  app.post("/messages/:id/attachments", async (req, reply) => {
    const session = app.requireAuth(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const parsed = attachmentBody.safeParse(req.body);
    if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));

    let targetId = parsed.data.targetId;

    if (parsed.data.attachmentType === "repository") {
      const ref = canonicalizarRepo(parsed.data.repoUrl as string);
      if (!ref) {
        throw badRequest("Eso no parece un repositorio de GitHub (probá con owner/repo)");
      }
      // El primero que lo adjunta lo da de alta; el resto reusa la fila.
      const repo = await upsertRepositoryByUrl(app.db, {
        canonicalUrl: ref.canonicalUrl,
        repositoryName: `${ref.owner}/${ref.repo}`,
      });
      targetId = repo.id as string;
    }

    const attachment = await addAttachment(app.db, {
      postId: id,
      attachmentType: parsed.data.attachmentType,
      targetId: targetId as string,
      note: parsed.data.note ?? null,
      actorId: session.userId,
    });
    return reply.code(201).send({ attachment });
  });

  app.delete("/attachments/:id", async (req) => {
    const session = app.requireAuth(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return removeAttachment(app.db, id, session.userId);
  });
};
