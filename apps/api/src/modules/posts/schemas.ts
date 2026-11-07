/** Esquemas de entrada de posts (puros). */
import { z } from "zod";

export const createBody = z.object({
  title: z.string().max(240).nullish(),
  slug: z.string().max(280).nullish(),
  excerpt: z.string().max(500).nullish(),
  bodyMarkdown: z.string().max(100_000).nullish(),
  visibility: z.enum(["community", "restricted"]).default("community"),
  tagIds: z.array(z.string().uuid()).max(10).optional(),
  mentionedUserIds: z.array(z.string().uuid()).max(25).optional(),
}).refine(
  (v) => Boolean(v.title) || Boolean(v.bodyMarkdown?.trim()),
  "Un post necesita al menos título o cuerpo", // espeja posts_content_ck
);

export const feedQuery = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const searchQuery = z.object({
  q: z.string().min(2).max(200),
  type: z.enum(["post", "book", "comment", "user"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
