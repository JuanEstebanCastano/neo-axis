/**
 * CLIENTE DE LA API DE GITHUB
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Habla con GitHub por HTTP. Es la única parte del proyecto que conoce las
 * direcciones de api.github.com. Nadie más arma un fetch a GitHub.
 *
 * TENÉ EN CUENTA
 * Acá no hay base de datos ni sesiones: entra un token, sale un dato. Eso lo
 * hace fácil de probar y de reemplazar (si mañana usamos la API de repos en
 * vez de gists, se agrega acá y el resto del módulo casi no cambia).
 *
 * Todo error de GitHub se traduce a un AppError nuestro, para que el usuario
 * vea un mensaje en español y no un JSON ajeno.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import {
  AppError,
  badRequest,
  notFound,
  serviceUnavailable,
  tooManyRequests,
  unauthorized,
} from "../../lib/errors.js";

const API_BASE = "https://api.github.com";
const OAUTH_BASE = "https://github.com/login/oauth";

// Versión fijada a propósito: es la que GitHub usa por defecto y está soportada
// hasta marzo de 2028. Fijarla evita que un cambio de GitHub nos rompa sin aviso.
const API_VERSION = "2022-11-28";

// Identificador genérico del cliente. GitHub pide un User-Agent; no lleva
// ningún dato del usuario ni del despliegue.
const USER_AGENT = "neo-axis-app";

// Si GitHub no contesta en este tiempo, cortamos: un request colgado bloquea
// una conexión del pool del API.
const TIMEOUT_MS = 10_000;

// ── Tipos de la parte de GitHub que usamos ────────────────────────────

export interface GithubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
}

export interface GistFile {
  filename: string;
  language: string | null;
  size: number;
  truncated?: boolean;
  /** Ausente cuando el archivo es muy grande; entonces hay que ir a raw_url. */
  content?: string;
  raw_url?: string;
}

export interface Gist {
  id: string;
  html_url: string;
  description: string | null;
  public: boolean;
  created_at: string;
  updated_at: string;
  owner: { login: string; avatar_url: string | null } | null;
  files: Record<string, GistFile>;
  history?: GistCommit[];
}

export interface GistCommit {
  version: string;
  committed_at: string;
  user: { login: string; avatar_url: string | null } | null;
  change_status: { total: number; additions: number; deletions: number } | null;
}

export interface OauthToken {
  access_token: string;
  token_type: string;
  scope: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
}

// ── Motor de peticiones ───────────────────────────────────────────────

interface RequestOptions {
  /** Token del usuario. Sin él se leen sólo gists públicos (60 req/hora). */
  token?: string | undefined;
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
}

/**
 * Traduce un fallo de GitHub a un error nuestro.
 * El 403/429 con x-ratelimit-remaining en 0 es el límite de uso: merece un
 * mensaje propio porque la solución es esperar, no reintentar.
 */
function translateError(status: number, headers: Headers, payload: unknown): AppError {
  const mensaje = (payload as { message?: string } | null)?.message ?? `GitHub respondió ${status}`;

  if (status === 401) {
    return unauthorized("La conexión con GitHub caducó o fue revocada. Volvé a conectar tu cuenta.");
  }
  if ((status === 403 || status === 429) && headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(headers.get("x-ratelimit-reset"));
    const minutos = Number.isFinite(reset)
      ? Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60000))
      : null;
    return tooManyRequests(
      minutos
        ? `Se agotó el límite de peticiones a GitHub. Volvé a intentar en ~${minutos} minuto(s).`
        : "Se agotó el límite de peticiones a GitHub. Probá de nuevo en un rato.",
    );
  }
  if (status === 403) return new AppError(403, "forbidden", `GitHub rechazó la operación: ${mensaje}`);
  if (status === 404) return notFound("GitHub no encontró el recurso (¿es privado o fue borrado?)");
  if (status === 422) return badRequest(`GitHub rechazó los datos: ${mensaje}`);
  if (status >= 500) return serviceUnavailable("GitHub no está respondiendo. Probá más tarde.");
  return badRequest(mensaje);
}

async function githubFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { token, method = "GET", body } = opts;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": USER_AGENT,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  // El body se asigna aparte: pasar `body: undefined` es un error de tipos
  // con exactOptionalPropertyTypes, y un GET con body es inválido igual.
  const init: RequestInit = { method, headers, signal: AbortSignal.timeout(TIMEOUT_MS) };
  if (body !== undefined) init.body = JSON.stringify(body);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw serviceUnavailable("No se pudo contactar a GitHub.");
  }

  if (res.status === 204) return null as T;

  const payload = await res.json().catch(() => null);
  if (!res.ok) throw translateError(res.status, res.headers, payload);
  return payload as T;
}

// ── OAuth ─────────────────────────────────────────────────────────────

