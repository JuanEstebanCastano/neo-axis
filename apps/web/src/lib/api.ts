/**
 * Cliente de la API. Mismo origen (proxy de Vite), cookie de sesión incluida.
 */

// En desarrollo, BASE queda relativo ("/api/v1") y usa el proxy de Vite.
// En producción, definí VITE_API_URL (p. ej. https://api.midominio.com).
// Se normaliza quitando la barra final para no generar "//api/v1".
const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "") + "/api/v1";

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
}
export interface RecoHit { entityType: string; entityId: string; title: string | null; distance: number }
export interface Snippet {
  id: string; postId: string; title: string; language: string; filename: string | null;
  sourceCode: string; createdAt: string; authorUsername: string; authorDisplayName: string;
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

  collections: (owner?: string) =>
    req<{ items: Collection[] }>(`/collections${owner ? `?owner=${owner}` : ""}`),
  collection: (id: string) =>
    req<{ collection: Collection & { items: CollectionItem[] } }>(`/collections/${id}`),
  createCollection: (b: { title: string; description?: string; visibility?: string }) =>
    req<{ collection: Collection }>("/collections", { method: "POST", body: JSON.stringify(b) }),
  addItem: (id: string, b: { itemType: string; bookId?: string; postId?: string; note?: string }) =>
    req<{ item: CollectionItem }>(`/collections/${id}/items`, { method: "POST", body: JSON.stringify(b) }),

  books: () => req<{ items: Book[] }>("/books"),
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
