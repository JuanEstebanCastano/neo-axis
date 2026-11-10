import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_LANG,
  LANG_STORAGE_KEY,
  formatDateTime,
  formatMonthYear,
  formatTimeAgo,
  isLang,
  localeOf,
  translate,
  type Lang,
  type TranslationKey,
  type Vars,
} from "../i18n";

interface I18nState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Texto traducido. `t("profile.memberSince", { date })` interpola. */
  t: (key: TranslationKey, vars?: Vars) => string;
  /** Elige entre singular y plural según `n`, y le pasa `{n}`. */
  tn: (n: number, one: TranslationKey, many: TranslationKey) => string;
  locale: string;
  dateTime: (iso: string) => string;
  monthYear: (iso: string) => string;
  timeAgo: (iso: string) => string;
}

const I18nCtx = createContext<I18nState>(null as unknown as I18nState);

/**
 * Idioma inicial, por prioridad:
 *   1) lo elegido antes y guardado en localStorage,
 *   2) el lang que dejó el script previo al pintado en <html>,
 *   3) español.
 *
 * El idioma del navegador NO entra en la cuenta a propósito: el español es
 * el idioma base del producto, y quien quiera inglés lo pide con el botón.
 */
function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* localStorage no disponible */
  }

  const fromHtml = document.documentElement.getAttribute("lang");
  if (isLang(fromHtml)) return fromHtml;

  return DEFAULT_LANG;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    // `lang` en <html> no es decorativo: de él dependen la separación
    // silábica, la ortografía del corrector y lo que anuncia el lector de
    // pantalla.
    document.documentElement.setAttribute("lang", lang);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      /* ignorar */
    }
  }, [lang]);

  const setLang = useCallback((next: Lang) => setLangState(next), []);

  const value = useMemo<I18nState>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
      tn: (n, one, many) => translate(lang, n === 1 ? one : many, { n }),
      locale: localeOf(lang),
      dateTime: (iso) => formatDateTime(lang, iso),
      monthYear: (iso) => formatMonthYear(lang, iso),
      timeAgo: (iso) => formatTimeAgo(lang, iso),
    }),
    [lang, setLang],
  );

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export const useI18n = () => useContext(I18nCtx);
