/**
 * LÓGICA DE SNIPPETS
 * ──────────────────────────────────────────────────────────────────────
 * Un snippet es código compartible. Se guarda como un post (para heredar el
 * feed, los comentarios y la búsqueda) más su fila en post_snippets, todo en
 * una transacción.
 *
 * CONTROL DE VERSIONES
 * Un snippet puede, además, estar publicado como gist en la cuenta de GitHub
 * de su autor. Cuando lo está, GitHub guarda el historial: cada edición genera
 * una revisión nueva, con su sha, su fecha y su diff. Neo Axis no reimplementa
 * nada de eso; guarda el vínculo (gist_id) y una copia local de la última
 * revisión vista, para poder mostrar el snippet aunque GitHub no responda.
 *
 * Hoy el modelo local es de UN archivo por snippet. Un gist puede tener varios:
 * en ese caso la copia local guarda el primero y el detalle lista el resto
 * leyéndolo de GitHub en vivo.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { Database } from "@neoaxis/db";
import { sql } from "@neoaxis/db";
import { upsertSearchDocument } from "../../lib/search.js";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.js";
import * as gh from "../github/client.js";
import { getAccessToken, hasConnection } from "../github/service.js";
import { nombreDeArchivo } from "./filenames.js";

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
  gistId: string | null;
  gistHtmlUrl: string | null;
  gistOwnerLogin: string | null;
  gistSyncedAt: string | null;
}

export async function listSnippets(db: Database, limit: number): Promise<SnippetCard[]> {
  const { rows } = await sql<SnippetCard>`
    SELECT s.id::text AS id, s.post_id::text AS "postId", s.title, s.language,
           s.filename, s.source_code AS "sourceCode", s.created_at AS "createdAt",
           s.gist_id AS "gistId", s.gist_html_url AS "gistHtmlUrl",
           s.gist_owner_login AS "gistOwnerLogin", s.gist_synced_at AS "gistSyncedAt",
           u.username AS "authorUsername", u.display_name AS "authorDisplayName"
    FROM app.post_snippets s
    JOIN app.posts p ON p.id = s.post_id
      AND p.deleted_at IS NULL AND p.status = 'published'
      AND p.hidden_at IS NULL AND p.visibility = 'community'
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

// ══════════════════════════════════════════════════════════════════════
// GITHUB: publicar, versionar, importar
// ══════════════════════════════════════════════════════════════════════

interface SnippetRow {
  id: string;
  postId: string;
  title: string;
  language: string;
  filename: string | null;
  sourceCode: string;
  description: string | null;
  gistId: string | null;
  gistHtmlUrl: string | null;
  gistOwnerLogin: string | null;
  gistRevisionSha: string | null;
  gistPublic: boolean;
  authorId: string;
}

/** Trae el snippet con su autor. Lanza 404 si no existe. */
async function getSnippetRow(db: Database, snippetId: string): Promise<SnippetRow> {
  const { rows } = await sql<SnippetRow>`
    SELECT s.id::text AS id, s.post_id::text AS "postId", s.title, s.language,
           s.filename, s.source_code AS "sourceCode", s.description,
           s.gist_id AS "gistId", s.gist_html_url AS "gistHtmlUrl",
           s.gist_owner_login AS "gistOwnerLogin",
           s.gist_revision_sha AS "gistRevisionSha", s.gist_public AS "gistPublic",
           p.author_id::text AS "authorId"
    FROM app.post_snippets s
    JOIN app.posts p ON p.id = s.post_id AND p.deleted_at IS NULL
    WHERE s.id = ${snippetId}::uuid
  `.execute(db);

  const fila = rows[0];
  if (!fila) throw notFound("El snippet no existe");
  return fila;
}

/** Igual que el anterior, pero exige ser el autor. */
async function getOwnSnippet(db: Database, snippetId: string, userId: string): Promise<SnippetRow> {
  const fila = await getSnippetRow(db, snippetId);
  if (fila.authorId !== userId) throw forbidden("Sólo el autor puede modificar este snippet");
  return fila;
}

/** Datos del gist que guardamos localmente tras cada operación. */
function datosDelGist(gist: gh.Gist) {
  const sha = gist.history?.[0]?.version ?? null;
  return {
    gistId: gist.id,
    gistHtmlUrl: gist.html_url,
    gistOwnerLogin: gist.owner?.login ?? null,
    gistRevisionSha: sha,
    gistPublic: gist.public,
    gistSyncedAt: new Date(),
  };
}

/** Primer archivo del gist: es el que espeja nuestra copia local. */
function archivoPrincipal(gist: gh.Gist): gh.GistFile | null {
  const archivos = Object.values(gist.files ?? {});
  return archivos[0] ?? null;
}

export interface GistInfo {
  gistId: string;
  gistHtmlUrl: string;
  gistOwnerLogin: string | null;
  gistRevisionSha: string | null;
  gistPublic: boolean;
  files: { filename: string; language: string | null; size: number }[];
}

