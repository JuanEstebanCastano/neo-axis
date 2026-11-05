/**
 * FORMATO DE ERRORES DE VALIDACIÓN
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Convierte un error de zod en un texto legible ("campo: motivo; ...").
 *
 * TENÉ EN CUENTA
 * Reemplaza a `z.prettifyError`, que sólo existe en zod v4. El proyecto usa
 * zod v3, así que armamos el texto a mano desde `error.issues`.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import type { ZodError } from "zod";

export function prettifyZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}
