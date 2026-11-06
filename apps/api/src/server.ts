/**
 * PUNTO DE ENTRADA DEL API
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * El primer archivo que corre. Enciende el servidor y le va montando capas en
 * orden: seguridad, cookies, base de datos, identificación, rutas.
 *
 * TENÉ EN CUENTA
 * Empezá a leer el proyecto por acá. El orden de los `register` importa: no se
 * puede identificar al visitante antes de saber leer cookies.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";

import { config, isProduction } from "./config.js";
import dbPlugin from "./plugins/db.js";
import authPlugin from "./plugins/auth.js";
import { authRoutes } from "./modules/auth/routes.js";
import { postRoutes } from "./modules/posts/routes.js";
import { collectionRoutes } from "./modules/collections/routes.js";
import { bookRoutes } from "./modules/books/routes.js";
import { recommendationRoutes } from "./modules/recommendations/routes.js";
import { snippetRoutes } from "./modules/snippets/routes.js";
import { ZodError } from "zod";
import { AppError } from "./lib/errors.js";
import { prettifyZodError } from "./lib/validation.js";

const app = Fastify({
  logger: isProduction
    ? { level: "info" }
    : { level: "debug", transport: { target: "pino-pretty" } },
  trustProxy: true,
  genReqId: () => crypto.randomUUID(),
});

await app.register(helmet, { contentSecurityPolicy: isProduction });
const allowedOrigins = config.PUBLIC_WEB_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
await app.register(cors, { origin: allowedOrigins, credentials: true });

// Defensa CSRF: toda petición que muta estado y traiga un Origin debe venir de
// un origen permitido. Cubre el caso COOKIE_SAMESITE=none (front y API en
// dominios distintos), donde el navegador manda la cookie cross-site.
app.addHook("onRequest", async (req, reply) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return;
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.includes(origin)) {
    return reply.code(403).send({ error: "forbidden", message: "Origen no permitido" });
  }
});

await app.register(cookie, { secret: config.SESSION_SECRET });
await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

await app.register(dbPlugin);
await app.register(authPlugin);

// IMPORTANTE: el error handler se define ANTES de registrar las rutas. Con el
// `await app.register(...)` de nivel superior, cada register dispara ready() y
// el contexto de las rutas hereda el handler vigente en ese instante.
app.setErrorHandler((err, req, reply) => {
  if (err instanceof AppError) {
    return reply.code(err.statusCode).send({ error: err.code, message: err.message });
  }
  // Validación de query/params/body: 400, no 500. Duck-typing además de
  // instanceof: distintas instancias de zod en el monorepo pueden hacer fallar
  // el instanceof para un ZodError real.
  const maybeZod = err as { name?: string; issues?: unknown };
  if (err instanceof ZodError || (maybeZod?.name === "ZodError" && Array.isArray(maybeZod.issues))) {
    return reply.code(400).send({ error: "bad_request", message: prettifyZodError(err as ZodError) });
  }
  req.log.error({ err }, "Error no controlado");
  // Nunca se filtra el mensaje interno al cliente en producción.
  return reply.code(500).send({ error: "internal_error", message: "Error interno" });
});

await app.register(async (api) => {
  await api.register(authRoutes);
  await api.register(postRoutes);
  await api.register(collectionRoutes);
  await api.register(bookRoutes);
  await api.register(recommendationRoutes);
  await api.register(snippetRoutes);
}, { prefix: "/api/v1" });

app.get("/health", async () => ({ status: "ok", uptime: process.uptime() }));

const shutdown = async (signal: string) => {
  app.log.info(`${signal} recibido, cerrando...`);
  await app.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ port: config.API_PORT, host: "0.0.0.0" });
