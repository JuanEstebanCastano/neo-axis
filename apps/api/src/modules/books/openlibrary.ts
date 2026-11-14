/**
 * CLIENTE DE OPEN LIBRARY (Internet Archive)
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Habla con openlibrary.org por HTTP. Es la única parte del proyecto que
 * conoce esa dirección. Entra una búsqueda, sale un libro normalizado.
 *
 * POR QUÉ ESTA FUENTE Y NO GUTENDEX
 * Antes esto hablaba con gutendex.com (la API JSON de Project Gutenberg).
 * Funciona desde una máquina cualquiera, pero NO desde el despliegue: Gutendex
 * está detrás de Cloudflare, que tarpitea a nivel HTTP las IP de datacenter
 * —el TCP abre pero la respuesta nunca llega—. Lo verificamos capa por capa:
 * DNS resuelve, el socket a :443 abre en milisegundos, y el GET se cuelga el
 * timeout completo; y pasa igual desde dos nubes distintas (Railway y, bajo
 * volumen, Supabase). No es nuestro código: es un muro anti-bot contra el
 * tráfico servidor-a-servidor, y no hay timeout ni User-Agent que lo sortee.
 *
 * Open Library (del Internet Archive) expone un buscador JSON que SÍ responde
 * desde datacenter (verificado desde Railway: 200 en ~40 ms), trae metadatos
 * ricos y marca qué libros son de lectura pública. Por eso es la fuente.
 *
 * SOBRE "DOMINIO PÚBLICO" / LECTURA PÚBLICA
 * Open Library no afirma "dominio público": dice `ebook_access`, y sólo
 * `"public"` significa que la obra se lee entera y libre (hay además scan de
 * dominio público en `public_scan_b`). Importamos SÓLO `ebook_access:"public"`,
 * igual que antes sólo traíamos `copyright:false` de Gutendex. El dominio
 * público depende del país (en Colombia, vida + 80 años), así que esto es
 * trazabilidad —de dónde salió y qué declara la fuente—, no un dictamen legal.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import { z } from "zod";
import { badRequest, notFound, serviceUnavailable, tooManyRequests } from "../../lib/errors.js";
import { prettifyZodError } from "../../lib/validation.js";

const API_BASE = "https://openlibrary.org";

// Identificador genérico: no lleva ningún dato del usuario ni del despliegue.
const USER_AGENT = "neo-axis-app";

// Si no contesta en este tiempo, cortamos. Open Library responde en decenas de
// milisegundos; 10 s es margen de sobra y nunca deja un request colgado.
const TIMEOUT_MS = 10_000;

// Sólo los campos que usamos: menos payload y un contrato explícito con la
// fuente. Lo demás que devuelva Open Library se ignora.
const FIELDS =
  "key,title,author_name,first_publish_year,cover_i,ia,public_scan_b,ebook_access,language";

// Open Library usa códigos de idioma de 3 letras (MARC). El resto del catálogo
// guarda 2 letras ("es", "en"), así que se traducen a la ida (filtro) y a la
// vuelta (al guardar). Un código que no esté en la tabla pasa tal cual.
const LANG_3_A_2: Record<string, string> = {
  spa: "es", eng: "en", fre: "fr", ger: "de", ita: "it",
  por: "pt", lat: "la", grc: "el", rus: "ru", cat: "ca",
};
const LANG_2_A_3: Record<string, string> = Object.fromEntries(
  Object.entries(LANG_3_A_2).map(([tres, dos]) => [dos, tres]),
);

// ── La parte de Open Library que usamos ────────────────────────────────
//
// CONTRATO CON UN TERCERO, no nuestro: la forma la decide Open Library y puede
// cambiar sin avisar. Por eso se valida con zod en vez de castear con `as`.
// Estricto en lo imprescindible (`key`, `title`), indulgente en lo demás: las
// listas y banderas caen a vacío/false con `.catch` si faltan o vienen raras.

const docSchema = z.object({
  key: z.string(), // "/works/OL12345W"
  title: z.string(),
  author_name: z.array(z.string()).catch([]),
  first_publish_year: z.number().int().nullish(),
  cover_i: z.number().int().nullish(),
  // Identificadores de Internet Archive: de acá salen los enlaces de lectura.
  ia: z.array(z.string()).catch([]),
  public_scan_b: z.boolean().catch(false),
  // "public" | "borrowable" | "printdisabled" | "no_ebook". Sólo "public" sirve.
  ebook_access: z.string().catch("no_ebook"),
  language: z.array(z.string()).catch([]),
});

const paginaSchema = z.object({
  numFound: z.number().int().nonnegative().catch(0),
  docs: z.array(docSchema).catch([]),
});

export interface LibroExterno {
  provider: "openlibrary";
  /** La "work key" sin el prefijo `/works/`, p. ej. "OL59202W". */
  externalId: string;
  title: string;
  authors: string[];
  /** Códigos de 2 letras, ya traducidos del MARC de 3 que da la fuente. */
  languages: string[];
  /** Año de la primera edición que conoce la fuente. */
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
 * Pide y VALIDA. Cada forma de fallar dice qué pasó, para no confundir "la
 * fuente está caída" con "la fuente cambió el formato de su respuesta".
 */
