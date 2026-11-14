/**
 * ALMACENAMIENTO DE OBJETOS (S3)
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Un único cliente S3 para todo el API: URLs firmadas de descarga (válidas
 * por unos minutos), subida y borrado de objetos.
 *
 * TENÉ EN CUENTA
 * La DESCARGA nunca pasa por acá: el API devuelve una URL temporal y el
 * cliente baja directo del storage, así el servidor no se satura con
 * binarios. La SUBIDA sí pasa por el API, y es a propósito: es la única
 * forma de medir el tamaño de verdad, calcular el checksum y mirar los
 * primeros bytes antes de guardar nada. Con una URL firmada de subida el
 * servidor no ve el archivo y tendría que creerle al cliente lo que diga.
 * Subir un libro es raro; descargarlo es constante. El costo está donde
 * casi no ocurre.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
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

/**
 * URL firmada de descarga. Expira en `expiresIn` segundos (5 min por defecto).
 *
 * `filename` viaja DENTRO de la firma (ResponseContentDisposition): el
 * navegador baja directo del storage, así que una cabecera que pusiera el API
 * no la vería nadie. Sin esto, el archivo cae con el nombre del objeto, que
 * es un uuid.
 */
export async function presignDownload(
  bucket: string,
  key: string,
  expiresIn = 300,
  opts: { filename?: string } = {},
): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: opts.filename
        ? `attachment; filename="${opts.filename}"`
        : undefined,
    }),
    { expiresIn },
  );
}

/**
 * Guarda un objeto. `contentType` viaja con él porque es lo que verá el
 * navegador al abrir la URL firmada: sin eso, un EPUB se descarga como
 * application/octet-stream y el lector de turno no lo reconoce.
 */
export async function putObject(
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

/**
 * Borra un objeto. S3 no se queja si la clave no existe, así que esto sirve
 * igual para limpiar lo que quedó a medias cuando la escritura en la base
 * falla después de haber subido el archivo.
 */
export async function deleteObject(bucket: string, key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
