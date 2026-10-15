/**
 * REGISTRO E INICIO DE SESIÓN
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Las direcciones para crear una cuenta, entrar, salir y preguntar quién soy.
 *
 * TENÉ EN CUENTA
 * Mirá el comentario sobre el 'hash falso' en el login: es un detalle de
 * seguridad sutil y vale la pena entenderlo.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { config } from "../../config.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { issueSession, revokeSession } from "../../lib/session.js";
import { badRequest, conflict, unauthorized } from "../../lib/errors.js";

const registerBody = z.object({
  username: z.string().regex(/^[A-Za-z0-9_][A-Za-z0-9_-]{2,39}$/, "Username inválido"),
  displayName: z.string().min(1).max(120),
  email: z.string().email().max(320),
  password: z.string().min(12).max(200),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/register", async (req, reply) => {
    const parsed = registerBody.safeParse(req.body);
    if (!parsed.success) throw badRequest(z.prettifyError(parsed.error));
    const { username, displayName, email, password } = parsed.data;

    const digest = await hashPassword(password);

    const user = await app.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom("users")
        .select("id")
        .where((eb) =>
          eb.or([
            eb(eb.fn("lower", ["username"]), "=", username.toLowerCase()),
            eb(eb.fn("lower", ["email"]), "=", email.toLowerCase()),
          ]),
        )
        .where("deletedAt", "is", null)
        .executeTakeFirst();

      if (existing) throw conflict("El usuario o el correo ya están registrados");

      const created = await trx
        .insertInto("users")
        .values({ username, displayName, email })
        .returning(["id", "username", "displayName", "email"])
        .executeTakeFirstOrThrow();

      await trx
        .insertInto("userCredentials")
        .values({ userId: created.id as string, passwordHash: digest })
        .execute();

      // Preferencias de notificación por defecto.
      await trx
        .insertInto("userNotificationPreferences")
        .values({ userId: created.id as string })
        .execute();

      // Rol base 'user' — el esquema lo siembra en la migración inicial.
      await trx
        .insertInto("userRoles")
        .columns(["userId", "roleId"])
        .expression((eb) =>
          eb.selectFrom("roles").select((e) => [
            e.val(created.id).as("userId"),
            "roles.id as roleId",
          ]).where("roles.code", "=", "user"),
        )
        .execute();

      return created;
    });

    const session = await issueSession(app.db, {
      userId: user.id as string,
      ttlDays: config.SESSION_TTL_DAYS,
      ip: req.ip,
      userAgent: req.headers["user-agent"] ?? null,
    });

    app.setSessionCookie(reply, session.token, session.expiresAt);
    return reply.code(201).send({ user });
  });

  app.post("/auth/login", { config: { rateLimit: { max: 10, timeWindow: "5 minutes" } } }, async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Credenciales inválidas");
    const { email, password } = parsed.data;

    const row = await app.db
      .selectFrom("users as u")
      .innerJoin("userCredentials as c", "c.userId", "u.id")
      .select(["u.id as id", "u.username as username", "u.status as status", "c.passwordHash as passwordHash"])
      .where((eb) => eb(eb.fn("lower", ["u.email"]), "=", email.toLowerCase()))
      .where("u.deletedAt", "is", null)
      .executeTakeFirst();

    // Se verifica siempre contra un hash, exista o no el usuario, para que el
    // tiempo de respuesta no revele qué correos están registrados.
    const dummy = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000";
    const ok = await verifyPassword(row?.passwordHash as string ?? dummy, password);

    if (!row || !ok || row.status !== "active") throw unauthorized("Credenciales inválidas");

    const session = await issueSession(app.db, {
      userId: row.id as string,
      ttlDays: config.SESSION_TTL_DAYS,
      ip: req.ip,
      userAgent: req.headers["user-agent"] ?? null,
    });

    app.setSessionCookie(reply, session.token, session.expiresAt);
    return { user: { id: row.id, username: row.username } };
  });

  app.post("/auth/logout", async (req, reply) => {
    if (req.session) await revokeSession(app.db, req.session.sessionId);
    app.clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.get("/auth/me", async (req) => {
    const session = app.requireAuth(req);
    return {
      user: { id: session.userId, username: session.username },
      permissions: [...req.permissions],
    };
  });
};
