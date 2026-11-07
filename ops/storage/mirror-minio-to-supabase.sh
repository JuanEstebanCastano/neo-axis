#!/usr/bin/env bash
# Copia (idempotente) el bucket de MinIO del VPS a Supabase Storage.
#
# Usa rclone `sync`: copia solo lo que falta o cambió (checksum), se puede correr
# varias veces sin duplicar, y conecta dos remotos S3 de proveedores distintos.
# Por defecto corre en DRY-RUN (no escribe nada). Pasá --go para ejecutar.
#
# Requisitos: rclone instalado. Variables de entorno (no se persisten en disco):
#   Origen (MinIO):    SRC_ENDPOINT SRC_ACCESS SRC_SECRET SRC_BUCKET
#   Destino (Supabase): DST_ENDPOINT DST_ACCESS DST_SECRET DST_BUCKET
#
# Ejemplo:
#   SRC_ENDPOINT=http://localhost:9000 SRC_ACCESS=minioadmin SRC_SECRET=minioadmin \
#   SRC_BUCKET=neoaxis-media \
#   DST_ENDPOINT=https://<ref>.storage.supabase.co/storage/v1/s3 \
#   DST_ACCESS=... DST_SECRET=... DST_BUCKET=neoaxis-media \
#   ./ops/storage/mirror-minio-to-supabase.sh          # dry-run
#   ... mismas vars ...  ./ops/storage/mirror-minio-to-supabase.sh --go   # ejecuta
set -euo pipefail

: "${SRC_ENDPOINT:?falta SRC_ENDPOINT}"; : "${SRC_ACCESS:?}"; : "${SRC_SECRET:?}"; : "${SRC_BUCKET:?}"
: "${DST_ENDPOINT:?falta DST_ENDPOINT}"; : "${DST_ACCESS:?}"; : "${DST_SECRET:?}"; : "${DST_BUCKET:?}"

DRY="--dry-run"
if [[ "${1:-}" == "--go" ]]; then DRY=""; echo ">> MODO REAL (escribe en Supabase)"; else echo ">> DRY-RUN (no escribe). Pasá --go para ejecutar."; fi

SRC=":s3,provider=Minio,access_key_id=${SRC_ACCESS},secret_access_key=${SRC_SECRET},endpoint=${SRC_ENDPOINT}:${SRC_BUCKET}"
# Supabase Storage necesita path-style.
DST=":s3,provider=Other,access_key_id=${DST_ACCESS},secret_access_key=${DST_SECRET},endpoint=${DST_ENDPOINT},force_path_style=true:${DST_BUCKET}"

echo ">> Copiando ${SRC_BUCKET} (MinIO) -> ${DST_BUCKET} (Supabase)"
rclone sync "${SRC}" "${DST}" ${DRY} --progress --checksum

echo ">> Listo. Verificá con ops/storage/check-s3.mjs y el README."
