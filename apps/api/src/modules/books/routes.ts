/**
 * DIRECCIONES DE LIBROS (archivos)
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Lista los formatos disponibles de un libro y entrega una URL firmada para
 * descargarlo, respetando el nivel de acceso del archivo.
 *
 * TENÉ EN CUENTA
 * access_level:
 *   public     -> cualquiera
 *   community  -> hay que estar autenticado
 *   restricted -> autenticado (política fina pendiente)
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { notFound, forbidden } from "../../lib/errors.js";
import { presignDownload } from "../../lib/storage.js";
import { listBooks, getBook, setShelf, importarLibroExterno } from "./service.js";
import { buscarLibros, obtenerLibro } from "./gutendex.js";

export const bookRoutes: FastifyPluginAsync = async (app) => {
  // Catálogo de libros.
  app.get("/books", async (req) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query);
    const items = await listBooks(app.db, q.limit);
    return { items };
  });

  // Detalle de un libro (autores, archivos, rating).
  app.get("/books/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const book = await getBook(app.db, id);
    return { book };
  });

  // ── Catálogo externo (Project Gutenberg vía Gutendex) ───────────────
  //
  // Las dos piden sesión. Buscar no cambia nada nuestro, pero sin sesión el
  // API quedaría de proxy gratuito hacia un servicio que no es nuestro, y
  // quien se lleva el tráfico ajeno es Gutendex.

  app.get("/books/external/search", async (req) => {
    app.requireAuth(req);
    const q = z
      .object({
        q: z.string().trim().min(2).max(120),
        // Código de dos letras, como los que devuelve la fuente.
        lang: z.string().trim().length(2).optional(),
      })
      .parse(req.query);

    const items = await buscarLibros(q.q, q.lang);
    return { items };
  });

  app.post("/books/external/import", async (req, reply) => {
    app.requireAuth(req);
    const body = z
      .object({ provider: z.literal("gutendex"), externalId: z.coerce.number().int().positive() })
      .parse(req.body);

    // El libro se vuelve a pedir a la fuente en vez de confiar en lo que
    // mande el cliente: así el título, los enlaces y la nota de derechos
    // salen siempre de Gutendex y no de quien llama.
    const libro = await obtenerLibro(body.externalId);
    const { bookId, yaExistia } = await importarLibroExterno(app.db, libro);

    return reply.code(yaExistia ? 200 : 201).send({ bookId, yaExistia });
  });

  // Estantería del usuario: marcar quiero leer / leyendo / leído.
  app.put("/books/:id/shelf", async (req) => {
    const session = app.requireAuth(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        status: z.enum(["want", "reading", "read"]),
        progress: z.coerce.number().int().min(0).max(100).optional(),
      })
      .parse(req.body);
    await setShelf(app.db, session.userId, id, body.status, body.progress);
    return { ok: true };
  });

  // Formatos disponibles de un libro (metadato público).
  app.get("/books/:bookId/files", async (req) => {
    const { bookId } = z.object({ bookId: z.string().uuid() }).parse(req.params);
    const files = await app.db
      .selectFrom("bookFiles")
      .select(["id", "format", "accessLevel", "createdAt"])
      .where("bookId", "=", bookId)
      .execute();
    return { files };
  });

  // URL firmada de descarga, con control de acceso según access_level.
  app.get("/book-files/:id/download", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

    const file = await app.db
      .selectFrom("bookFiles as bf")
      .innerJoin("mediaAssets as ma", "ma.id", "bf.mediaAssetId")
      .innerJoin("books as b", "b.id", "bf.bookId")
      .select(["bf.id as id", "bf.accessLevel as accessLevel", "ma.bucketName as bucketName", "ma.objectKey as objectKey"])
      .where("bf.id", "=", id)
      .where("b.deletedAt", "is", null)
      .executeTakeFirst();

    if (!file) throw notFound("Archivo de libro no encontrado");

    // public = libre; community = requiere sesión; restricted = denegado por
    // defecto hasta que exista un modelo de autorización (permiso/entitlement).
    if (file.accessLevel === "restricted") {
      throw forbidden("Este archivo requiere una autorización que todavía no está disponible");
    }
    if (file.accessLevel === "community") {
      app.requireAuth(req);
    }

    const expiresInSeconds = 300;
    const url = await presignDownload(file.bucketName, file.objectKey, expiresInSeconds);
    return { url, expiresInSeconds };
  });
};
