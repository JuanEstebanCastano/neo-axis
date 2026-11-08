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
import { z } from "zod";
import { processEmailBatch } from "./jobs/email.js";
import { createSmtpMailer, createMailerSendMailer, parseMailFrom, type Mailer } from "./lib/mailer.js";
import { purgeExpiredSessions, purgeSoftDeletedPosts, purgeConsumedTokens } from "./jobs/maintenance.js";

const env = z.object({
  DATABASE_URL: z.string().url(),
  // Elige el transporte de correo. "mailersend" usa la API HTTP (puerto 443),
  // recomendada en Railway porque bloquea SMTP saliente en planes bajos.
  MAIL_TRANSPORT: z.enum(["smtp", "mailersend"]).default("smtp"),
  MAIL_FROM: z.string(),
  // SMTP (requeridas solo con MAIL_TRANSPORT=smtp)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  // MailerSend API (requerida solo con MAIL_TRANSPORT=mailersend)
  MAILERSEND_API_KEY: z.string().optional(),
  WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(25),
  WORKER_POLL_MS: z.coerce.number().int().positive().default(5000),
  WORKER_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
}).superRefine((val, ctx) => {
  if (val.MAIL_TRANSPORT === "smtp") {
    if (!val.SMTP_HOST) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["SMTP_HOST"], message: "requerida con MAIL_TRANSPORT=smtp" });
    if (!val.SMTP_PORT) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["SMTP_PORT"], message: "requerida con MAIL_TRANSPORT=smtp" });
  } else if (!val.MAILERSEND_API_KEY) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["MAILERSEND_API_KEY"], message: "requerida con MAIL_TRANSPORT=mailersend" });
  }
}).parse(process.env);

const db = createDb({ connectionString: env.DATABASE_URL, maxConnections: 4 });
await assertDatabaseReady(db);

let running = true;
const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), msg, ...extra }));

// Construye el transporte de correo según MAIL_TRANSPORT. parseMailFrom valida
// el formato de MAIL_FROM y, si está mal, cortamos el arranque con un mensaje
// claro (un error de config no debe disfrazarse de fallo al enviar).
let mailer: Mailer;
try {
  const from = parseMailFrom(env.MAIL_FROM);
  mailer = env.MAIL_TRANSPORT === "mailersend"
    ? createMailerSendMailer({ apiKey: env.MAILERSEND_API_KEY as string, from })
    : createSmtpMailer({
        host: env.SMTP_HOST as string,
        port: env.SMTP_PORT as number,
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
        from,
      });
  log("Transporte de correo listo", { transport: env.MAIL_TRANSPORT, from: from.email });
} catch (err) {
  log("Config de correo inválida, abortando", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
}

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
    });

    if (result.sent || result.failed) log("Lote de correos procesado", { sent: result.sent, failed: result.failed });

    // Cada fallo de envío se escribe en el log con su causa real (p. ej. el
    // error de SMTP). Antes solo veíamos "failed: N" sin el porqué.
    for (const e of result.errors) {
      log("Fallo al enviar correo", {
        emailId: e.id,
        to: e.recipientEmail,
        template: e.templateCode,
        attempts: e.attempts,
        error: e.error,
      });
    }

    // Mantenimiento cada ~1h asumiendo poll de 5s.
    if (++ticks % 720 === 0) {
      const sessionsPurged = await purgeExpiredSessions(db);
      const postsPurged = await purgeSoftDeletedPosts(db);
      const tokensPurged = await purgeConsumedTokens(db);
      log("Mantenimiento ejecutado", { sessionsPurged, postsPurged, tokensPurged });
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
