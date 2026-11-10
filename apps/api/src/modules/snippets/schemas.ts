/** Esquemas de entrada de snippets (puros). */
import { z } from "zod";

export const createBody = z.object({
  title: z.string().min(1).max(240),
  language: z.string().min(1).max(80),
  sourceCode: z.string().min(1).max(20000),
  description: z.string().max(1000).nullish(),
  filename: z.string().max(255).nullish(),
});

/** Edición. Todo opcional: se manda sólo lo que cambió. */
export const updateBody = z
  .object({
    title: z.string().min(1).max(240).optional(),
    language: z.string().min(1).max(80).optional(),
    sourceCode: z.string().min(1).max(20000).optional(),
    description: z.string().max(1000).nullish(),
    filename: z.string().max(255).nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No mandaste ningún cambio" });

/** Publicar como gist. Secreto = sólo accesible con el enlace. */
export const publishBody = z.object({
  public: z.boolean().default(true),
});

/** Importar un gist existente: acepta la URL completa o el id pelado. */
export const importBody = z.object({
  gist: z.string().min(1).max(500),
});

export const snippetParams = z.object({ id: z.string().uuid() });

/** Los sha de git son hexadecimales de 40 caracteres (7 si vienen abreviados). */
export const revisionParams = z.object({
  id: z.string().uuid(),
  sha: z.string().regex(/^[0-9a-f]{7,40}$/i, "sha inválido"),
});
