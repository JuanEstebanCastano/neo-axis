import { test } from "node:test";
import assert from "node:assert/strict";
import { AppError, badRequest, conflict, forbidden, notFound, unauthorized } from "./errors.js";

test("los constructores asignan el código HTTP correcto", () => {
  assert.equal(badRequest("x").statusCode, 400);
  assert.equal(unauthorized().statusCode, 401);
  assert.equal(forbidden().statusCode, 403);
  assert.equal(notFound().statusCode, 404);
  assert.equal(conflict("y").statusCode, 409);
});

test("los errores llevan code legible y son AppError", () => {
  const e = notFound("no existe");
  assert.ok(e instanceof AppError);
  assert.equal(e.code, "not_found");
  assert.equal(e.message, "no existe");
});
