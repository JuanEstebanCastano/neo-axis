/**
 * Capa de idiomas: diccionarios, interpolación y formato de fechas.
 *
 * Es deliberadamente de andar por casa, sin dependencias: dos idiomas y un
 * par de cientos de textos no justifican una biblioteca de i18n. Lo que sí
 * importa es que el inglés esté tipado contra el español (ver en.ts), así que
 * un texto sin traducir no compila en vez de aparecer en blanco en pantalla.
 */
import { es, type TranslationKey } from "./es";
import { en } from "./en";

export type Lang = "es" | "en";
export type { TranslationKey };

export const LANGS: Lang[] = ["es", "en"];
export const DEFAULT_LANG: Lang = "es";
export const LANG_STORAGE_KEY = "neoaxis-lang";

const DICTIONARIES: Record<Lang, Record<TranslationKey, string>> = { es, en };

/** Etiqueta BCP-47 para fechas, números y ordenamiento. */
const LOCALES: Record<Lang, string> = { es: "es-CO", en: "en-US" };

export type Vars = Record<string, string | number>;

export function isLang(value: unknown): value is Lang {
  return value === "es" || value === "en";
}

/** Reemplaza `{nombre}` por su valor. Lo que no se pasa, se deja tal cual. */
function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function translate(lang: Lang, key: TranslationKey, vars?: Vars): string {
  // El español es la fuente de verdad: si algún día falta una clave en otro
  // idioma, se muestra el texto base en vez de la clave cruda.
  const text = DICTIONARIES[lang][key] ?? es[key];
  return interpolate(text, vars);
}

export function localeOf(lang: Lang): string {
  return LOCALES[lang];
}

// ── Fechas ────────────────────────────────────────────────────────────
// Todas las fechas de la interfaz pasan por acá, para que cambiar de idioma
// cambie también el formato y no quede "10 nov 2026" dentro de una pantalla
// en inglés.

export function formatDateTime(lang: Lang, iso: string): string {
  return new Date(iso).toLocaleString(localeOf(lang), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatShortDate(lang: Lang, iso: string): string {
  return new Date(iso).toLocaleDateString(localeOf(lang), { day: "numeric", month: "short" });
}

export function formatMonthYear(lang: Lang, iso: string): string {
  return new Date(iso).toLocaleDateString(localeOf(lang), { year: "numeric", month: "long" });
}

/** "hace 5 min" / "5 min ago", y fecha corta a partir de un día. */
export function formatTimeAgo(lang: Lang, iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return translate(lang, "time.justNow");
  if (seconds < 3600) return translate(lang, "time.minutes", { n: Math.floor(seconds / 60) });
  if (seconds < 86400) return translate(lang, "time.hours", { n: Math.floor(seconds / 3600) });
  return formatShortDate(lang, iso);
}
