/**
 * LÓGICA DE LIBROS
 * ──────────────────────────────────────────────────────────────────────
 * Listado y detalle de libros (con autores, archivos y rating promedio) y la
 * estantería del usuario. Usa SQL crudo donde hay agregaciones.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { Database } from "@neoaxis/db";
import { sql } from "@neoaxis/db";
import { notFound } from "../../lib/errors.js";
import type { LibroExterno } from "./gutendex.js";

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

export async function listBooks(db: Database, limit: number): Promise<BookCard[]> {
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
    GROUP BY b.id
    ORDER BY b.created_at DESC
    LIMIT ${limit}
  `.execute(db);
  return rows;
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

  const files = await db
    .selectFrom("bookFiles")
    .select(["id", "format", "accessLevel"])
    .where("bookId", "=", id)
    .execute();

  return { ...book, files };
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

    // Los autores se buscan por nombre: Gutendex no da un id estable para
    // ellos, así que external_id queda nulo (el UNIQUE admite varios nulos).
    let orden = 0;
    for (const nombre of libro.authors) {
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
        .values({ bookId: book.id, authorId: autorId, authorOrder: orden })
        .onConflict((oc) => oc.doNothing())
        .execute();
      orden += 1;
    }

    return book.id;
  });

  return { bookId, yaExistia: false };
}
