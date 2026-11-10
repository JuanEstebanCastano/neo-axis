/**
 * CIFRADO DE SECRETOS GUARDADOS
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Guarda y recupera textos que el servidor necesita usar tal cual más tarde
 * (hoy: el token de GitHub de cada usuario). Cifra con AES-256-GCM.
 *
 * TENÉ EN CUENTA
 * Esto NO es lo mismo que una contraseña. Una contraseña se guarda hasheada y
 * nunca se recupera (ver lib/password.ts). Un token de GitHub hay que poder
 * leerlo para hablar con GitHub, así que se cifra. Si se filtra la base pero
 * no la clave, los tokens siguen siendo inservibles.
 *
 * GCM además autentica: si alguien toca un byte del sobre, el descifrado falla
 * en vez de devolver basura.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // Tamaño recomendado para GCM.
const TAG_BYTES = 16;

/** La clave llega en hexadecimal (64 caracteres = 32 bytes). */
export function parseEncryptionKey(hex: string): Buffer {
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY debe ser de 32 bytes en hexadecimal (64 caracteres)");
  }
  return key;
}

/**
 * Devuelve un sobre: iv (12) || authTag (16) || texto cifrado.
 * Se guarda como bytea en Postgres.
 */
export function encryptSecret(plaintext: string, key: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

/** Abre el sobre. Lanza si fue alterado o si la clave no es la correcta. */
export function decryptSecret(envelope: Buffer, key: Buffer): string {
  if (envelope.length <= IV_BYTES + TAG_BYTES) {
    throw new Error("Sobre cifrado inválido: demasiado corto");
  }
  const iv = envelope.subarray(0, IV_BYTES);
  const authTag = envelope.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = envelope.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
