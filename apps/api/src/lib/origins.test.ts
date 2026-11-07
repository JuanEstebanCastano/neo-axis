import { test } from "node:test";
import assert from "node:assert/strict";
import { makeOriginMatcher, VERCEL_PREVIEW_REGEX } from "./origins.js";

const allowed = makeOriginMatcher(["https://app.midominio.com"], VERCEL_PREVIEW_REGEX);

test("permite el origen exacto de producción", () => {
  assert.equal(allowed("https://app.midominio.com"), true);
});

test("permite un preview del slug correcto (deploy y alias de rama)", () => {
  assert.equal(allowed("https://neo-axis-ab12cd34-miequipo.vercel.app"), true);
  assert.equal(allowed("https://neo-axis-git-main-miequipo.vercel.app"), true);
});

test("rechaza un preview de OTRO proyecto en vercel.app", () => {
  assert.equal(allowed("https://otro-proyecto.vercel.app"), false);
  assert.equal(allowed("https://neoaxis.vercel.app"), false); // sin guion: no matchea el slug
});

test("rechaza un dominio hostil", () => {
  assert.equal(allowed("https://evil.example"), false);
  assert.equal(allowed("http://app.midominio.com"), false); // http, no https
});

test("permite la ausencia de Origin (mismo origen / curl / server-to-server)", () => {
  assert.equal(allowed(undefined), true);
  assert.equal(allowed(null), true);
  assert.equal(allowed(""), true);
});
