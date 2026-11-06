import { test } from "node:test";
import assert from "node:assert/strict";
import { itemColumns } from "./service.js";

test("itemColumns pone el id en la columna del tipo y null en el resto", () => {
  assert.deepEqual(itemColumns("book", "b1"), {
    bookId: "b1", repositoryId: null, snippetId: null, postId: null,
  });
  assert.deepEqual(itemColumns("repository", "r1"), {
    bookId: null, repositoryId: "r1", snippetId: null, postId: null,
  });
  assert.deepEqual(itemColumns("snippet", "s1"), {
    bookId: null, repositoryId: null, snippetId: "s1", postId: null,
  });
  assert.deepEqual(itemColumns("post", "p1"), {
    bookId: null, repositoryId: null, snippetId: null, postId: "p1",
  });
});

test("exactamente una columna queda no-nula (espeja el CHECK de la tabla)", () => {
  for (const t of ["book", "repository", "snippet", "post"] as const) {
    const cols = itemColumns(t, "id");
    const noNulos = Object.values(cols).filter((v) => v !== null);
    assert.equal(noNulos.length, 1);
  }
});
