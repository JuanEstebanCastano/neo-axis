/**
 * CONEXIÓN DE CADA USUARIO CON GITHUB
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Guarda (cifrado) el token con el que cada usuario autorizó a Neo Axis, y lo
 * devuelve listo para usar, renovándolo solo si hizo falta.
 *
 * TENÉ EN CUENTA
 * El token NUNCA sale de acá hacia el navegador. El frontend sólo se entera de
 * si hay conexión y de qué cuenta es. Todas las llamadas a GitHub las hace el
 * servidor.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { Database } from "@neoaxis/db";
import { config } from "../../config.js";
import { decryptSecret, encryptSecret, parseEncryptionKey } from "../../lib/crypto.js";
import { AppError, conflict, serviceUnavailable, unauthorized } from "../../lib/errors.js";
import * as gh from "./client.js";

/**
 * Permisos que le pedimos a GitHub. Son el mínimo para lo que hace la app:
 *  - gist         crear y editar gists del usuario.
 *  - read:user    saber qué cuenta se conectó (login y avatar).
 *  - public_repo  leer y escribir en sus repositorios PÚBLICOS.
 *
 * Deliberadamente NO pedimos `repo`: ese permiso abarca también los privados y
 * da acceso de escritura a todos ellos. Si alguna vez hace falta trabajar con
 * repos privados, es una decisión a tomar con el usuario, no un cambio de una
 * línea acá.
 */
export const GITHUB_SCOPES = ["gist", "read:user", "public_repo"];

/** Separa el campo `scopes` tal como lo devuelve GitHub ("a,b" o "a b"). */
function parseScopes(crudo: string | null): string[] {
  return crudo ? crudo.split(/[\s,]+/).filter(Boolean) : [];
}

/**
 * Error propio, con su código, para "tu conexión es vieja y no alcanza".
 * El frontend lo distingue de un 403 cualquiera y te ofrece reconectar en vez
 * de dejarte adivinando.
 */
export const faltaScope = (scope: string) =>
  new AppError(
    403,
    "github_scope_missing",
    `Tu conexión con GitHub es anterior a esta función y no incluye el permiso "${scope}". Desconectá y volvé a conectar tu cuenta para habilitarla.`,
  );

// La clave se parsea una sola vez por proceso.
let cachedKey: Buffer | null = null;
function encryptionKey(): Buffer {
  if (!config.TOKEN_ENCRYPTION_KEY) {
    throw serviceUnavailable("La integración con GitHub no está configurada en este servidor.");
  }
  cachedKey ??= parseEncryptionKey(config.TOKEN_ENCRYPTION_KEY);
  return cachedKey;
}

/** Lo único que el frontend necesita saber de la conexión. */
export interface ConnectionView {
  login: string;
  avatarUrl: string | null;
  scopes: string[];
  connectedAt: string;
}

export async function getConnectionView(
  db: Database,
  userId: string,
): Promise<ConnectionView | null> {
  const fila = await db
    .selectFrom("githubConnections")
    .select(["githubLogin", "githubAvatarUrl", "scopes", "connectedAt"])
    .where("userId", "=", userId)
    .executeTakeFirst();

  if (!fila) return null;
  return {
    login: fila.githubLogin,
    avatarUrl: fila.githubAvatarUrl,
    scopes: fila.scopes ? fila.scopes.split(/[\s,]+/).filter(Boolean) : [],
    connectedAt: new Date(fila.connectedAt as unknown as string).toISOString(),
  };
}

/** ¿El usuario tiene GitHub conectado? Sin traer el token. */
export async function hasConnection(db: Database, userId: string): Promise<boolean> {
  const fila = await db
    .selectFrom("githubConnections")
    .select("id")
    .where("userId", "=", userId)
    .executeTakeFirst();
  return Boolean(fila);
}

/**
 * Guarda (o reemplaza) la conexión. Se llama al volver del callback de OAuth.
 * Reconectar simplemente pisa el token anterior.
 */
export async function saveConnection(
  db: Database,
  input: { userId: string; user: gh.GithubUser; token: gh.OauthToken },
): Promise<ConnectionView> {
  const key = encryptionKey();
  const ahora = Date.now();

  const valores = {
    userId: input.userId,
    githubUserId: input.user.id,
    githubLogin: input.user.login,
    githubAvatarUrl: input.user.avatar_url,
    accessTokenEnc: encryptSecret(input.token.access_token, key),
    refreshTokenEnc: input.token.refresh_token
      ? encryptSecret(input.token.refresh_token, key)
      : null,
    accessTokenExpiresAt: input.token.expires_in
      ? new Date(ahora + input.token.expires_in * 1000)
      : null,
    refreshTokenExpiresAt: input.token.refresh_token_expires_in
      ? new Date(ahora + input.token.refresh_token_expires_in * 1000)
      : null,
    scopes: input.token.scope ?? "",
  };

  try {
    await db
      .insertInto("githubConnections")
      .values(valores)
      .onConflict((oc) =>
        oc.column("userId").doUpdateSet({
          githubUserId: valores.githubUserId,
          githubLogin: valores.githubLogin,
          githubAvatarUrl: valores.githubAvatarUrl,
          accessTokenEnc: valores.accessTokenEnc,
          refreshTokenEnc: valores.refreshTokenEnc,
          accessTokenExpiresAt: valores.accessTokenExpiresAt,
          refreshTokenExpiresAt: valores.refreshTokenExpiresAt,
          scopes: valores.scopes,
        }),
      )
      .execute();
  } catch (err) {
    // UNIQUE(github_user_id): esa cuenta de GitHub ya la usa otro usuario.
    if ((err as { code?: string }).code === "23505") {
      throw conflict("Esa cuenta de GitHub ya está conectada a otro usuario de Neo Axis.");
    }
    throw err;
  }

  return {
    login: input.user.login,
    avatarUrl: input.user.avatar_url,
    scopes: valores.scopes.split(/[\s,]+/).filter(Boolean),
    connectedAt: new Date().toISOString(),
  };
}

