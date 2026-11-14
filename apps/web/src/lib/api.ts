/**
 * Cliente de la API. Mismo origen (proxy de Vite), cookie de sesión incluida.
 */

// En desarrollo, BASE queda relativo ("/api/v1") y usa el proxy de Vite.
// En producción, definí VITE_API_URL (p. ej. https://api.midominio.com).
// Se normaliza quitando la barra final para no generar "//api/v1".
const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "") + "/api/v1";

/** Dirección absoluta de una ruta del API. Para navegaciones, no para fetch. */
export const apiUrl = (path: string) => BASE + path;

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  // Solo declaramos JSON cuando efectivamente mandamos un cuerpo. Un POST sin body
  // (p. ej. logout) con Content-Type: application/json hace que el servidor rechace
  // el cuerpo vacío.
  const hasBody = opts.body != null;
  const res = await fetch(BASE + path, {
    credentials: "include",
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers ?? {}),
    },
    ...opts,
  });
  if (res.status === 204) return null as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const d = data as { message?: string; error?: string } | null;
    throw new ApiError(res.status, d?.message ?? d?.error ?? `Error ${res.status}`, d?.error);
  }
  return data as T;
}

// ── Tipos ──
export interface User { id: string; username: string; displayName: string; avatarUrl: string | null }
export interface Post {
  id: string; title: string | null; slug: string | null; excerpt: string | null;
  createdAt: string; authorUsername: string; authorDisplayName: string; authorAvatarUrl: string | null;
}
export interface Channel {
  id: string; slug: string; name: string; description: string | null;
  topic: string | null; sortOrder: number; archivedAt: string | null; createdAt: string;
}
export interface Attachment {
  id: string; postId: string;
  attachmentType: "book" | "repository" | "snippet";
  targetId: string; title: string | null; note: string | null;
  downloadUrl: string | null; readUrl: string | null;
  canonicalUrl: string | null; language: string | null;
}
export interface ChannelMessage {
  id: string; bodyMarkdown: string | null; createdAt: string; authorId: string;
  authorUsername: string; authorDisplayName: string; authorAvatarUrl: string | null;
  commentCount: number; attachments: Attachment[];
}
export interface Comment {
  id: string; parentCommentId: string | null; bodyMarkdown: string; createdAt: string;
  authorId: string; authorUsername: string; authorDisplayName: string;
  authorAvatarUrl: string | null; replies: Comment[];
}
export interface Collection {
  id: string; ownerId: string; title: string; slug: string | null;
  description: string | null; visibility: "community" | "restricted"; createdAt: string;
}
export interface CollectionItem {
  id: string; itemType: "book" | "repository" | "snippet" | "post";
  itemId: string | null; title: string | null; note: string | null; sortOrder: number;
}
export interface Book {
  id: string; title: string; publicationYear: number | null; coverUrl: string | null;
  languageCode: string | null; authors: string[]; ratingAvg: number | null;
  files?: { id: string; format: string; accessLevel: string }[];
  // Enlaces a la fuente externa. Nulos en los libros que alojamos nosotros:
  // ésos se descargan firmados desde `files`.
  readUrl: string | null; downloadUrl: string | null;
  sourceUrl: string | null; rightsNote: string | null;
}

/** Filtros del catálogo. Todo opcional: sin nada, devuelve todo. */
export interface BookFilters {
  q?: string;
  lang?: string;
  source?: "any" | "gutendex" | "manual";
  access?: "any" | "readable" | "downloadable";
}

/** Alta de un libro pegando sus enlaces. */
export interface LinkBookInput {
  title: string;
  authors?: string[];
  languageCode?: string;
  publicationYear?: number;
  coverUrl?: string;
  readUrl?: string;
  downloadUrl?: string;
  sourceUrl?: string;
  rightsNote: string;
}

/** Un resultado del catálogo externo, todavía sin importar. */
export interface LibroExterno {
  provider: "gutendex"; externalId: string; title: string; authors: string[];
  languages: string[]; publicationYear: number | null; coverUrl: string | null;
  readUrl: string | null; downloadUrl: string | null;
  sourceUrl: string; rightsNote: string; downloadCount: number;
}
export interface RecoHit { entityType: string; entityId: string; title: string | null; distance: number }

