/**
 * ALMACENAMIENTO DE OBJETOS (S3)
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Un único cliente S3 para todo el API y un helper para generar URLs
 * firmadas de descarga (válidas por unos minutos).
 *
 * TENÉ EN CUENTA
 * El API nunca sirve el archivo en sí: devuelve una URL temporal y el cliente
 * descarga directo del storage. Así el servidor no se satura con binarios.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";

export const s3 = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  forcePathStyle: config.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: config.S3_ACCESS_KEY,
    secretAccessKey: config.S3_SECRET_KEY,
  },
});

/** URL firmada de descarga. Expira en `expiresIn` segundos (5 min por defecto). */
export async function presignDownload(
  bucket: string,
  key: string,
  expiresIn = 300,
): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
}
