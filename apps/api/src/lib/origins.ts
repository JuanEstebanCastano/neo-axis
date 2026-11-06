/**
 * ORÍGENES PERMITIDOS
 * ──────────────────────────────────────────────────────────────────────
 * Una sola fuente de verdad para "¿este Origin está permitido?", usada por CORS
 * y por la defensa CSRF. La lógica es pura (no importa config) para poder
 * testearla; server.ts la instancia con los valores reales.
 *
 * Acepta:
 *  (a) los orígenes EXACTOS de PUBLIC_WEB_ORIGIN,
 *  (b) los previews de Vercel ANCLADOS al slug del proyecto,
 *  (c) la AUSENCIA de Origin (mismo origen, curl, server-to-server).
 */

/**
 * Previews de Vercel. Vercel arma las URLs así (OJO: usa el slug del PROYECTO en
 * Vercel, que puede NO coincidir con el nombre del repo):
 *   https://<project-slug>-<hash-único>-<team-slug>.vercel.app   (deploy)
 *   https://<project-slug>-git-<branch>-<team-slug>.vercel.app   (alias de rama)
 *
 * Por eso anclamos al prefijo del slug y aceptamos cualquier sufijo. NUNCA un
 * comodín *.vercel.app genérico (habilitaría cualquier sitio alojado en Vercel).
 *
 * 👉 AJUSTÁ ESTO si tu slug de proyecto en Vercel no empieza con "neo-axis".
 *    Cómo leer el slug real (no el del repo):
 *    - Dashboard de Vercel → tu Proyecto → Settings → General → "Project Name".
 *    - O abrí cualquier Preview y leé el subdominio ANTES del primer "-git-" o
 *      del hash: `https://ESE-SLUG-....vercel.app`.
 */
export const VERCEL_PREVIEW_REGEX = /^https:\/\/neo-axis[a-z0-9-]*\.vercel\.app$/;

/** Fábrica pura: decide si un Origin (o su ausencia) está permitido. */
export function makeOriginMatcher(exactOrigins: string[], previewRegex: RegExp) {
  return (origin: string | null | undefined): boolean =>
    !origin || exactOrigins.includes(origin) || previewRegex.test(origin);
}
