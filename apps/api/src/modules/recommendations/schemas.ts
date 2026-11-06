/** Esquemas de entrada de recomendaciones (puros). */
import { z } from "zod";

export const recommendQuery = z.object({
  entityId: z.string().uuid().optional(),
  q: z.string().min(2).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
