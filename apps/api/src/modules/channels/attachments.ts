/**
 * ADJUNTOS DE UN MENSAJE
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Cuelga de un mensaje un libro de la biblioteca, un fragmento de código o
 * un repositorio. Es el cruce que da sentido al proyecto: el libro que
 * explica el tema y el código que lo practica, en la misma conversación.
 *
 * TENÉ EN CUENTA
 * Es el mismo arco exclusivo de collection_items, con las mismas tres
 * lecciones que costó aprender allá:
 *   1. Validar que el objetivo existe ANTES de insertar, o sale un 500 por
 *      violación de clave foránea y el endpoint sirve de oráculo de UUIDs.
 *   2. Un snippet es una vista sobre un post y hereda su visibilidad: hay
 *      que pasar por canViewPost o se cuela el código de un post retirado.
 *   3. El choque del índice único es un 409 con mensaje, no un 500.
 *
 * Y al LEER, la visibilidad se impone en el JOIN. Comprobarla al adjuntar no
 * basta: el post dueño de un snippet puede ocultarse después, y entonces su
 * título reaparecería en un debate público.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { Database } from "@neoaxis/db";
import { sql } from "@neoaxis/db";
import { conflict, notFound } from "../../lib/errors.js";
import { canViewPost } from "../../lib/rbac.js";

export type AttachmentType = "book" | "repository" | "snippet";

export interface AdjuntoLeido {
  id: string;
  postId: string;
  attachmentType: AttachmentType;
  targetId: string;
  title: string | null;
  note: string | null;
  /** Sólo para libros: a dónde lleva el botón de descarga. */
  downloadUrl: string | null;
  readUrl: string | null;
  /** Sólo para repositorios. */
  canonicalUrl: string | null;
  /** Sólo para fragmentos de código. */
  language: string | null;
}

/**
 * Gemelo de itemColumns() en collections/service.ts: traduce el tipo a la
 * única columna que debe quedar llena.
 */
export function attachmentColumns(tipo: AttachmentType, targetId: string) {
  return {
    bookId: tipo === "book" ? targetId : null,
    repositoryId: tipo === "repository" ? targetId : null,
    snippetId: tipo === "snippet" ? targetId : null,
  };
}

export async function addAttachment(
  db: Database,
  input: {
    postId: string;
    attachmentType: AttachmentType;
    targetId: string;
    note?: string | null | undefined;
    actorId: string;
  },
) {
  // Sólo el autor del mensaje le cuelga cosas.
  const post = await db
    .selectFrom("posts")
    .select(["id", "authorId"])
    .where("id", "=", input.postId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();

  if (!post) throw notFound("El mensaje no existe");
  if (post.authorId !== input.actorId) {
    throw notFound("El mensaje no existe o no es tuyo");
  }

  if (input.attachmentType === "book") {
    const b = await db
      .selectFrom("books")
      .select("id")
      .where("id", "=", input.targetId)
      .where("deletedAt", "is", null)
      .executeTakeFirst();
    if (!b) throw notFound("El libro no existe");
  } else if (input.attachmentType === "repository") {
    const r = await db
      .selectFrom("githubRepositories")
      .select("id")
      .where("id", "=", input.targetId)
      .executeTakeFirst();
    if (!r) throw notFound("El repositorio no existe");
  } else {
    const s = await db
      .selectFrom("postSnippets")
      .select(["id", "postId"])
      .where("id", "=", input.targetId)
      .executeTakeFirst();
    if (!s) throw notFound("El fragmento no existe");
    // Hereda la visibilidad de su post.
    if (!(await canViewPost(db, s.postId, input.actorId))) {
      throw notFound("El fragmento no existe o no tenés acceso");
    }
  }

  try {
    return await db
      .insertInto("postAttachments")
      .values({
        postId: input.postId,
        attachmentType: input.attachmentType,
        ...attachmentColumns(input.attachmentType, input.targetId),
        note: input.note ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      throw conflict("Eso ya está adjunto a este mensaje");
    }
    throw err;
  }
}

export async function removeAttachment(
  db: Database,
  attachmentId: string,
  actorId: string,
) {
  const fila = await db
    .selectFrom("postAttachments as a")
    .innerJoin("posts as p", "p.id", "a.postId")
    .select(["a.id as id", "p.authorId as authorId"])
    .where("a.id", "=", attachmentId)
    .executeTakeFirst();

  if (!fila || fila.authorId !== actorId) throw notFound("El adjunto no existe");

  await db.deleteFrom("postAttachments").where("id", "=", attachmentId).execute();
  return { ok: true };
}

/**
 * Los adjuntos de VARIOS mensajes de una vez.
 *
 * Una sola consulta para la página entera: pedirlos mensaje por mensaje
 * serían cincuenta viajes al pooler para pintar una pantalla.
 *
 * El COALESCE de cuatro LEFT JOIN va en SQL crudo porque Kysely no lo
 * modela bien; es el mismo recurso que usa collections/service.ts para leer
 * los ítems de una colección.
 */
export async function listAttachmentsForPosts(
  db: Database,
  postIds: string[],
): Promise<Map<string, AdjuntoLeido[]>> {
  const porPost = new Map<string, AdjuntoLeido[]>();
  if (postIds.length === 0) return porPost;

  const { rows } = await sql<AdjuntoLeido>`
    SELECT a.id::text AS "id",
           a.post_id::text AS "postId",
           a.attachment_type AS "attachmentType",
           COALESCE(a.book_id, a.repository_id, a.snippet_id)::text AS "targetId",
           COALESCE(b.title, gr.repository_name, sn.title) AS "title",
           a.note AS "note",
           b.download_url AS "downloadUrl",
           b.read_url AS "readUrl",
           gr.canonical_url AS "canonicalUrl",
           sn.language AS "language"
    FROM app.post_attachments a
    LEFT JOIN app.books b
      ON b.id = a.book_id AND b.deleted_at IS NULL
    LEFT JOIN app.github_repositories gr
      ON gr.id = a.repository_id
    LEFT JOIN app.post_snippets sn
      ON sn.id = a.snippet_id
    -- El fragmento sólo cuenta si su post sigue visible. Así, ocultar una
    -- publicación hace desaparecer su código de todas las conversaciones
    -- donde se citó, sin que nadie tenga que acordarse de limpiarlas.
    LEFT JOIN app.posts sp
      ON sp.id = sn.post_id
     AND sp.deleted_at IS NULL
     AND sp.status = 'published'
     AND sp.hidden_at IS NULL
     AND sp.visibility = 'community'
    WHERE a.post_id = ANY(${postIds}::uuid[])
      AND (
        (a.attachment_type = 'book' AND b.id IS NOT NULL) OR
        (a.attachment_type = 'repository' AND gr.id IS NOT NULL) OR
        (a.attachment_type = 'snippet' AND sp.id IS NOT NULL)
      )
    ORDER BY a.sort_order, a.created_at
  `.execute(db);

  for (const fila of rows) {
    const lista = porPost.get(fila.postId);
    if (lista) lista.push(fila);
    else porPost.set(fila.postId, [fila]);
  }
  return porPost;
}
