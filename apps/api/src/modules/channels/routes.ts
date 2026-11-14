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
  recorrerMensajes,
} from "./service.js";
import {
  cabeceraMarkdown,
  mensajeAMarkdown,
  nombreDeExportacion,
  type MensajeExportado,
} from "./export.js";

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

  /**
   * Llevarse el debate entero.
   *
   * Se escribe al stream por lotes en vez de armar el documento en memoria:
   * una sección con decenas de miles de mensajes no cabe. Con límite propio
   * de peticiones porque es, de lejos, lo más caro que hace este módulo.
   */
  app.get(
    "/channels/:slug/export",
    { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { slug } = z.object({ slug: z.string().min(1).max(100) }).parse(req.params);
      const { format } = z
        .object({ format: z.enum(["md", "json"]).default("md") })
        .parse(req.query);

      const channel = await getChannelBySlug(app.db, slug);

      // Las cabeceras van en el raw, no con reply.header(): al escribir
      // directamente en el stream nos saltamos a Fastify, y lo que haya
      // puesto él nunca llega. Sin Content-Disposition el navegador muestra
      // el documento en vez de guardarlo, que es justo lo contrario de
      // "descargar el debate".
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type":
          format === "md" ? "text/markdown; charset=utf-8" : "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nombreDeExportacion(channel.slug, format)}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });

      if (format === "json") {
        // Se arma a mano para poder ir escribiendo: JSON.stringify de todo
        // junto obligaría a tener el array entero en memoria.
        reply.raw.write(
          `{"channel":${JSON.stringify({
            slug: channel.slug,
            name: channel.name,
            topic: channel.topic,
          })},"messages":[`,
        );
        let primero = true;
        for await (const m of recorrerMensajes(app.db, channel.id as string)) {
          reply.raw.write((primero ? "" : ",") + JSON.stringify(m));
          primero = false;
        }
        reply.raw.write("]}");
      } else {
        reply.raw.write(cabeceraMarkdown({ name: channel.name, topic: channel.topic }));
        for await (const m of recorrerMensajes(app.db, channel.id as string)) {
          reply.raw.write(mensajeAMarkdown(m as unknown as MensajeExportado));
        }
      }

      reply.raw.end();
    },
  );

  /**
   * El canal por el que llegan los avisos de mensajes nuevos.
   *
   * Es text/event-stream: el navegador lo abre con EventSource, que reconecta
   * solo si se corta. Va exenta del límite de peticiones porque una conexión
   * abierta no es una ráfaga, y sin X-Accel-Buffering el proxy guardaría los
   * avisos en un búfer y llegarían a destiempo o no llegarían.
   */
  app.get("/channels/:id/stream", { config: { rateLimit: false } }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const enviar = (evento: string, datos: unknown) => {
      // Si el navegador ya cerró, escribir lanza: que no se lleve el proceso.
      try {
        reply.raw.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
      } catch {
        /* conexión cerrada */
      }
    };

    enviar("listo", { channelId: id });

    const baja = app.bus.suscribir(id, (aviso) => {
      // Sólo el id: el navegador pide el mensaje con la misma consulta de
      // siempre, que ya filtra visibilidad. Mandar el texto acá sería
      // duplicar ese filtro y arriesgarse a saltárselo.
      enviar("mensaje", aviso);
    });

    // Sin esto, el proxy corta la conexión por inactividad en una sección
    // tranquila y el navegador tiene que reconectar cada pocos minutos.
    const latido = setInterval(() => {
      try {
        reply.raw.write(": ping\n\n");
      } catch {
        /* conexión cerrada */
      }
    }, 25_000);
    latido.unref();

    const cerrar = () => {
      clearInterval(latido);
      baja();
    };
    req.raw.on("close", cerrar);
    req.raw.on("error", cerrar);
  });

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
