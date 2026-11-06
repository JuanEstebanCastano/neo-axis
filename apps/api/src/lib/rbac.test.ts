import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPermission, PERMISSIONS } from "./rbac.js";
import { AppError } from "./errors.js";

test("assertPermission pasa cuando el permiso está concedido", () => {
  const granted = new Set<string>([PERMISSIONS.postsCreate]);
  assert.doesNotThrow(() => assertPermission(granted, PERMISSIONS.postsCreate));
});

test("assertPermission lanza 403 cuando el permiso falta", () => {
  const granted = new Set<string>();
  assert.throws(
    () => assertPermission(granted, PERMISSIONS.postsCreate),
    (e: unknown) => e instanceof AppError && e.statusCode === 403 && e.code === "forbidden",
  );
});
