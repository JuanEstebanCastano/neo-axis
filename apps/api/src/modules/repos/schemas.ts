/**
 * VALIDACIÓN DE LO QUE LLEGA A /repos
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Define la forma exacta que tiene que tener cada petición. Lo que no encaja
 * se rechaza acá, antes de tocar GitHub.
 *
 * TENÉ EN CUENTA
 * La ruta de un archivo es el campo delicado: viaja dentro de una URL hacia
 * GitHub, así que se revisa que no tenga `..` ni barras iniciales. No es
 * paranoia: `../../otro-repo/archivo` es exactamente cómo se escapa de un
 * directorio.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import { z } from "zod";

/** 5 MB por archivo, ya decodificado. Por encima de esto, la Contents API de
 *  GitHub deja de ser la herramienta correcta (habría que usar blobs). */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Cuántos archivos acepta una subida en lote. Cada uno es un commit. */
export const MAX_BATCH_FILES = 20;

/** Ruta dentro del repo: `src/lib/util.ts`. Ni absoluta, ni con `..`. */
export const repoPath = z
  .string()
  .trim()
  .min(1, "La ruta no puede estar vacía")
  .max(400, "La ruta es demasiado larga")
  .refine((p) => !p.startsWith("/"), "La ruta no puede empezar con /")
  .refine((p) => !p.split("/").includes(".."), "La ruta no puede contener ..")
  // Sin regex a propósito: una clase de caracteres de control dentro de una
  // expresión regular es, justamente, lo que el linter marca como sospechoso.
  .refine(
    (p) => ![...p].some((c) => c.charCodeAt(0) < 32),
    "La ruta tiene caracteres de control",
  );

/** Igual que la anterior pero puede ser vacía: la raíz del repo. */
export const repoDir = z
  .string()
  .trim()
  .max(400)
  .refine((p) => !p.startsWith("/"), "La ruta no puede empezar con /")
  .refine((p) => !p.split("/").includes(".."), "La ruta no puede contener ..")
  .default("");

/** Nombre de repositorio, con las reglas de GitHub. */
export const repoName = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/, "Sólo letras, números, punto, guion y guion bajo");

export const ownerRepoParams = z.object({
  owner: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/),
  repo: repoName,
});

export const createRepoBody = z.object({
  name: repoName,
  description: z.string().trim().max(350).optional(),
  // Sólo públicos: el permiso que pedimos (`public_repo`) no alcanza para
  // crear privados, así que ni lo ofrecemos.
  autoInit: z.boolean().default(true),
});

export const setDefaultRepoBody = z.object({
  fullName: z.string().trim().max(255).nullable(),
});

export const contentsQuery = z.object({
  path: repoDir,
  ref: z.string().trim().min(1).max(255).optional(),
});

/**
 * Un archivo que se sube. `utf8` es lo que escribe la gente en el cuadro de
 * código; `base64` es lo que manda el navegador cuando elige un archivo del
 * disco (y es el único modo que soporta binarios).
 */
export const fileContent = z.object({
  path: repoPath,
  content: z.string(),
  encoding: z.enum(["utf8", "base64"]).default("utf8"),
});

export const putFileBody = fileContent.extend({
  message: z.string().trim().min(1).max(500).optional(),
  /** sha del archivo que estoy reemplazando. Sin esto, GitHub crea uno nuevo
   *  y falla si ya existía. El servicio lo averigua solo si no viene. */
  sha: z.string().trim().min(1).max(64).optional(),
  branch: z.string().trim().min(1).max(255).optional(),
});

export const uploadBody = z.object({
  files: z.array(fileContent).min(1).max(MAX_BATCH_FILES),
  message: z.string().trim().min(1).max(500).optional(),
  branch: z.string().trim().min(1).max(255).optional(),
  /** Carpeta donde cae todo lo que se sube. Vacío = raíz del repo. */
  directory: repoDir,
});

export const deleteFileBody = z.object({
  path: repoPath,
  sha: z.string().trim().min(1).max(64),
  message: z.string().trim().min(1).max(500).optional(),
  branch: z.string().trim().min(1).max(255).optional(),
});

export const commitsQuery = z.object({
  path: z.string().trim().max(400).optional(),
});
