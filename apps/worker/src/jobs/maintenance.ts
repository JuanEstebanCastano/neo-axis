/**
 * TAREAS DE LIMPIEZA
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Borra lo que ya no sirve: sesiones vencidas, tokens usados y publicaciones
 * borradas hace más de 30 días.
 *
 * TENÉ EN CUENTA
 * Sin esto la base de datos crecería para siempre con basura. Es poco
 * glamoroso y absolutamente necesario.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { Database } from "@neoaxis/db";
import { sql } from "@neoaxis/db";

/** Sesiones vencidas hace más de 7 días: se borran físicamente. */
export async function purgeExpiredSessions(db: Database): Promise<number> {
  const { rows } = await sql<{ count: string }>`
    WITH deleted AS (
      DELETE FROM app.auth_sessions
      WHERE expires_at < now() - interval '7 days'
      RETURNING 1
    )
    SELECT count(*)::text AS count FROM deleted
  `.execute(db);
  return Number(rows[0]?.count ?? 0);
}

/**
 * Purga de contenido borrado lógicamente.
 *
 * Como el DDL usa deleted_at, los ON DELETE CASCADE nunca se disparan y las
 * filas hijas (post_images, comments, reactions) se acumulan para siempre.
 * Este job cierra ese hueco: pasado el período de gracia, borra físicamente y
 * ahí sí el CASCADE limpia todo el árbol de una.
 */
export async function purgeSoftDeletedPosts(db: Database, graceDays = 30): Promise<number> {
  const { rows } = await sql<{ count: string }>`
    WITH deleted AS (
      DELETE FROM app.posts
      WHERE deleted_at IS NOT NULL
        AND deleted_at < now() - make_interval(days => ${graceDays})
      RETURNING 1
    )
    SELECT count(*)::text AS count FROM deleted
  `.execute(db);
  return Number(rows[0]?.count ?? 0);
}

/** Tokens de verificación/reset ya consumidos o vencidos. */
export async function purgeConsumedTokens(db: Database): Promise<number> {
  const { rows } = await sql<{ count: string }>`
    WITH deleted AS (
      DELETE FROM app.auth_tokens
      WHERE consumed_at IS NOT NULL OR expires_at < now() - interval '1 day'
      RETURNING 1
    )
    SELECT count(*)::text AS count FROM deleted
  `.execute(db);
  return Number(rows[0]?.count ?? 0);
}
