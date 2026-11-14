import { test } from "node:test";
import assert from "node:assert/strict";
import { textoDeLibro } from "./search.js";

/**
 * Lo único de la indexación de libros que no necesita base: cómo se arma el
 * documento. El resto (el upsert y el backfill) es SQL y se prueba corriendo.
 */

test("textoDeLibro junta autores y año en el cuerpo", () => {
  const doc = textoDeLibro("Cien años de soledad", ["Gabriel García Márquez"], 1967);
  assert.equal(doc.title, "Cien años de soledad");
  assert.equal(doc.content, "Gabriel García Márquez · 1967");
});

test("textoDeLibro conserva el orden de los autores", () => {
  const doc = textoDeLibro("Obra a cuatro manos", ["Borges", "Bioy Casares"], null);
  assert.equal(doc.content, "Borges, Bioy Casares");
});

test("textoDeLibro sobrevive a un libro sin autores ni año", () => {
  const doc = textoDeLibro("Anónimo", [], null);
  assert.equal(doc.title, "Anónimo");
  assert.equal(doc.content, "");
});

test("textoDeLibro descarta autores vacíos en vez de dejar comas sueltas", () => {
  // vincularAutores ya limpia al guardar, pero el documento se arma también
  // con lo que llega del importador, que no pasa por ahí.
  const doc = textoDeLibro("Con huecos", ["  ", "Kafka", ""], 1925);
  assert.equal(doc.content, "Kafka · 1925");
});

test("textoDeLibro recorta los espacios del título", () => {
  assert.equal(textoDeLibro("  El proceso  ", [], null).title, "El proceso");
});

test("textoDeLibro ignora un año en cero en vez de escribirlo", () => {
  // publication_year es nullable y hay fuentes que mandan 0 por 'desconocido'.
  assert.equal(textoDeLibro("Sin fecha", ["Anónimo"], 0).content, "Anónimo");
});
