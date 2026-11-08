/** Esquemas de entrada de auth (puros, sin dependencias de servidor). */
import { z } from "zod";

export const registerBody = z.object({
  username: z.string().regex(/^[A-Za-z0-9_][A-Za-z0-9_-]{2,39}$/, "Username inválido"),
  displayName: z.string().min(1).max(120),
  email: z.string().email().max(320),
  password: z.string().min(12).max(200),
});

export const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const forgotPasswordBody = z.object({
  email: z.string().email().max(320),
});

export const resetPasswordBody = z.object({
  token: z.string().min(1, "Token faltante"),
  newPassword: z.string().min(12, "La contraseña debe tener al menos 12 caracteres").max(200),
});
