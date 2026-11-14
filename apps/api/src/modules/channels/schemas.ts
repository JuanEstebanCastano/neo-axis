/** Esquemas de entrada de las secciones (puros). */
import { z } from "zod";

export const createChannelBody = z.object({
  name: z.string().min(2).max(120),
  // Si no lo mandan, se deriva del nombre con slugify().
  slug: z.string().min(2).max(100).optional(),
  description: z.string().max(2000).nullish(),
  topic: z.string().max(300).nullish(),
});

export const messagesQuery = z.object({
  /** Mensajes ANTERIORES a este id: es el scroll hacia atrás. */
  before: z.string().uuid().optional(),
  /** Mensajes POSTERIORES a este id: es el refresco automático. */
  after: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

/**
 * Todo mensaje lleva texto, y no es un capricho: posts_content_ck exige
 * título o cuerpo, y un mensaje sin ninguno de los dos reventaría con una
 * violación de restricción que el error handler convierte en un 500 que no
 * le dice nada a nadie. Mejor un 400 claro acá.
 */
export const createMessageBody = z.object({
  bodyMarkdown: z.string().trim().min(1).max(10_000),
  mentionedUserIds: z.array(z.string().uuid()).max(25).optional(),
});

export const attachmentBody = z.object({
  attachmentType: z.enum(["book", "repository", "snippet"]),
  /** El id del libro o del fragmento. Para repositorios se usa repoUrl. */
  targetId: z.string().uuid().optional(),
  /**
   * Un repositorio se adjunta por su dirección, no por un id: la tabla
   * app.github_repositories no la llena nadie más, así que el primero que lo
   * adjunta es quien lo da de alta.
   */
  repoUrl: z.string().min(3).max(300).optional(),
  note: z.string().max(300).nullish(),
}).refine(
  (v) => (v.attachmentType === "repository" ? Boolean(v.repoUrl) : Boolean(v.targetId)),
  "Falta el repositorio o el id de lo que querés adjuntar",
);