/**
 * Publica el snippet como gist en la cuenta de GitHub del autor.
 * A partir de acá, cada edición queda versionada en GitHub.
 */
export async function publishSnippetAsGist(
  db: Database,
  input: { snippetId: string; userId: string; isPublic: boolean },
): Promise<GistInfo> {
  const snippet = await getOwnSnippet(db, input.snippetId, input.userId);
  if (snippet.gistId) throw conflict("Este snippet ya está publicado como gist");

  const token = await getAccessToken(db, input.userId);
  const archivo = nombreDeArchivo(snippet.title, snippet.language, snippet.filename);

  const gist = await gh.createGist(token, {
    description: snippet.description?.trim() || snippet.title,
    public: input.isPublic,
    files: { [archivo]: { content: snippet.sourceCode } },
  });

  const datos = datosDelGist(gist);
  await db
    .updateTable("postSnippets")
    .set({ ...datos, filename: archivo })
    .where("id", "=", input.snippetId)
    .execute();

  return {
    gistId: datos.gistId,
    gistHtmlUrl: datos.gistHtmlUrl,
    gistOwnerLogin: datos.gistOwnerLogin,
    gistRevisionSha: datos.gistRevisionSha,
    gistPublic: datos.gistPublic,
    files: Object.values(gist.files ?? {}).map((f) => ({
      filename: f.filename,
      language: f.language,
      size: f.size,
    })),
  };
}

export interface UpdateSnippetInput {
  snippetId: string;
  userId: string;
  title?: string | undefined;
  language?: string | undefined;
  sourceCode?: string | undefined;
  description?: string | null | undefined;
  filename?: string | null | undefined;
}

/**
 * Edita el snippet. Si está publicado como gist, la edición viaja a GitHub y
 * queda como una revisión nueva: ESA es la versión canónica del historial.
 */
export async function updateSnippet(db: Database, input: UpdateSnippetInput) {
  const snippet = await getOwnSnippet(db, input.snippetId, input.userId);

  const title = input.title ?? snippet.title;
  const language = input.language ?? snippet.language;
  const sourceCode = input.sourceCode ?? snippet.sourceCode;
  const description = input.description === undefined ? snippet.description : input.description;
  const filenameNuevo = nombreDeArchivo(title, language, input.filename ?? snippet.filename);

  let datosGist: ReturnType<typeof datosDelGist> | null = null;

  if (snippet.gistId) {
    const token = await getAccessToken(db, input.userId);
    const archivoViejo = snippet.filename ?? filenameNuevo;

    // Si cambió el nombre del archivo, se lo renombra en el gist en vez de
    // crear uno nuevo y dejar el viejo colgado.
    const files: gh.GistFileInput =
      archivoViejo === filenameNuevo
        ? { [filenameNuevo]: { content: sourceCode } }
        : { [archivoViejo]: null, [filenameNuevo]: { content: sourceCode } };

    const gist = await gh.updateGist(token, snippet.gistId, {
      description: description?.trim() || title,
      files,
    });
    datosGist = datosDelGist(gist);
  }

  return db.transaction().execute(async (trx) => {
    const actualizado = await trx
      .updateTable("postSnippets")
      .set({
        title,
        language,
        sourceCode,
        description,
        filename: filenameNuevo,
        ...(datosGist ?? {}),
      })
      .where("id", "=", input.snippetId)
      .returningAll()
      .executeTakeFirstOrThrow();

    await trx.updateTable("posts").set({ title }).where("id", "=", snippet.postId).execute();

    await upsertSearchDocument(trx, {
      entityType: "post",
      entityId: snippet.postId,
      title,
      content: sourceCode,
    });

    return actualizado;
  });
}

export interface RevisionView {
  sha: string;
  committedAt: string;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  additions: number | null;
  deletions: number | null;
  total: number | null;
}

/**
 * Historial del snippet. Es el historial real del gist en GitHub.
 * Para un gist público no hace falta token; si el que mira es el autor y tiene
 * conexión, usamos su token (más cupo de peticiones y alcanza gists secretos).
 */
export async function listSnippetRevisions(
  db: Database,
  snippetId: string,
  viewerId: string | null,
): Promise<RevisionView[]> {
  const snippet = await getSnippetRow(db, snippetId);
  if (!snippet.gistId) {
    throw badRequest("Este snippet todavía no está publicado en GitHub, así que no tiene historial");
  }

  const token = await tokenDelVisitante(db, snippet, viewerId);
  const commits = await gh.listGistCommits(snippet.gistId, token);

  return commits.map((c) => ({
    sha: c.version,
    committedAt: c.committed_at,
    authorLogin: c.user?.login ?? null,
    authorAvatarUrl: c.user?.avatar_url ?? null,
    additions: c.change_status?.additions ?? null,
    deletions: c.change_status?.deletions ?? null,
    total: c.change_status?.total ?? null,
  }));
}

