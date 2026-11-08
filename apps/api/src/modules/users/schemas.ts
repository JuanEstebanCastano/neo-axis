/** Esquemas de entrada del perfil de usuario (puros, sin dependencias de servidor). */
import { z } from "zod";

/**
 * Convierte "" (campo vaciado desde el formulario) y undefined en null, y luego
 * valida con el esquema dado permitiendo null. Así el usuario puede limpiar su
 * bio, sitio web o avatar enviando un string vacío.
 */
const emptyToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), schema.nullable());

export const updateProfileBody = z.object({
  displayName: z.string().min(1, "El nombre no puede estar vacío").max(120).optional(),
  bio: emptyToNull(z.string().max(2000)).optional(),
  websiteUrl: emptyToNull(z.string().url("El sitio web debe ser una URL válida").max(500)).optional(),
  avatarUrl: emptyToNull(z.string().url("El avatar debe ser una URL válida").max(500)).optional(),
});

export const changeEmailBody = z.object({
  email: z.string().email("Correo inválido").max(320),
  currentPassword: z.string().min(1, "Ingresá tu contraseña actual"),
});

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1, "Ingresá tu contraseña actual"),
  newPassword: z.string().min(12, "La nueva contraseña debe tener al menos 12 caracteres").max(200),
});

export const notificationPrefsBody = z
  .object({
    inAppEnabled: z.boolean(),
    emailEnabled: z.boolean(),
    emailMentions: z.boolean(),
    emailComments: z.boolean(),
    emailReactions: z.boolean(),
    emailFollows: z.boolean(),
    emailEvents: z.boolean(),
    emailModeration: z.boolean(),
  })
  .partial();
