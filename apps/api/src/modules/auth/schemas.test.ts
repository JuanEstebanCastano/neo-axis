import { test } from "node:test";
import assert from "node:assert/strict";
import { registerBody, loginBody } from "./schemas.js";

const ok = {
  username: "juan_01",
  displayName: "Juan",
  email: "juan@example.com",
  password: "una-clave-larga-123",
};

test("registerBody acepta un registro válido", () => {
  assert.equal(registerBody.safeParse(ok).success, true);
});

test("registerBody rechaza contraseña de menos de 12 caracteres", () => {
  assert.equal(registerBody.safeParse({ ...ok, password: "corta123" }).success, false);
});

test("registerBody acepta contraseña de exactamente 12 y rechaza >200", () => {
  assert.equal(registerBody.safeParse({ ...ok, password: "a".repeat(12) }).success, true);
  assert.equal(registerBody.safeParse({ ...ok, password: "a".repeat(201) }).success, false);
});

test("registerBody rechaza usernames inválidos", () => {
  for (const username of ["ab", "-abc", "con espacio", "ñandú", "a".repeat(41), "a;drop"]) {
    assert.equal(registerBody.safeParse({ ...ok, username }).success, false, username);
  }
});

test("registerBody acepta usernames en los bordes (3 y 40 caracteres)", () => {
  assert.equal(registerBody.safeParse({ ...ok, username: "abc" }).success, true);
  assert.equal(registerBody.safeParse({ ...ok, username: "a".repeat(40) }).success, true);
});

test("registerBody rechaza email inválido y displayName vacío", () => {
  assert.equal(registerBody.safeParse({ ...ok, email: "no-es-email" }).success, false);
  assert.equal(registerBody.safeParse({ ...ok, displayName: "" }).success, false);
});

test("registerBody rechaza campos faltantes", () => {
  const { password: _p, ...sinPass } = ok;
  assert.equal(registerBody.safeParse(sinPass).success, false);
});

test("loginBody valida email y exige password no vacío", () => {
  assert.equal(loginBody.safeParse({ email: "a@b.co", password: "x" }).success, true);
  assert.equal(loginBody.safeParse({ email: "a@b.co", password: "" }).success, false);
  assert.equal(loginBody.safeParse({ email: "nope", password: "x" }).success, false);
});
