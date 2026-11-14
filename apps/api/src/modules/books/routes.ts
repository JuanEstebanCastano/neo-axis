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
 *   restricted -> NADIE, hasta que exista un modelo de autorización. Por eso
 *                 tampoco se puede subir un archivo con ese nivel: sería
 *                 guardar algo que ni quien lo sube podría volver a bajar.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { notFound, forbidden, badRequest, conflict, serviceUnavailable } from "../../lib/errors.js";
import { config } from "../../config.js";
import { prettifyZodError } from "../../lib/validation.js";
import { presignDownload, putObject, deleteObject } from "../../lib/storage.js";
import {
  listBooks,
  listBookLanguages,
  getBook,
  setShelf,
  importarLibroExterno,
  agregarLibroPorEnlace,
  guardarArchivoDeLibro,
  eliminarArchivoDeLibro,
} from "./service.js";
import { booksQuery, linkBookBody } from "./schemas.js";
import { PERMISSIONS } from "../../lib/rbac.js";
import { buscarLibros, obtenerLibro } from "./gutendex.js";
import {
  detectarFormato,
  claveDeObjeto,
  nombreDescarga,
  MIME_POR_FORMATO,
  TIPOS_ACEPTADOS,
} from "./fileformat.js";

export const bookRoutes: FastifyPluginAsync = async (app) => {
  const MAX_BYTES = config.BOOK_FILE_MAX_MB * 1024 * 1024;

  /**
   * El cuerpo de una subida llega como binario crudo, no como multipart.
   *
   * multipart es el formato de un <form>, y acá no hay formulario: hay UN
   * archivo. Soportarlo significaría sumar una dependencia que parsea
   * límites, cabeceras y codificaciones por nosotros —y que es donde viven
   * los bugs de este terreno— para transportar exactamente los mismos bytes.
   * Lo que acompaña al archivo (formato y nivel de acceso) cabe de sobra en
   * la querystring.
   *
   * El límite se declara acá: Fastify corta la lectura al pasarse, así que
   * un archivo de 2 GB no llega nunca a ocupar memoria.
   */
  app.addContentTypeParser(
    TIPOS_ACEPTADOS,
    { parseAs: "buffer", bodyLimit: MAX_BYTES },
    (_req, body, done) => done(null, body),
  );

  // Catálogo de libros.
  app.get("/books", async (req) => {
    const parsed = booksQuery.safeParse(req.query);
    if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));
    const items = await listBooks(app.db, parsed.data);
    return { items };
  });

  // Idiomas que existen de verdad en el catálogo, para poblar el filtro.
  app.get("/books/languages", async () => {
    const languages = await listBookLanguages(app.db);
    return { languages };
  });

  /**
   * Agregar un libro pegando sus enlaces.
   *
   * Pide sesión: queda registrado quién lo trajo (books.added_by). No es
   * burocracia — un enlace a una obra protegida tiene que poder atribuirse a
   * alguien, y quien lo sube declara de dónde salió en rightsNote.
   */
  app.post("/books/link", async (req, reply) => {
    const session = app.requireAuth(req);
    const parsed = linkBookBody.safeParse(req.body);
    if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));

    const { bookId } = await agregarLibroPorEnlace(app.db, session.userId, parsed.data);
    return reply.code(201).send({ bookId });
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

  /**
   * DIAGNÓSTICO TEMPORAL (sólo admin). Habla con Gutendex directo, sin pasar
   * por el cliente que se traga el error, y devuelve crudo lo que pase: el
   * status si contesta, o la cadena de causas del fetch si falla.
   *
   * undici (el fetch de Node) guarda el motivo real en err.cause, no en el
   * mensaje de arriba. Lo que distingue el caso:
   *   ENOTFOUND / EAI_AGAIN      -> DNS: no resuelve el nombre
   *   ECONNREFUSED               -> rechazo: algo contesta que no
   *   UND_ERR_CONNECT_TIMEOUT    -> la conexión nunca se abre (bloqueo/tarpit)
   *   ETIMEDOUT                  -> abrió pero no respondió a tiempo
   *   TimeoutError / AbortError  -> saltó NUESTRO corte (el de abajo)
   * El timeout es alto y configurable a propósito: si Gutendex sólo está lento,
   * acá se ve que contesta (ok:true, elapsedMs grande) en vez de parecer caído.
   *
   * Quitar junto con el de storage una vez cerrado el tema.
   */
  app.get("/books/external/_diag", async (req) => {
    app.requireAuth(req);
    if (!req.permissions.has(PERMISSIONS.usersManageRoles)) {
      throw forbidden("Sólo administración");
    }
    const q = z
      .object({
        timeoutMs: z.coerce.number().int().min(1000).max(60000).default(30000),
        q: z.string().trim().min(1).max(120).default("test"),
        // Para probar OTRA fuente (p. ej. Open Library) desde Railway sin
        // escribir el cliente antes de saber si siquiera la alcanza.
        url: z.string().url().startsWith("https://").max(2000).optional(),
      })
      .parse(req.query);

    // Separa las capas para no confundir una con otra: primero resuelve el
    // nombre (DNS), después abre un socket TCP crudo a 443 (transporte), y
    // recién al final intenta el HTTP. Y hace el mismo probe TCP contra dos
    // hosts que SABEMOS que funcionan desde este mismo servidor (MailerSend y
    // Supabase, ambos por 443): si Gutendex cuelga y esos dos abren, el
    // problema es de Gutendex con la IP de Railway, no de la salida de Railway.
    async function probarDns(host: string) {
      const dns = await import("node:dns/promises");
      const t0 = Date.now();
      try {
        const r = await dns.lookup(host, { all: true });
        return { ok: true, elapsedMs: Date.now() - t0, addresses: r.map((a) => a.address) };
      } catch (e) {
        const o = e as { code?: string; message?: string };
        return { ok: false, elapsedMs: Date.now() - t0, code: o.code, message: o.message };
      }
    }

    async function probarTcp(host: string, port: number, ms: number) {
      const net = await import("node:net");
      const t0 = Date.now();
      return await new Promise<Record<string, unknown>>((resolve) => {
        const sock = net.connect({ host, port });
        const cerrar = (extra: Record<string, unknown>) => {
          sock.destroy();
          resolve({ host, port, elapsedMs: Date.now() - t0, ...extra });
        };
        sock.setTimeout(ms);
        sock.once("connect", () => cerrar({ ok: true }));
        sock.once("timeout", () => cerrar({ ok: false, error: "timeout" }));
        sock.once("error", (e) => cerrar({ ok: false, error: (e as { code?: string }).code ?? String(e) }));
      });
    }

    const url = q.url ?? `https://gutendex.com/books?search=${encodeURIComponent(q.q)}`;

    // Prueba el HTTP con dos User-Agent: el nuestro ("neo-axis-app", que en una
    // IP de datacenter es lo que la mitigación de bots de Cloudflare marca) y
    // uno de navegador. Si el de navegador pasa y el nuestro no, el arreglo es
    // cambiar una línea en gutendex.ts.
    const UA_NAVEGADOR =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    async function probarHttp(ua: string) {
      const inicio = Date.now();
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": ua, Accept: "application/json" },
          signal: AbortSignal.timeout(q.timeoutMs),
        });
        let count: number | null = null;
        try {
          count = ((await res.json()) as { count?: number })?.count ?? null;
        } catch {
          count = null;
        }
        return { ok: res.ok, status: res.status, elapsedMs: Date.now() - inicio, count };
      } catch (err) {
        const cadena: unknown[] = [];
        let e: unknown = err;
        for (let i = 0; i < 6 && e; i++) {
          const o = e as {
            name?: string; message?: string; code?: string;
            errno?: number; syscall?: string; hostname?: string; cause?: unknown;
          };
          cadena.push({
            name: o.name, message: o.message, code: o.code,
            errno: o.errno, syscall: o.syscall, hostname: o.hostname,
          });
          e = o.cause;
        }
        return { ok: false, elapsedMs: Date.now() - inicio, error: cadena };
      }
    }

    return {
      url,
      dns: await probarDns("gutendex.com"),
      tcp: {
        gutendex: await probarTcp("gutendex.com", 443, 12000),
        mailersend_control: await probarTcp("api.mailersend.com", 443, 12000),
        supabase_control: await probarTcp("dkdofozfgaajxyiocsul.supabase.co", 443, 12000),
      },
      httpAppUA: await probarHttp("neo-axis-app"),
      httpBrowserUA: await probarHttp(UA_NAVEGADOR),
    };
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


  // ── Archivos del libro ────────────────────────────────────────────────

  // Formatos disponibles de un libro (metadato público). El tamaño viene del
  // media_asset: sirve para que nadie empiece una descarga de 20 MB sin
  // saberlo, y para que se note cuando un archivo quedó en 3 KB.
  app.get("/books/:bookId/files", async (req) => {
    const { bookId } = z.object({ bookId: z.string().uuid() }).parse(req.params);
    const files = await app.db
      .selectFrom("bookFiles as bf")
      .innerJoin("mediaAssets as ma", "ma.id", "bf.mediaAssetId")
      .select([
        "bf.id as id",
        "bf.format as format",
        "bf.accessLevel as accessLevel",
        "bf.createdAt as createdAt",
        "ma.byteSize as byteSize",
        "ma.ownerId as ownerId",
      ])
      .where("bf.bookId", "=", bookId)
      .execute();
    return { files: files.map((f) => ({ ...f, byteSize: Number(f.byteSize) })) };
  });

  /**
   * Subir el archivo de un libro.
   *
   * El cuerpo es el archivo tal cual. El formato NO se le cree a quien sube:
   * se lee de los primeros bytes (ver fileformat.ts). Si además lo declara en
   * la query y no coincide, se avisa en vez de guardar en silencio algo que
   * dice ser lo que no es.
   *
   * Pide sesión por lo mismo que /books/link: un archivo de una obra ajena
   * tiene que poder atribuirse a alguien. Quien lo sube es también el único
   * que puede borrarlo.
   *
   * El límite de peticiones es bajo a propósito: cada llamada mueve hasta 25
   * MB por la memoria del API y los escribe en el storage. Es, de lejos, lo
   * más caro que puede pedir una sola persona.
   */
  app.post(
    "/books/:bookId/files",
    { config: { rateLimit: { max: 10, timeWindow: "5 minutes" } } },
    async (req, reply) => {
      const session = app.requireAuth(req);
      const { bookId } = z.object({ bookId: z.string().uuid() }).parse(req.params);

      const parsed = z
        .object({
          // Opcional: si viene, tiene que coincidir con lo que digan los bytes.
          format: z.enum(["epub", "pdf", "mobi"]).optional(),
          // 'restricted' no se ofrece: hoy el endpoint de descarga lo deniega
          // para todo el mundo, así que subir con ese nivel sería esconder el
          // archivo de quien lo acaba de subir.
          accessLevel: z.enum(["public", "community"]).default("community"),
        })
        .safeParse(req.query);
      if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));

      const cuerpo = req.body;
      if (!Buffer.isBuffer(cuerpo) || cuerpo.length === 0) {
        throw badRequest("El cuerpo de la petición tiene que ser el archivo del libro");
      }

      const formato = detectarFormato(cuerpo);
      if (!formato) {
        throw badRequest(
          "El archivo no parece un EPUB, un PDF ni un MOBI. Se miran los primeros bytes, no la extensión",
        );
      }
      if (parsed.data.format && parsed.data.format !== formato) {
        throw badRequest(
          `Lo mandaste como ${parsed.data.format} pero el archivo es un ${formato}`,
        );
      }

      const objectKey = claveDeObjeto(bookId, formato, randomUUID());
      const mediaType = MIME_POR_FORMATO[formato];

      // Primero el storage, después la base. Al revés, una fila apuntaría a
      // un objeto que quizá nunca llegó a subirse.
      //
      // El try es propio: si el storage rechaza la escritura —credenciales S3
      // mal puestas, sin permiso o bucket equivocado— el error del SDK sube
      // crudo y la persona ve "Error interno", que no dice nada de lo que pasó.
      // Pasa en el servidor, no en lo que mandó quien sube, así que es un 503
      // con un mensaje entendible, igual que cuando el catálogo externo no
      // responde. El detalle real queda en el log, que es donde se diagnostica.
      try {
        await putObject(config.S3_BUCKET, objectKey, cuerpo, mediaType);
      } catch (err) {
        app.log.error({ err, objectKey, bucket: config.S3_BUCKET }, "falló la subida al storage");
        // A quien administra se le devuelve la CLASE de error del SDK, no el
        // mensaje genérico: AccessDenied, SignatureDoesNotMatch,
        // InvalidAccessKeyId, NoSuchBucket… cada una apunta a una variable S3
        // distinta. Es la clase del error, no un secreto, y queda tras el
        // permiso de administración. Para el resto, el mensaje neutro de siempre.
        if (req.permissions.has(PERMISSIONS.usersManageRoles)) {
          const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
          throw serviceUnavailable(
            `Storage rechazó la escritura: ${e.name ?? "error"} (HTTP ${e.$metadata?.httpStatusCode ?? "?"}) — ${e.message ?? ""}`.trim(),
          );
        }
        throw serviceUnavailable(
          "No pudimos guardar el archivo ahora mismo. Intentá de nuevo en un momento",
        );
      }

      try {
        const file = await guardarArchivoDeLibro(app.db, {
          bookId,
          ownerId: session.userId,
          format: formato,
          accessLevel: parsed.data.accessLevel,
          bucketName: config.S3_BUCKET,
          objectKey,
          mediaType,
          byteSize: cuerpo.length,
          checksumSha256: createHash("sha256").update(cuerpo).digest(),
        });

        return reply.code(201).send({ file: { ...file, byteSize: cuerpo.length } });
      } catch (err) {
        // La base no lo quiso: el objeto que acabamos de subir no lo
        // referencia nadie. Si no se limpia, queda ocupando lugar para
        // siempre y sin forma de encontrarlo.
        await deleteObject(config.S3_BUCKET, objectKey).catch((e) =>
          app.log.error({ err: e, objectKey }, "quedó un objeto huérfano en el storage"),
        );

        // UNIQUE (book_id, format): ya hay un archivo de ese formato. Es un
        // choque esperable —dos personas suben el mismo EPUB— y merece un
        // mensaje, no un 500.
        if ((err as { code?: string }).code === "23505") {
          throw conflict(`Este libro ya tiene un archivo ${formato.toUpperCase()}`);
        }
        throw err;
      }
    },
  );

  /**
   * URL firmada de descarga, con control de acceso según access_level.
   *
   * El nombre del archivo se impone acá (Content-Disposition dentro de la
   * firma) porque dentro del bucket el objeto se llama como un uuid. Va en la
   * URL firmada y no en una cabecera nuestra: el navegador descarga directo
   * del storage, así que una cabecera puesta por el API no llegaría a verse.
   */
  app.get("/book-files/:id/download", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

    const file = await app.db
      .selectFrom("bookFiles as bf")
      .innerJoin("mediaAssets as ma", "ma.id", "bf.mediaAssetId")
      .innerJoin("books as b", "b.id", "bf.bookId")
      .select([
        "bf.id as id",
        "bf.format as format",
        "bf.accessLevel as accessLevel",
        "b.title as title",
        "ma.bucketName as bucketName",
        "ma.objectKey as objectKey",
      ])
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
    const url = await presignDownload(file.bucketName, file.objectKey, expiresInSeconds, {
      filename: nombreDescarga(file.title, file.format),
    });
    return { url, expiresInSeconds };
  });

  /**
   * Borrar un archivo. Sólo quien lo subió.
   *
   * El objeto del storage se borra después de que la base confirmó, y si esa
   * limpieza falla se registra pero no se devuelve error: para quien llamó, el
   * archivo ya no está en el catálogo, que es lo que pidió. Lo que queda es un
   * objeto sin referencia, y eso se arregla barriendo, no fallando.
   */
  app.delete("/book-files/:id", async (req) => {
    const session = app.requireAuth(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

    const { bucketName, objectKey } = await eliminarArchivoDeLibro(app.db, id, session.userId);
    await deleteObject(bucketName, objectKey).catch((e) =>
      app.log.error({ err: e, objectKey }, "no se pudo borrar el objeto del storage"),
    );

    return { ok: true };
  });
};
