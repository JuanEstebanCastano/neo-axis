/**
 * REPOSITORIOS DE GITHUB
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Deja ver y escribir archivos en los repos del usuario. Listar carpetas,
 * abrir un archivo, subir código o archivos sueltos, y ver el historial.
 *
 * TENÉ EN CUENTA
 * Acá no se guarda nada del repo: el dueño de esos datos es GitHub y se
 * consultan en vivo. Lo único que persistimos es cuál repo eligió el usuario,
 * para no preguntárselo cada vez.
 *
 * Cada archivo que se escribe es UN commit. No juntamos varios en uno solo a
 * propósito: así el historial de GitHub dice qué cambió y cuándo, archivo por
 * archivo, que es justamente lo que uno va a buscar cuando algo se rompe.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { Database } from "@neoaxis/db";
import { AppError, badRequest, notFound } from "../../lib/errors.js";
import * as gh from "../github/client.js";
import {
  getAccessTokenWithScope,
  getDefaultRepo,
  setDefaultRepo,
} from "../github/service.js";
import { MAX_FILE_BYTES } from "./schemas.js";

/** El permiso que GitHub exige para todo lo de este módulo. */
const SCOPE = "public_repo";

const token = (db: Database, userId: string) => getAccessTokenWithScope(db, userId, SCOPE);

// ── Vistas que devolvemos al frontend ─────────────────────────────────

export interface RepoView {
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  description: string | null;
  defaultBranch: string;
  language: string | null;
  updatedAt: string;
}

export interface EntryView {
  type: "file" | "dir" | "symlink" | "submodule";
  name: string;
  path: string;
  size: number;
  sha: string;
  htmlUrl: string | null;
}

export interface FileView extends EntryView {
  /** El texto del archivo. Null si es binario o si GitHub no lo mandó. */
  text: string | null;
  /** True cuando es binario (una imagen, un pdf): no se puede mostrar como texto. */
  binary: boolean;
  /** True cuando pasa de 1 MB: GitHub no manda el contenido por esta vía. */
  tooLarge: boolean;
  downloadUrl: string | null;
}

export interface CommitView {
  sha: string;
  message: string;
  authorLogin: string | null;
  authorName: string | null;
  committedAt: string | null;
  htmlUrl: string;
}

const toRepoView = (r: gh.RepoSummary): RepoView => ({
  name: r.name,
  fullName: r.full_name,
  private: r.private,
  htmlUrl: r.html_url,
  description: r.description,
  defaultBranch: r.default_branch,
  language: r.language,
  updatedAt: r.updated_at,
});

const toEntryView = (e: gh.RepoEntry): EntryView => ({
  type: e.type,
  name: e.name,
  path: e.path,
  size: e.size,
  sha: e.sha,
  htmlUrl: e.html_url,
});

// ── Listar, crear y elegir repositorio ────────────────────────────────

export async function listRepos(db: Database, userId: string) {
  const [repos, elegido] = await Promise.all([
    gh.listUserRepos(await token(db, userId)),
    getDefaultRepo(db, userId),
  ]);

  // Los privados no se muestran: con `public_repo` no podemos escribir en
  // ellos, así que ofrecerlos sería prometer algo que después falla.
  return {
    repos: repos.filter((r) => !r.private).map(toRepoView),
    defaultRepo: elegido,
  };
}

export async function createRepo(
  db: Database,
  userId: string,
  input: { name: string; description?: string | undefined; autoInit: boolean },
) {
  const creado = await gh.createRepo(await token(db, userId), {
    name: input.name,
    ...(input.description !== undefined ? { description: input.description } : {}),
    private: false,
    // Sin auto_init el repo nace sin rama, y la Contents API no tiene dónde
    // poner el primer archivo. Es la causa #1 de "no puedo subir nada".
    auto_init: input.autoInit,
  });

  // Recién creado es, casi seguro, con el que va a querer trabajar.
  await setDefaultRepo(db, userId, creado.full_name);
  return toRepoView(creado);
}

export async function elegirRepo(db: Database, userId: string, fullName: string | null) {
  if (fullName === null) {
    await setDefaultRepo(db, userId, null);
    return { defaultRepo: null };
  }

  const partes = gh.parseRepoFullName(fullName);
  if (!partes) throw badRequest("Escribí el repositorio como usuario/nombre.");

  // Que exista y que podamos verlo. Si no, guardaríamos un nombre muerto.
  const repo = await gh.getRepo(await token(db, userId), partes.owner, partes.repo);
  await setDefaultRepo(db, userId, repo.full_name);
  return { defaultRepo: repo.full_name, repo: toRepoView(repo) };
}

