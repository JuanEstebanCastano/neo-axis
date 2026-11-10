/**
 * LÓGICA DE COLECCIONES
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Una colección agrupa, en orden, ítems de distinto tipo (libro, repo,
 * snippet o post). Es la capa que une los dos mundos: libros y código.
 *
 * TENÉ EN CUENTA
 * Los ítems son polimórficos: la tabla tiene una FK por tipo y un CHECK que
 * exige exactamente una. Acá se traduce `itemType` a la columna correcta.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { Database } from "@neoaxis/db";
import { sql } from "@neoaxis/db";
import { notFound, forbidden, badRequest, conflict } from "../../lib/errors.js";
import { canViewPost } from "../../lib/rbac.js";

export type CollectionItemType = "book" | "repository" | "snippet" | "post";

export interface CreateCollectionInput {
  ownerId: string;
  title: string;
  slug?: string | null | undefined;
  description?: string | null | undefined;
  visibility?: "community" | "restricted" | undefined;
}

export async function createCollection(db: Database, input: CreateCollectionInput) {
  return db
    .insertInto("collections")
    .values({
      ownerId: input.ownerId,
      title: input.title,
      slug: input.slug ?? null,
      description: input.description ?? null,
      visibility: input.visibility ?? "community",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export interface AddItemInput {
  collectionId: string;
  actorId: string;
  itemType: CollectionItemType;
  bookId?: string | undefined;
  repositoryId?: string | undefined;
  snippetId?: string | undefined;
  postId?: string | undefined;
  note?: string | null | undefined;
  sortOrder?: number | undefined;
}

/**
 * Mapea el tipo de ítem a las cuatro columnas polimórficas: la del tipo lleva
 * el id, las otras tres van en null (lo que exige el CHECK de la tabla).
 */
export function itemColumns(itemType: CollectionItemType, targetId: string) {
  return {
    bookId: itemType === "book" ? targetId : null,
    repositoryId: itemType === "repository" ? targetId : null,
    snippetId: itemType === "snippet" ? targetId : null,
    postId: itemType === "post" ? targetId : null,
  };
}

async function assertOwner(db: Database, collectionId: string, actorId: string) {
  const col = await db
    .selectFrom("collections")
    .select(["id", "ownerId", "deletedAt"])
    .where("id", "=", collectionId)
    .executeTakeFirst();
  if (!col || col.deletedAt) throw notFound("La colección no existe");
  if (col.ownerId !== actorId) throw forbidden("No sos el dueño de la colección");
}

