import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { prettifyZodError } from "./validation.js";

test("prettifyZodError nombra cada campo con su motivo", () => {
  const schema = z.object({ email: z.string().email(), age: z.number().min(18) });
  const r = schema.safeParse({ email: "no-es-mail", age: 5 });
  assert.equal(r.success, false);
  if (!r.success) {
    const texto = prettifyZodError(r.error);
    assert.match(texto, /email/);
    assert.match(texto, /age/);
    assert.ok(texto.includes(";"), "separa varios errores con ';'");
  }
});

test("prettifyZodError funciona en un error de raíz (sin path)", () => {
  const r = z.string().safeParse(123);
  assert.equal(r.success, false);
  if (!r.success) assert.ok(prettifyZodError(r.error).length > 0);
});
