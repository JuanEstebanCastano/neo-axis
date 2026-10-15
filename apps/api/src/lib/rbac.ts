/**
 * PERMISOS Y VISIBILIDAD
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Responde dos preguntas: '¿esta persona puede hacer esta acción?' y
 * '¿esta persona puede ver esta publicación?'
 *
 * TENÉ EN CUENTA
 * El código pregunta por PERMISOS ('posts.create'), nunca por ROLES
 * ('admin'). Así se cambia una política insertando una fila en la base de
 * datos, sin tocar código ni desplegar.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { Database } from "@neoaxis/db";
import { forbidden } from "./errors.js";

/**
 * Autorización por PERMISO, nunca por rol.
 *
 * El esquema ya modela roles -> role_permissions -> permissions y siembra los
 * códigos ('posts.create', 'moderation.manage_content', ...). Chequear
 * `role === 'admin'` en el código tiraría a la basura ese modelo y obligaría a
 * recompilar para cambiar una política. Se chequea el código del permiso.
 */

export const PERMISSIONS = {
  postsCreate: "posts.create",
  postsEditOwn: "posts.edit_own",
  postsDeleteOwn: "posts.delete_own",
  commentsCreate: "comments.create",
  eventsCreate: "events.create",
  eventsManageOwn: "events.manage_own",
  moderationReadReports: "moderation.read_reports",
  moderationManageContent: "moderation.manage_content",
  adminAuditRead: "admin.audit.read",
  usersManageRoles: "users.manage_roles",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export async function loadPermissions(
  db: Database,
  userId: string,
): Promise<ReadonlySet<string>> {
  const rows = await db
    .selectFrom("userRoles as ur")
    .innerJoin("rolePermissions as rp", "rp.roleId", "ur.roleId")
    .innerJoin("permissions as p", "p.id", "rp.permissionId")
    .select("p.code as code")
    .where("ur.userId", "=", userId)
    .distinct()
    .execute();

  return new Set(rows.map((r) => r.code as string));
}

export function assertPermission(
  granted: ReadonlySet<string>,
  required: PermissionCode,
): void {
  if (!granted.has(required)) {
    throw forbidden(`Falta el permiso requerido: ${required}`);
  }
}

/**
 * Visibilidad de posts. Replica en consulta la semántica del enum
 * app.visibility + las tablas post_allowed_roles / post_allowed_users.
 * Devuelve true si el usuario (o el anónimo, con userId null) puede verlo.
 */
export async function canViewPost(
  db: Database,
  postId: string,
  userId: string | null,
): Promise<boolean> {
  const post = await db
    .selectFrom("posts")
    .select(["id", "authorId", "visibility", "status", "deletedAt", "hiddenAt"])
    .where("id", "=", postId)
    .executeTakeFirst();

  if (!post || post.deletedAt || post.status !== "published") return false;
  if (post.hiddenAt) return userId !== null && post.authorId === userId;
  if (post.visibility === "community") return true;
  if (!userId) return false;
  if (post.authorId === userId) return true;

  const direct = await db
    .selectFrom("postAllowedUsers")
    .select("postId")
    .where("postId", "=", postId)
    .where("userId", "=", userId)
    .executeTakeFirst();
  if (direct) return true;

  const viaRole = await db
    .selectFrom("postAllowedRoles as par")
    .innerJoin("userRoles as ur", "ur.roleId", "par.roleId")
    .select("par.postId")
    .where("par.postId", "=", postId)
    .where("ur.userId", "=", userId)
    .executeTakeFirst();

  return Boolean(viaRole);
}
