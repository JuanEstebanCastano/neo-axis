/**
 * CONEXIÓN DISPONIBLE EN TODO EL API
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Hace que `app.db` esté disponible en cualquier ruta, sin tener que importar
 * y reconectar en cada archivo.
 *
 * TENÉ EN CUENTA
 * Un 'plugin' de Fastify es código que se monta una vez al arrancar y queda
 * disponible para siempre.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import fp from "fastify-plugin";
import { createDb, assertDatabaseReady, type Database } from "@neoaxis/db";
import { config } from "../config.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
  }
}

export default fp(async (app) => {
  const db = createDb({ connectionString: config.DATABASE_URL });
  await assertDatabaseReady(db);

  app.decorate("db", db);
  app.addHook("onClose", async () => {
    await db.destroy();
  });
}, { name: "db" });
