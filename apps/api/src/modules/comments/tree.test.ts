import { test } from "node:test";
import assert from "node:assert/strict";
import { armarArbol } from "./tree.js";

test("armarArbol anida las respuestas bajo su padre", () => {
  const arbol = armarArbol([
    { id: "a", parentCommentId: null },
    { id: "b", parentCommentId: "a" },
    { id: "c", parentCommentId: "b" },
    { id: "d", parentCommentId: null },
  ]);

  assert.equal(arbol.length, 2);
  assert.equal(arbol[0]!.id, "a");
  assert.equal(arbol[0]!.replies[0]!.id, "b");
  assert.equal(arbol[0]!.replies[0]!.replies[0]!.id, "c");
  assert.equal(arbol[1]!.id, "d");
});

test("armarArbol respeta el orden de entrada entre hermanos", () => {
  const arbol = armarArbol([
    { id: "a", parentCommentId: null },
    { id: "b1", parentCommentId: "a" },
    { id: "b2", parentCommentId: "a" },
  ]);
  assert.deepEqual(arbol[0]!.replies.map((r) => r.id), ["b1", "b2"]);
});

test("una respuesta cuyo padre no está sube a la raíz, no se pierde", () => {
  // El padre fue borrado u ocultado y no vino en la consulta.
  const arbol = armarArbol([{ id: "huerfano", parentCommentId: "fantasma" }]);
  assert.equal(arbol.length, 1);
  assert.equal(arbol[0]!.id, "huerfano");
});

test("un comentario que se apunta a sí mismo no cuelga el recorrido", () => {
  const arbol = armarArbol([{ id: "a", parentCommentId: "a" }]);
  assert.equal(arbol.length, 1);
  assert.equal(arbol[0]!.replies.length, 0);
});
