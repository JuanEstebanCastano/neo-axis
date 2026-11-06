/**
 * LÓGICA DE SNIPPETS
 * ──────────────────────────────────────────────────────────────────────
 * Un snippet es código compartible. Se guarda como un post (para heredar el
 * feed, los comentarios y la búsqueda) más su fila en post_snippets, todo en
 * una transacción.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { Database } from "@neoaxis/db";
import { sql } from "@neoaxis/db";
import { upsertSearchDocument } from "../../lib/search.js";

export interface SnippetCard {
  id: string;
  postId: string;
  title: string;
  language: string;
  filename: string | null;
  sourceCode: string;
  createdAt: string;
  authorUsername: string;
  authorDisplayName: string;
}

export async function listSnippets(db: Database, limit: number): Promise<SnippetCard[]> {
  const { rows } = await sql<SnippetCard>`
    SELECT s.id::text AS id, s.post_id::text AS "postId", s.title, s.language,
           s.filename, s.source_code AS "sourceCode", s.created_at AS "createdAt",
           u.username AS "authorUsername", u.display_name AS "authorDisplayName"
    FROM app.post_snippets s
    JOIN app.posts p ON p.id = s.post_id AND p.deleted_at IS NULL
    JOIN app.users u ON u.id = p.author_id
    ORDER BY s.created_at DESC
    LIMIT ${limit}
  `.execute(db);
  return rows;
}

export interface CreateSnippetInput {
  authorId: string;
  title: string;
  language: string;
  sourceCode: string;
  description?: string | null | undefined;
  filename?: string | null | undefined;
}

export async function createSnippet(db: Database, input: CreateSnippetInput) {
  return db.transaction().execute(async (trx) => {
    const post = await trx
      .insertInto("posts")
      .values({ authorId: input.authorId, title: input.title, publishedAt: new Date() })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    const snippet = await trx
      .insertInto("postSnippets")
      .values({
        postId: post.id as string,
        title: input.title,
        language: input.language,
        sourceCode: input.sourceCode,
        description: input.description ?? null,
        filename: input.filename ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // El snippet entra al índice de búsqueda como su post.
    await upsertSearchDocument(trx, {
      entityType: "post",
      entityId: post.id as string,
      title: input.title,
      content: input.sourceCode,
    });

    return snippet;
  });
}