// ── Repositorios de GitHub ──
export interface Repo {
  name: string; fullName: string; private: boolean; htmlUrl: string;
  description: string | null; defaultBranch: string; language: string | null; updatedAt: string;
}
/** Una entrada del árbol de archivos: un archivo o una carpeta. */
export interface RepoEntry {
  type: "file" | "dir" | "symlink" | "submodule";
  name: string; path: string; size: number; sha: string; htmlUrl: string | null;
}
export interface RepoFile extends RepoEntry {
  /** El texto. Null cuando el archivo es binario o pesa más de 1 MB. */
  text: string | null;
  binary: boolean;
  tooLarge: boolean;
  downloadUrl: string | null;
}
/** La respuesta dice de qué tipo es: una carpeta trae `entries`, un archivo `file`. */
export type RepoContents =
  | { kind: "dir"; path: string; entries: RepoEntry[] }
  | { kind: "file"; path: string; file: RepoFile };
export interface RepoCommit {
  sha: string; message: string; authorLogin: string | null;
  authorName: string | null; committedAt: string | null; htmlUrl: string;
}
export interface RepoWriteResult {
  path: string; commitSha: string; commitUrl: string; creado: boolean;
}
export interface Snippet {
  id: string; postId: string; title: string; language: string; filename: string | null;
  sourceCode: string; createdAt: string; authorUsername: string; authorDisplayName: string;
  // Presentes sólo si el snippet está publicado como gist en GitHub.
  gistId: string | null; gistHtmlUrl: string | null;
  gistOwnerLogin: string | null; gistSyncedAt: string | null;
}
/** La cuenta de GitHub que el usuario conectó. El token nunca llega acá. */
export interface GithubConnection {
  login: string; avatarUrl: string | null; scopes: string[]; connectedAt: string;
}
/** Una revisión del gist: un "commit" del historial. */
export interface SnippetRevision {
  sha: string; committedAt: string; authorLogin: string | null; authorAvatarUrl: string | null;
  additions: number | null; deletions: number | null; total: number | null;
}
export interface RevisionFile {
  filename: string; language: string | null; size: number; truncated: boolean; content: string | null;
}
export interface RevisionDetail { sha: string; committedAt: string; files: RevisionFile[] }
export interface GistInfo {
  gistId: string; gistHtmlUrl: string; gistOwnerLogin: string | null;
  gistRevisionSha: string | null; gistPublic: boolean;
  files: { filename: string; language: string | null; size: number }[];
}
export interface Profile {
  id: string; username: string; displayName: string; email: string;
  bio: string | null; websiteUrl: string | null; avatarUrl: string | null;
  status: string; createdAt: string;
}
export interface NotificationPrefs {
  userId: string; inAppEnabled: boolean; emailEnabled: boolean;
  emailMentions: boolean; emailComments: boolean; emailReactions: boolean;
  emailFollows: boolean; emailEvents: boolean; emailModeration: boolean; updatedAt: string;
}
export interface MeFull {
  user: Profile;
  stats: { posts: number; snippets: number; collections: number };
  notifications: NotificationPrefs | null;
}

