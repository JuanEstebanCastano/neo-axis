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
import { notFound } from "../../lib/errors.js";
import { presignDownload } from "../../lib/storage.js";

export const bookRoutes: FastifyPluginAsync = async (app) => {
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
      .select(["bf.id as id", "bf.accessLevel as accessLevel", "ma.bucketName as bucketName", "ma.objectKey as objectKey"])
      .where("bf.id", "=", id)
      .executeTakeFirst();

    if (!file) throw notFound("Archivo de libro no encontrado");

    // public = libre; community/restricted = requiere sesión.
    if (file.accessLevel !== "public") {
      app.requireAuth(req);
    }

    const expiresInSeconds = 300;
    const url = await presignDownload(file.bucketName, file.objectKey, expiresInSeconds);
    return { url, expiresInSeconds };
  });
};
