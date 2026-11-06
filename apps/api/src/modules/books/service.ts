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

export interface BookCard {
  id: string;
  title: string;
  publicationYear: number | null;
  coverUrl: string | null;
  languageCode: string | null;
  authors: string[];
  ratingAvg: number | null;
}

export async function listBooks(db: Database, limit: number): Promise<BookCard[]> {
  const { rows } = await sql<BookCard>`
    SELECT b.id::text AS id, b.title,
           b.publication_year AS "publicationYear",
           b.cover_url AS "coverUrl",
           b.language_code AS "languageCode",
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
  progress: number,
) {
  await sql`
    INSERT INTO app.book_shelves (user_id, book_id, status, progress)
    VALUES (${userId}::uuid, ${bookId}::uuid, ${status}, ${progress})
    ON CONFLICT (user_id, book_id) DO UPDATE
      SET status = EXCLUDED.status, progress = EXCLUDED.progress, updated_at = now()
  `.execute(db);
}
