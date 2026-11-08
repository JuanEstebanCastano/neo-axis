/**
 * DIRECCIONES DEL PERFIL DE USUARIO
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Las URLs para que una persona vea y edite SU PROPIO perfil: datos públicos,
 * correo, contraseña y preferencias de notificación.
 *
 * TENÉ EN CUENTA
 * Todas estas rutas operan sobre la sesión actual (req.session), nunca sobre un
 * id que venga del cliente: una persona sólo puede tocar sus propios datos. Por
 * eso alcanza con requireAuth y no hace falta un permiso especial.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { FastifyPluginAsync } from "fastify";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { badRequest, conflict, notFound, unauthorized } from "../../lib/errors.js";
import { prettifyZodError } from "../../lib/validation.js";

import {
  updateProfileBody,
  changeEmailBody,
  changePasswordBody,
  notificationPrefsBody,
} from "./schemas.js";

// Columnas públicas del perfil que devolvemos siempre que cambia algo.
const PROFILE_COLUMNS = [
  "id",
  "username",
  "displayName",
  "email",
  "bio",
  "websiteUrl",
  "avatarUrl",
  "status",
  "createdAt",
] as const;

export const userRoutes: FastifyPluginAsync = async (app) => {
  // Perfil completo + resumen de actividad + preferencias de notificación.
  app.get("/users/me", async (req) => {
    const session = app.requireAuth(req);

    const user = await app.db
      .selectFrom("users")
      .select(PROFILE_COLUMNS)
      .where("id", "=", session.userId)
      .where("deletedAt", "is", null)
      .executeTakeFirst();

    if (!user) throw notFound("Usuario no encontrado");

    const notifications = await app.db
      .selectFrom("userNotificationPreferences")
      .selectAll()
      .where("userId", "=", session.userId)
      .executeTakeFirst();

    // Publicaciones propias (excluyendo las que son snippets).
    const posts = await app.db
      .selectFrom("posts as p")
      .leftJoin("postSnippets as ps", "ps.postId", "p.id")
      .select((eb) => eb.fn.countAll().as("n"))
      .where("p.authorId", "=", session.userId)
      .where("p.deletedAt", "is", null)
      .where("ps.id", "is", null)
      .executeTakeFirst();

    const snippets = await app.db
      .selectFrom("posts as p")
      .innerJoin("postSnippets as ps", "ps.postId", "p.id")
      .select((eb) => eb.fn.countAll().as("n"))
      .where("p.authorId", "=", session.userId)
      .where("p.deletedAt", "is", null)
      .executeTakeFirst();

    const collections = await app.db
      .selectFrom("collections")
      .select((eb) => eb.fn.countAll().as("n"))
      .where("ownerId", "=", session.userId)
      .where("deletedAt", "is", null)
      .executeTakeFirst();

    return {
      user,
      stats: {
        posts: Number(posts?.n ?? 0),
        snippets: Number(snippets?.n ?? 0),
        collections: Number(collections?.n ?? 0),
      },
      notifications: notifications ?? null,
    };
  });

  // Editar datos públicos del perfil (nombre, bio, sitio web, avatar).
  app.put("/users/me", async (req) => {
    const session = app.requireAuth(req);
    const parsed = updateProfileBody.safeParse(req.body);
    if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));

    const data = parsed.data;
    const patch: {
      displayName?: string;
      bio?: string | null;
      websiteUrl?: string | null;
      avatarUrl?: string | null;
    } = {};
    if (data.displayName !== undefined) patch.displayName = data.displayName;
    if (data.bio !== undefined) patch.bio = data.bio;
    if (data.websiteUrl !== undefined) patch.websiteUrl = data.websiteUrl;
    if (data.avatarUrl !== undefined) patch.avatarUrl = data.avatarUrl;

    if (Object.keys(patch).length === 0) throw badRequest("No enviaste ningún campo para actualizar");

    const user = await app.db
      .updateTable("users")
      .set(patch)
      .where("id", "=", session.userId)
      .returning(PROFILE_COLUMNS)
      .executeTakeFirstOrThrow();

    return { user };
  });

  // Cambiar el correo. Exige la contraseña actual y verifica que no esté en uso.
  app.put("/users/me/email", async (req) => {
    const session = app.requireAuth(req);
    const parsed = changeEmailBody.safeParse(req.body);
    if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));
    const { email, currentPassword } = parsed.data;

    const cred = await app.db
      .selectFrom("userCredentials")
      .select("passwordHash")
      .where("userId", "=", session.userId)
      .executeTakeFirst();

    const ok = cred ? await verifyPassword(cred.passwordHash, currentPassword) : false;
    if (!ok) throw unauthorized("La contraseña actual es incorrecta");

    const taken = await app.db
      .selectFrom("users")
      .select("id")
      .where((eb) => eb(eb.fn("lower", ["email"]), "=", email.toLowerCase()))
      .where("id", "!=", session.userId)
      .where("deletedAt", "is", null)
      .executeTakeFirst();

    if (taken) throw conflict("Ese correo ya está en uso");

    const user = await app.db
      .updateTable("users")
      .set({ email })
      .where("id", "=", session.userId)
      .returning(PROFILE_COLUMNS)
      .executeTakeFirstOrThrow();

    return { user };
  });

  // Cambiar la contraseña. Exige la actual y revoca las demás sesiones.
  app.put("/users/me/password", async (req) => {
    const session = app.requireAuth(req);
    const parsed = changePasswordBody.safeParse(req.body);
    if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));
    const { currentPassword, newPassword } = parsed.data;

    const cred = await app.db
      .selectFrom("userCredentials")
      .select("passwordHash")
      .where("userId", "=", session.userId)
      .executeTakeFirst();

    const ok = cred ? await verifyPassword(cred.passwordHash, currentPassword) : false;
    if (!ok) throw unauthorized("La contraseña actual es incorrecta");

    const digest = await hashPassword(newPassword);
    await app.db
      .updateTable("userCredentials")
      .set({ passwordHash: digest })
      .where("userId", "=", session.userId)
      .execute();

    // Seguridad: invalidar todas las OTRAS sesiones (se mantiene la actual).
    await app.db
      .updateTable("authSessions")
      .set({ revokedAt: new Date() })
      .where("userId", "=", session.userId)
      .where("id", "!=", session.sessionId)
      .where("revokedAt", "is", null)
      .execute();

    return { ok: true };
  });

  // Preferencias de notificación. Upsert por si la fila no existiera.
  app.put("/users/me/notifications", async (req) => {
    const session = app.requireAuth(req);
    const parsed = notificationPrefsBody.safeParse(req.body);
    if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));
    const data = parsed.data;

    if (Object.keys(data).length === 0) throw badRequest("No enviaste ninguna preferencia para actualizar");

    const notifications = await app.db
      .insertInto("userNotificationPreferences")
      .values({ userId: session.userId, ...data })
      .onConflict((oc) => oc.column("userId").doUpdateSet(data))
      .returningAll()
      .executeTakeFirstOrThrow();

    return { notifications };
  });
};
