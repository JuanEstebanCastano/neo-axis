/**
 * LÓGICA DE LIBROS
 * ──────────────────────────────────────────────────────────────────────
 * Listado y detalle de libros (con autores, archivos y rating promedio) y la
 * estantería del usuario. Usa SQL crudo donde hay agregaciones.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { Database, Transaction, DB } from "@neoaxis/db";
import { sql } from "@neoaxis/db";
import { notFound, forbidden } from "../../lib/errors.js";
import type { LibroExterno } from "./gutendex.js";
import type { BooksQuery, LinkBookInput } from "./schemas.js";

export interface BookCard {
  id: string;
  title: string;
  publicationYear: number | null;
  coverUrl: string | null;
  languageCode: string | null;
  authors: string[];
  ratingAvg: number | null;
  /** Enlaces a la fuente externa. Nulos en los libros que alojamos nosotros. */
  readUrl: string | null;
  downloadUrl: string | null;
  sourceUrl: string | null;
  rightsNote: string | null;
}

/**
 * Escapa los comodines de LIKE en lo que escribe la persona.
 *
 * Sin esto, buscar "100%" casa con todo lo que empiece por "100", y un "_"
 * casa con cualquier carácter. No es un agujero de seguridad —el valor va
 * parametrizado, no concatenado— pero sí resultados que no se entienden.
 */
