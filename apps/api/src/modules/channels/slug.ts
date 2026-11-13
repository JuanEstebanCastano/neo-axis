/**
 * EL NOMBRE CORTO DE UNA SECCIÓN
 * ──────────────────────────────────────────────────────────────────────
 * "Libros y Reseñas" -> "libros-y-resenas". Es lo que va en la URL, así que
 * tiene que ser estable, legible y sin sorpresas: sin tildes, sin eñes, sin
 * espacios ni símbolos.
 *
 * Función pura y con pruebas: el slug entra en un índice único, y un bug acá
 * se paga con secciones duplicadas que sólo se distinguen por un acento.
 */

/** Longitud máxima del slug; espeja el varchar(100) de la columna. */
const MAX = 100;

export function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    // Quita los diacríticos que NFD dejó sueltos (la tilde de "á", etc.).
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    // Cualquier cosa que no sea letra o número pasa a ser un guion.
    .replace(/[^a-z0-9]+/g, "-")
    // Sin guiones repetidos ni en los extremos: "---hola--" -> "hola".
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX)
    // El recorte pudo dejar un guion colgando al final.
    .replace(/-$/, "");
}
