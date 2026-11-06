/**
 * ORÍGENES PERMITIDOS
 * ──────────────────────────────────────────────────────────────────────
 * Una sola fuente de verdad para "¿este Origin está permitido?", usada tanto
 * por CORS como por la defensa CSRF. Así no se desincronizan.
 *
 * Acepta:
 *  (a) los orígenes EXACTOS de PUBLIC_WEB_ORIGIN (coma-separados), y
 *  (b) los previews de Vercel, ANCLADOS al slug del proyecto. Nunca un comodín
 *      *.vercel.app genérico (habilitaría cualquier sitio alojado en Vercel).
 */

import { config } from "../config.js";

export const exactOrigins = config.PUBLIC_WEB_ORIGIN.split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Previews de Vercel del proyecto: https://neo-axis-<lo-que-sea>.vercel.app
// Si el slug del proyecto en Vercel NO empieza con "neo-axis", ajustá este regex.
const VERCEL_PREVIEW_REGEX = /^https:\/\/neo-axis[a-z0-9-]*\.vercel\.app$/;

export function isAllowedOrigin(origin: string): boolean {
  return exactOrigins.includes(origin) || VERCEL_PREVIEW_REGEX.test(origin);
}
