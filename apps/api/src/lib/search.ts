/**
 * BÚSQUEDA
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Mantiene actualizado el índice de búsqueda y resuelve las consultas.
 * Combina búsqueda por palabras con tolerancia a errores de tipeo.
 *
 * TENÉ EN CUENTA
 * El índice se actualiza DENTRO de la misma transacción que guarda la
 * publicación. Si falla el índice, falla la publicación: así nunca queda
 * contenido guardado que no aparece al buscar.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { Database, Transaction, DB } from "@neoaxis/db";
import { sql } from "@neoaxis/db";

/**
 * app.search_documents está desnormalizada a propósito y sin FKs: el DDL delega
 * la sincronización a la aplicación. Para que no derive, este upsert se llama
 * SIEMPRE dentro de la misma transacción que escribe la entidad. Si falla la
 * indexación, falla la escritura. Sin estados intermedios.
 */

export type IndexableEntity = "post" | "book" | "comment" | "user";

export interface IndexPayload {
  entityType: IndexableEntity;
  entityId: string;
  title: string | null;
  content: string | null;
  /** Configuración de diccionario de Postgres. 'spanish' por defecto. */
  language?: "spanish" | "english" | "simple";
}

export async function upsertSearchDocument(
  trx: Transaction<DB> | Database,
  payload: IndexPayload,
): Promise<void> {
  const lang = payload.language ?? "spanish";

  await sql`
    INSERT INTO app.search_documents (entity_type, entity_id, title, content, search_vector)
    VALUES (
      ${payload.entityType},
      ${payload.entityId}::uuid,
      ${payload.title},
      ${payload.content},
      setweight(to_tsvector(${lang}::regconfig, coalesce(${payload.title}, '')), 'A')
      || setweight(to_tsvector(${lang}::regconfig, coalesce(${payload.content}, '')), 'B')
    )
    ON CONFLICT (entity_type, entity_id) DO UPDATE SET
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      search_vector = EXCLUDED.search_vector,
      updated_at = now()
  `.execute(trx);
}

export async function removeSearchDocument(
  trx: Transaction<DB> | Database,
  entityType: IndexableEntity,
  entityId: string,
): Promise<void> {
  await sql`
    DELETE FROM app.search_documents
    WHERE entity_type = ${entityType} AND entity_id = ${entityId}::uuid
  `.execute(trx);
}

export interface SearchHit {
  entityType: string;
  entityId: string;
  title: string | null;
  rank: number;
}

/** Full-text con fallback a trigramas para errores de tipeo. */
export async function search(
  db: Database,
  query: string,
  opts: { limit?: number | undefined; entityType?: IndexableEntity | undefined } = {},
): Promise<SearchHit[]> {
  const limit = Math.min(opts.limit ?? 20, 100);

  const { rows } = await sql<SearchHit>`
    SELECT sd.entity_type AS "entityType",
           sd.entity_id::text AS "entityId",
           sd.title,
           GREATEST(
             ts_rank(sd.search_vector, websearch_to_tsquery('spanish', ${query})),
             similarity(coalesce(sd.title, ''), ${query})
           ) AS rank
    FROM app.search_documents sd
    LEFT JOIN app.posts p ON p.id = sd.entity_id AND sd.entity_type = 'post'
    -- Un comentario hereda la visibilidad de su publicación: hay que mirar
    -- las dos. Sin esto, borrar un comentario lo saca del hilo pero lo deja
    -- saliendo en las búsquedas, y moderar la publicación no silencia su
    -- debate.
    LEFT JOIN app.comments c ON c.id = sd.entity_id AND sd.entity_type = 'comment'
    LEFT JOIN app.posts cp ON cp.id = c.post_id
    WHERE (
      sd.search_vector @@ websearch_to_tsquery('spanish', ${query})
      OR coalesce(sd.title, '') % ${query}
    )
    -- Sólo contenido visible: los posts restringidos, ocultos o borrados no salen.
    AND (
      sd.entity_type <> 'post'
      OR (p.deleted_at IS NULL AND p.status = 'published' AND p.hidden_at IS NULL AND p.visibility = 'community')
    )
    AND (
      sd.entity_type <> 'comment'
      OR (
        c.deleted_at IS NULL AND c.hidden_at IS NULL
        AND cp.deleted_at IS NULL AND cp.status = 'published'
        AND cp.hidden_at IS NULL AND cp.visibility = 'community'
      )
    )
    ${opts.entityType ? sql`AND sd.entity_type = ${opts.entityType}` : sql``}
    ORDER BY rank DESC
    LIMIT ${limit}
  `.execute(db);

  return rows;
}

// ── Recomendaciones semánticas (pgvector) ────────────────────────────────
// La extensión vive en el schema 'extensions'; el search_path del API es
// 'app,public', así que calificamos el operador: OPERATOR(extensions.<=>).

export interface RecoHit {
  entityType: string;
  entityId: string;
  title: string | null;
  distance: number;
}

