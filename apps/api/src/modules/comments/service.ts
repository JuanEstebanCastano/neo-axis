/**
 * COMENTARIOS
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * El debate: comentar una publicación o un mensaje de sección, y responder
 * a otro comentario.
 *
 * TENÉ EN CUENTA
 * La visibilidad se comprueba UNA vez, sobre el post padre, y después se
 * traen todos los comentarios en una sola consulta. canViewPost hace hasta
 * tres consultas; llamarlo por comentario sería insostenible.
 *
 * Como todo lo que se guarda, el comentario entra al índice de búsqueda
 * dentro de la misma transacción.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { Database } from "@neoaxis/db";
import { canViewPost } from "../../lib/rbac.js";
import { badRequest, forbidden, notFound } from "../../lib/errors.js";
import { removeSearchDocument, upsertSearchDocument } from "../../lib/search.js";
import { armarArbol } from "./tree.js";

export async function listComments(db: Database, postId: string, viewerId: string | null) {
  // Una sola comprobación de visibilidad, la del post padre: si no se puede
  // ver la publicación, no se puede ver su hilo.
  if (!(await canViewPost(db, postId, viewerId))) {
    throw notFound("La publicación no existe o no tenés acceso");
  }

  const planos = await db
    .selectFrom("comments as c")
    .innerJoin("users as u", "u.id", "c.authorId")
    .select([
      "c.id as id",
      "c.parentCommentId as parentCommentId",
      "c.bodyMarkdown as bodyMarkdown",
      "c.createdAt as createdAt",
      "c.authorId as authorId",
      "u.username as authorUsername",
      "u.displayName as authorDisplayName",
      "u.avatarUrl as authorAvatarUrl",
    ])
    .where("c.postId", "=", postId)
    .where("c.deletedAt", "is", null)
    .where("c.hiddenAt", "is", null)
    .orderBy("c.createdAt")
    .execute();

  return { items: armarArbol(planos), total: planos.length };
}

export async function createComment(
  db: Database,
  input: {
    postId: string;
    authorId: string;
    bodyMarkdown: string;
    parentCommentId?: string | undefined;
    mentionedUserIds?: string[] | undefined;
  },
) {
  const post = await db
    .selectFrom("posts")
    .select(["id", "authorId"])
    .where("id", "=", input.postId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();

  if (!post) throw notFound("La publicación no existe");
  if (!(await canViewPost(db, input.postId, input.authorId))) {
    throw notFound("La publicación no existe o no tenés acceso");
  }

  // Responder a un comentario exige que el padre sea del MISMO post. Sin esto
  // se puede colgar una respuesta de un hilo ajeno pasando un uuid cualquiera,
  // y el comentario aparece en una conversación que no es la suya.
  let padreAutorId: string | null = null;
  if (input.parentCommentId) {
    const padre = await db
      .selectFrom("comments")
      .select(["id", "postId", "authorId"])
      .where("id", "=", input.parentCommentId)
      .where("deletedAt", "is", null)
      .executeTakeFirst();

    if (!padre) throw notFound("El comentario al que respondés no existe");
    if (padre.postId !== input.postId) {
      throw badRequest("Ese comentario es de otra publicación");
    }
    padreAutorId = padre.authorId;
  }

  return db.transaction().execute(async (trx) => {
    const comment = await trx
      .insertInto("comments")
      .values({
        postId: input.postId,
        authorId: input.authorId,
        parentCommentId: input.parentCommentId ?? null,
        bodyMarkdown: input.bodyMarkdown,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    if (input.mentionedUserIds?.length) {
      await trx
        .insertInto("commentMentions")
        .values(
          input.mentionedUserIds.map((mentionedUserId) => ({
            commentId: comment.id,
            mentionedUserId,
          })),
        )
        .onConflict((oc) => oc.doNothing())
        .execute();
    }

    // A quién avisar. Nadie se notifica a sí mismo: enterarse de lo que uno
    // acaba de escribir es ruido.
    const avisos = new Map<string, "comment" | "comment_reply" | "mention">();
    if (padreAutorId) avisos.set(padreAutorId, "comment_reply");
    else if (post.authorId) avisos.set(post.authorId, "comment");
    for (const uid of input.mentionedUserIds ?? []) avisos.set(uid, "mention");
    avisos.delete(input.authorId);

    if (avisos.size) {
      // El envío de correo lo hace el worker leyendo email_notification_queue;
      // el API nunca habla con SMTP.
      await trx
        .insertInto("notifications")
        .values(
          [...avisos].map(([recipientUserId, type]) => ({
            recipientUserId,
            actorUserId: input.authorId,
            type,
            entityType: "comment",
            entityId: comment.id as string,
            payload: JSON.stringify({ postId: input.postId, commentId: comment.id }),
          })),
        )
        .execute();
    }

    await upsertSearchDocument(trx, {
      entityType: "comment",
      entityId: comment.id as string,
      title: null,
      content: comment.bodyMarkdown as string,
    });

    return comment;
  });
}

/** Borrado lógico, como el resto del proyecto. */
export async function softDeleteComment(db: Database, commentId: string, actorId: string) {
  const comment = await db
    .selectFrom("comments")
    .select(["id", "authorId"])
    .where("id", "=", commentId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();

  if (!comment) throw notFound("El comentario no existe");
  if (comment.authorId !== actorId) throw forbidden("Sólo podés borrar tus comentarios");

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("comments")
      .set({ deletedAt: new Date() })
      .where("id", "=", commentId)
      .execute();

    // El borrado lógico no dispara cascadas: hay que sacarlo del índice a
    // mano o seguiría apareciendo en las búsquedas.
    await removeSearchDocument(trx, "comment", commentId);
  });

  return { ok: true };
}
