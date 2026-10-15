/**
 * ERRORES CON CÓDIGO HTTP
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Define los errores que el API puede devolver, cada uno con su número.
 * 400 = datos mal, 401 = no iniciaste sesión, 403 = no tenés permiso,
 * 404 = no existe, 409 = ya existe.
 *
 * TENÉ EN CUENTA
 * Usá estos en vez de `throw new Error(...)`. El servidor los traduce solo a
 * la respuesta correcta.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unauthorized = (msg = "No autenticado") => new AppError(401, "unauthorized", msg);
export const forbidden = (msg = "Sin permisos suficientes") => new AppError(403, "forbidden", msg);
export const notFound = (msg = "Recurso no encontrado") => new AppError(404, "not_found", msg);
export const conflict = (msg: string) => new AppError(409, "conflict", msg);
export const badRequest = (msg: string) => new AppError(400, "bad_request", msg);
