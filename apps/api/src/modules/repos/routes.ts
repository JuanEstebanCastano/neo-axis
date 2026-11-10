/**
 * DIRECCIONES DE /repos
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Expone los repositorios de GitHub del usuario: listarlos, crear uno, mirar
 * sus archivos y escribir en ellos.
 *
 * TENÉ EN CUENTA
 * Todas piden sesión iniciada: no hay forma anónima de usar el token de otro.
 * Y todas pasan por `getAccessTokenWithScope`, que además de traer el token
 * verifica que la conexión tenga el permiso `public_repo`; quien conectó su
 * cuenta antes de que esto existiera recibe un mensaje claro para reconectar.
 *
 * El límite de tamaño del cuerpo se sube sólo en las dos rutas que reciben
 * archivos. En el resto queda el del servidor, que es más chico a propósito.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { FastifyPluginAsync } from "fastify";
import { isGithubEnabled } from "../../config.js";
import { serviceUnavailable } from "../../lib/errors.js";
import {
  commitsQuery,
  contentsQuery,
  createRepoBody,
  deleteFileBody,
  ownerRepoParams,
  putFileBody,
  setDefaultRepoBody,
  uploadBody,
} from "./schemas.js";
import * as service from "./service.js";

/** 12 MB: deja pasar un archivo de 5 MB ya inflado por el base64 (+33%). */
const BODY_LIMIT_SUBIDA = 12 * 1024 * 1024;

export const repoRoutes: FastifyPluginAsync = async (app) => {
  // Si la integración no está configurada, estas rutas no tienen nada que
  // hacer. Mejor decirlo que fallar más adentro con un mensaje raro.
  app.addHook("onRequest", async () => {
    if (!isGithubEnabled) {
      throw serviceUnavailable("La integración con GitHub no está configurada en este servidor.");
    }
  });

  // ── Mis repositorios ──
  app.get("/repos", async (req) => {
    const session = app.requireAuth(req);
    return service.listRepos(app.db, session.userId);
  });

  app.post("/repos", async (req, reply) => {
    const session = app.requireAuth(req);
    const body = createRepoBody.parse(req.body);
    const repo = await service.createRepo(app.db, session.userId, body);
    return reply.code(201).send({ repo });
  });

  // ── Cuál es "mi" repo (el que la interfaz abre por defecto) ──
  app.put("/repos/default", async (req) => {
    const session = app.requireAuth(req);
    const { fullName } = setDefaultRepoBody.parse(req.body);
    return service.elegirRepo(app.db, session.userId, fullName);
  });

  // ── Navegar: carpeta o archivo, según la ruta ──
  app.get("/repos/:owner/:repo/contents", async (req) => {
    const session = app.requireAuth(req);
    const { owner, repo } = ownerRepoParams.parse(req.params);
    const { path, ref } = contentsQuery.parse(req.query);
    return service.browse(app.db, session.userId, owner, repo, path, ref);
  });

  // ── Historial del repo, o de un archivo si viene `path` ──
  app.get("/repos/:owner/:repo/commits", async (req) => {
    const session = app.requireAuth(req);
    const { owner, repo } = ownerRepoParams.parse(req.params);
    const { path } = commitsQuery.parse(req.query);
    return { commits: await service.historial(app.db, session.userId, owner, repo, path) };
  });

  // ── Escribir un archivo (el cuadro de código) ──
  app.put(
    "/repos/:owner/:repo/contents",
    { bodyLimit: BODY_LIMIT_SUBIDA },
    async (req) => {
      const session = app.requireAuth(req);
      const { owner, repo } = ownerRepoParams.parse(req.params);
      const body = putFileBody.parse(req.body);
      return service.escribirArchivo(app.db, session.userId, owner, repo, body);
    },
  );

  // ── Subir varios archivos del disco: un commit por archivo ──
  app.post(
    "/repos/:owner/:repo/upload",
    { bodyLimit: BODY_LIMIT_SUBIDA },
    async (req) => {
      const session = app.requireAuth(req);
      const { owner, repo } = ownerRepoParams.parse(req.params);
      const body = uploadBody.parse(req.body);
      return service.subirArchivos(app.db, session.userId, owner, repo, body);
    },
  );

  // ── Borrar un archivo ──
  app.delete("/repos/:owner/:repo/contents", async (req) => {
    const session = app.requireAuth(req);
    const { owner, repo } = ownerRepoParams.parse(req.params);
    const body = deleteFileBody.parse(req.body);
    return service.borrarArchivo(app.db, session.userId, owner, repo, body);
  });
};
