import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAuthorizeUrl, parseGistId } from "./client.js";

test("parseGistId acepta el id pelado", () => {
  assert.equal(parseGistId("aa84bc0cec68a7d9b5b1f5e2f7d9a0e1"), "aa84bc0cec68a7d9b5b1f5e2f7d9a0e1");
  assert.equal(parseGistId("  aa84bc0cec68a7d9b5b1f5e2f7d9a0e1  "), "aa84bc0cec68a7d9b5b1f5e2f7d9a0e1");
});

test("parseGistId acepta la URL que copia el usuario", () => {
  assert.equal(
    parseGistId("https://gist.github.com/alguien/aa84bc0cec68a7d9b5b1f5e2f7d9a0e1"),
    "aa84bc0cec68a7d9b5b1f5e2f7d9a0e1",
  );
});

test("parseGistId rechaza lo que no es un gist", () => {
  assert.equal(parseGistId("https://github.com/usuario/repo"), null);
  assert.equal(parseGistId("no-es-un-id"), null);
  assert.equal(parseGistId(""), null);
  // Un host parecido no alcanza: tiene que ser gist.github.com.
  assert.equal(parseGistId("https://gist.github.com.falso.com/x/aa84bc0cec68a7d9b5b1f5e2f7d9a0e1"), null);
});

test("buildAuthorizeUrl arma la URL con scopes separados por espacio y el state", () => {
  const url = new URL(
    buildAuthorizeUrl({
      clientId: "Iv1.ejemplo",
      redirectUri: "https://api.ejemplo.com/api/v1/github/callback",
      state: "estado-al-azar",
      scopes: ["gist", "read:user"],
    }),
  );
  assert.equal(url.origin + url.pathname, "https://github.com/login/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "Iv1.ejemplo");
  assert.equal(url.searchParams.get("scope"), "gist read:user");
  assert.equal(url.searchParams.get("state"), "estado-al-azar");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://api.ejemplo.com/api/v1/github/callback",
  );
});
