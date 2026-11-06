/**
 * CONFIGURACIÓN
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Lee las variables del archivo .env y revisa que estén todas y sean válidas.
 * Si falta alguna, el programa no arranca y dice exactamente cuál.
 *
 * TENÉ EN CUENTA
 * Fallar al encender es mucho mejor que fallar en el primer pedido de un
 * usuario real. Por eso la validación es tan estricta acá.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import { z } from "zod";
import { prettifyZodError } from "./lib/validation.js";

// El proceso no arranca con configuración inválida. Fallar en el boot es
// infinitamente mejor que fallar en el primer request de un usuario real.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  // Uno o varios orígenes permitidos para CORS, separados por coma.
  PUBLIC_WEB_ORIGIN: z.string().min(1),

  SESSION_COOKIE_NAME: z.string().min(1).default("neoaxis_session"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  SESSION_SECRET: z.string().min(32),
  // 'none' (+Secure) habilita la cookie en despliegues con front y API en
  // dominios distintos. 'lax' alcanza cuando comparten origen (proxy en dev).
  COOKIE_SAMESITE: z.enum(["lax", "none", "strict"]).default("lax"),

  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),

  // Recomendaciones semánticas (opcional). URL de la Edge Function de embeddings
  // y el token (JWT anon) con el que el API la invoca.
  EMBEDDINGS_URL: z.string().url().optional(),
  EMBEDDINGS_TOKEN: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Configuración inválida:\n", prettifyZodError(parsed.error));
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
export const isProduction = config.NODE_ENV === "production";
