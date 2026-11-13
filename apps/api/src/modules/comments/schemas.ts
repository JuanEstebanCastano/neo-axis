/** Esquemas de entrada de comentarios (puros). */
import { z } from "zod";

export const createCommentBody = z.object({
  bodyMarkdown: z.string().trim().min(1).max(10_000),
  /** Responder a otro comentario del mismo hilo. */
  parentCommentId: z.string().uuid().optional(),
  mentionedUserIds: z.array(z.string().uuid()).max(25).optional(),
});
