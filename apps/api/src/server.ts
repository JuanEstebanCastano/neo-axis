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
import { AppError } from "./lib/errors.js";

const app = Fastify({
  logger: isProduction
    ? { level: "info" }
    : { level: "debug", transport: { target: "pino-pretty" } },
  trustProxy: true,
  genReqId: () => crypto.randomUUID(),
});

await app.register(helmet, { contentSecurityPolicy: isProduction });
await app.register(cors, { origin: config.PUBLIC_WEB_ORIGIN, credentials: true });
await app.register(cookie, { secret: config.SESSION_SECRET });
await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

await app.register(dbPlugin);
await app.register(authPlugin);

await app.register(async (api) => {
  await api.register(authRoutes);
  await api.register(postRoutes);
}, { prefix: "/api/v1" });

app.get("/health", async () => ({ status: "ok", uptime: process.uptime() }));

app.setErrorHandler((err, req, reply) => {
  if (err instanceof AppError) {
    return reply.code(err.statusCode).send({ error: err.code, message: err.message });
  }
  req.log.error({ err }, "Error no controlado");
  // Nunca se filtra el mensaje interno al cliente en producción.
  return reply.code(500).send({ error: "internal_error", message: "Error interno" });
});

const shutdown = async (signal: string) => {
  app.log.info(`${signal} recibido, cerrando...`);
  await app.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ port: config.API_PORT, host: "0.0.0.0" });
