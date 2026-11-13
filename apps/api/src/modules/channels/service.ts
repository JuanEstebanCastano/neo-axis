/**
 * SECCIONES DE LA COMUNIDAD
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Una sección es un lugar donde se conversa: "Libros", "Desarrollo". Los
 * mensajes de una sección SON posts con channel_id, así que heredan gratis
 * los comentarios, la moderación, el borrado lógico y la búsqueda.
 *
 * TENÉ EN CUENTA
 * El listado de mensajes pagina por `id` y no por `created_at`. Los uuidv7
 * ya están ordenados por tiempo y dan un orden TOTAL; con created_at, dos
 * mensajes del mismo milisegundo hacen que el segundo se saltee entre
 * páginas y nadie se entera. En un feed eso casi no pasa; en un chat, pasa.
 *
 * Y la visibilidad se impone en el WHERE, nunca llamando a canViewPost en un
 * bucle: son hasta 3 consultas por post, o sea 150 idas y vueltas para una
 * página de 50 mensajes.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { Database } from "@neoaxis/db";
import { conflict, notFound } from "../../lib/errors.js";
import { listAttachmentsForPosts } from "./attachments.js";
import { createPost } from "../posts/service.js";
import { slugify } from "./slug.js";

export interface CreateChannelInput {
  name: string;
  slug?: string | undefined;
  description?: string | null | undefined;
  topic?: string | null | undefined;
  createdBy: string;
}

export interface ListMessagesInput {
  channelId: string;
  before?: string | undefined;
  after?: string | undefined;
  limit: number;
}

/** Las secciones vivas, en el orden en que se muestran en la barra lateral. */
export async function listChannels(db: Database) {
  return db
    .selectFrom("channels")
    .select([
      "id", "slug", "name", "description", "topic",
      "sortOrder", "archivedAt", "createdAt",
    ])
    .where("deletedAt", "is", null)
    .orderBy("sortOrder")
    .orderBy("createdAt")
    .execute();
}

export async function getChannelBySlug(db: Database, slug: string) {
  const channel = await db
    .selectFrom("channels")
    .select([
      "id", "slug", "name", "description", "topic",
      "sortOrder", "archivedAt", "createdAt",
    ])
    .where("slug", "=", slug)
    .where("deletedAt", "is", null)
    .executeTakeFirst();

  if (!channel) throw notFound("La sección no existe");
  return channel;
}

export async function createChannel(db: Database, input: CreateChannelInput) {
  // El slug se deriva del nombre si no lo mandan. Puede quedar vacío si el
  // nombre era sólo símbolos: ahí sí hay que pedir uno a mano.
  const slug = slugify(input.slug ?? input.name);
  if (!slug) {
    throw conflict("Ese nombre no da una dirección usable: escribí un slug a mano");
  }

  try {
    return await db
      .insertInto("channels")
      .values({
        slug,
        name: input.name,
        description: input.description ?? null,
        topic: input.topic ?? null,
        createdBy: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  } catch (err) {
    // channels_slug_active_uq. Repetir un nombre es un desliz normal, no un
    // fallo del servidor: merece un mensaje, no un 500.
    if ((err as { code?: string }).code === "23505") {
      throw conflict(`Ya hay una sección en /${slug}`);
    }
    throw err;
  }
}

/**
 * Los mensajes de una sección, del más nuevo al más viejo.
 *
 * Los WHERE repiten LITERALMENTE los predicados de posts_channel_idx. Si se
 * tocan acá sin tocarlos allá, el planner deja de poder probar que el índice
 * parcial aplica y la consulta se va a secuencial.
 */
export async function listMessages(db: Database, input: ListMessagesInput) {
  let query = db
    .selectFrom("posts as p")
    .innerJoin("users as u", "u.id", "p.authorId")
    .select([
      "p.id as id",
      "p.bodyMarkdown as bodyMarkdown",
      "p.createdAt as createdAt",
      "p.authorId as authorId",
      "u.username as authorUsername",
      "u.displayName as authorDisplayName",
      "u.avatarUrl as authorAvatarUrl",
      // Cuántas respuestas tiene el mensaje. LATERAL y no una consulta por
      // mensaje: una página de 30 serían 30 viajes extra al pooler.
      (eb) => eb
        .selectFrom("comments as c")
        .select(({ fn }) => fn.countAll<string>().as("n"))
        .whereRef("c.postId", "=", "p.id")
        .where("c.deletedAt", "is", null)
        .where("c.hiddenAt", "is", null)
        .as("commentCount"),
    ])
    .where("p.channelId", "=", input.channelId)
    .where("p.deletedAt", "is", null)
    .where("p.status", "=", "published")
    .where("p.hiddenAt", "is", null)
    .orderBy("p.id", "desc")
    .limit(input.limit);

  // Scroll hacia atrás.
  if (input.before) query = query.where("p.id", "<", input.before);
  // Refresco: lo que llegó desde la última vez.
  if (input.after) query = query.where("p.id", ">", input.after);

  const rows = await query.execute();

  // Los adjuntos de TODA la página en una consulta. Pedirlos mensaje por
  // mensaje serían cincuenta viajes más al pooler para pintar una pantalla.
  const adjuntos = await listAttachmentsForPosts(db, rows.map((r) => r.id as string));

  // Se piden en orden descendente (el índice los da así y el cursor funciona
  // sobre eso), pero se leen de viejo a nuevo, como cualquier conversación.
  const items = rows.reverse().map((r) => ({
    ...r,
    commentCount: Number(r.commentCount ?? 0),
    attachments: adjuntos.get(r.id as string) ?? [],
  }));

  return {
    items,
    // El cursor para seguir hacia atrás es el id del más viejo de la tanda.
    nextBefore: rows.length === input.limit && items[0] ? items[0].id : null,
  };
}

/**
 * Publicar en una sección.
 *
 * Delega en createPost en vez de insertar acá: esa función ya mete el post,
 * las menciones, las notificaciones y el índice de búsqueda en una sola
 * transacción. Duplicarla sería dos sitios donde acordarse de indexar.
 */
export async function createMessage(
  db: Database,
  input: {
    channelId: string;
    authorId: string;
    bodyMarkdown: string;
    mentionedUserIds?: string[] | undefined;
  },
) {
  const channel = await db
    .selectFrom("channels")
    .select(["id", "archivedAt"])
    .where("id", "=", input.channelId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();

  if (!channel) throw notFound("La sección no existe");
  if (channel.archivedAt) throw conflict("Esta sección está archivada: ya no admite mensajes");

  const post = await createPost(db, {
    authorId: input.authorId,
    channelId: input.channelId,
    bodyMarkdown: input.bodyMarkdown,
    ...(input.mentionedUserIds ? { mentionedUserIds: input.mentionedUserIds } : {}),
  });

  return post;
}
