import { test } from "node:test";
import assert from "node:assert/strict";
import { createBody } from "./schemas.js";

const ok = { title: "Hola", language: "ts", sourceCode: "console.log(1)" };

test("snippets createBody acepta snippet mínimo y opcionales nulos", () => {
  assert.equal(createBody.safeParse(ok).success, true);
  assert.equal(createBody.safeParse({ ...ok, description: null, filename: null }).success, true);
});

test("snippets createBody rechaza campos obligatorios vacíos o ausentes", () => {
  assert.equal(createBody.safeParse({ ...ok, title: "" }).success, false);
  assert.equal(createBody.safeParse({ ...ok, language: "" }).success, false);
  assert.equal(createBody.safeParse({ ...ok, sourceCode: "" }).success, false);
  assert.equal(createBody.safeParse({ title: "x" }).success, false);
});

test("snippets createBody respeta límites (sourceCode 20000, description 1000, filename 255)", () => {
  assert.equal(createBody.safeParse({ ...ok, sourceCode: "x".repeat(20000) }).success, true);
  assert.equal(createBody.safeParse({ ...ok, sourceCode: "x".repeat(20001) }).success, false);
  assert.equal(createBody.safeParse({ ...ok, description: "x".repeat(1001) }).success, false);
  assert.equal(createBody.safeParse({ ...ok, filename: "x".repeat(256) }).success, false);
  assert.equal(createBody.safeParse({ ...ok, language: "x".repeat(81) }).success, false);
});