export async function recommendByEmbedding(
  db: Database,
  embedding: number[],
  opts: { excludeEntityId?: string | undefined; limit?: number | undefined } = {},
): Promise<RecoHit[]> {
  const vec = `[${embedding.join(",")}]`;
  const limit = Math.min(opts.limit ?? 10, 50);

  const { rows } = await sql<RecoHit>`
    SELECT sd.entity_type AS "entityType",
           sd.entity_id::text AS "entityId",
           sd.title,
           sd.embedding OPERATOR(extensions.<=>) ${vec}::extensions.vector AS distance
    FROM app.search_documents sd
    LEFT JOIN app.posts p ON p.id = sd.entity_id AND sd.entity_type = 'post'
    WHERE sd.embedding IS NOT NULL
      AND (
        sd.entity_type <> 'post'
        OR (p.deleted_at IS NULL AND p.status = 'published' AND p.hidden_at IS NULL AND p.visibility = 'community')
      )
      ${opts.excludeEntityId ? sql`AND sd.entity_id <> ${opts.excludeEntityId}::uuid` : sql``}
    ORDER BY sd.embedding OPERATOR(extensions.<=>) ${vec}::extensions.vector
    LIMIT ${limit}
  `.execute(db);

  return rows;
}

/**
 * El texto con el que un libro entra al índice.
 *
 * Un libro no tiene cuerpo que indexar: no guardamos la obra, sólo su ficha.
 * Lo único que lo distingue de otro es el título, quién lo escribió y de
 * cuándo es, así que eso ES el documento. Por eso va aparte y es una función
 * pura: es la única parte de la indexación que se puede probar sin base.
 *
 * El autor pesa tanto como el título a propósito. Quien busca "García
 * Márquez" espera sus libros, y para el embedding "Cien años de soledad,
 * Gabriel García Márquez" y "El amor en los tiempos del cólera, Gabriel
 * García Márquez" quedan cerca, que es exactamente lo que "parecidos a este"
 * tiene que contestar.
 */
export function textoDeLibro(
  titulo: string,
  autores: string[],
  anio?: number | null,
): { title: string; content: string } {
  const firmas = autores.map((a) => a.trim()).filter(Boolean);
  const partes = [firmas.join(", "), anio ? String(anio) : ""].filter(Boolean);
  return { title: titulo.trim(), content: partes.join(" · ") };
}

/**
 * Mete en el índice los libros que nunca entraron.
 *
 * Hacía falta porque la indexación de libros se conectó tarde: el tipo "book"
 * existía en IndexableEntity desde el principio y nadie lo escribía, así que
 * todo libro anterior a ese arreglo está fuera del índice y "parecidos a
 * este" no lo encuentra jamás. Se llama desde el reindex, que es donde la
 * persona ya está pidiendo que se arregle el pasado.
 *
 * Sólo inserta los que faltan: el que ya está indexado se mantiene como está,
 * porque su documento puede haber cambiado por otra vía y no es asunto de un
 * backfill decidirlo.
 */
export async function backfillBookDocuments(db: Database, batch = 500): Promise<number> {
  const { rows } = await sql<{
    id: string;
    title: string;
    publicationYear: number | null;
    authors: string[];
  }>`
    SELECT b.id,
           b.title,
           b.publication_year AS "publicationYear",
           coalesce(
             array_agg(a.name ORDER BY l.author_order) FILTER (WHERE a.name IS NOT NULL),
             ARRAY[]::text[]
           ) AS authors
    FROM app.books b
    LEFT JOIN app.book_author_links l ON l.book_id = b.id
    LEFT JOIN app.book_authors a ON a.id = l.author_id
    WHERE b.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM app.search_documents sd
        WHERE sd.entity_type = 'book' AND sd.entity_id = b.id
      )
    GROUP BY b.id
    LIMIT ${batch}
  `.execute(db);

  for (const libro of rows) {
    const doc = textoDeLibro(libro.title, libro.authors, libro.publicationYear);
    await upsertSearchDocument(db, { entityType: "book", entityId: libro.id, ...doc });
  }

  return rows.length;
}

/**
 * Genera y guarda los embeddings que falten en search_documents.
 * Pensado para backfill o un job periódico; devuelve cuántos indexó.
 */
export async function backfillEmbeddings(
  db: Database,
  embed: (text: string) => Promise<number[]>,
  batch = 200,
): Promise<number> {
  const rows = await db
    .selectFrom("searchDocuments")
    .select(["entityType", "entityId", "title", "content"])
    .where("embedding", "is", null)
    .limit(batch)
    .execute();

  let indexed = 0;
  for (const r of rows) {
    const text = [r.title, r.content].filter(Boolean).join("\n").trim();
    if (!text) continue;
    const emb = await embed(text);
    const vec = `[${emb.join(",")}]`;
    await sql`
      UPDATE app.search_documents
      SET embedding = ${vec}::extensions.vector
      WHERE entity_type = ${r.entityType} AND entity_id = ${r.entityId}::uuid
    `.execute(db);
    indexed++;
  }
  return indexed;
}