/** Contenido del snippet tal como estaba en una revisión concreta. */
export async function getSnippetRevision(
  db: Database,
  snippetId: string,
  sha: string,
  viewerId: string | null,
) {
  const snippet = await getSnippetRow(db, snippetId);
  if (!snippet.gistId) throw badRequest("Este snippet no está publicado en GitHub");

  const token = await tokenDelVisitante(db, snippet, viewerId);
  const gist = await gh.getGistRevision(snippet.gistId, sha, token);

  return {
    sha,
    committedAt: gist.updated_at,
    files: Object.values(gist.files ?? {}).map((f) => ({
      filename: f.filename,
      language: f.language,
      size: f.size,
      truncated: Boolean(f.truncated),
      content: f.content ?? null,
    })),
  };
}

/**
 * Trae del gist la última versión y pisa la copia local. Sirve cuando el autor
 * editó el gist desde GitHub: Neo Axis se pone al día.
 */
export async function syncSnippetFromGist(
  db: Database,
  input: { snippetId: string; userId: string },
) {
  const snippet = await getOwnSnippet(db, input.snippetId, input.userId);
  if (!snippet.gistId) throw badRequest("Este snippet no está publicado en GitHub");

  const token = await getAccessToken(db, input.userId);
  const gist = await gh.getGist(snippet.gistId, token);
  const archivo = archivoPrincipal(gist);
  if (!archivo) throw badRequest("El gist no tiene archivos");

  const contenido = archivo.content ?? snippet.sourceCode;
  const datos = datosDelGist(gist);

  return db.transaction().execute(async (trx) => {
    const actualizado = await trx
      .updateTable("postSnippets")
      .set({
        sourceCode: contenido,
        filename: archivo.filename,
        language: archivo.language ?? snippet.language,
        description: gist.description ?? snippet.description,
        ...datos,
      })
      .where("id", "=", input.snippetId)
      .returningAll()
      .executeTakeFirstOrThrow();

    await upsertSearchDocument(trx, {
      entityType: "post",
      entityId: snippet.postId,
      title: snippet.title,
      content: contenido,
    });

    return actualizado;
  });
}

/**
 * Importa un gist existente como snippet de Neo Axis. No copia nada a otra
 * cuenta: el gist sigue siendo de quien es, y queda vinculado.
 */
export async function importSnippetFromGist(
  db: Database,
  input: { userId: string; gistRef: string },
) {
  const gistId = gh.parseGistId(input.gistRef);
  if (!gistId) throw badRequest("Pegá la URL de un gist (gist.github.com/...) o su identificador");

  // Si el usuario tiene GitHub conectado usamos su token: así puede importar
  // también sus propios gists secretos.
  const token = (await hasConnection(db, input.userId))
    ? await getAccessToken(db, input.userId)
    : undefined;

  const gist = await gh.getGist(gistId, token);
  const archivo = archivoPrincipal(gist);
  if (!archivo) throw badRequest("Ese gist no tiene archivos");
  if (archivo.truncated && !archivo.content) {
    throw badRequest("Ese archivo es demasiado grande para importarlo");
  }

  const yaExiste = await db
    .selectFrom("postSnippets")
    .select("id")
    .where("gistId", "=", gistId)
    .executeTakeFirst();
  if (yaExiste) throw conflict("Ese gist ya está publicado en Neo Axis");

  const title = (gist.description?.trim() || archivo.filename).slice(0, 240);
  const datos = datosDelGist(gist);

  return db.transaction().execute(async (trx) => {
    const post = await trx
      .insertInto("posts")
      .values({ authorId: input.userId, title, publishedAt: new Date() })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    const snippet = await trx
      .insertInto("postSnippets")
      .values({
        postId: post.id as string,
        title,
        language: archivo.language ?? "text",
        sourceCode: archivo.content ?? "",
        description: gist.description ?? null,
        filename: archivo.filename,
        ...datos,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await upsertSearchDocument(trx, {
      entityType: "post",
      entityId: post.id as string,
      title,
      content: archivo.content ?? "",
    });

    return snippet;
  });
}

/** Deja de publicar: borra el vínculo. El gist en GitHub queda intacto. */
export async function unlinkGist(db: Database, input: { snippetId: string; userId: string }) {
  const snippet = await getOwnSnippet(db, input.snippetId, input.userId);
  if (!snippet.gistId) throw badRequest("Este snippet no está vinculado a ningún gist");

  await db
    .updateTable("postSnippets")
    .set({
      gistId: null,
      gistHtmlUrl: null,
      gistOwnerLogin: null,
      gistRevisionSha: null,
      gistSyncedAt: null,
    })
    .where("id", "=", input.snippetId)
    .execute();

  return { ok: true };
}

/**
 * Token con el que leer un gist: el del autor si es él quien mira y tiene
 * conexión; si no, ninguno (lectura anónima, sólo gists públicos).
 */
async function tokenDelVisitante(
  db: Database,
  snippet: SnippetRow,
  viewerId: string | null,
): Promise<string | undefined> {
  if (!viewerId || viewerId !== snippet.authorId) return undefined;
  if (!(await hasConnection(db, viewerId))) return undefined;
  return getAccessToken(db, viewerId);
}
