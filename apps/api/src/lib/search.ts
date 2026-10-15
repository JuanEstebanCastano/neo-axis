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
  opts: { limit?: number; entityType?: IndexableEntity } = {},
): Promise<SearchHit[]> {
  const limit = Math.min(opts.limit ?? 20, 100);

  const { rows } = await sql<SearchHit>`
    SELECT entity_type AS "entityType",
           entity_id::text AS "entityId",
           title,
           GREATEST(
             ts_rank(search_vector, websearch_to_tsquery('spanish', ${query})),
             similarity(coalesce(title, ''), ${query})
           ) AS rank
    FROM app.search_documents
    WHERE (
      search_vector @@ websearch_to_tsquery('spanish', ${query})
      OR coalesce(title, '') % ${query}
    )
    ${opts.entityType ? sql`AND entity_type = ${opts.entityType}` : sql``}
    ORDER BY rank DESC
    LIMIT ${limit}
  `.execute(db);

  return rows;
}
