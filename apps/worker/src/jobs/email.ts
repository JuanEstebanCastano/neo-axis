/**
 * ENVÍO DE CORREOS
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Toma correos pendientes de la cola, los envía y marca el resultado.
 * Si uno falla, lo reprograma con esperas crecientes (1, 2, 4, 8 minutos).
 *
 * TENÉ EN CUENTA
 * En desarrollo los correos NO salen a internet: los atrapa Mailpit y los ves
 * en http://localhost:8025
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { Database } from "@neoaxis/db";
import { sql } from "@neoaxis/db";
import type { Transporter } from "nodemailer";

/**
 * Consumidor de app.email_notification_queue.
 *
 * NO se agrega Redis ni BullMQ: la tabla YA es una cola, con status,
 * attempts, scheduled_at y last_error. Postgres resuelve el reclamo
 * concurrente con FOR UPDATE SKIP LOCKED, que permite correr N réplicas del
 * worker sin que dos tomen el mismo correo. Meter un broker al lado duplicaría
 * el estado y abriría la puerta a que la cola y la BD se desincronicen.
 */

interface QueuedEmail {
  id: string;
  recipientEmail: string;
  templateCode: string;
  payload: Record<string, unknown>;
  attempts: number;
}

export interface EmailJobOptions {
  batchSize: number;
  maxAttempts: number;
  from: string;
}

/** Reclama un lote en una transacción corta y lo marca como tomado. */
async function claimBatch(db: Database, batchSize: number): Promise<QueuedEmail[]> {
  const { rows } = await sql<QueuedEmail>`
    WITH claimed AS (
      SELECT id
      FROM app.email_notification_queue
      WHERE status = 'queued' AND scheduled_at <= now()
      ORDER BY scheduled_at, created_at
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE app.email_notification_queue q
    SET attempts = q.attempts + 1
    FROM claimed c
    WHERE q.id = c.id
    RETURNING q.id::text            AS id,
              q.recipient_email     AS "recipientEmail",
              q.template_code       AS "templateCode",
              q.payload             AS payload,
              q.attempts            AS attempts
  `.execute(db);

  return rows;
}

async function markSent(db: Database, id: string): Promise<void> {
  await sql`
    UPDATE app.email_notification_queue
    SET status = 'sent', sent_at = now(), last_error = NULL
    WHERE id = ${id}::uuid
  `.execute(db);
}

/** Backoff exponencial: 1, 2, 4, 8... minutos. Agotados los intentos, 'failed'. */
async function markRetryOrFail(
  db: Database,
  email: QueuedEmail,
  error: unknown,
  maxAttempts: number,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);

  if (email.attempts >= maxAttempts) {
    await sql`
      UPDATE app.email_notification_queue
      SET status = 'failed', last_error = ${message}
      WHERE id = ${email.id}::uuid
    `.execute(db);
    return;
  }

  const delayMinutes = Math.min(2 ** (email.attempts - 1), 60);
  await sql`
    UPDATE app.email_notification_queue
    SET status = 'queued',
        scheduled_at = now() + make_interval(mins => ${delayMinutes}),
        last_error = ${message}
    WHERE id = ${email.id}::uuid
  `.execute(db);
}

function render(templateCode: string, payload: Record<string, unknown>) {
  // Plantillas mínimas. En producción conviene MJML o react-email compilado
  // en build-time; el contrato (template_code + payload jsonb) no cambia.
  const templates: Record<string, (p: Record<string, unknown>) => { subject: string; html: string }> = {
    "notification.mention": (p) => ({
      subject: `${p.actorName ?? "Alguien"} te mencionó`,
      html: `<p>${p.actorName ?? "Alguien"} te mencionó en una publicación.</p>`,
    }),
    "notification.comment": (p) => ({
      subject: `Nuevo comentario en "${p.postTitle ?? "tu publicación"}"`,
      html: `<p>${p.actorName ?? "Alguien"} comentó tu publicación.</p>`,
    }),
    "auth.password_reset": (p) => ({
      subject: "Restablecer tu contraseña",
      html: `<p>Usá este enlace para restablecer tu contraseña: ${p.resetUrl}</p>`,
    }),
    "auth.email_verification": (p) => ({
      subject: "Verificá tu correo",
      html: `<p>Confirmá tu dirección acá: ${p.verifyUrl}</p>`,
    }),
  };

  const tpl = templates[templateCode];
  if (!tpl) throw new Error(`Plantilla desconocida: ${templateCode}`);
  return tpl(payload);
}

export async function processEmailBatch(
  db: Database,
  mailer: Transporter,
  opts: EmailJobOptions,
): Promise<{ sent: number; failed: number }> {
  const batch = await claimBatch(db, opts.batchSize);
  let sent = 0;
  let failed = 0;

  for (const email of batch) {
    try {
      const { subject, html } = render(email.templateCode, email.payload ?? {});
      await mailer.sendMail({ from: opts.from, to: email.recipientEmail, subject, html });
      await markSent(db, email.id);
      sent += 1;
    } catch (err) {
      await markRetryOrFail(db, email, err, opts.maxAttempts);
      failed += 1;
    }
  }

  return { sent, failed };
}
