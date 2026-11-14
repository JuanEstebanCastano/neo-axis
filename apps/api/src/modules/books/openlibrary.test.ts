import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizar, esPublico } from "./openlibrary.js";

/**
 * Lo puro del cliente de Open Library: decidir qué es público y mapear un doc
 * de la fuente a nuestro LibroExterno. El HTTP (pedir/buscar/obtener) no se
 * prueba acá: eso es red y se verifica corriendo contra la fuente.
 */

/** Un doc como el que devuelve Open Library, con sólo los campos que usamos. */
function doc(over: Record<string, unknown> = {}) {
  return {
    key: "/works/OL2000W",
    title: "Don Quijote de la Mancha",
    author_name: ["Miguel de Cervantes Saavedra"],
    first_publish_year: 1605,
    cover_i: 14428305,
    ia: ["elingeniosohidal00cervrs"],
    public_scan_b: true,
    ebook_access: "public",
    language: ["spa"],
    ...over,
  } as Parameters<typeof normalizar>[0];
}

test("esPublico sólo acepta ebook_access 'public'", () => {
  assert.equal(esPublico(doc({ ebook_access: "public" })), true);
  assert.equal(esPublico(doc({ ebook_access: "borrowable" })), false);
  assert.equal(esPublico(doc({ ebook_access: "no_ebook" })), false);
});

test("normalizar quita el prefijo /works/ de la clave", () => {
  assert.equal(normalizar(doc()).externalId, "OL2000W");
});

test("normalizar traduce el idioma MARC de 3 letras a 2", () => {
  assert.deepEqual(normalizar(doc({ language: ["spa"] })).languages, ["es"]);
  assert.deepEqual(normalizar(doc({ language: ["eng", "fre"] })).languages, ["en", "fr"]);
});

test("normalizar deja pasar un idioma que no está en la tabla", () => {
  assert.deepEqual(normalizar(doc({ language: ["chi"] })).languages, ["chi"]);
});

test("normalizar arma el enlace de lectura desde el id de Internet Archive", () => {
  assert.equal(
    normalizar(doc({ ia: ["elingeniosohidal00cervrs"] })).readUrl,
    "https://archive.org/details/elingeniosohidal00cervrs",
  );
});

test("normalizar cae a la ficha de Open Library cuando no hay ia", () => {
  assert.equal(normalizar(doc({ ia: [] })).readUrl, "https://openlibrary.org/works/OL2000W");
});

test("normalizar arma la portada desde cover_i, o null si falta", () => {
  assert.equal(
    normalizar(doc({ cover_i: 123 })).coverUrl,
    "https://covers.openlibrary.org/b/id/123-M.jpg",
  );
  assert.equal(normalizar(doc({ cover_i: null })).coverUrl, null);
});

test("normalizar nunca promete una descarga directa (IA no da URL estable)", () => {
  assert.equal(normalizar(doc()).downloadUrl, null);
});

test("normalizar descarta un año fuera de rango", () => {
  assert.equal(normalizar(doc({ first_publish_year: 0 })).publicationYear, null);
  assert.equal(normalizar(doc({ first_publish_year: null })).publicationYear, null);
  assert.equal(normalizar(doc({ first_publish_year: 1605 })).publicationYear, 1605);
});

test("normalizar marca el proveedor como openlibrary", () => {
  assert.equal(normalizar(doc()).provider, "openlibrary");
});
