/**
 * CONECTAR Y DESCONECTAR GITHUB
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * El baile de OAuth: mandamos al usuario a GitHub, GitHub lo devuelve acá con
 * un código, cambiamos ese código por un token y lo guardamos cifrado.
 *
 * TENÉ EN CUENTA
 * El `state` es la defensa contra CSRF del flujo: un valor al azar que sale en
 * una cookie firmada y tiene que volver idéntico desde GitHub. Si no coincide,
 * alguien está intentando conectar SU cuenta de GitHub a la sesión de otro.
 *
 * El callback es un GET al que llega el navegador: no puede devolver JSON,
 * tiene que redirigir al frontend con el resultado en la URL.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { config, isGithubEnabled, isProduction } from "../../config.js";
import { serviceUnavailable } from "../../lib/errors.js";
import * as gh from "./client.js";
import { GITHUB_SCOPES, disconnect, getConnectionView, saveConnection } from "./service.js";

const STATE_COOKIE = "neoaxis_gh_state";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutos para completar el flujo.

/** Primer origen de PUBLIC_WEB_ORIGIN: es a donde vuelve el usuario. */
function webOrigin(): string {
  return (config.PUBLIC_WEB_ORIGIN.split(",")[0] ?? "").trim().replace(/\/+$/, "");
}

/** Vuelve al frontend con el resultado en la query. */
function volverAlFrontend(reply: FastifyReply, resultado: string, detalle?: string) {
  const qs = new URLSearchParams({ github: resultado });
  if (detalle) qs.set("motivo", detalle);
  return reply.redirect(`${webOrigin()}/snippets?${qs.toString()}`, 302);
}

export const githubRoutes: FastifyPluginAsync = async (app) => {
  // ── ¿Está disponible la integración? ¿Y conectado este usuario? ──
  app.get("/github/status", async (req) => {
    if (!isGithubEnabled) return { enabled: false, connection: null };
    if (!req.session) return { enabled: true, connection: null };
    return { enabled: true, connection: await getConnectionView(app.db, req.session.userId) };
  });

  // ── Paso 1: mandar al usuario a GitHub ──
  app.get("/github/connect", async (req, reply) => {
    if (!isGithubEnabled) {
      throw serviceUnavailable("La integración con GitHub no está configurada en este servidor.");
    }
    // Es una navegación del navegador, no un fetch: si no hay sesión lo
    // mandamos a iniciarla en vez de devolver un 401 que nadie vería.
    if (!req.session) return reply.redirect(`${webOrigin()}/auth`, 302);

    const state = randomBytes(32).toString("base64url");
    reply.setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      secure: isProduction || config.COOKIE_SAMESITE === "none",
      sameSite: config.COOKIE_SAMESITE,
      path: "/",
      maxAge: STATE_TTL_MS / 1000,
      signed: true,
    });

    return reply.redirect(
      gh.buildAuthorizeUrl({
        clientId: config.GITHUB_CLIENT_ID as string,
        redirectUri: config.GITHUB_CALLBACK_URL as string,
        state,
        scopes: GITHUB_SCOPES,
      }),
      302,
    );
  });

  // ── Paso 2: GitHub devuelve al usuario acá ──
  app.get("/github/callback", async (req, reply) => {
    if (!isGithubEnabled) return volverAlFrontend(reply, "error", "no-configurado");

    const query = z
      .object({
        code: z.string().min(1).optional(),
        state: z.string().min(1).optional(),
        error: z.string().optional(),
      })
      .safeParse(req.query);

    // El usuario apretó "Cancel" en la pantalla de GitHub.
    if (!query.success || query.data.error) return volverAlFrontend(reply, "cancelado");

    const { code, state } = query.data;
    const firmada = req.cookies[STATE_COOKIE];
    const esperado = firmada ? app.unsignCookie(firmada) : null;

    // La cookie se consume siempre: un state sirve para un solo intento.
    reply.clearCookie(STATE_COOKIE, {
      httpOnly: true,
      secure: isProduction || config.COOKIE_SAMESITE === "none",
      sameSite: config.COOKIE_SAMESITE,
      path: "/",
    });

    if (!code || !state || !esperado?.valid || esperado.value !== state) {
      return volverAlFrontend(reply, "error", "state-invalido");
    }
    if (!req.session) return reply.redirect(`${webOrigin()}/auth`, 302);

    try {
      const token = await gh.exchangeCodeForToken({
        clientId: config.GITHUB_CLIENT_ID as string,
        clientSecret: config.GITHUB_CLIENT_SECRET as string,
        code,
        redirectUri: config.GITHUB_CALLBACK_URL as string,
      });
      const usuario = await gh.getAuthenticatedUser(token.access_token);
      await saveConnection(app.db, { userId: req.session.userId, user: usuario, token });
      return volverAlFrontend(reply, "conectado");
    } catch (err) {
      // Un fallo acá no puede terminar en un 500 sin contexto: el usuario está
      // mirando una pestaña en blanco esperando volver.
      req.log.error({ err }, "Falló la conexión con GitHub");
      const code = (err as { code?: string }).code;
      return volverAlFrontend(reply, "error", code === "conflict" ? "cuenta-en-uso" : "fallo");
    }
  });

  // ── Desconectar ──
  app.delete("/github/connection", async (req) => {
    const session = app.requireAuth(req);
    await disconnect(app.db, session.userId);
    // Nota: esto borra el token de Neo Axis. Los gists ya publicados siguen
    // existiendo en la cuenta de GitHub del usuario, que es lo correcto.
    return { ok: true };
  });
};
