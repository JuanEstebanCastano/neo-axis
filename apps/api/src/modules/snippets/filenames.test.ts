import { test } from "node:test";
import assert from "node:assert/strict";
import { nombreDeArchivo } from "./filenames.js";

test("nombreDeArchivo respeta el nombre que puso el autor", () => {
  assert.equal(nombreDeArchivo("Lo que sea", "typescript", "debounce.ts"), "debounce.ts");
  assert.equal(nombreDeArchivo("Lo que sea", "typescript", "  util.py  "), "util.py");
});

test("nombreDeArchivo lo deriva del título cuando falta", () => {
  assert.equal(nombreDeArchivo("Debounce en TypeScript", "typescript", null), "debounce-en-typescript.ts");
  assert.equal(nombreDeArchivo("Consulta pesada", "sql", undefined), "consulta-pesada.sql");
});

test("nombreDeArchivo limpia tildes, eñes y símbolos", () => {
  assert.equal(nombreDeArchivo("Año: cómputo rápido!", "python", null), "ano-computo-rapido.py");
});

test("nombreDeArchivo cae a .txt con un lenguaje desconocido", () => {
  assert.equal(nombreDeArchivo("Algo", "brainfuck", null), "algo.txt");
});

test("nombreDeArchivo nunca devuelve un nombre vacío", () => {
  assert.equal(nombreDeArchivo("!!!", "javascript", null), "snippet.js");
  assert.equal(nombreDeArchivo("Algo", "javascript", "   "), "algo.js");
});

test("nombreDeArchivo acorta títulos largos", () => {
  const nombre = nombreDeArchivo("palabra ".repeat(30), "go", null);
  assert.ok(nombre.length <= 64, `demasiado largo: ${nombre}`);
  assert.ok(nombre.endsWith(".go"));
});
