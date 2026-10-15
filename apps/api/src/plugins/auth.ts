/**
 * IDENTIFICAR AL VISITANTE
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Corre en CADA pedido que llega. Lee la cookie, busca la sesión y carga los
 * permisos de esa persona.
 *
 * TENÉ EN CUENTA
 * No bloquea a nadie: sólo averigua quién es y lo anota. Quien decide bloquear
 * es cada ruta. Un visitante anónimo puede leer el feed sin problema.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import fp from "fastify-plugin";
import { config, isProduction } from "../config.js";
import { resolveSession, type SessionUser } from "../lib/session.js";
import { loadPermissions, assertPermission, type PermissionCode } from "../lib/rbac.js";
import { unauthorized } from "../lib/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    /** null cuando el visitante es anónimo. */
    session: SessionUser | null;
    permissions: ReadonlySet<string>;
  }
  interface FastifyInstance {
    requireAuth: (req: import("fastify").FastifyRequest) => SessionUser;
    requirePermission: (
      code: PermissionCode,
    ) => (req: import("fastify").FastifyRequest) => Promise<void>;
    setSessionCookie: (reply: import("fastify").FastifyReply, token: string, expiresAt: Date) => void;
    clearSessionCookie: (reply: import("fastify").FastifyReply) => void;
  }
}

export default fp(async (app) => {
  app.decorateRequest("session", null);
  app.decorateRequest("permissions", new Set<string>());

  // Resuelve la identidad en cada request. No corta: sólo informa.
  // Los permisos se cargan una vez por request y se reutilizan.
  app.addHook("onRequest", async (req) => {
    const token = req.cookies[config.SESSION_COOKIE_NAME];
    if (!token) return;

    const session = await resolveSession(app.db, token);
    if (!session) return;

    req.session = session;
    req.permissions = await loadPermissions(app.db, session.userId);
  });

  app.decorate("requireAuth", (req) => {
    if (!req.session) throw unauthorized();
    return req.session;
  });

  app.decorate("requirePermission", (code: PermissionCode) => async (req) => {
    if (!req.session) throw unauthorized();
    assertPermission(req.permissions, code);
  });

  app.decorate("setSessionCookie", (reply, token, expiresAt) => {
    reply.setCookie(config.SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
      signed: false,
    });
  });

  app.decorate("clearSessionCookie", (reply) => {
    reply.clearCookie(config.SESSION_COOKIE_NAME, { path: "/" });
  });
}, { name: "auth", dependencies: ["db"] });
