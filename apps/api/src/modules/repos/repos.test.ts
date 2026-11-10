import { test } from "node:test";
import assert from "node:assert/strict";
import { encodePath, parseRepoFullName } from "../github/client.js";
import { contentsQuery, putFileBody, repoPath, uploadBody } from "./schemas.js";

// ── Rutas dentro del repo ─────────────────────────────────────────────

test("encodePath respeta las barras y escapa el resto", () => {
  assert.equal(encodePath("src/lib/util.ts"), "src/lib/util.ts");
  assert.equal(encodePath("src/mi archivo.ts"), "src/mi%20archivo.ts");
  assert.equal(encodePath("docs/año nuevo.md"), "docs/a%C3%B1o%20nuevo.md");
  // Las barras de más no generan segmentos vacíos.
  assert.equal(encodePath("/src//a.ts"), "src/a.ts");
});

test("repoPath rechaza lo que podría escapar del repositorio", () => {
  assert.equal(repoPath.safeParse("src/a.ts").success, true);
  assert.equal(repoPath.safeParse("../otro/a.ts").success, false);
  assert.equal(repoPath.safeParse("src/../../a.ts").success, false);
  assert.equal(repoPath.safeParse("/etc/passwd").success, false);
  assert.equal(repoPath.safeParse("").success, false);
  assert.equal(repoPath.safeParse("a\u0000b").success, false);
});

test("repoPath acepta un punto suelto, que es un nombre válido", () => {
  // `..` es el peligro; `.github` o `a..b` no lo son.
  assert.equal(repoPath.safeParse(".github/workflows/ci.yml").success, true);
  assert.equal(repoPath.safeParse("src/a..b.ts").success, true);
});

// ── Nombre completo del repositorio ───────────────────────────────────

test("parseRepoFullName acepta usuario/repo y la URL completa", () => {
  assert.deepEqual(parseRepoFullName("juan/neo-axis"), { owner: "juan", repo: "neo-axis" });
  assert.deepEqual(parseRepoFullName("  juan/neo-axis  "), { owner: "juan", repo: "neo-axis" });
  assert.deepEqual(parseRepoFullName("https://github.com/juan/neo-axis"), {
    owner: "juan",
    repo: "neo-axis",
  });
  // La URL de clonar también: es la que ofrece GitHub para copiar.
  assert.deepEqual(parseRepoFullName("https://github.com/juan/neo-axis.git"), {
    owner: "juan",
    repo: "neo-axis",
  });
});

test("parseRepoFullName rechaza lo que no identifica un repositorio", () => {
  assert.equal(parseRepoFullName("solo-nombre"), null);
  assert.equal(parseRepoFullName(""), null);
  assert.equal(parseRepoFullName("https://gitlab.com/juan/repo"), null);
  // Un host que apenas se parece no alcanza.
  assert.equal(parseRepoFullName("https://github.com.falso.com/juan/repo"), null);
});

// ── Cuerpos de las peticiones ─────────────────────────────────────────

test("putFileBody toma utf8 por defecto y deja el resto opcional", () => {
  const r = putFileBody.safeParse({ path: "a.ts", content: "hola" });
  assert.equal(r.success, true);
  assert.equal(r.data?.encoding, "utf8");
  assert.equal(r.data?.message, undefined);
});

test("contentsQuery trata la ruta vacía como la raíz del repo", () => {
  const r = contentsQuery.safeParse({});
  assert.equal(r.success, true);
  assert.equal(r.data?.path, "");
});

test("uploadBody exige al menos un archivo y corta en 20", () => {
  const archivo = { path: "a.ts", content: "x" };
  assert.equal(uploadBody.safeParse({ files: [] }).success, false);
  assert.equal(uploadBody.safeParse({ files: [archivo] }).success, true);
  assert.equal(
    uploadBody.safeParse({ files: Array.from({ length: 21 }, () => archivo) }).success,
    false,
  );
});

test("uploadBody deja la carpeta destino vacía si no la mandan", () => {
  const r = uploadBody.safeParse({ files: [{ path: "a.ts", content: "x" }] });
  assert.equal(r.data?.directory, "");
});
