import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cabeceraMarkdown,
  mensajeAMarkdown,
  nombreDeExportacion,
} from "./export.js";

const BASE = {
  id: "1",
  createdAt: "2026-11-13T20:35:44.499Z",
  authorDisplayName: "Ana",
  authorUsername: "ana",
};

test("la cabecera lleva el nombre y, si hay, el tema", () => {
  assert.equal(cabeceraMarkdown({ name: "General", topic: null }), "# General\n");
  assert.match(cabeceraMarkdown({ name: "General", topic: "Bienvenida" }), /_Bienvenida_/);
});

test("un mensaje sale con autor y fecha legible", () => {
  const md = mensajeAMarkdown({ ...BASE, bodyMarkdown: "Hola a todos" });
  assert.match(md, /## Ana \(@ana\) · 2026-11-13 20:35/);
  assert.match(md, /Hola a todos/);
});

test("el texto del mensaje no puede romper la estructura del documento", () => {
  // Alguien escribe "# Título" o "> cita" dentro de su mensaje: sin escapar,
  // se convertiría en un encabezado del documento exportado.
  const md = mensajeAMarkdown({ ...BASE, bodyMarkdown: "# Soy un encabezado\n> y una cita" });
  assert.match(md, /\\# Soy un encabezado/);
  assert.match(md, /\\> y una cita/);
  // El encabezado real del mensaje sigue siendo el nuestro.
  assert.equal(md.match(/^## /gm)?.length, 1);
});

test("los adjuntos salen como lista, con enlace si lo tienen", () => {
  const md = mensajeAMarkdown({
    ...BASE,
    bodyMarkdown: "mirad esto",
    attachments: [
      {
        attachmentType: "repository",
        title: "castano/neo-axis",
        note: "el repo",
        canonicalUrl: "https://github.com/castano/neo-axis",
      },
      { attachmentType: "book", title: "Clean Architecture", note: null, canonicalUrl: null },
    ],
  });
  assert.match(md, /\[castano\/neo-axis\]\(https:\/\/github\.com\/castano\/neo-axis\) — el repo/);
  assert.match(md, /- book: Clean Architecture$/m);
});

test("las respuestas se sangran según su profundidad", () => {
  const md = mensajeAMarkdown({
    ...BASE,
    bodyMarkdown: "pregunta",
    comments: [
      { bodyMarkdown: "respuesta", createdAt: BASE.createdAt, authorDisplayName: "Ana", authorUsername: "ana", depth: 0 },
      { bodyMarkdown: "contra", createdAt: BASE.createdAt, authorDisplayName: "Ana", authorUsername: "ana", depth: 1 },
    ],
  });
  assert.match(md, /^- \*\*Ana\*\*.*respuesta$/m);
  assert.match(md, /^ {2}- \*\*Ana\*\*.*contra$/m);
});

test("un comentario de varias líneas no rompe su viñeta", () => {
  const md = mensajeAMarkdown({
    ...BASE,
    bodyMarkdown: "x",
    comments: [
      { bodyMarkdown: "linea uno\nlinea dos", createdAt: BASE.createdAt, authorDisplayName: "Ana", authorUsername: "ana", depth: 0 },
    ],
  });
  assert.match(md, /linea uno linea dos/);
});

test("el nombre del archivo es seguro y lleva la fecha", () => {
  const n = nombreDeExportacion("libros-y-resenas", "md");
  assert.match(n, /^libros-y-resenas-\d{4}-\d{2}-\d{2}\.md$/);
  // Un slug raro no puede convertirse en una ruta.
  assert.match(nombreDeExportacion("../../etc/passwd", "json"), /^etcpasswd-\d{4}-\d{2}-\d{2}\.json$/);
});
