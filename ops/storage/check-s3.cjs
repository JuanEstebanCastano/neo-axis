#!/usr/bin/env node
/*
 * Verifica el endpoint S3-compatible (Supabase Storage) con las S3_* cargadas.
 * Hace, en orden: listar el bucket, subir un archivo de prueba, generar una URL
 * firmada, descargarla y borrar el archivo. Si algo rompe, sale 1 diciendo
 * EXACTAMENTE cuál de los 5 pasos falló.
 *
 * Correlo (desde la raíz del repo) con las S3_* de Supabase ya en el .env:
 *   NODE_PATH=apps/api/node_modules node --env-file=.env ops/storage/check-s3.cjs
 * (PowerShell: $env:NODE_PATH="apps/api/node_modules"; node --env-file=.env ops/storage/check-s3.cjs)
 *
 * NODE_PATH apunta a apps/api/node_modules porque ahí vive @aws-sdk (es S3
 * genérico, el mismo que usa la API).
 */
const {
  S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand, DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

function need(k) {
  const v = process.env[k];
  if (!v) { console.error(`Falta la variable ${k}`); process.exit(2); }
  return v;
}
const BUCKET = need("S3_BUCKET");
const s3 = new S3Client({
  endpoint: need("S3_ENDPOINT"),
  region: need("S3_REGION"),
  forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE) !== "false",
  credentials: { accessKeyId: need("S3_ACCESS_KEY"), secretAccessKey: need("S3_SECRET_KEY") },
});

const key = `healthcheck/check-${Date.now()}.txt`;
const body = `neo-axis storage check ${new Date().toISOString()}`;
const fail = (step, e) => {
  console.error(`\n❌ FALLÓ EN: ${step}\n   ${e && e.name ? e.name + ": " : ""}${(e && e.message) || e}`);
  process.exit(1);
};

(async () => {
  try {
    await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, MaxKeys: 1 }));
    console.log("1/5 listar bucket: OK");
  } catch (e) { fail("1) LISTAR el bucket (¿existe el bucket? ¿endpoint/region/keys correctos?)", e); }

  try {
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: "text/plain" }));
    console.log("2/5 subir archivo: OK");
  } catch (e) { fail("2) SUBIR (PutObject) (¿la key S3 tiene permiso de escritura?)", e); }

  let url;
  try {
    url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 120 });
    console.log("3/5 firmar URL de descarga: OK");
  } catch (e) { fail("3) FIRMAR la URL (getSignedUrl)", e); }

  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const txt = await r.text();
    if (txt !== body) throw new Error("el contenido descargado no coincide con el subido");
    console.log("4/5 descargar por URL firmada: OK");
  } catch (e) { fail("4) DESCARGAR la URL firmada (¿force_path_style? ¿firma válida contra Supabase?)", e); }

  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    console.log("5/5 borrar archivo: OK");
  } catch (e) { fail("5) BORRAR (DeleteObject)", e); }

  console.log("\n✅ Supabase Storage respondió a los 5 pasos. El presigner del AWS SDK funciona contra este endpoint.");
})();
