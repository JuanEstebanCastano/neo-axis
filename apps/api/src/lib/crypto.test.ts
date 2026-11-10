import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { encryptSecret, decryptSecret, parseEncryptionKey } from "./crypto.js";

const key = randomBytes(32);

test("ida y vuelta: lo cifrado se recupera igual", () => {
  const secret = "gho_tokenDeGitHubDeEjemplo123";
  assert.equal(decryptSecret(encryptSecret(secret, key), key), secret);
});

test("dos cifrados del mismo texto dan sobres distintos (iv aleatorio)", () => {
  const a = encryptSecret("mismo", key);
  const b = encryptSecret("mismo", key);
  assert.notEqual(a.toString("hex"), b.toString("hex"));
});

test("un sobre alterado no se puede abrir", () => {
  const envelope = encryptSecret("intacto", key);
  const ultimo = envelope.length - 1;
  envelope[ultimo] = (envelope[ultimo] ?? 0) ^ 0xff;
  assert.throws(() => decryptSecret(envelope, key));
});

test("con otra clave no se puede abrir", () => {
  const envelope = encryptSecret("secreto", key);
  assert.throws(() => decryptSecret(envelope, randomBytes(32)));
});

test("la clave debe medir 32 bytes", () => {
  assert.equal(parseEncryptionKey("ab".repeat(32)).length, 32);
  assert.throws(() => parseEncryptionKey("abcd"));
});
