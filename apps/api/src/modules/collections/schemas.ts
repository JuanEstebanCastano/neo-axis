/** Esquemas de entrada de colecciones (puros). */
import { z } from "zod";

export const createBody = z.object({
  title: z.string().min(1).max(240),
  slug: z.string().max(280).nullish(),
  description: z.string().max(5000).nullish(),
  visibility: z.enum(["community", "restricted"]).default("community"),
});

export const itemBody = z.object({
  itemType: z.enum(["book", "repository", "snippet", "post"]),
  bookId: z.string().uuid().optional(),
  repositoryId: z.string().uuid().optional(),
  snippetId: z.string().uuid().optional(),
  postId: z.string().uuid().optional(),
  note: z.string().max(500).nullish(),
  sortOrder: z.coerce.number().int().min(0).max(32767).optional(),
});
