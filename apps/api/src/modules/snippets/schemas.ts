/** Esquemas de entrada de snippets (puros). */
import { z } from "zod";

export const createBody = z.object({
  title: z.string().min(1).max(240),
  language: z.string().min(1).max(80),
  sourceCode: z.string().min(1).max(20000),
  description: z.string().max(1000).nullish(),
  filename: z.string().max(255).nullish(),
});