/** Canjea el `code` del callback por un token de acceso del usuario. */
export async function exchangeCodeForToken(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<OauthToken> {
  let res: Response;
  try {
    res = await fetch(`${OAUTH_BASE}/access_token`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        client_id: params.clientId,
        client_secret: params.clientSecret,
        code: params.code,
        redirect_uri: params.redirectUri,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw serviceUnavailable("No se pudo contactar a GitHub para completar la conexión.");
  }

  const data = (await res.json().catch(() => null)) as
    | (OauthToken & { error?: string; error_description?: string })
    | null;

  // GitHub devuelve 200 incluso cuando el canje falla: el error viene adentro.
  if (!res.ok || !data || data.error || !data.access_token) {
    throw badRequest(
      data?.error_description ?? "GitHub no aceptó el código de autorización. Intentá de nuevo.",
    );
  }
  return data;
}

/** Renueva el token cuando la OAuth App tiene expiración activada. */
export async function refreshAccessToken(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<OauthToken> {
  let res: Response;
  try {
    res = await fetch(`${OAUTH_BASE}/access_token`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        client_id: params.clientId,
        client_secret: params.clientSecret,
        grant_type: "refresh_token",
        refresh_token: params.refreshToken,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw serviceUnavailable("No se pudo renovar la conexión con GitHub.");
  }

  const data = (await res.json().catch(() => null)) as (OauthToken & { error?: string }) | null;
  if (!res.ok || !data || data.error || !data.access_token) {
    throw unauthorized("La conexión con GitHub caducó. Volvé a conectar tu cuenta.");
  }
  return data;
}

/** Arma la URL a la que mandamos al usuario para que autorice la app. */
export function buildAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes: string[];
}): string {
  const qs = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    scope: params.scopes.join(" "),
    state: params.state,
    allow_signup: "true",
  });
  return `${OAUTH_BASE}/authorize?${qs.toString()}`;
}

// ── Usuario ───────────────────────────────────────────────────────────

export const getAuthenticatedUser = (token: string) => githubFetch<GithubUser>("/user", { token });

// ── Gists ─────────────────────────────────────────────────────────────

/** Un archivo con valor null se borra. Así lo espera la API de gists. */
export type GistFileInput = Record<string, { content: string } | null>;

/** Crea un gist. Cada archivo es una clave del objeto `files`. */
export const createGist = (
  token: string,
  input: { description: string; public: boolean; files: GistFileInput },
) => githubFetch<Gist>("/gists", { token, method: "POST", body: input });

/**
 * Actualiza un gist. Ojo: cada actualización genera una REVISIÓN nueva en
 * GitHub; eso es, literalmente, el control de versiones que buscamos.
 */
export const updateGist = (
  token: string,
  gistId: string,
  input: { description?: string; files: GistFileInput },
) => githubFetch<Gist>(`/gists/${gistId}`, { token, method: "PATCH", body: input });

export const getGist = (gistId: string, token?: string | undefined) =>
  githubFetch<Gist>(`/gists/${gistId}`, { token });

/** Contenido del gist tal como estaba en esa revisión (sha). */
export const getGistRevision = (gistId: string, sha: string, token?: string | undefined) =>
  githubFetch<Gist>(`/gists/${gistId}/${sha}`, { token });

/** Historial de revisiones, de la más nueva a la más vieja. */
export const listGistCommits = (gistId: string, token?: string | undefined, perPage = 30) =>
  githubFetch<GistCommit[]>(`/gists/${gistId}/commits?per_page=${perPage}`, { token });

export const forkGist = (token: string, gistId: string) =>
  githubFetch<Gist>(`/gists/${gistId}/forks`, { token, method: "POST" });

export const deleteGist = (token: string, gistId: string) =>
  githubFetch<null>(`/gists/${gistId}`, { token, method: "DELETE" });

// ── Repositorios ──────────────────────────────────────────────────────
//
// Un gist es un repo de archivos sueltos. Esto es la otra mitad: repos de
// verdad, con carpetas. Lo que usamos es la "Contents API", que sube y baja
// archivos de a uno y hace el commit sola. No necesitamos la Git Data API
// (árboles y blobs a mano) porque no hacemos commits de varios archivos en
// una sola operación: cada archivo es su propio commit, y así el historial
// queda legible.

export interface RepoSummary {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  default_branch: string;
  updated_at: string;
  language: string | null;
}

/** Una entrada del árbol: un archivo o una carpeta. */
export interface RepoEntry {
  type: "file" | "dir" | "symlink" | "submodule";
  name: string;
  path: string;
  sha: string;
  size: number;
  html_url: string | null;
  download_url: string | null;
}

/** Un archivo con su contenido. GitHub lo manda en base64. */
export interface RepoFile extends RepoEntry {
  /** Vacío si el archivo pasa de 1 MB: ahí GitHub no manda el contenido. */
  content?: string;
  encoding?: "base64" | "none";
}

export interface CommitResult {
  content: RepoEntry | null;
  commit: {
    sha: string;
    html_url: string;
    message: string;
    author?: { name?: string; date?: string } | null;
  };
}

