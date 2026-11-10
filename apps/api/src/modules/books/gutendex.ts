/**
 * CLIENTE DE GUTENDEX (Project Gutenberg)
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Habla con gutendex.com por HTTP. Es la única parte del proyecto que conoce
 * esa dirección. Entra una búsqueda, sale un libro normalizado.
 *
 * POR QUÉ ESTA FUENTE Y NO OTRA
 * Project Gutenberg publica obras de dominio público y Gutendex las expone en
 * JSON, sin clave y con los enlaces a los archivos. Es la única de las fuentes
 * que miramos que da metadatos Y archivo legal en el mismo sitio.
 *
 * LO QUE NO HACE
 * No descarga ni rehospeda los archivos: guardamos el enlace a donde ya están.
 * Copiarlos a nuestro bucket sería alojar obras ajenas sin ninguna necesidad.
 *
 * SOBRE "DOMINIO PÚBLICO"
 * El campo `copyright` de Gutendex dice lo que declara Project Gutenberg, que
 * razona sobre la ley de ESTADOS UNIDOS. El dominio público depende del país:
 * en Colombia el plazo es la vida del autor + 80 años, más largo que el de allá.
 * Por eso sólo se importa lo que viene marcado `copyright: false`, se guarda la
 * nota de derechos tal cual, y se deja el enlace a la ficha original para poder
 * verificarlo. Esto es trazabilidad, no un dictamen legal.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import { z } from "zod";
import { badRequest, notFound, serviceUnavailable, tooManyRequests } from "../../lib/errors.js";
import { prettifyZodError } from "../../lib/validation.js";

const API_BASE = "https://gutendex.com";

// Identificador genérico del cliente: no lleva ningún dato del usuario ni del
// despliegue, igual que en el cliente de GitHub.
const USER_AGENT = "neo-axis-app";

// Si no contesta en este tiempo, cortamos: un request colgado bloquea una
// conexión del pool del API.
const TIMEOUT_MS = 10_000;

// ── La parte de Gutendex que usamos ───────────────────────────────────
//
// Esto es un CONTRATO CON UN TERCERO, no nuestro: la forma la decide Gutendex
// y puede cambiar sin avisarnos. Por eso se valida con zod en vez de castear
// la respuesta con `as`, que no comprueba nada en ejecución.
//
// El criterio: estricto en lo que necesitamos, indulgente en lo demás.
//   · `id`, `title` y `copyright` son obligatorios: sin ellos no se puede ni
//     identificar el libro ni decidir si es legal traerlo.
//   · Las listas y `formats` caen a vacío si faltan o vienen con otra forma
//     (`.catch`), porque un libro sin autores anotados sigue siendo utilizable
//     y un libro sin formatos se descarta después, con su propio mensaje.
// Los campos que no usamos (summaries, translators, media_type…) ni se
// declaran: zod los ignora y así un campo nuevo de Gutendex no nos rompe.

const personaSchema = z.object({
  name: z.string(),
  death_year: z.number().int().nullish(),
});

const libroSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  // Único campo del que depende la decisión legal. Si no viene booleano ni
  // null, NO lo damos por bueno: `obtenerLibro` exige `=== false`.
  copyright: z.boolean().nullable(),
  authors: z.array(personaSchema).catch([]),
  languages: z.array(z.string()).catch([]),
  // Claves y valores son strings (MIME -> URL). Un valor que no sea string
  // tiraría la entrada entera, así que se filtra por fuera, en `formato()`.
  formats: z.record(z.string(), z.string()).catch({}),
  download_count: z.number().int().nonnegative().catch(0),
});

const paginaSchema = z.object({
  count: z.number().int().nonnegative().catch(0),
  results: z.array(libroSchema),
});

/** Lo que el resto del proyecto ve. Sin la forma cruda de Gutendex. */
export interface LibroExterno {
  provider: "gutendex";
  externalId: string;
  title: string;
  authors: string[];
  languages: string[];
  /** Año de muerte del primer autor: lo más cerca de una fecha que da la fuente. */
  publicationYear: number | null;
  coverUrl: string | null;
  readUrl: string | null;
  downloadUrl: string | null;
  sourceUrl: string;
  rightsNote: string;
  downloadCount: number;
}

// ── HTTP ──────────────────────────────────────────────────────────────

/**
 * Pide y VALIDA. Cada forma de fallar dice qué pasó, porque si no todas
 * terminan igual —"Error interno"— y desde afuera no se distingue que
 * Gutendex esté caído de que haya cambiado el formato de su respuesta.
 */
