/**
 * CIFRADO DE CONTRASEÑAS
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Convierte una contraseña en un código del que NO se puede volver atrás.
 * Si alguien roba la base de datos, no obtiene las contraseñas reales.
 *
 * TENÉ EN CUENTA
 * Los números raros (19456, 2, 1) son los parámetros recomendados por OWASP.
 * Están calibrados para que probar contraseñas al azar sea lentísimo.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import { hash, verify } from "@node-rs/argon2";

// Argon2id con parámetros OWASP 2024: 19 MiB, 2 iteraciones, paralelismo 1.
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (plain: string): Promise<string> => hash(plain, OPTIONS);

export async function verifyPassword(digest: string, plain: string): Promise<boolean> {
  try {
    return await verify(digest, plain, OPTIONS);
  } catch {
    return false;
  }
}