// ── Navegar el repositorio ────────────────────────────────────────────

/**
 * Devuelve una carpeta o un archivo, según lo que haya en esa ruta.
 * GitHub contesta un array para las carpetas y un objeto para los archivos:
 * esa diferencia la resolvemos acá y hacia afuera queda explícita en `kind`.
 */
export async function browse(
  db: Database,
  userId: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string | undefined,
): Promise<
  | { kind: "dir"; path: string; entries: EntryView[] }
  | { kind: "file"; path: string; file: FileView }
> {
  const resultado = await gh.getContents(await token(db, userId), owner, repo, path, ref);

  if (Array.isArray(resultado)) {
    // Carpetas primero y después por nombre: es como lo muestra cualquier
    // explorador de archivos, y la gente lo busca ahí.
    const entries = resultado.map(toEntryView).sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name, "es");
    });
    return { kind: "dir", path, entries };
  }

  return { kind: "file", path, file: toFileView(resultado) };
}

function toFileView(archivo: gh.RepoFile): FileView {
  const base = toEntryView(archivo);

  // GitHub manda encoding "none" cuando el archivo pasa de 1 MB.
  if (archivo.encoding === "none" || !archivo.content) {
    return {
      ...base,
      text: null,
      binary: false,
      tooLarge: true,
      downloadUrl: archivo.download_url,
    };
  }

  const bytes = Buffer.from(archivo.content, "base64");
  const binario = esBinario(bytes);

  return {
    ...base,
    text: binario ? null : bytes.toString("utf8"),
    binary: binario,
    tooLarge: false,
    downloadUrl: archivo.download_url,
  };
}

/**
 * Heurística de toda la vida: si hay un byte 0 en el primer tramo, no es
 * texto. Alcanza para no intentar pintar un PNG dentro de un <pre>.
 */
function esBinario(bytes: Buffer): boolean {
  const tramo = bytes.subarray(0, 8000);
  return tramo.includes(0);
}

export async function historial(
  db: Database,
  userId: string,
  owner: string,
  repo: string,
  path?: string | undefined,
): Promise<CommitView[]> {
  const commits = await gh.listRepoCommits(await token(db, userId), owner, repo, path);
  return commits.map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    authorLogin: c.author?.login ?? null,
    authorName: c.commit.author?.name ?? null,
    committedAt: c.commit.author?.date ?? null,
    htmlUrl: c.html_url,
  }));
}

// ── Escribir ──────────────────────────────────────────────────────────

/** Pasa a base64 lo que haya mandado el frontend, y controla el tamaño. */
function aBase64(content: string, encoding: "utf8" | "base64", path: string): string {
  const bytes =
    encoding === "base64"
      ? Buffer.from(content, "base64")
      : Buffer.from(content, "utf8");

  // Buffer.from con base64 inválido no falla: descarta lo que no entiende.
  // Si el resultado queda vacío y la entrada no lo estaba, era basura.
  if (encoding === "base64" && bytes.length === 0 && content.trim().length > 0) {
    throw badRequest(`No se pudo leer el contenido de ${path}.`);
  }
  if (bytes.length > MAX_FILE_BYTES) {
    const mb = (MAX_FILE_BYTES / 1024 / 1024).toFixed(0);
    throw badRequest(`${path} pasa de ${mb} MB, que es el máximo por archivo.`);
  }
  return bytes.toString("base64");
}

/** El sha de lo que hay hoy en esa ruta, o null si el archivo no existe. */
async function shaActual(
  tok: string,
  owner: string,
  repo: string,
  path: string,
  branch?: string | undefined,
): Promise<string | null> {
  try {
    const actual = await gh.getContents(tok, owner, repo, path, branch);
    if (Array.isArray(actual)) throw badRequest(`${path} es una carpeta, no un archivo.`);
    return actual.sha;
  } catch (err) {
    // 404 es la respuesta normal para "todavía no existe": se crea.
    if (err instanceof AppError && err.statusCode === 404) return null;
    throw err;
  }
}

