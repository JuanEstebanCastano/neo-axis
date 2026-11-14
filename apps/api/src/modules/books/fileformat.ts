/**
 * QUÉ ES ESTE ARCHIVO DE VERDAD
 * ──────────────────────────────────────────────────────────────────────
 * Mira los primeros bytes de lo que alguien sube y dice si es un EPUB, un
 * PDF o un MOBI. Nada más. Sin base, sin red, sin S3: por eso se puede
 * probar con buffers escritos a mano.
 *
 * POR QUÉ NO ALCANZA CON EL NOMBRE NI CON EL CONTENT-TYPE
 * Los dos los elige quien sube. Renombrar `virus.exe` a `libro.epub` es un
 * segundo de trabajo, y el navegador manda el Content-Type que se le
 * antoje. Si guardáramos eso como "formato", la biblioteca ofrecería
 * descargar un EPUB que no lo es, firmado por nosotros y con nuestra cara.
 * Los primeros bytes, en cambio, los pone el programa que creó el archivo.
 *
 * Esto NO es un antivirus y no pretende serlo: un ZIP con la firma de EPUB
 * sigue pasando. Lo que evita es el engaño barato y, sobre todo, que la
 * columna `format` diga una cosa y el archivo sea otra.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

/** Los tres que acepta el enum app.book_file_format. */
export type BookFileFormat = "epub" | "pdf" | "mobi";

/** Lo que se guarda como media_type y lo que verá el navegador al descargar. */
export const MIME_POR_FORMATO: Record<BookFileFormat, string> = {
  epub: "application/epub+zip",
  pdf: "application/pdf",
  mobi: "application/x-mobipocket-ebook",
};

export const EXTENSION_POR_FORMATO: Record<BookFileFormat, string> = {
  epub: "epub",
  pdf: "pdf",
  mobi: "mobi",
};

/** Los Content-Type que el API acepta recibir en el cuerpo de una subida. */
export const TIPOS_ACEPTADOS = [
  "application/epub+zip",
  "application/pdf",
  "application/x-mobipocket-ebook",
  // El navegador manda esto cuando no reconoce la extensión, que con .mobi
  // pasa casi siempre. Igual se valida por los bytes, así que aceptarlo no
  // afloja nada.
  "application/octet-stream",
];

const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04"
const PDF = Buffer.from("%PDF-", "latin1");
const MOBI = Buffer.from("BOOKMOBI", "latin1");

/**
 * Qué es este archivo, mirándolo. `null` si no es ninguno de los tres.
 *
 * EPUB: es un ZIP, pero uno muy particular. El estándar OCF exige que el
 * primer archivo del zip se llame `mimetype`, vaya sin comprimir y contenga
 * exactamente "application/epub+zip". Eso cae en bytes fijos (30 y 38), y
 * por eso se puede reconocer sin descomprimir nada. Si la cabecera no está
 * donde debería, igual se busca la cadena en los primeros 2 KB: hay
 * generadores que ordenan mal el zip y el archivo abre igual en cualquier
 * lector. Lo que no se acepta nunca es un ZIP a secas, porque un .zip
 * cualquiera entraría como libro.
 *
 * PDF: "%PDF-" debería estar en el byte 0. Se busca en el primer KB porque
 * hay PDFs con basura delante que todos los lectores abren igual.
 *
 * MOBI: la firma vive en el byte 60, después de la cabecera PalmDB.
 */
export function detectarFormato(buf: Buffer): BookFileFormat | null {
  if (buf.length < 4) return null;

  if (buf.subarray(0, 1024).includes(PDF)) return "pdf";

  if (buf.length >= 68 && buf.subarray(60, 68).equals(MOBI)) return "mobi";

  if (buf.subarray(0, 4).equals(ZIP)) {
    const esEpubOrdenado =
      buf.length >= 58 &&
      buf.subarray(30, 38).toString("latin1") === "mimetype" &&
      buf.subarray(38, 58).toString("latin1") === "application/epub+zip";
    const tieneLaCadena = buf.subarray(0, 2048).includes(MIME_POR_FORMATO.epub);
    if (esEpubOrdenado || tieneLaCadena) return "epub";
  }

  return null;
}

/**
 * Dónde vive el objeto dentro del bucket.
 *
 * El nombre lo pone el servidor, nunca quien sube. Con el nombre del cliente
 * de por medio habría que defenderse de '../', de barras, de nombres
 * repetidos y de caracteres que un storage u otro traten distinto; con un
 * uuid no hay nada de qué defenderse. El nombre bonito se arma recién al
 * descargar, a partir del título del libro.
 */
export function claveDeObjeto(bookId: string, formato: BookFileFormat, token: string): string {
  return `libros/${bookId}/${token}.${EXTENSION_POR_FORMATO[formato]}`;
}

/**
 * El nombre con el que la persona ve caer el archivo en su carpeta.
 *
 * Dentro del bucket el objeto se llama como un uuid, que es lo correcto allá
 * y lo peor posible acá: nadie reconoce "a3f9…ab.epub" entre veinte
 * descargas. Se arma del título, con el mismo criterio que los snippets
 * (sin tildes ni símbolos), porque este nombre viaja en una cabecera HTTP y
 * ahí una eñe o una coma se vuelven un problema de codificación.
 */
export function nombreDescarga(titulo: string, formato: BookFileFormat): string {
  const base =
    titulo
      .toLowerCase()
      .normalize("NFD") // Separa la tilde de la letra...
      .replace(/[\u0300-\u036f]/g, "") // ...y la tilde se va.
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "libro";

  return `${base}.${EXTENSION_POR_FORMATO[formato]}`;
}
