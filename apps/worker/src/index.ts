/**
 * EL TRABAJADOR DE FONDO
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Un ciclo infinito: mira si hay correos pendientes, los envía, duerme 5
 * segundos, repite. Cada hora aproximadamente hace tareas de limpieza.
 *
 * TENÉ EN CUENTA
 * Es el programa más simple del proyecto. Nadie lo llama: trabaja solo.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import { createDb, assertDatabaseReady } from "@neoaxis/db";
import nodemailer from "nodemailer";
import { z } from "zod";
import { processEmailBatch } from "./jobs/email.js";
import { purgeExpiredSessions } from "./jobs/maintenance.js";

const env = z.object({
  DATABASE_URL: z.string().url(),
  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string(),
  WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(25),
  WORKER_POLL_MS: z.coerce.number().int().positive().default(5000),
  WORKER_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
}).parse(process.env);

const db = createDb({ connectionString: env.DATABASE_URL, maxConnections: 4 });
await assertDatabaseReady(db);

const mailer = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
});

let running = true;
const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), msg, ...extra }));

const stop = async (signal: string) => {
  log("Deteniendo worker", { signal });
  running = false;
};
process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

log("Worker iniciado", { batchSize: env.WORKER_BATCH_SIZE, pollMs: env.WORKER_POLL_MS });

let ticks = 0;

while (running) {
  try {
    const result = await processEmailBatch(db, mailer, {
      batchSize: env.WORKER_BATCH_SIZE,
      maxAttempts: env.WORKER_MAX_ATTEMPTS,
      from: env.MAIL_FROM,
    });

    if (result.sent || result.failed) log("Lote de correos procesado", result);

    // Mantenimiento cada ~1h asumiendo poll de 5s.
    if (++ticks % 720 === 0) {
      const purged = await purgeExpiredSessions(db);
      log("Mantenimiento ejecutado", { sessionsPurged: purged });
    }

    // Si el lote vino lleno hay más trabajo: no dormir.
    if (result.sent + result.failed < env.WORKER_BATCH_SIZE) {
      await sleep(env.WORKER_POLL_MS);
    }
  } catch (err) {
    log("Error en el ciclo del worker", { error: err instanceof Error ? err.message : String(err) });
    await sleep(env.WORKER_POLL_MS);
  }
}

await db.destroy();
log("Worker detenido limpiamente");
process.exit(0);