export interface RepoCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string | null; date: string | null } | null;
  };
  author: { login: string; avatar_url: string | null } | null;
}

/**
 * Codifica una ruta para meterla en una URL sin romper las barras.
 * `src/mi archivo.ts` -> `src/mi%20archivo.ts`. Si codificáramos la ruta
 * entera de una, las `/` se volverían `%2F` y GitHub vería un solo archivo
 * con un nombre absurdo en vez de una ruta.
 */
export function encodePath(path: string): string {
  return path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

const repoBase = (owner: string, repo: string) =>
  `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

/**
 * Los repos del usuario sobre los que puede escribir.
 * `affiliation=owner` deja afuera aquellos en los que sólo colabora, para no
 * ofrecerle escribir donde quizá no deba.
 */
export const listUserRepos = (token: string, perPage = 100) =>
  githubFetch<RepoSummary[]>(
    `/user/repos?affiliation=owner&sort=updated&per_page=${perPage}`,
    { token },
  );

export const getRepo = (token: string, owner: string, repo: string) =>
  githubFetch<RepoSummary>(repoBase(owner, repo), { token });

/**
 * Crea un repo en la cuenta del usuario.
 * `auto_init` es importante: un repo vacío no tiene ni rama por defecto, y
 * entonces la Contents API falla al subir el primer archivo.
 */
export const createRepo = (
  token: string,
  input: { name: string; description?: string; private?: boolean; auto_init?: boolean },
) => githubFetch<RepoSummary>("/user/repos", { token, method: "POST", body: input });

/**
 * Contenido de una ruta. Devuelve un array si es carpeta y un objeto si es
 * archivo: eso lo resuelve el servicio, no quien llama.
 */
export const getContents = (
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string | undefined,
) => {
  const qs = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  return githubFetch<RepoEntry[] | RepoFile>(
    `${repoBase(owner, repo)}/contents/${encodePath(path)}${qs}`,
    { token },
  );
};

/**
 * Crea o reemplaza un archivo, en un commit.
 * El `sha` es la clave del asunto: sin él GitHub entiende "creá un archivo
 * nuevo" y rechaza la operación si ya existe. Con él, entiende "reemplazá
 * ESTA versión", y si alguien la cambió mientras tanto responde 409 en vez de
 * pisar el trabajo ajeno.
 */
export const putFile = (
  token: string,
  owner: string,
  repo: string,
  path: string,
  input: { message: string; content: string; sha?: string; branch?: string },
) =>
  githubFetch<CommitResult>(`${repoBase(owner, repo)}/contents/${encodePath(path)}`, {
    token,
    method: "PUT",
    body: input,
  });

export const deleteFile = (
  token: string,
  owner: string,
  repo: string,
  path: string,
  input: { message: string; sha: string; branch?: string },
) =>
  githubFetch<CommitResult>(`${repoBase(owner, repo)}/contents/${encodePath(path)}`, {
    token,
    method: "DELETE",
    body: input,
  });

/** Historial de un archivo (o del repo entero si no se pasa ruta). */
export const listRepoCommits = (
  token: string,
  owner: string,
  repo: string,
  path?: string | undefined,
  perPage = 20,
) => {
  const qs = new URLSearchParams({ per_page: String(perPage) });
  if (path) qs.set("path", path);
  return githubFetch<RepoCommit[]>(`${repoBase(owner, repo)}/commits?${qs.toString()}`, { token });
};

/**
 * Parte `usuario/repo` en sus dos mitades. Acepta también la URL completa de
 * GitHub, porque es lo que la gente tiene en el portapapeles.
 */
export function parseRepoFullName(input: string): { owner: string; repo: string } | null {
  let texto = input.trim();
  if (!texto) return null;

  if (texto.includes("://")) {
    try {
      const url = new URL(texto);
      if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
      texto = url.pathname;
    } catch {
      return null;
    }
  }

  const partes = texto.split("/").filter(Boolean);
  if (partes.length < 2) return null;
  const owner = partes[0] as string;
  const repo = (partes[1] as string).replace(/\.git$/, "");

  const valido = /^[A-Za-z0-9._-]+$/;
  if (!valido.test(owner) || !valido.test(repo)) return null;
  return { owner, repo };
}

/**
 * Saca el id de un gist desde lo que haya pegado el usuario: una URL completa
 * (https://gist.github.com/usuario/ID) o el id pelado.
 */
export function parseGistId(input: string): string | null {
  const limpio = input.trim();
  if (/^[0-9a-f]{20,40}$/i.test(limpio)) return limpio;
  try {
    const url = new URL(limpio);
    if (url.hostname !== "gist.github.com") return null;
    const partes = url.pathname.split("/").filter(Boolean);
    const id = partes[partes.length - 1];
    return id && /^[0-9a-f]{20,40}$/i.test(id) ? id : null;
  } catch {
    return null;
  }
}