function comodines(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listBooks(db: Database, filtros: BooksQuery): Promise<BookCard[]> {
  const { limit, q, lang, source, access } = filtros;
  const patron = q ? `%${comodines(q)}%` : null;

  const { rows } = await sql<BookCard>`
    SELECT b.id::text AS id, b.title,
          b.publication_year AS "publicationYear",
          b.cover_url AS "coverUrl",
          b.language_code AS "languageCode",
          b.read_url AS "readUrl",
          b.download_url AS "downloadUrl",
          b.source_url AS "sourceUrl",
          b.rights_note AS "rightsNote",
          COALESCE(array_agg(DISTINCT ba.name) FILTER (WHERE ba.name IS NOT NULL), '{}') AS authors,
          (SELECT round(avg(rating)::numeric, 1)
              FROM app.book_reviews r
              WHERE r.book_id = b.id AND r.deleted_at IS NULL) AS "ratingAvg"
    FROM app.books b
    LEFT JOIN app.book_author_links bal ON bal.book_id = b.id
    LEFT JOIN app.book_authors ba ON ba.id = bal.author_id
    WHERE b.deleted_at IS NULL
    -- El texto busca en el título Y en los autores. Los autores van por
    -- EXISTS y no en este WHERE: filtrar sobre el JOIN que después se agrega
    -- dejaría al libro con la lista de autores recortada a los que casaron.
    ${
      patron
        ? sql`AND (
            b.title ILIKE ${patron}
            OR EXISTS (
              SELECT 1 FROM app.book_author_links bal2
              JOIN app.book_authors ba2 ON ba2.id = bal2.author_id
              WHERE bal2.book_id = b.id AND ba2.name ILIKE ${patron}
            )
          )`
        : sql``
    }
    ${lang ? sql`AND b.language_code = ${lang}` : sql``}
    ${source === "gutendex" ? sql`AND b.external_provider = 'gutendex'` : sql``}
    ${source === "manual" ? sql`AND b.added_by IS NOT NULL` : sql``}
    ${access === "readable" ? sql`AND b.read_url IS NOT NULL` : sql``}
    -- "Descargable" incluye los archivos que alojamos nosotros, no sólo el
    -- enlace externo.
    ${
      access === "downloadable"
        ? sql`AND (
            b.download_url IS NOT NULL
            OR EXISTS (SELECT 1 FROM app.book_files bf WHERE bf.book_id = b.id)
          )`
        : sql``
    }
    GROUP BY b.id
    ORDER BY b.created_at DESC
    LIMIT ${limit}
  `.execute(db);
  return rows;
}

/**
 * Idiomas presentes en el catálogo, para poblar el filtro sin inventarse una
 * lista fija: si no hay libros en francés, no tiene sentido ofrecer francés.
 */
export async function listBookLanguages(db: Database): Promise<string[]> {
  const { rows } = await sql<{ lang: string }>`
    SELECT DISTINCT b.language_code AS lang
    FROM app.books b
    WHERE b.deleted_at IS NULL AND b.language_code IS NOT NULL
    ORDER BY lang
  `.execute(db);
  return rows.map((r) => r.lang);
}

export async function getBook(db: Database, id: string) {
  const { rows } = await sql<BookCard>`
    SELECT b.id::text AS id, b.title,
          b.publication_year AS "publicationYear",
          b.cover_url AS "coverUrl",
          b.language_code AS "languageCode",
          b.read_url AS "readUrl",
          b.download_url AS "downloadUrl",
          b.source_url AS "sourceUrl",
          b.rights_note AS "rightsNote",
          COALESCE(array_agg(DISTINCT ba.name) FILTER (WHERE ba.name IS NOT NULL), '{}') AS authors,
          (SELECT round(avg(rating)::numeric, 1)
              FROM app.book_reviews r
              WHERE r.book_id = b.id AND r.deleted_at IS NULL) AS "ratingAvg"
    FROM app.books b
    LEFT JOIN app.book_author_links bal ON bal.book_id = b.id
    LEFT JOIN app.book_authors ba ON ba.id = bal.author_id
    WHERE b.id = ${id}::uuid AND b.deleted_at IS NULL
    GROUP BY b.id
  `.execute(db);

  const book = rows[0];
  if (!book) throw notFound("Libro no encontrado");

  // byteSize y ownerId salen del media_asset: el primero para que la pantalla
  // avise cuánto pesa antes de que alguien empiece a bajarlo, el segundo para
  // saber si a quien mira le corresponde el botón de borrar.
  const files = await db
    .selectFrom("bookFiles as bf")
    .innerJoin("mediaAssets as ma", "ma.id", "bf.mediaAssetId")
    .select([
      "bf.id as id",
      "bf.format as format",
      "bf.accessLevel as accessLevel",
      "ma.byteSize as byteSize",
      "ma.ownerId as ownerId",
    ])
    .where("bf.bookId", "=", id)
    .execute();

  // byteSize es bigint en la base y llega como BigInt, que JSON.stringify no
  // sabe serializar: sin este Number(), la respuesta entera revienta.
  return { ...book, files: files.map((f) => ({ ...f, byteSize: Number(f.byteSize) })) };
}

export type ShelfStatus = "want" | "reading" | "read";

export async function setShelf(
  db: Database,
  userId: string,
  bookId: string,
  status: ShelfStatus,
  progress?: number | null,
) {
  // Si no mandan progreso: 'read' implica 100%; para los demás, el default 0 al
  // insertar, pero en un update se CONSERVA el progreso previo (no se pisa).
  const insertProgress = progress ?? (status === "read" ? 100 : 0);
  await sql`
    INSERT INTO app.book_shelves (user_id, book_id, status, progress)
    VALUES (${userId}::uuid, ${bookId}::uuid, ${status}, ${insertProgress})
    ON CONFLICT (user_id, book_id) DO UPDATE
      SET status = EXCLUDED.status,
          progress = COALESCE(
            ${progress ?? null}::int,
            CASE WHEN EXCLUDED.status = 'read' THEN 100 ELSE app.book_shelves.progress END
          ),
          updated_at = now()
  `.execute(db);
}

// ── Importar del catálogo externo ─────────────────────────────────────

/**
 * Trae un libro de Gutendex a nuestra biblioteca.
 *
 * NO copia el archivo: guarda los enlaces a donde ya está publicado, más la
 * ficha de origen y lo que la fuente declara sobre derechos. Por eso no toca
 * book_files, que es para lo que alojamos nosotros.
 *
 * Es idempotente: si el libro ya se importó, devuelve el que hay en vez de
 * duplicarlo. El UNIQUE (external_provider, external_id) lo respalda, pero se
 * comprueba antes para poder decir "ya estaba" en vez de fallar.
 */
export async function importarLibroExterno(db: Database, libro: LibroExterno) {
  const yaEsta = await db
    .selectFrom("books")
    .select(["id"])
    .where("externalProvider", "=", libro.provider)
    .where("externalId", "=", libro.externalId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();

  if (yaEsta) return { bookId: yaEsta.id, yaExistia: true };

  const bookId = await db.transaction().execute(async (trx) => {
    const book = await trx
      .insertInto("books")
      .values({
        externalProvider: libro.provider,
        externalId: libro.externalId,
        title: libro.title.slice(0, 500),
        publicationYear: libro.publicationYear,
        coverUrl: libro.coverUrl,
        // El primero de la lista: la columna guarda un idioma, y Gutendex
        // devuelve un arreglo porque hay ediciones bilingües.
        languageCode: libro.languages[0]?.slice(0, 10) ?? null,
        readUrl: libro.readUrl,
        downloadUrl: libro.downloadUrl,
        sourceUrl: libro.sourceUrl,
        rightsNote: libro.rightsNote.slice(0, 200),
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    await vincularAutores(trx, book.id, libro.authors);
    return book.id;
  });

  return { bookId, yaExistia: false };
}

// ── Autores ───────────────────────────────────────────────────────────

/**
 * Enlaza los autores de un libro, creándolos si no existían.
 *
 * Se buscan por NOMBRE: ni Gutendex ni quien pega un enlace dan un id
 * estable, así que `external_id` queda nulo (el UNIQUE admite varios nulos).
 * Lo usan las dos vías de alta —importar y pegar enlace— y por eso vive acá y
 * no dentro de ninguna de las dos.
 */
async function vincularAutores(
  trx: Transaction<DB>,
  bookId: string,
  nombres: string[],
): Promise<void> {
  let orden = 0;
  for (const nombre of nombres) {
    const limpio = nombre.trim().slice(0, 200);
    if (!limpio) continue;

    const existente = await trx
      .selectFrom("bookAuthors")
      .select(["id"])
      .where("name", "=", limpio)
      .executeTakeFirst();

    const autorId =
      existente?.id ??
      (
        await trx
          .insertInto("bookAuthors")
          .values({ name: limpio })
          .returning(["id"])
          .executeTakeFirstOrThrow()
      ).id;

    await trx
      .insertInto("bookAuthorLinks")
      .values({ bookId, authorId: autorId, authorOrder: orden })
      .onConflict((oc) => oc.doNothing())
      .execute();
    orden += 1;
  }
}

// ── Alta por enlace ───────────────────────────────────────────────────

/**
 * Agrega un libro a partir de los enlaces que pega una persona.
 *
 * Igual que la importación, NO alojamos nada: se guarda a dónde apunta. La
 * diferencia es de dónde sale la responsabilidad. En Gutendex la procedencia
 * la respalda la fuente; acá la pone quien sube el enlace, y por eso quedan
 * registrados `added_by` y su declaración de derechos.
 *
 * `external_provider = 'manual'` con `external_id` nulo: el UNIQUE sobre el
 * par admite varios nulos, así que no hay choque entre libros manuales.
 */
export async function agregarLibroPorEnlace(
  db: Database,
  userId: string,
  datos: LinkBookInput,
) {
  const bookId = await db.transaction().execute(async (trx) => {
    const book = await trx
      .insertInto("books")
      .values({
        externalProvider: "manual",
        addedBy: userId,
        title: datos.title.slice(0, 500),
        publicationYear: datos.publicationYear ?? null,
        coverUrl: datos.coverUrl ?? null,
        languageCode: datos.languageCode?.slice(0, 10) ?? null,
        readUrl: datos.readUrl ?? null,
        downloadUrl: datos.downloadUrl ?? null,
        sourceUrl: datos.sourceUrl ?? null,
        rightsNote: datos.rightsNote.slice(0, 200),
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    await vincularAutores(trx, book.id, datos.authors);
    return book.id;
  });

  return { bookId };
}

// ── Archivos del libro (lo que alojamos nosotros) ──────────────────────

export interface ArchivoAGuardar {
  bookId: string;
  /** Quién lo sube: queda en media_assets.owner_id y es quien puede borrarlo. */
  ownerId: string;
  format: "epub" | "pdf" | "mobi";
  accessLevel: "public" | "community" | "restricted";
  bucketName: string;
  objectKey: string;
  mediaType: string;
  byteSize: number;
  checksumSha256: Buffer;
}

/**
 * Anota un archivo ya subido al storage: una fila en media_assets (el objeto)
 * y otra en book_files (que ese objeto es tal formato de tal libro).
 *
 * Las dos van en una transacción porque por separado dejan basura que nadie
 * vuelve a mirar: un media_asset sin book_files es un archivo pago y
 * escondido, y la FK impide el caso inverso.
 *
 * El libro se comprueba acá dentro y no antes: entre un SELECT previo y el
 * INSERT alguien pudo borrarlo, y el error de FK que saldría entonces es
 * ilegible para quien está mirando la pantalla.
 */
export async function guardarArchivoDeLibro(db: Database, a: ArchivoAGuardar) {
  return db.transaction().execute(async (trx) => {
    const libro = await trx
      .selectFrom("books")
      .select(["id"])
      .where("id", "=", a.bookId)
      .where("deletedAt", "is", null)
      .executeTakeFirst();
    if (!libro) throw notFound("Libro no encontrado");

    const asset = await trx
      .insertInto("mediaAssets")
      .values({
        ownerId: a.ownerId,
        bucketName: a.bucketName,
        objectKey: a.objectKey,
        mediaType: a.mediaType,
        byteSize: BigInt(a.byteSize),
        checksumSha256: a.checksumSha256,
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    const file = await trx
      .insertInto("bookFiles")
      .values({
        bookId: a.bookId,
        mediaAssetId: asset.id,
        format: a.format,
        accessLevel: a.accessLevel,
      })
      .returning(["id", "format", "accessLevel", "createdAt"])
      .executeTakeFirstOrThrow();

    return file;
  });
}

/**
 * Saca el archivo del catálogo y devuelve dónde vivía, para que quien llama
 * borre el objeto del storage.
 *
 * Primero la base y después el storage, no al revés: si el borrado del objeto
 * falla, queda un objeto sin referencia (plata, nada más); si se cayera en el
 * medio al revés, quedaría una fila que promete un archivo que ya no existe y
 * el botón de descargar daría un error raro.
 *
 * Sólo lo borra quien lo subió. Es la misma regla que usa el resto del
 * proyecto cuando todavía no hay roles finos, y no hace falta más para que
 * nadie te vacíe la biblioteca.
 */
export async function eliminarArchivoDeLibro(db: Database, fileId: string, userId: string) {
  return db.transaction().execute(async (trx) => {
    const file = await trx
      .selectFrom("bookFiles as bf")
      .innerJoin("mediaAssets as ma", "ma.id", "bf.mediaAssetId")
      .select([
        "bf.id as id",
        "bf.mediaAssetId as mediaAssetId",
        "ma.ownerId as ownerId",
        "ma.bucketName as bucketName",
        "ma.objectKey as objectKey",
      ])
      .where("bf.id", "=", fileId)
      .executeTakeFirst();

    if (!file) throw notFound("Archivo de libro no encontrado");
    if (file.ownerId !== userId) throw forbidden("Sólo quien subió el archivo puede borrarlo");

    // book_files primero: media_assets tiene ON DELETE RESTRICT del otro lado.
    await trx.deleteFrom("bookFiles").where("id", "=", fileId).execute();
    await trx.deleteFrom("mediaAssets").where("id", "=", file.mediaAssetId).execute();

    return { bucketName: file.bucketName, objectKey: file.objectKey };
  });
}
