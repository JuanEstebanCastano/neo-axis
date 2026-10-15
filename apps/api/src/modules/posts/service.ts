/**
 * LÓGICA DE PUBLICACIONES
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Acá pasa el trabajo real: crear una publicación toca cinco tablas, y todo
 * va dentro de una transacción (todo-o-nada).
 *
 * TENÉ EN CUENTA
 * Si querés entender el proyecto, leé este archivo con el documento
 * docs/02-como-funciona.md al lado. Es el ejemplo central.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { Database } from "@neoaxis/db";
import { upsertSearchDocument } from "../../lib/search.js";
import { notFound, forbidden } from "../../lib/errors.js";

export interface CreatePostInput {
  authorId: string;
  title?: string | null;
  slug?: string | null;
  excerpt?: string | null;
  bodyMarkdown?: string | null;
  visibility?: "community" | "restricted";
  tagIds?: string[];
  mentionedUserIds?: string[];
}

/**
 * Crear un post toca cuatro tablas (posts, post_tags, post_mentions,
 * search_documents). Va todo en una transacción: el esquema no tiene triggers
 * que lo coordinen, así que la atomicidad es responsabilidad de esta capa.
 */
export async function createPost(db: Database, input: CreatePostInput) {
  return db.transaction().execute(async (trx) => {
    const post = await trx
      .insertInto("posts")
      .values({
        authorId: input.authorId,
        title: input.title ?? null,
        slug: input.slug ?? null,
        excerpt: input.excerpt ?? null,
        bodyMarkdown: input.bodyMarkdown ?? null,
        visibility: input.visibility ?? "community",
        publishedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    if (input.tagIds?.length) {
      await trx
        .insertInto("postTags")
        .values(input.tagIds.map((tagId) => ({ postId: post.id, tagId })))
        .onConflict((oc) => oc.doNothing())
        .execute();
    }

    if (input.mentionedUserIds?.length) {
      await trx
        .insertInto("postMentions")
        .values(
          input.mentionedUserIds.map((mentionedUserId) => ({
            postId: post.id,
            mentionedUserId,
          })),
        )
        .onConflict((oc) => oc.doNothing())
        .execute();

      // Las notificaciones se insertan acá; el envío de correo lo hace el worker
      // leyendo email_notification_queue. El API nunca habla con SMTP.
      await trx
        .insertInto("notifications")
        .values(
          input.mentionedUserIds.map((recipientUserId) => ({
            recipientUserId,
            actorUserId: input.authorId,
            type: "mention" as const,
            entityType: "post",
            entityId: post.id as string,
            payload: JSON.stringify({ postId: post.id }),
          })),
        )
        .execute();
    }

    await upsertSearchDocument(trx, {
      entityType: "post",
      entityId: post.id as string,
      title: (post.title as string | null) ?? null,
      content: (post.bodyMarkdown as string | null) ?? null,
    });

    return post;
  });
}

/**
 * Borrado lógico. El DDL usa deleted_at en vez de DELETE físico, lo que
 * significa que ningún ON DELETE CASCADE se dispara: hay que limpiar el índice
 * de búsqueda a mano o el post sigue apareciendo en los resultados.
 */
export async function softDeletePost(db: Database, postId: string, actorId: string) {
  return db.transaction().execute(async (trx) => {
    const post = await trx
      .selectFrom("posts")
      .select(["id", "authorId", "deletedAt"])
      .where("id", "=", postId)
      .executeTakeFirst();

    if (!post || post.deletedAt) throw notFound("El post no existe");
    if (post.authorId !== actorId) throw forbidden("No sos el autor de este post");

    await trx
      .updateTable("posts")
      .set({ deletedAt: new Date(), status: "deleted" })
      .where("id", "=", postId)
      .execute();

    await trx
      .deleteFrom("searchDocuments")
      .where("entityType", "=", "post")
      .where("entityId", "=", postId)
      .execute();
  });
}