// Genérico sobre el esquema y no sobre el resultado: con `.catch()` el tipo de
// entrada (lo que llega de Gutendex) y el de salida (lo ya saneado) no son el
// mismo, y `z.ZodType<T>` los daba por iguales.
async function pedir<S extends z.ZodTypeAny>(path: string, schema: S): Promise<z.output<S>> {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Se cayó la red o se agotó el tiempo. No es culpa de quien busca.
    throw serviceUnavailable("No pudimos consultar el catálogo externo. Intentá de nuevo en un momento.");
  }

  if (res.status === 404) throw notFound("Ese libro no está en el catálogo externo");
  if (res.status === 429) {
    throw tooManyRequests("El catálogo externo está limitando las consultas. Probá de nuevo en un rato.");
  }
  if (!res.ok) {
    throw serviceUnavailable(`El catálogo externo respondió ${res.status}`);
  }

  let crudo: unknown;
  try {
    crudo = await res.json();
  } catch {
    throw serviceUnavailable("El catálogo externo no devolvió JSON válido");
  }

  const parsed = schema.safeParse(crudo);
  if (!parsed.success) {
    // El detalle va al log del servidor, no al usuario: es un problema de
    // contrato entre nosotros y Gutendex, y a quien busca no le dice nada.
    console.error("[gutendex] respuesta inesperada en %s: %s", path, prettifyZodError(parsed.error));
    throw serviceUnavailable(
      "El catálogo externo respondió en un formato que no reconocemos. Puede que haya cambiado su API.",
    );
  }

  return parsed.data;
}

// ── Normalización ─────────────────────────────────────────────────────

/**
 * Elige el primer formato cuyo MIME empiece por alguno de los prefijos, en
 * orden de preferencia. Gutendex mezcla sufijos de charset ("text/html;
 * charset=utf-8"), así que se compara por prefijo y no por igualdad.
 *
 * Se descartan los ".zip": son el mismo contenido comprimido y no se abren en
 * el navegador.
 */
function formato(formats: Record<string, string>, prefijos: string[]): string | null {
  for (const prefijo of prefijos) {
    for (const [mime, url] of Object.entries(formats)) {
      if (mime.startsWith(prefijo) && !url.endsWith(".zip")) return url;
    }
  }
  return null;
}

/** El libro ya validado. Se deriva del esquema para que no se puedan separar. */
type LibroCrudo = z.infer<typeof libroSchema>;

function normalizar(b: LibroCrudo): LibroExterno {
  // El año de muerte del primer autor es lo más cercano a una fecha que da la
  // fuente: Gutendex no trae año de publicación. Es una aproximación y por eso
  // sólo se usa para ordenar y mostrar, nunca para afirmar nada.
  const anio = b.authors[0]?.death_year ?? null;

  return {
    provider: "gutendex",
    externalId: String(b.id),
    title: b.title,
    authors: b.authors.map((a) => a.name),
    languages: b.languages,
    publicationYear: anio !== null && anio > 0 && anio <= 3000 ? anio : null,
    coverUrl: formato(b.formats, ["image/jpeg", "image/png"]),
    readUrl: formato(b.formats, ["text/html"]),
    downloadUrl: formato(b.formats, ["application/epub+zip", "application/pdf", "text/plain"]),
    sourceUrl: `https://www.gutenberg.org/ebooks/${b.id}`,
    // Lo que declara la fuente, en sus términos. No lo traducimos a una
    // afirmación nuestra sobre derechos.
    rightsNote: b.copyright === false ? "Public domain in the USA (Project Gutenberg)" : "Copyright status unknown",
    downloadCount: b.download_count,
  };
}

// ── Lo que usa el resto del módulo ────────────────────────────────────

/**
 * Busca en el catálogo. `copyright=false` lo filtra del lado de Gutendex: no
 * queremos ni mostrar lo que está bajo derechos, para que nadie lo importe por
 * descuido.
 */
export async function buscarLibros(q: string, idioma?: string): Promise<LibroExterno[]> {
  const params = new URLSearchParams({ search: q, copyright: "false" });
  if (idioma) params.set("languages", idioma);

  const page = await pedir(`/books?${params.toString()}`, paginaSchema);
  return page.results
    .filter((b) => b.copyright === false)
    .map(normalizar)
    // Sin forma de leerlo ni de descargarlo, el libro no aporta nada acá.
    .filter((l) => l.readUrl !== null || l.downloadUrl !== null);
}

/** Un libro por su id de Project Gutenberg, para el momento de importar. */
export async function obtenerLibro(id: number): Promise<LibroExterno> {
  const b = await pedir(`/books/${id}`, libroSchema);

  // Se vuelve a comprobar acá y no sólo en la búsqueda: el id llega del
  // cliente y podría ser cualquiera, no necesariamente uno que pasó el filtro.
  if (b.copyright !== false) {
    throw badRequest("Ese libro no está marcado como de dominio público en la fuente");
  }

  const libro = normalizar(b);
  if (!libro.readUrl && !libro.downloadUrl) {
    throw badRequest("Ese libro no tiene ningún formato que podamos enlazar");
  }
  return libro;
}
