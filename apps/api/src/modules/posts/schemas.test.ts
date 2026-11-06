import { test } from "node:test";
import assert from "node:assert/strict";
import { createBody, feedQuery, searchQuery } from "./schemas.js";

const uuid = "123e4567-e89b-42d3-a456-426614174000";

test("createBody acepta sólo título y aplica visibility=community por defecto", () => {
  const r = createBody.safeParse({ title: "Hola" });
  assert.ok(r.success);
  assert.equal(r.data.visibility, "community");
});

test("createBody acepta sólo cuerpo", () => {
  assert.equal(createBody.safeParse({ bodyMarkdown: "texto" }).success, true);
});

test("createBody rechaza post sin título ni cuerpo", () => {
  assert.equal(createBody.safeParse({}).success, false);
  assert.equal(createBody.safeParse({ title: "", bodyMarkdown: "   " }).success, false);
  assert.equal(createBody.safeParse({ title: null, bodyMarkdown: null }).success, false);
});

test("createBody rechaza visibility desconocida, título largo y tagIds no uuid", () => {
  assert.equal(createBody.safeParse({ title: "x", visibility: "public" }).success, false);
  assert.equal(createBody.safeParse({ title: "x".repeat(241) }).success, false);
  assert.equal(createBody.safeParse({ title: "x", tagIds: ["no-uuid"] }).success, false);
});

test("createBody respeta límites de tagIds (10) y mentionedUserIds (25)", () => {
  assert.equal(createBody.safeParse({ title: "x", tagIds: Array(10).fill(uuid) }).success, true);
  assert.equal(createBody.safeParse({ title: "x", tagIds: Array(11).fill(uuid) }).success, false);
  assert.equal(createBody.safeParse({ title: "x", mentionedUserIds: Array(25).fill(uuid) }).success, true);
  assert.equal(createBody.safeParse({ title: "x", mentionedUserIds: Array(26).fill(uuid) }).success, false);
});

test("feedQuery: limit por defecto 20, coerciona strings y limita a 1..50", () => {
  assert.equal(feedQuery.parse({}).limit, 20);
  assert.equal(feedQuery.parse({ limit: "5" }).limit, 5);
  assert.equal(feedQuery.safeParse({ limit: "0" }).success, false);
  assert.equal(feedQuery.safeParse({ limit: "51" }).success, false);
});

test("feedQuery: cursor debe ser datetime ISO", () => {
  assert.equal(feedQuery.safeParse({ cursor: "2026-01-01T00:00:00Z" }).success, true);
  assert.equal(feedQuery.safeParse({ cursor: "ayer" }).success, false);
});

test("searchQuery: q de 2..200, type acotado", () => {
  assert.equal(searchQuery.safeParse({ q: "a" }).success, false);
  assert.equal(searchQuery.safeParse({ q: "ab" }).success, true);
  assert.equal(searchQuery.safeParse({ q: "a".repeat(201) }).success, false);
  assert.equal(searchQuery.safeParse({ q: "ab", type: "repo" }).success, false);
  assert.equal(searchQuery.parse({ q: "ab", type: "book" }).type, "book");
});
