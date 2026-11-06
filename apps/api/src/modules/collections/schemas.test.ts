import { test } from "node:test";
import assert from "node:assert/strict";
import { createBody, itemBody } from "./schemas.js";

const uuid = "123e4567-e89b-42d3-a456-426614174000";

test("collections createBody: válido y visibility por defecto", () => {
  const r = createBody.safeParse({ title: "Mi lista" });
  assert.ok(r.success);
  assert.equal(r.data.visibility, "community");
});

test("collections createBody: rechaza título vacío/largo y visibility inválida", () => {
  assert.equal(createBody.safeParse({ title: "" }).success, false);
  assert.equal(createBody.safeParse({ title: "x".repeat(241) }).success, false);
  assert.equal(createBody.safeParse({ title: "x", visibility: "private" }).success, false);
  assert.equal(createBody.safeParse({}).success, false);
});

test("itemBody acepta cada itemType con su id", () => {
  assert.equal(itemBody.safeParse({ itemType: "book", bookId: uuid }).success, true);
  assert.equal(itemBody.safeParse({ itemType: "post", postId: uuid }).success, true);
});

test("itemBody rechaza itemType desconocido e ids no uuid", () => {
  assert.equal(itemBody.safeParse({ itemType: "video" }).success, false);
  assert.equal(itemBody.safeParse({ itemType: "book", bookId: "123" }).success, false);
});

test("itemBody: sortOrder se coerciona y respeta 0..32767 (smallint)", () => {
  assert.equal(itemBody.parse({ itemType: "book", sortOrder: "3" }).sortOrder, 3);
  assert.equal(itemBody.safeParse({ itemType: "book", sortOrder: -1 }).success, false);
  assert.equal(itemBody.safeParse({ itemType: "book", sortOrder: 32768 }).success, false);
  assert.equal(itemBody.safeParse({ itemType: "book", sortOrder: 1.5 }).success, false);
});

test("itemBody: note máximo 500", () => {
  assert.equal(itemBody.safeParse({ itemType: "book", note: "x".repeat(500) }).success, true);
  assert.equal(itemBody.safeParse({ itemType: "book", note: "x".repeat(501) }).success, false);
});
