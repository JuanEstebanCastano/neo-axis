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
import { userRoutes } from "./modules/users/routes.js";
import { postRoutes } from "./modules/posts/routes.js";
import { collectionRoutes } from "./modules/collections/routes.js";
import { bookRoutes } from "./modules/books/routes.js";
import { recommendationRoutes } from "./modules/recommendations/routes.js";
import { snippetRoutes } from "./modules/snippets/routes.js";
import { githubRoutes } from "./modules/github/routes.js";
import { repoRoutes } from "./modules/repos/routes.js";
import { ZodError } from "zod";
import { AppError, badRequest } from "./lib/errors.js";
import { prettifyZodError } from "./lib/validation.js";
import { makeOriginMatcher, VERCEL_PREVIEW_REGEX } from "./lib/origins.js";

const app = Fastify({
  logger: isProduction
    ? { level: "info" }
    : { level: "debug", transport: { target: "pino-pretty" } },
  trustProxy: true,
  genReqId: () => crypto.randomUUID(),
});

// Cuerpo JSON vacío permitido. Varios POST no mandan body (p. ej. /auth/logout o
// /recomendaciones/reindex), pero el cliente igual envía Content-Type: application/json.
// El parser por defecto de Fastify lanza "Body cannot be empty when content-type is
// set to 'application/json'", que el error handler convertía en 500 (de ahí que el
// botón "Salir" no hiciera nada). Con esto, un body vacío se interpreta como undefined
// y un JSON mal formado devuelve 400 limpio.
app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
  if (body === "" || body == null) {
    done(null, undefined);
    return;
  }
  try {
    done(null, JSON.parse(body as string));
  } catch {
    done(badRequest("JSON inválido"), undefined);
  }
});

await app.register(helmet, { contentSecurityPolicy: isProduction });
// Matcher de orígenes: exactos de PUBLIC_WEB_ORIGIN + previews de Vercel.
const exactOrigins = config.PUBLIC_WEB_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
const isOriginAllowed = makeOriginMatcher(exactOrigins, VERCEL_PREVIEW_REGEX);

// CORS: origin como función. Las peticiones sin Origin (mismo origen, curl,
// server-to-server) se permiten (el matcher devuelve true para undefined).
await app.register(cors, {
  origin: (origin, cb) => cb(null, isOriginAllowed(origin)),
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
});

// Defensa CSRF: toda petición que muta estado debe venir de un origen permitido.
// Usa EXACTAMENTE el mismo matcher que el CORS (previews de Vercel incluidos).
// Cubre COOKIE_SAMESITE=none.
app.addHook("onRequest", async (req, reply) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return;
  if (!isOriginAllowed(req.headers.origin)) {
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
  await api.register(userRoutes);
  await api.register(postRoutes);
  await api.register(collectionRoutes);
  await api.register(bookRoutes);
  await api.register(recommendationRoutes);
  await api.register(snippetRoutes);
  await api.register(githubRoutes);
  await api.register(repoRoutes);
}, { prefix: "/api/v1" });

app.get("/health", async () => ({ status: "ok", uptime: process.uptime() }));

const shutdown = async (signal: string) => {
  app.log.info(`${signal} recibido, cerrando...`);
  await app.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// Escucha el PORT que inyecta la plataforma (PaaS/contenedor) si existe; si no,
// el API_PORT de config. host 0.0.0.0 para ser accesible desde el reverse-proxy.
await app.listen({ port: Number(process.env.PORT) || config.API_PORT, host: "0.0.0.0" });
