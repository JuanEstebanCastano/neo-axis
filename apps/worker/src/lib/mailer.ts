/**
 * ENVÍO DE CORREO: ABSTRACCIÓN DE TRANSPORTE
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Define una interfaz `Mailer` única y dos implementaciones: SMTP (nodemailer)
 * y la API HTTP de MailerSend (puerto 443). El resto del worker (cola y
 * reintentos) no sabe cuál se usa; se elige con MAIL_TRANSPORT.
 *
 * TENÉ EN CUENTA
 * Railway bloquea SMTP saliente en planes bajos (puertos 25/465/587/2525), por
 * eso la API HTTP es la opción confiable allí.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import nodemailer from "nodemailer";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
}

export interface Mailer {
  send(email: OutgoingEmail): Promise<void>;
}

export interface MailFrom {
  email: string;
  name?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parsea MAIL_FROM a { email, name }. Acepta dos formatos:
 *   - "Nombre <correo@dominio>"
 *   - "correo@dominio"
 * Falla con un mensaje claro (no genérico) si el formato no es válido, para que
 * un error de configuración se vea de inmediato y no como un fallo opaco al enviar.
 */
export function parseMailFrom(raw: string): MailFrom {
  const value = (raw ?? "").trim();
  if (!value) {
    throw new Error('MAIL_FROM está vacío. Usá el formato "Nombre <correo@dominio>" o "correo@dominio".');
  }

  // "Nombre <correo@dominio>"
  const withName = value.match(/^(.*?)\s*<\s*([^<>\s]+)\s*>$/);
  if (withName) {
    const name = (withName[1] ?? "").replace(/^["']|["']$/g, "").trim();
    const email = (withName[2] ?? "").trim();
    if (!EMAIL_RE.test(email)) {
      throw new Error(`MAIL_FROM: el correo "${email}" no es válido. Formato esperado: "Nombre <correo@dominio>".`);
    }
    return name ? { email, name } : { email };
  }

  // Si hay un "<" pero no matcheó el formato completo, el formato está mal.
  if (value.includes("<") || value.includes(">")) {
    throw new Error(`MAIL_FROM con formato inválido: "${raw}". Usá "Nombre <correo@dominio>" o "correo@dominio".`);
  }

  // "correo@dominio" a secas
  if (EMAIL_RE.test(value)) {
    return { email: value };
  }

  throw new Error(`MAIL_FROM con formato inválido: "${raw}". Usá "Nombre <correo@dominio>" o "correo@dominio".`);
}

/** Transporte SMTP clásico (nodemailer). Con timeouts explícitos para no colgar. */
export function createSmtpMailer(opts: {
  host: string;
  port: number;
  user?: string | undefined;
  password?: string | undefined;
  from: MailFrom;
}): Mailer {
  const transporter = nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure: opts.port === 465,
    auth: opts.user ? { user: opts.user, pass: opts.password } : undefined,
    // Sin esto, un puerto bloqueado deja la conexión colgada ~2 min por intento.
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  const from = opts.from.name ? { name: opts.from.name, address: opts.from.email } : opts.from.email;

  return {
    async send(email) {
      await transporter.sendMail({ from, to: email.to, subject: email.subject, html: email.html });
    },
  };
}

/**
 * Transporte vía API HTTP de MailerSend (POST /v1/email, HTTPS/443).
 * Ante un error, el mensaje incluye el CÓDIGO DE ESTADO y el CUERPO de la
 * respuesta de MailerSend, para que quede en last_error y en el log y sea
 * depurable (y no un "request failed" opaco).
 */
export function createMailerSendMailer(opts: { apiKey: string; from: MailFrom }): Mailer {
  const endpoint = "https://api.mailersend.com/v1/email";

  return {
    async send(email) {
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${opts.apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            from: opts.from,
            to: [{ email: email.to }],
            subject: email.subject,
            html: email.html,
          }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch (err) {
        // Falla de red / timeout: también explícito.
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`MailerSend: no se pudo conectar a la API (${reason})`);
      }

      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        const body = raw.length > 1000 ? `${raw.slice(0, 1000)}…` : raw;
        throw new Error(
          `MailerSend API respondió ${res.status} ${res.statusText}: ${body || "(sin cuerpo)"}`,
        );
      }
      // Éxito: MailerSend devuelve 202 Accepted (cuerpo vacío). Nada más que hacer.
    },
  };
}
