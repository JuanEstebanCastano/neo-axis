/**
 * SESIONES
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Crear, verificar y anular sesiones. Cuando alguien inicia sesión se genera
 * un código al azar: se le manda en una cookie y se guarda cifrado en la base.
 *
 * TENÉ EN CUENTA
 * Se guarda cifrado a propósito. Si alguien roba la base de datos, no puede
 * hacerse pasar por nadie: los códigos guardados no sirven como cookie.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import type { Database } from "@neoaxis/db";
import { sql } from "@neoaxis/db";

/**
 * Sesiones opacas, no JWT.
 *
 * El esquema guarda `token_hash bytea` en app.auth_sessions, es decir que la
 * revocación es un UPDATE y surte efecto de inmediato. Un JWT stateless no
 * podría cumplir eso sin una denylist, que termina siendo la misma tabla.
 */

const TOKEN_BYTES = 32;

export interface IssuedSession {
  token: string;
  sessionId: string;
  expiresAt: Date;
}

const hashToken = (token: string): Buffer =>
  createHash("sha256").update(token, "utf8").digest();

export async function issueSession(
  db: Database,
  params: { userId: string; ttlDays: number; ip?: string | null; userAgent?: string | null },
): Promise<IssuedSession> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + params.ttlDays * 86_400_000);

  const row = await db
    .insertInto("authSessions")
    .values({
      userId: params.userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return { token, sessionId: row.id as string, expiresAt };
}

export interface SessionUser {
  sessionId: string;
  userId: string;
  username: string;
  status: string;
}

export async function resolveSession(
  db: Database,
  token: string,
): Promise<SessionUser | null> {
  const digest = hashToken(token);

  const row = await db
    .selectFrom("authSessions as s")
    .innerJoin("users as u", "u.id", "s.userId")
    .select([
      "s.id as sessionId",
      "s.tokenHash as tokenHash",
      "u.id as userId",
      "u.username as username",
      "u.status as status",
    ])
    .where("s.tokenHash", "=", digest)
    .where("s.revokedAt", "is", null)
    .where("s.expiresAt", ">", new Date())
    .where("u.deletedAt", "is", null)
    .executeTakeFirst();

  if (!row) return null;

  // Comparación en tiempo constante aunque el índice ya haya hecho el match:
  // defensa en profundidad, cuesta microsegundos.
  const stored = row.tokenHash as Buffer;
  if (stored.length !== digest.length || !timingSafeEqual(stored, digest)) return null;

  // Un usuario suspendido conserva la sesión pero no pasa de acá.
  if (row.status !== "active") return null;

  // last_seen_at sin bloquear la respuesta.
  void db
    .updateTable("authSessions")
    .set({ lastSeenAt: new Date() })
    .where("id", "=", row.sessionId)
    .execute()
    .catch(() => {});

  return {
    sessionId: row.sessionId as string,
    userId: row.userId as string,
    username: row.username as string,
    status: row.status as string,
  };
}

export async function revokeSession(db: Database, sessionId: string): Promise<void> {
  await db
    .updateTable("authSessions")
    .set({ revokedAt: new Date() })
    .where("id", "=", sessionId)
    .where("revokedAt", "is", null)
    .execute();
}