export async function disconnect(db: Database, userId: string): Promise<void> {
  await db.deleteFrom("githubConnections").where("userId", "=", userId).execute();
}

/**
 * Devuelve un token usable. Si la OAuth App emite tokens con vencimiento y el
 * actual ya venció, lo renueva con el refresh token y guarda el nuevo.
 * Lanza 401 si el usuario no conectó GitHub (o si ya no se puede renovar).
 */
export async function getAccessToken(db: Database, userId: string): Promise<string> {
  const fila = await db
    .selectFrom("githubConnections")
    .select([
      "accessTokenEnc",
      "refreshTokenEnc",
      "accessTokenExpiresAt",
      "refreshTokenExpiresAt",
      "scopes",
    ])
    .where("userId", "=", userId)
    .executeTakeFirst();

  if (!fila) throw unauthorized("Conectá tu cuenta de GitHub para hacer esto.");

  const key = encryptionKey();
  const vence = fila.accessTokenExpiresAt ? new Date(fila.accessTokenExpiresAt as unknown as string) : null;

  // Margen de 60s: un token que vence mientras viaja la petición es un token vencido.
  const sigueVivo = !vence || vence.getTime() - Date.now() > 60_000;
  if (sigueVivo) return decryptSecret(fila.accessTokenEnc as unknown as Buffer, key);

  const refreshVence = fila.refreshTokenExpiresAt
    ? new Date(fila.refreshTokenExpiresAt as unknown as string)
    : null;
  if (!fila.refreshTokenEnc || (refreshVence && refreshVence.getTime() <= Date.now())) {
    throw unauthorized("La conexión con GitHub caducó. Volvé a conectar tu cuenta.");
  }

  const nuevo = await gh.refreshAccessToken({
    clientId: config.GITHUB_CLIENT_ID as string,
    clientSecret: config.GITHUB_CLIENT_SECRET as string,
    refreshToken: decryptSecret(fila.refreshTokenEnc as unknown as Buffer, key),
  });

  const ahora = Date.now();
  await db
    .updateTable("githubConnections")
    .set({
      accessTokenEnc: encryptSecret(nuevo.access_token, key),
      refreshTokenEnc: nuevo.refresh_token ? encryptSecret(nuevo.refresh_token, key) : null,
      accessTokenExpiresAt: nuevo.expires_in ? new Date(ahora + nuevo.expires_in * 1000) : null,
      refreshTokenExpiresAt: nuevo.refresh_token_expires_in
        ? new Date(ahora + nuevo.refresh_token_expires_in * 1000)
        : null,
      scopes: nuevo.scope ?? fila.scopes,
    })
    .where("userId", "=", userId)
    .execute();

  return nuevo.access_token;
}

/**
 * Igual que getAccessToken, pero además exige que la conexión tenga el permiso
 * que hace falta. Sin esto, el usuario que conectó su cuenta antes de que
 * existiera la función de repositorios recibiría un 404 de GitHub —confuso—
 * en vez de "reconectá tu cuenta".
 */
export async function getAccessTokenWithScope(
  db: Database,
  userId: string,
  scope: string,
): Promise<string> {
  const fila = await db
    .selectFrom("githubConnections")
    .select("scopes")
    .where("userId", "=", userId)
    .executeTakeFirst();

  if (!fila) throw unauthorized("Conectá tu cuenta de GitHub para hacer esto.");
  if (!parseScopes(fila.scopes).includes(scope)) throw faltaScope(scope);

  return getAccessToken(db, userId);
}

/** El repo que el usuario dejó elegido la última vez. */
export async function getDefaultRepo(db: Database, userId: string): Promise<string | null> {
  const fila = await db
    .selectFrom("githubConnections")
    .select("defaultRepo")
    .where("userId", "=", userId)
    .executeTakeFirst();
  return fila?.defaultRepo ?? null;
}

export async function setDefaultRepo(
  db: Database,
  userId: string,
  fullName: string | null,
): Promise<void> {
  await db
    .updateTable("githubConnections")
    .set({ defaultRepo: fullName })
    .where("userId", "=", userId)
    .execute();
}
