import { test } from "node:test";
import assert from "node:assert/strict";
import { recommendQuery } from "./schemas.js";

test("recommendQuery: limit por defecto 10 y coerción", () => {
  assert.equal(recommendQuery.parse({}).limit, 10);
  assert.equal(recommendQuery.parse({ limit: "50" }).limit, 50);
  assert.equal(recommendQuery.safeParse({ limit: "51" }).success, false);
});

test("recommendQuery: q mínimo 2, entityId uuid", () => {
  assert.equal(recommendQuery.safeParse({ q: "a" }).success, false);
  assert.equal(recommendQuery.safeParse({ q: "ab" }).success, true);
  assert.equal(recommendQuery.safeParse({ entityId: "x" }).success, false);
  assert.equal(
    recommendQuery.safeParse({ entityId: "123e4567-e89b-42d3-a456-426614174000" }).success,
    true,
  );
});
