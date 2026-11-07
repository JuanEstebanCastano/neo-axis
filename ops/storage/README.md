# Almacenamiento (S3 / Supabase Storage)

El código (`apps/api/src/lib/storage.ts`) es S3 genérico: funciona igual con MinIO
(dev) o con el endpoint S3-compatible de **Supabase Storage** (prod). Solo cambian
las variables `S3_*`.

## Estado actual

> **No hay archivos que migrar.** Al momento de escribir esto: `media_assets = 0`,
> `book_files = 0`, `post_images = 0`, videos con asset = 0. El script de copia
> queda listo para cuando haya objetos reales.

## Dónde saco las credenciales de Supabase Storage

Dashboard de Supabase → **Storage** → **S3 Connection** (o *S3 Access Keys*):
- **Endpoint:** `https://<project_ref>.storage.supabase.co/storage/v1/s3`
- **Region:** la que muestra esa pantalla (p. ej. `us-east-1` o la región del proyecto).
- **Access Key / Secret Key:** se generan ahí (son distintas del anon/service key).
- Creá el **bucket** con el MISMO nombre que usa `media_assets.bucket_name`
  (hoy, por defecto, `neoaxis-media`).
- `S3_FORCE_PATH_STYLE=true` (Supabase Storage requiere path-style).

## Copiar objetos de MinIO (VPS) a Supabase Storage

```bash
# 1) DRY-RUN (no escribe nada): revisás qué copiaría.
SRC_ENDPOINT=http://localhost:9000 SRC_ACCESS=... SRC_SECRET=... SRC_BUCKET=neoaxis-media \
DST_ENDPOINT=https://<ref>.storage.supabase.co/storage/v1/s3 DST_ACCESS=... DST_SECRET=... DST_BUCKET=neoaxis-media \
  ./ops/storage/mirror-minio-to-supabase.sh

# 2) Ejecutar de verdad:
... mismas variables ...  ./ops/storage/mirror-minio-to-supabase.sh --go
```

Es **idempotente** (`rclone sync` por checksum): podés correrlo las veces que haga falta.

## Verificar que las referencias de la base siguen resolviendo

`media_assets` guarda `(bucket_name, object_key)`; `book_files`, `post_images` y
`post_videos` apuntan a `media_assets` (no tienen bucket propio). Si copiás los
objetos **al mismo bucket y con las mismas keys** (rclone preserva las keys), las
URLs firmadas siguen resolviendo sin tocar la base.

Chequeos:

```sql
-- ¿Qué buckets referencia la base?
SELECT bucket_name, count(*) FROM app.media_assets GROUP BY bucket_name;
-- Muestra algunas keys para probar la descarga por el endpoint /book-files/:id/download
SELECT id, bucket_name, object_key FROM app.media_assets LIMIT 5;
```

Después corré `ops/storage/check-s3.mjs` contra Supabase (ver abajo) y probá una
descarga real por la API.

## Si el bucket cambia de nombre

Si en Supabase el bucket NO se llama igual que en MinIO, tenés dos opciones:
1. **Recomendado:** creá el bucket en Supabase con el MISMO nombre (`neoaxis-media`)
   → no tocás la base.
2. Si sí o sí cambia de nombre, actualizá la base (una sola tabla, el resto hereda):
   ```sql
   UPDATE app.media_assets SET bucket_name = 'NUEVO_BUCKET' WHERE bucket_name = 'neoaxis-media';
   ```

## Validar el endpoint S3 de Supabase ANTES de tocar el VPS

Ver `ops/storage/check-s3.mjs` (lista, sube, firma, descarga y borra un archivo de
prueba). Falla indicando cuál de los pasos rompió.
