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
