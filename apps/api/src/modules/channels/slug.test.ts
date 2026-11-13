import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "./slug.js";

test("slugify limpia tildes, eñes y mayúsculas", () => {
  assert.equal(slugify("Libros y Reseñas"), "libros-y-resenas");
  assert.equal(slugify("ÁLGEBRA"), "algebra");
});

test("slugify colapsa separadores y no deja guiones sueltos", () => {
  assert.equal(slugify("  hola   mundo  "), "hola-mundo");
  assert.equal(slugify("---hola--mundo---"), "hola-mundo");
  assert.equal(slugify("C++ / Rust"), "c-rust");
});

test("slugify recorta a 100 y no deja el guion del corte", () => {
  const largo = slugify("a".repeat(120));
  assert.equal(largo.length, 100);

  // El carácter 100 cae justo en un separador: no debe quedar colgando.
  const cortado = slugify("b".repeat(99) + " palabra");
  assert.ok(!cortado.endsWith("-"), `no debería terminar en guion: ${cortado}`);
});

test("slugify puede quedar vacío si no hay nada aprovechable", () => {
  // Quien llame decide qué hacer con esto; la función no inventa un nombre.
  assert.equal(slugify("¿?¡!"), "");
});