export interface EscrituraResultado {
  path: string;
  commitSha: string;
  commitUrl: string;
  creado: boolean;
}

export async function escribirArchivo(
  db: Database,
  userId: string,
  owner: string,
  repo: string,
  input: {
    path: string;
    content: string;
    encoding: "utf8" | "base64";
    message?: string | undefined;
    sha?: string | undefined;
    branch?: string | undefined;
  },
): Promise<EscrituraResultado> {
  const tok = await token(db, userId);
  const contenido = aBase64(input.content, input.encoding, input.path);

  // Si el frontend no nos dijo qué versión está reemplazando, la averiguamos.
  const sha = input.sha ?? (await shaActual(tok, owner, repo, input.path, input.branch));

  const resultado = await gh.putFile(tok, owner, repo, input.path, {
    message: input.message ?? mensajePorDefecto(input.path, sha !== null),
    content: contenido,
    ...(sha ? { sha } : {}),
    ...(input.branch ? { branch: input.branch } : {}),
  });

  return {
    path: input.path,
    commitSha: resultado.commit.sha,
    commitUrl: resultado.commit.html_url,
    creado: sha === null,
  };
}

const mensajePorDefecto = (path: string, existia: boolean) =>
  `${existia ? "Actualiza" : "Agrega"} ${path}`;

/**
 * Sube varios archivos, uno por commit, en orden.
 * Si uno falla, los anteriores YA están en GitHub: no hay transacción posible
 * contra una API remota. Por eso devolvemos el detalle de cada uno en vez de
 * un sí/no global, y la interfaz muestra qué entró y qué no.
 */
export async function subirArchivos(
  db: Database,
  userId: string,
  owner: string,
  repo: string,
  input: {
    files: { path: string; content: string; encoding: "utf8" | "base64" }[];
    directory: string;
    message?: string | undefined;
    branch?: string | undefined;
  },
) {
  const resultados: (EscrituraResultado & { ok: true })[] = [];
  const fallos: { path: string; error: string }[] = [];

  for (const archivo of input.files) {
    const destino = input.directory
      ? `${input.directory.replace(/\/+$/, "")}/${archivo.path}`
      : archivo.path;

    try {
      const r = await escribirArchivo(db, userId, owner, repo, {
        path: destino,
        content: archivo.content,
        encoding: archivo.encoding,
        ...(input.message !== undefined ? { message: input.message } : {}),
        ...(input.branch !== undefined ? { branch: input.branch } : {}),
      });
      resultados.push({ ...r, ok: true });
    } catch (err) {
      fallos.push({ path: destino, error: (err as Error).message });
    }
  }

  return { subidos: resultados, fallos };
}

export async function borrarArchivo(
  db: Database,
  userId: string,
  owner: string,
  repo: string,
  input: { path: string; sha: string; message?: string | undefined; branch?: string | undefined },
) {
  const resultado = await gh.deleteFile(await token(db, userId), owner, repo, input.path, {
    message: input.message ?? `Elimina ${input.path}`,
    sha: input.sha,
    ...(input.branch ? { branch: input.branch } : {}),
  });

  if (!resultado?.commit) throw notFound("GitHub no confirmó el borrado.");
  return { path: input.path, commitSha: resultado.commit.sha, commitUrl: resultado.commit.html_url };
}

/**
 * Da de alta un repositorio en app.github_repositories (o devuelve el que ya
 * estaba) para poder adjuntarlo a un mensaje.
 *
 * Esta tabla existía desde el esquema inicial y nadie la escribía nunca: por
 * eso el selector de colecciones dejaba los repositorios fuera, porque elegir
 * uno daba siempre "el repositorio no existe".
 *
 * DO UPDATE y no DO NOTHING: con DO NOTHING el RETURNING viene vacío cuando
 * la fila ya existía, y habría que hacer un SELECT extra que además puede
 * perder la carrera contra otra petición simultánea.
 */
export async function upsertRepositoryByUrl(
  db: Database,
  input: { canonicalUrl: string; repositoryName: string },
) {
  const fila = await db
    .insertInto("githubRepositories")
    .values({
      canonicalUrl: input.canonicalUrl,
      repositoryName: input.repositoryName,
    })
    .onConflict((oc) =>
      oc.column("canonicalUrl").doUpdateSet({
        repositoryName: input.repositoryName,
        updatedAt: new Date(),
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow();

  return fila;
}