async function pedir<S extends z.ZodTypeAny>(path: string, schema: S): Promise<z.output<S>> {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw serviceUnavailable("No pudimos consultar el catálogo externo. Intentá de nuevo en un momento.");
  }

  if (res.status === 404) throw notFound("Ese libro no está en el catálogo externo");
  if (res.status === 429) {
    throw tooManyRequests("El catálogo externo está limitando las consultas. Probá de nuevo en un rato.");
  }
  if (!res.ok) throw serviceUnavailable(`El catálogo externo respondió ${res.status}`);

  let crudo: unknown;
  try {
    crudo = await res.json();
  } catch {
    throw serviceUnavailable("El catálogo externo no devolvió JSON válido");
  }

  const parsed = schema.safeParse(crudo);
  if (!parsed.success) {
    console.error("[openlibrary] respuesta inesperada en %s: %s", path, prettifyZodError(parsed.error));
    throw serviceUnavailable(
      "El catálogo externo respondió en un formato que no reconocemos. Puede que haya cambiado su API.",
    );
  }
  return parsed.data;
}

// ── Normalización ─────────────────────────────────────────────────────

type DocCrudo = z.infer<typeof docSchema>;

/** Sólo lo que se lee entero y gratis. El resto (prestable, sin ebook) se descarta. */
export function esPublico(doc: DocCrudo): boolean {
  return doc.ebook_access === "public";
}

/**
 * Doc de Open Library -> nuestro LibroExterno. Pura: sin red, por eso se prueba
 * con objetos escritos a mano.
 *
 * El enlace de lectura es la página del ítem en Internet Archive
 * (`archive.org/details/<ia>`), que es el lector online. Si no hay `ia` pero el
 * libro es público, se cae a la ficha de la obra en Open Library. No se arma un
 * enlace de descarga directo: Internet Archive no garantiza una URL de EPUB/PDF
 * estable por ítem, y un enlace muerto es peor que ninguno.
 */
export function normalizar(doc: DocCrudo): LibroExterno {
  const key = doc.key.replace(/^\/works\//, "");
  const ia = doc.ia[0] ?? null;
  const anio = doc.first_publish_year ?? null;

  return {
    provider: "openlibrary",
    externalId: key,
    title: doc.title,
    authors: doc.author_name,
    languages: doc.language.map((l) => LANG_3_A_2[l] ?? l),
    publicationYear: anio !== null && anio > 0 && anio <= 3000 ? anio : null,
    coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
    readUrl: ia ? `https://archive.org/details/${ia}` : `${API_BASE}/works/${key}`,
    downloadUrl: null,
    sourceUrl: `${API_BASE}/works/${key}`,
    // Lo que declara la fuente, en nuestros términos pero sin exagerar: "lectura
    // pública" es lo que `ebook_access:"public"` garantiza, no un fallo de derechos.
    rightsNote: "Lectura pública (Open Library / Internet Archive)",
    downloadCount: 0,
  };
}

// ── Lo que usa el resto del módulo ────────────────────────────────────

/**
 * Busca en el catálogo. Pide de más (limit alto) porque recién después se
 * filtra a los de lectura pública, que son una fracción de lo que devuelve.
 */
export async function buscarLibros(q: string, idioma?: string): Promise<LibroExterno[]> {
  const params = new URLSearchParams({ q, fields: FIELDS, limit: "40" });
  if (idioma) params.set("language", LANG_2_A_3[idioma] ?? idioma);

  const page = await pedir(`/search.json?${params.toString()}`, paginaSchema);
  return page.docs
    .filter(esPublico)
    .map(normalizar)
    .filter((l) => l.readUrl !== null || l.downloadUrl !== null)
    .slice(0, 24);
}

/** Un libro por su work key de Open Library (p. ej. "OL59202W"), al importar. */
export async function obtenerLibro(key: string): Promise<LibroExterno> {
  // Se vuelve a pedir a la fuente en vez de confiar en lo que mande el cliente:
  // el título, los enlaces y la nota de derechos salen siempre de Open Library.
  const page = await pedir(
    `/search.json?q=key:/works/${encodeURIComponent(key)}&fields=${FIELDS}&limit=1`,
    paginaSchema,
  );
  const doc = page.docs[0];
  if (!doc) throw notFound("Ese libro no está en el catálogo externo");

  // Se recomprueba acá y no sólo en la búsqueda: la key llega del cliente y
  // podría ser cualquiera, no necesariamente una que pasó el filtro.
  if (!esPublico(doc)) {
    throw badRequest("Ese libro no es de lectura pública en la fuente");
  }

  const libro = normalizar(doc);
  if (!libro.readUrl && !libro.downloadUrl) {
    throw badRequest("Ese libro no tiene ningún formato que podamos enlazar");
  }
  return libro;
}
