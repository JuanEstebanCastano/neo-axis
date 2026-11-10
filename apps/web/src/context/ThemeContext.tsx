import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => {} });

const STORAGE_KEY = "neoaxis-theme";

/** --bg de cada tema. Es el color con el que el teléfono pinta su barra. */
const BAR_COLOR: Record<Theme, string> = { light: "#e8ebf2", dark: "#2a2d34" };

/**
 * Tema inicial, por prioridad:
 *   1) lo guardado en localStorage (preferencia explícita del usuario),
 *   2) el data-theme que fijó prefs-init.js antes de pintar,
 *   3) la preferencia del sistema,
 *   4) "light".
 * Leer localStorage acá hace que la persistencia funcione aunque el script
 * previo al pintado no haya corrido (p. ej. bloqueado por CSP).
 */
function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* localStorage no disponible */ }

  if (document.documentElement.getAttribute("data-theme") === "dark") return "dark";

  try {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  } catch { /* matchMedia no disponible */ }

  return "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }

    // Sin esto, la barra del navegador móvil se quedaba con el color del
    // primer pintado y contrastaba contra la página al conmutar el tema.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", BAR_COLOR[theme]);
  }, [theme]);

  return (
    <ThemeCtx.Provider value={{ theme, toggle: () => setTheme((t) => (t === "light" ? "dark" : "light")) }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
