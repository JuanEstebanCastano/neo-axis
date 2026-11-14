/** Esquemas de entrada de libros (puros). */
import { z } from "zod";

/**
 * URL que vamos a poner dentro de un `href`.
 *
 * `z.string().url()` NO alcanza: usa el constructor `URL`, que acepta
 * `javascript:alert(1)` como URL perfectamente válida. Puesta en un enlace,
 * eso es XSS ejecutándose con la sesión de quien haga clic. Acá sólo pasan
 * http y https.
 */
const urlEnlazable = z
  .string()
  .trim()
  .url("Tiene que ser una dirección web completa (https://…)")
  .max(2000)
  .refine(
    (v) => {
      try {
        const p = new URL(v).protocol;
        return p === "http:" || p === "https:";
      } catch {
        return false;
      }
    },
    { message: "Sólo se aceptan enlaces http o https" },
  );

/**
 * Agregar un libro pegando sus enlaces.
 *
 * `rightsNote` es obligatoria a propósito: quien sube el enlace tiene que
 * declarar de dónde salió y bajo qué condiciones. No nos convierte en
 * jueces de nada, pero deja por escrito qué dijo quien lo trajo.
 */
export const linkBookBody = z
  .object({
    title: z.string().trim().min(1).max(500),
    authors: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
    languageCode: z.string().trim().min(2).max(10).optional(),
    publicationYear: z.coerce.number().int().min(0).max(3000).optional(),
    coverUrl: urlEnlazable.optional(),
    readUrl: urlEnlazable.optional(),
    downloadUrl: urlEnlazable.optional(),
    sourceUrl: urlEnlazable.optional(),
    rightsNote: z.string().trim().min(1).max(200),
  })
  // Un libro al que no se puede llegar no es un libro: es una ficha vacía.
  .refine((b) => Boolean(b.readUrl || b.downloadUrl), {
    message: "Hace falta al menos un enlace: para leer o para descargar",
    path: ["readUrl"],
  });

export type LinkBookInput = z.infer<typeof linkBookBody>;

/** Filtros del catálogo. Todos opcionales: sin ninguno, devuelve todo. */
export const booksQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Texto libre contra el título y el nombre de los autores. */
  q: z.string().trim().min(1).max(120).optional(),
  /** Código de idioma tal como lo guarda la fila (es, en…). */
  lang: z.string().trim().min(2).max(10).optional(),
  /** De dónde salió: del catálogo externo, de una persona, o cualquiera. */
  source: z.enum(["openlibrary", "manual", "any"]).default("any"),
  /** Qué se puede hacer con él. */
  access: z.enum(["any", "readable", "downloadable"]).default("any"),
});

export type BooksQuery = z.infer<typeof booksQuery>;
