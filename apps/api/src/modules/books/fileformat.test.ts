import { test } from "node:test";
import assert from "node:assert/strict";
import { detectarFormato, claveDeObjeto, nombreDescarga } from "./fileformat.js";

/** Un EPUB como manda el estándar OCF: 'mimetype' en 30 y el tipo en 38. */
function epubOrdenado(): Buffer {
  const buf = Buffer.alloc(200, 0);
  Buffer.from([0x50, 0x4b, 0x03, 0x04]).copy(buf, 0);
  buf.write("mimetype", 30, "latin1");
  buf.write("application/epub+zip", 38, "latin1");
  return buf;
}

/** Un zip que es epub pero con el mimetype en cualquier parte. Pasa igual. */
function epubDesordenado(): Buffer {
  const buf = Buffer.alloc(900, 0x20);
  Buffer.from([0x50, 0x4b, 0x03, 0x04]).copy(buf, 0);
  buf.write("application/epub+zip", 600, "latin1");
  return buf;
}

function mobi(): Buffer {
  const buf = Buffer.alloc(120, 0);
  buf.write("Mi libro", 0, "latin1"); // nombre PalmDB
  buf.write("BOOKMOBI", 60, "latin1");
  return buf;
}

test("reconoce un epub bien armado", () => {
  assert.equal(detectarFormato(epubOrdenado()), "epub");
});

test("reconoce un epub con el zip desordenado", () => {
  assert.equal(detectarFormato(epubDesordenado()), "epub");
});

test("un zip cualquiera NO es un epub", () => {
  // Lo importante del archivo: sin esto, subir fotos.zip quedaría guardado
  // como libro y la biblioteca ofrecería descargarlo en formato epub.
  const zip = Buffer.alloc(500, 0);
  Buffer.from([0x50, 0x4b, 0x03, 0x04]).copy(zip, 0);
  zip.write("fotos/verano.jpg", 30, "latin1");
  assert.equal(detectarFormato(zip), null);
});

test("reconoce un pdf", () => {
  assert.equal(detectarFormato(Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj", "latin1")), "pdf");
});

test("reconoce un pdf con basura delante", () => {
  const buf = Buffer.concat([Buffer.alloc(300, 0x0a), Buffer.from("%PDF-1.4", "latin1")]);
  assert.equal(detectarFormato(buf), "pdf");
});

test("no reconoce un pdf cuya firma aparece pasado el primer kilobyte", () => {
  const buf = Buffer.concat([Buffer.alloc(2000, 0x0a), Buffer.from("%PDF-1.4", "latin1")]);
  assert.equal(detectarFormato(buf), null);
});

test("reconoce un mobi por la firma del byte 60", () => {
  assert.equal(detectarFormato(mobi()), "mobi");
});

test("un ejecutable renombrado no es ninguno de los tres", () => {
  // 'MZ' al inicio: un .exe de Windows al que le pusieron libro.epub.
  const exe = Buffer.concat([Buffer.from("MZ", "latin1"), Buffer.alloc(400, 0)]);
  assert.equal(detectarFormato(exe), null);
});

test("un archivo vacío o diminuto no rompe nada", () => {
  assert.equal(detectarFormato(Buffer.alloc(0)), null);
  assert.equal(detectarFormato(Buffer.from("PK", "latin1")), null);
});

test("la clave del objeto la arma el servidor, con la extensión del formato", () => {
  const clave = claveDeObjeto("01a1c757-b46b-7f88-84c3-d7251901599b", "epub", "abc123");
  assert.equal(clave, "libros/01a1c757-b46b-7f88-84c3-d7251901599b/abc123.epub");
});

test("la clave nunca toma el nombre que mandó el cliente", () => {
  // El token lo genera el servidor (crypto.randomUUID), así que no hay
  // '../' posible; esto deja constancia de la forma esperada.
  const clave = claveDeObjeto("b1", "pdf", "t1");
  assert.ok(!clave.includes(".."));
  assert.ok(clave.endsWith(".pdf"));
});

test("el nombre de descarga sale del título, sin tildes ni símbolos", () => {
  assert.equal(nombreDescarga("Cien años de soledad", "epub"), "cien-anos-de-soledad.epub");
  assert.equal(nombreDescarga("¿Qué es el Quijote?", "pdf"), "que-es-el-quijote.pdf");
});

test("un título impronunciable para una cabecera HTTP igual da un nombre usable", () => {
  // Comillas y saltos de línea romperían el Content-Disposition.
  assert.equal(nombreDescarga('El "libro"\n raro', "mobi"), "el-libro-raro.mobi");
  assert.equal(nombreDescarga("日本語", "epub"), "libro.epub");
});
