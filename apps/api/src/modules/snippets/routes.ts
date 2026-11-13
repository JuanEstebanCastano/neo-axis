/**
 * DIRECCIONES DE SNIPPETS
 * Listar, compartir y versionar fragmentos de código.
 *
 * Las direcciones que terminan en /gist, /sync o /revisions son las que hablan
 * con GitHub. Las demás funcionan igual aunque la integración esté apagada.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  createSnippet,
  getSnippetRevision,
  importSnippetFromGist,
  listSnippetRevisions,
  listSnippets,
  publishSnippetAsGist,
  syncSnippetFromGist,
  unlinkGist,
  updateSnippet,
} from "./service.js";
import { PERMISSIONS } from "../../lib/rbac.js";
import { canViewPost } from "../../lib/rbac.js";
import { nombreDeArchivo } from "./filenames.js";
import { browse } from "../repos/service.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { prettifyZodError } from "../../lib/validation.js";

import {
  createBody,
  importBody,
  publishBody,
  revisionParams,
  snippetParams,
  updateBody,
} from "./schemas.js";

export const snippetRoutes: FastifyPluginAsync = async (app) => {
  const requiereCrear = [
    async (req: Parameters<ReturnType<typeof app.requirePermission>>[0]) => {
      await app.requirePermission(PERMISSIONS.postsCreate)(req);
    },
  ];
  const requiereEditar = [
    async (req: Parameters<ReturnType<typeof app.requirePermission>>[0]) => {
      await app.requirePermission(PERMISSIONS.postsEditOwn)(req);
    },
  ];

  /**
   * Bajarse el código como archivo.
   *
   * Texto plano con Content-Disposition: attachment, que es lo que hace que
   * el navegador lo guarde en vez de mostrarlo. El nombre sale de la misma
   * función que ya usan los gists, así que el archivo se llama igual en los
   * dos sitios.
   */
  app.get("/snippets/:id/raw", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

    const snippet = await app.db
      .selectFrom("postSnippets")
      .select(["id", "postId", "title", "language", "sourceCode", "filename"])
      .where("id", "=", id)
      .executeTakeFirst();

    if (!snippet) throw notFound("El fragmento no existe");
    // Un snippet es una vista sobre un post y hereda su visibilidad: sin
    // esto, con el id a mano se descargaría el código de un post retirado.
    if (!(await canViewPost(app.db, snippet.postId, req.session?.userId ?? null))) {
      throw notFound("El fragmento no existe o no tenés acceso");
    }

    const nombre = nombreDeArchivo(
      snippet.title as string,
      snippet.language as string,
      snippet.filename as string | null,
    );

    return reply
      .header("Content-Type", "text/plain; charset=utf-8")
      // El nombre va entre comillas: puede llevar espacios.
      .header("Content-Disposition", `attachment; filename="${nombre}"`)
      .send(snippet.sourceCode);
  });

  /**
   * Traer un archivo de un repositorio conectado y guardarlo como fragmento.
   *
   * Lee de GitHub en vivo (browse ya resuelve el token y los permisos) y
   * delega en createSnippet, que guarda el post, el fragmento y el índice de
   * búsqueda en una sola transacción.
   */
  app.post("/snippets/from-repo", { preHandler: requiereCrear }, async (req, reply) => {
    const session = app.requireAuth(req);
    const parsed = z
      .object({
        owner: z.string().min(1).max(100),
        repo: z.string().min(1).max(100),
        path: z.string().min(1).max(400),
        language: z.string().min(1).max(40).optional(),
        title: z.string().min(1).max(200).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));

    const { owner, repo, path } = parsed.data;
    const resultado = await browse(app.db, session.userId, owner, repo, path);

    if (resultado.kind !== "file") {
      throw badRequest("Esa ruta es una carpeta, no un archivo");
    }
    const archivo = resultado.file;
    if (archivo.binary || archivo.tooLarge || archivo.text === null) {
      throw badRequest(
        archivo.tooLarge
          ? "El archivo pasa de 1 MB y GitHub no lo manda por esta vía"
          : "Ese archivo es binario: no se puede guardar como fragmento",
      );
    }

    const nombre = path.split("/").pop() ?? path;
    const extension = nombre.includes(".") ? (nombre.split(".").pop() as string) : "txt";

    const snippet = await createSnippet(app.db, {
      authorId: session.userId,
      title: parsed.data.title ?? nombre,
      // Sin tabla de equivalencias: la extensión ya es la pista que usa el
      // resaltador, y una lista propia se queda vieja enseguida.
      language: parsed.data.language ?? extension,
      sourceCode: archivo.text,
      filename: nombre,
    });

    return reply.code(201).send({ snippet });
  });

  app.get("/snippets", async (req) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(req.query);
    const items = await listSnippets(app.db, q.limit);
    return { items };
  });

  app.post("/snippets", { preHandler: requiereCrear }, async (req, reply) => {
    const session = app.requireAuth(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));
    const snippet = await createSnippet(app.db, { authorId: session.userId, ...parsed.data });
    return reply.code(201).send({ snippet });
  });

  // ── Edición: si el snippet está en GitHub, genera una revisión nueva ──
  app.put("/snippets/:id", { preHandler: requiereEditar }, async (req) => {
    const session = app.requireAuth(req);
    const { id } = snippetParams.parse(req.params);
    const parsed = updateBody.safeParse(req.body);
    if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));
    const snippet = await updateSnippet(app.db, { snippetId: id, userId: session.userId, ...parsed.data });
    return { snippet };
  });

  // ── Publicar en GitHub como gist ──
  app.post("/snippets/:id/gist", { preHandler: requiereEditar }, async (req, reply) => {
    const session = app.requireAuth(req);
    const { id } = snippetParams.parse(req.params);
    const parsed = publishBody.safeParse(req.body ?? {});
    if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));

    const gist = await publishSnippetAsGist(app.db, {
      snippetId: id,
      userId: session.userId,
      isPublic: parsed.data.public,
    });
    return reply.code(201).send({ gist });
  });

  // ── Desvincular (el gist sigue vivo en GitHub) ──
  app.delete("/snippets/:id/gist", { preHandler: requiereEditar }, async (req) => {
    const session = app.requireAuth(req);
    const { id } = snippetParams.parse(req.params);
    return unlinkGist(app.db, { snippetId: id, userId: session.userId });
  });

  // ── Traer desde GitHub la última versión ──
  app.post("/snippets/:id/sync", { preHandler: requiereEditar }, async (req) => {
    const session = app.requireAuth(req);
    const { id } = snippetParams.parse(req.params);
    const snippet = await syncSnippetFromGist(app.db, { snippetId: id, userId: session.userId });
    return { snippet };
  });

  // ── Historial de revisiones (lectura pública si el gist es público) ──
  app.get("/snippets/:id/revisions", async (req) => {
    const { id } = snippetParams.parse(req.params);
    const revisions = await listSnippetRevisions(app.db, id, req.session?.userId ?? null);
    return { revisions };
  });

  // ── Contenido de una revisión concreta ──
  app.get("/snippets/:id/revisions/:sha", async (req) => {
    const { id, sha } = revisionParams.parse(req.params);
    const revision = await getSnippetRevision(app.db, id, sha, req.session?.userId ?? null);
    return { revision };
  });

  // ── Importar un gist que ya existe ──
  app.post("/snippets/import", { preHandler: requiereCrear }, async (req, reply) => {
    const session = app.requireAuth(req);
    const parsed = importBody.safeParse(req.body);
    if (!parsed.success) throw badRequest(prettifyZodError(parsed.error));
    const snippet = await importSnippetFromGist(app.db, {
      userId: session.userId,
      gistRef: parsed.data.gist,
    });
    return reply.code(201).send({ snippet });
  });
};