export const api = {
  me: () => req<{ user: User; permissions: string[] }>("/auth/me"),
  login: (b: { email: string; password: string }) =>
    req<{ user: User }>("/auth/login", { method: "POST", body: JSON.stringify(b) }),
  register: (b: { username: string; displayName: string; email: string; password: string }) =>
    req<{ user: User }>("/auth/register", { method: "POST", body: JSON.stringify(b) }),
  logout: () => req<null>("/auth/logout", { method: "POST" }),
  forgotPassword: (b: { email: string }) =>
    req<{ ok: boolean }>("/auth/forgot-password", { method: "POST", body: JSON.stringify(b) }),
  resetPassword: (b: { token: string; newPassword: string }) =>
    req<{ ok: boolean }>("/auth/reset-password", { method: "POST", body: JSON.stringify(b) }),

  feed: (limit = 20) => req<{ items: Post[]; nextCursor: string | null }>(`/posts?limit=${limit}`),
  // Detalle de una publicación: incluye el cuerpo completo (bodyMarkdown) para
  // expandir la tarjeta en el feed.
  post: (id: string) =>
    req<{ post: { id: string; title: string | null; excerpt: string | null; bodyMarkdown: string | null } }>(`/posts/${id}`),
  createPost: (b: { title?: string; bodyMarkdown?: string }) =>
    req<{ post: Post }>("/posts", { method: "POST", body: JSON.stringify(b) }),

  // ── Secciones de la comunidad ──
  channels: () => req<{ items: Channel[] }>("/channels"),
  channel: (slug: string) => req<{ channel: Channel }>(`/channels/${slug}`),
  // before: hacia atrás (scroll). after: lo nuevo (refresco automático).
  channelMessages: (id: string, o: { before?: string; after?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (o.before) qs.set("before", o.before);
    if (o.after) qs.set("after", o.after);
    if (o.limit) qs.set("limit", String(o.limit));
    const q = qs.toString();
    return req<{ items: ChannelMessage[]; nextBefore: string | null }>(
      `/channels/${id}/messages${q ? `?${q}` : ""}`,
    );
  },
  createChannel: (b: { name: string; description?: string; topic?: string }) =>
    req<{ channel: Channel }>("/channels", { method: "POST", body: JSON.stringify(b) }),
  sendMessage: (channelId: string, b: { bodyMarkdown: string }) =>
    req<{ message: ChannelMessage }>(`/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify(b),
    }),

  // ── Adjuntos de un mensaje ──
  // Un repositorio se adjunta por su dirección: la tabla de repos no la
  // llena nadie más, así que el primero que lo adjunta lo da de alta.
  attachToMessage: (
    messageId: string,
    b:
      | { attachmentType: "book" | "snippet"; targetId: string; note?: string }
      | { attachmentType: "repository"; repoUrl: string; note?: string },
  ) =>
    req<{ attachment: Attachment }>(`/messages/${messageId}/attachments`, {
      method: "POST",
      body: JSON.stringify(b),
    }),
  removeAttachment: (id: string) =>
    req<{ ok: boolean }>(`/attachments/${id}`, { method: "DELETE" }),
  /** Para el botón de descargar: es una navegación, no un fetch. */
  snippetRawUrl: (id: string) => apiUrl(`/snippets/${id}/raw`),
  /** Llevarse el debate entero de una sección. También es navegación. */
  channelExportUrl: (slug: string, format: "md" | "json" = "md") =>
    apiUrl(`/channels/${slug}/export?format=${format}`),
  importFromRepo: (b: { owner: string; repo: string; path: string; title?: string }) =>
    req<{ snippet: Snippet }>("/snippets/from-repo", {
      method: "POST",
      body: JSON.stringify(b),
    }),

  // ── Comentarios (el hilo de una publicación o de un mensaje) ──
  comments: (postId: string) =>
    req<{ items: Comment[]; total: number }>(`/posts/${postId}/comments`),
  createComment: (postId: string, b: { bodyMarkdown: string; parentCommentId?: string }) =>
    req<{ comment: Comment }>(`/posts/${postId}/comments`, {
      method: "POST",
      body: JSON.stringify(b),
    }),
  deleteComment: (id: string) => req<{ ok: boolean }>(`/comments/${id}`, { method: "DELETE" }),

  collections: (owner?: string) =>
    req<{ items: Collection[] }>(`/collections${owner ? `?owner=${owner}` : ""}`),
  collection: (id: string) =>
    req<{ collection: Collection & { items: CollectionItem[] } }>(`/collections/${id}`),
  createCollection: (b: { title: string; description?: string; visibility?: string }) =>
    req<{ collection: Collection }>("/collections", { method: "POST", body: JSON.stringify(b) }),
  /**
   * Agregar un ítem a una colección. Los cuatro tipos que acepta el servidor
   * (ver collections/schemas.ts) tienen que existir también acá: faltaban
   * snippetId y repositoryId, y por eso desde la pantalla sólo se podían
   * agregar libros aunque la API soportara los demás desde el primer día.
   */
  addItem: (
    id: string,
    b: {
      itemType: "book" | "repository" | "snippet" | "post";
      bookId?: string;
      repositoryId?: string;
      snippetId?: string;
      postId?: string;
      note?: string;
    },
  ) =>
    req<{ item: CollectionItem }>(`/collections/${id}/items`, { method: "POST", body: JSON.stringify(b) }),

  // Sin filtros devuelve todo, así que las pantallas que sólo quieren el
  // catálogo (elegir un libro para una colección) siguen llamando sin nada.
  books: (f: BookFilters = {}) => {
    const qs = new URLSearchParams();
    if (f.q) qs.set("q", f.q);
    if (f.lang) qs.set("lang", f.lang);
    if (f.source && f.source !== "any") qs.set("source", f.source);
    if (f.access && f.access !== "any") qs.set("access", f.access);
    const cola = qs.toString();
    return req<{ items: Book[] }>("/books" + (cola ? "?" + cola : ""));
  },
  bookLanguages: () => req<{ languages: string[] }>("/books/languages"),
  linkBook: (b: LinkBookInput) =>
    req<{ bookId: string }>("/books/link", { method: "POST", body: JSON.stringify(b) }),

  // Catálogo externo: buscar en Project Gutenberg e importar a la biblioteca.
  searchExternalBooks: (q: string, lang?: string) => {
    const qs = new URLSearchParams({ q });
    if (lang) qs.set("lang", lang);
    return req<{ items: LibroExterno[] }>("/books/external/search?" + qs.toString());
  },
  importExternalBook: (externalId: string) =>
    req<{ bookId: string; yaExistia: boolean }>("/books/external/import", {
      method: "POST",
      body: JSON.stringify({ provider: "gutendex", externalId }),
    }),
  book: (id: string) => req<{ book: Book }>(`/books/${id}`),
  setShelf: (id: string, b: { status: string; progress?: number }) =>
    req<{ ok: boolean }>(`/books/${id}/shelf`, { method: "PUT", body: JSON.stringify(b) }),
  bookFileDownload: (fileId: string) =>
    req<{ url: string; expiresInSeconds: number }>(`/book-files/${fileId}/download`),

  recommend: (p: { q?: string; entityId?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (p.q) qs.set("q", p.q);
    if (p.entityId) qs.set("entityId", p.entityId);
    if (p.limit) qs.set("limit", String(p.limit));
    return req<{ hits: RecoHit[] }>(`/recomendaciones?${qs.toString()}`);
  },
  reindex: () => req<{ indexed: number }>("/recomendaciones/reindex", { method: "POST" }),

  snippets: () => req<{ items: Snippet[] }>("/snippets"),
  createSnippet: (b: { title: string; language: string; sourceCode: string; filename?: string }) =>
    req<{ snippet: Snippet }>("/snippets", { method: "POST", body: JSON.stringify(b) }),
  updateSnippet: (
    id: string,
    b: { title?: string; language?: string; sourceCode?: string; filename?: string | null },
  ) => req<{ snippet: Snippet }>(`/snippets/${id}`, { method: "PUT", body: JSON.stringify(b) }),

  // ── GitHub: control de versiones de los snippets ──
  githubStatus: () =>
    req<{ enabled: boolean; connection: GithubConnection | null }>("/github/status"),
  githubDisconnect: () => req<{ ok: boolean }>("/github/connection", { method: "DELETE" }),
  /** Publica el snippet como gist en la cuenta de GitHub del autor. */
  publishSnippetAsGist: (id: string, isPublic: boolean) =>
    req<{ gist: GistInfo }>(`/snippets/${id}/gist`, {
      method: "POST",
      body: JSON.stringify({ public: isPublic }),
    }),
  /** Corta el vínculo. El gist sigue existiendo en GitHub. */
  unlinkGist: (id: string) => req<{ ok: boolean }>(`/snippets/${id}/gist`, { method: "DELETE" }),
  /** Trae desde GitHub la última versión del gist. */
  syncSnippet: (id: string) =>
    req<{ snippet: Snippet }>(`/snippets/${id}/sync`, { method: "POST", body: "{}" }),
  snippetRevisions: (id: string) =>
    req<{ revisions: SnippetRevision[] }>(`/snippets/${id}/revisions`),
  snippetRevision: (id: string, sha: string) =>
    req<{ revision: RevisionDetail }>(`/snippets/${id}/revisions/${sha}`),
  importGist: (gist: string) =>
    req<{ snippet: Snippet }>("/snippets/import", { method: "POST", body: JSON.stringify({ gist }) }),

  // ── Repositorios de GitHub ──
  repos: () => req<{ repos: Repo[]; defaultRepo: string | null }>("/repos"),
  createRepo: (b: { name: string; description?: string; autoInit?: boolean }) =>
    req<{ repo: Repo }>("/repos", { method: "POST", body: JSON.stringify(b) }),
  /** Deja fijado el repo que la pantalla abre al entrar. */
  setDefaultRepo: (fullName: string | null) =>
    req<{ defaultRepo: string | null; repo?: Repo }>("/repos/default", {
      method: "PUT",
      body: JSON.stringify({ fullName }),
    }),
  /** Una carpeta o un archivo, según lo que haya en esa ruta. */
  repoContents: (owner: string, repo: string, path = "") =>
    req<RepoContents>(
      `/repos/${owner}/${repo}/contents?path=${encodeURIComponent(path)}`,
    ),
  repoCommits: (owner: string, repo: string, path?: string) =>
    req<{ commits: RepoCommit[] }>(
      `/repos/${owner}/${repo}/commits${path ? `?path=${encodeURIComponent(path)}` : ""}`,
    ),
  /** Crea o reemplaza un archivo. Cada llamada es un commit en GitHub. */
  writeRepoFile: (
    owner: string,
    repo: string,
    b: { path: string; content: string; encoding?: "utf8" | "base64"; message?: string; sha?: string },
  ) =>
    req<RepoWriteResult>(`/repos/${owner}/${repo}/contents`, {
      method: "PUT",
      body: JSON.stringify(b),
    }),
  /** Sube varios archivos del disco. Un commit por archivo. */
  uploadRepoFiles: (
    owner: string,
    repo: string,
    b: { files: { path: string; content: string; encoding: "utf8" | "base64" }[]; directory?: string; message?: string },
  ) =>
    req<{ subidos: RepoWriteResult[]; fallos: { path: string; error: string }[] }>(
      `/repos/${owner}/${repo}/upload`,
      { method: "POST", body: JSON.stringify(b) },
    ),
  deleteRepoFile: (owner: string, repo: string, b: { path: string; sha: string; message?: string }) =>
    req<{ path: string; commitSha: string; commitUrl: string }>(
      `/repos/${owner}/${repo}/contents`,
      { method: "DELETE", body: JSON.stringify(b) },
    ),

  // ── Perfil ──
  profile: () => req<MeFull>("/users/me"),
  updateProfile: (b: { displayName?: string; bio?: string | null; websiteUrl?: string | null; avatarUrl?: string | null }) =>
    req<{ user: Profile }>("/users/me", { method: "PUT", body: JSON.stringify(b) }),
  changeEmail: (b: { email: string; currentPassword: string }) =>
    req<{ user: Profile }>("/users/me/email", { method: "PUT", body: JSON.stringify(b) }),
  changePassword: (b: { currentPassword: string; newPassword: string }) =>
    req<{ ok: boolean }>("/users/me/password", { method: "PUT", body: JSON.stringify(b) }),
  updateNotifications: (b: Partial<Omit<NotificationPrefs, "userId" | "updatedAt">>) =>
    req<{ notifications: NotificationPrefs }>("/users/me/notifications", { method: "PUT", body: JSON.stringify(b) }),
};