export async function addCollectionItem(db: Database, input: AddItemInput) {
  await assertOwner(db, input.collectionId, input.actorId);

  const targetId =
    input.itemType === "book" ? input.bookId
    : input.itemType === "repository" ? input.repositoryId
    : input.itemType === "snippet" ? input.snippetId
    : input.postId;
  if (!targetId) throw badRequest(`Falta el id del ítem para el tipo '${input.itemType}'`);

  // Validar que el recurso existe (evita el 500 por violación de FK y el uso del
  // endpoint como oráculo de UUIDs) y, para posts, que el actor puede verlo.
  if (input.itemType === "post") {
    const ok = await canViewPost(db, targetId, input.actorId);
    if (!ok) throw notFound("El post no existe o no tenés acceso");
  } else if (input.itemType === "book") {
    const b = await db.selectFrom("books").select("id")
      .where("id", "=", targetId).where("deletedAt", "is", null).executeTakeFirst();
    if (!b) throw notFound("El libro no existe");
  } else if (input.itemType === "repository") {
    const r = await db.selectFrom("githubRepositories").select("id")
      .where("id", "=", targetId).executeTakeFirst();
    if (!r) throw notFound("El repositorio no existe");
  } else {
    // Un snippet es una vista sobre un post y hereda su visibilidad. Mirar
    // sólo post_snippets dejaba un hueco: con el UUID a mano se podía citar
    // en una colección el snippet de un post retirado, oculto o restringido,
    // y su título volvía a aparecer. El tipo "post" ya se validaba así.
    const s = await db.selectFrom("postSnippets").select(["id", "postId"])
      .where("id", "=", targetId).executeTakeFirst();
    if (!s) throw notFound("El snippet no existe");
    if (!(await canViewPost(db, s.postId, input.actorId))) {
      throw notFound("El snippet no existe o no tenés acceso");
    }
  }

  try {
    return await db
      .insertInto("collectionItems")
      .values({
        collectionId: input.collectionId,
        itemType: input.itemType,
        ...itemColumns(input.itemType, targetId),
        note: input.note ?? null,
        sortOrder: input.sortOrder ?? 0,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  } catch (err) {
    // Hay un índice único por (colección, ítem) para cada tipo. Sin esto, el
    // choque salía como 500 "Error interno" y la persona no se enteraba de
    // que el ítem ya estaba ahí; agregar dos veces lo mismo es un desliz
    // normal, no un fallo del servidor.
    if ((err as { code?: string }).code === "23505") {
      throw conflict("Ese ítem ya está en la colección");
    }
    throw err;
  }
}

export async function removeCollectionItem(
  db: Database,
  collectionId: string,
  itemId: string,
  actorId: string,
) {
  await assertOwner(db, collectionId, actorId);
  await db
    .deleteFrom("collectionItems")
    .where("id", "=", itemId)
    .where("collectionId", "=", collectionId)
    .execute();
}

interface CollectionItemRow {
  id: string;
  itemType: string;
  itemId: string | null;
  title: string | null;
  note: string | null;
  sortOrder: number;
}

/** Resuelve el título de cada ítem según su tipo (join polimórfico). */
async function listItems(db: Database, collectionId: string): Promise<CollectionItemRow[]> {
  const { rows } = await sql<CollectionItemRow>`
    SELECT ci.id::text AS id,
            ci.item_type AS "itemType",
            COALESCE(ci.book_id, ci.repository_id, ci.snippet_id, ci.post_id)::text AS "itemId",
            COALESCE(b.title, gr.repository_name, sn.title, p.title) AS title,
            ci.note,
            ci.sort_order AS "sortOrder"
    FROM app.collection_items ci
    LEFT JOIN app.books b            ON b.id  = ci.book_id
    LEFT JOIN app.github_repositories gr ON gr.id = ci.repository_id
    LEFT JOIN app.post_snippets sn    ON sn.id = ci.snippet_id
    LEFT JOIN app.posts p             ON p.id  = ci.post_id
    WHERE ci.collection_id = ${collectionId}::uuid
    ORDER BY ci.sort_order, ci.created_at
  `.execute(db);
  return rows;
}

export async function getCollection(db: Database, id: string, userId: string | null) {
  const col = await db
    .selectFrom("collections")
    .select(["id", "ownerId", "title", "slug", "description", "visibility", "createdAt", "updatedAt", "deletedAt"])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!col || col.deletedAt) throw notFound("La colección no existe");
  if (col.visibility === "restricted" && col.ownerId !== userId) {
    throw forbidden("Colección restringida");
  }

  const items = await listItems(db, id);
  return { ...col, items };
}

export async function listCollections(
  db: Database,
  opts: { ownerId?: string | undefined; requesterId?: string | null | undefined; limit: number },
) {
  let q = db
    .selectFrom("collections")
    .select(["id", "ownerId", "title", "slug", "description", "visibility", "createdAt"])
    .where("deletedAt", "is", null);

  if (opts.ownerId) {
    q = q.where("ownerId", "=", opts.ownerId);
    // Las colecciones de OTRO usuario solo se listan si son públicas.
    if (opts.ownerId !== opts.requesterId) q = q.where("visibility", "=", "community");
  } else {
    q = q.where("visibility", "=", "community");
  }

  return q.orderBy("createdAt", "desc").limit(opts.limit).execute();
}

export async function softDeleteCollection(db: Database, id: string, actorId: string) {
  await assertOwner(db, id, actorId);
  await db
    .updateTable("collections")
    .set({ deletedAt: new Date() })
    .where("id", "=", id)
    .execute();
}
