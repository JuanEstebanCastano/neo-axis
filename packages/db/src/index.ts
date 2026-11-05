/**
 * CONEXIÓN A LA BASE DE DATOS
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Crea la conexión que usan tanto el API como el worker. También verifica al
 * arrancar que la versión de PostgreSQL sea la correcta.
 *
 * TENÉ EN CUENTA
 * Este archivo se toca muy poco. No necesitás entenderlo para contribuir.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import { Kysely, PostgresDialect, CamelCasePlugin, sql } from "kysely";
import pg from "pg";
import type { DB } from "./schema.js";

export type { DB } from "./schema.js";
export { sql } from "kysely";
export type { Transaction, Selectable, Insertable, Updateable } from "kysely";

// Los uuid y timestamptz vuelven como string: el dominio decide cómo parsearlos,
// no el driver. Evita sorpresas de zona horaria con las fechas de eventos.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));

export interface DbOptions {
  connectionString: string;
  maxConnections?: number;
}

export function createDb({ connectionString, maxConnections = 10 }: DbOptions) {
  const pool = new pg.Pool({
    connectionString,
    max: maxConnections,
    // El esquema se llama `app`; esto evita prefijarlo en cada query.
    options: "-c search_path=app,public",
    idle_in_transaction_session_timeout: 10_000,
  });

  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool }),
    // La BD usa snake_case; el código TypeScript, camelCase.
    plugins: [new CamelCasePlugin()],
  });
}

export type Database = ReturnType<typeof createDb>;

/**
 * Comprueba conectividad y que exista una función `uuidv7()` utilizable.
 *
 * En PostgreSQL 18+ `uuidv7()` es nativa. En versiones anteriores (p. ej.
 * Supabase, que hoy corre PG17) el esquema aporta una función de
 * compatibilidad `app.uuidv7()`; como la conexión usa `search_path=app,public`,
 * el nombre `uuidv7()` resuelve a esa función. Por eso ya no exigimos PG18:
 * basta con que la llamada devuelva un UUID válido.
 */
export async function assertDatabaseReady(db: Database): Promise<void> {
  const { rows } = await sql<{ version: number; uuid: string | null }>`
    SELECT current_setting('server_version_num')::int AS version,
           uuidv7()::text AS uuid
  `.execute(db);

  const row = rows[0];
  if (!row) throw new Error("La base de datos no respondió al chequeo de arranque.");

  // Si uuidv7() no existiera, la consulta de arriba ya habría fallado. Aquí sólo
  // confirmamos que el valor devuelto tiene forma de UUID versión 7.
  const isUuidV7 = row.uuid != null &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.uuid);
  if (!isUuidV7) {
    throw new Error(
      `uuidv7() no devolvió un UUID válido (PostgreSQL ${row.version}). ` +
        "Verificá que el esquema 'app' y app.uuidv7() estén aplicados.",
    );
  }
}
