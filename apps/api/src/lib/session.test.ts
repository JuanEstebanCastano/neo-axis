import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { hashToken } from "./session.js";

test("hashToken es determinista", () => {
  assert.ok(hashToken("abc").equals(hashToken("abc")));
});

test("hashToken devuelve SHA-256 (32 bytes) y coincide con la referencia", () => {
  const h = hashToken("abc");
  assert.equal(h.length, 32);
  assert.equal(h.toString("hex"), createHash("sha256").update("abc").digest("hex"));
});

test("hashToken distingue tokens distintos y no devuelve el token en claro", () => {
  assert.ok(!hashToken("abc").equals(hashToken("abd")));
  assert.ok(!hashToken("abc").toString("utf8").includes("abc"));
});
