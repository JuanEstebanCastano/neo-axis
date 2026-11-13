import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalizarRepo } from "./canonical.js";

test("acepta owner/repo a secas", () => {
  const r = canonicalizarRepo("Castano/Neo-Axis");
  assert.equal(r?.canonicalUrl, "https://github.com/castano/neo-axis");
  assert.equal(r?.fullName, "castano/neo-axis");
  // El nombre se conserva como lo escribió su dueño.
  assert.equal(r?.owner, "Castano");
  assert.equal(r?.repo, "Neo-Axis");
});

test("todas las formas de la misma URL dan la misma canónica", () => {
  const esperada = "https://github.com/castano/neo-axis";
  for (const entrada of [
    "https://github.com/Castano/Neo-Axis",
    "https://github.com/Castano/Neo-Axis/",
    "https://github.com/Castano/Neo-Axis.git",
    "http://github.com/castano/neo-axis",
    "https://www.github.com/castano/neo-axis",
    "github.com/Castano/Neo-Axis",
    "  https://github.com/Castano/Neo-Axis  ",
  ]) {
    assert.equal(canonicalizarRepo(entrada)?.canonicalUrl, esperada, `falló con: ${entrada}`);
  }
});

test("ignora lo que cuelgue después del repositorio", () => {
  // Pegar la URL estando dentro de un archivo es lo más normal del mundo.
  const r = canonicalizarRepo("https://github.com/castano/neo-axis/blob/main/README.md");
  assert.equal(r?.canonicalUrl, "https://github.com/castano/neo-axis");
});

test("rechaza lo que no es un repositorio de GitHub", () => {
  for (const entrada of [
    "",
    "   ",
    "castano",
    "castano/neo-axis/extra",
    "https://gitlab.com/castano/neo-axis",
    "https://github.com/castano",
    "https://example.com",
    "no es una url",
    "castano/neo axis",
  ]) {
    assert.equal(canonicalizarRepo(entrada), null, `debería rechazar: ${entrada}`);
  }
});

test("un host parecido no cuela", () => {
  // github.com.algo-malicioso.example no es github.com.
  assert.equal(canonicalizarRepo("https://github.com.otro.example/a/b"), null);
});
