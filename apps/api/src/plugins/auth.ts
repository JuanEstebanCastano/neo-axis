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
  // Fastify v5 prohíbe decorar el request con un tipo referencia (Set/objeto)
  // directamente: se declaran como null y se inicializan por request en el hook.
  app.decorateRequest("session", null);
  // Valor por defecto null (primitivo) para no violar la regla de tipos
  // referencia de Fastify v5; el hook onRequest lo reemplaza por un Set real
  // en cada request antes de que cualquier ruta lo lea.
  app.decorateRequest("permissions", null as unknown as ReadonlySet<string>);

  // Resuelve la identidad en cada request. No corta: sólo informa.
  // Los permisos se cargan una vez por request y se reutilizan.
  app.addHook("onRequest", async (req) => {
    req.permissions = new Set<string>();
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
      // SameSite=None exige Secure. También forzamos Secure en producción.
      secure: isProduction || config.COOKIE_SAMESITE === "none",
      sameSite: config.COOKIE_SAMESITE,
      path: "/",
      expires: expiresAt,
      signed: false,
    });
  });

  app.decorate("clearSessionCookie", (reply) => {
    // El borrado debe replicar los MISMOS atributos con que se creó la cookie
    // (secure + sameSite), o el navegador no la hace coincidir y la cookie
    // cross-site (SameSite=None; Secure) no se elimina de verdad.
    reply.clearCookie(config.SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: isProduction || config.COOKIE_SAMESITE === "none",
      sameSite: config.COOKIE_SAMESITE,
      path: "/",
    });
  });
}, { name: "auth", dependencies: ["db"] });
