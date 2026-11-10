/**
 * En una SPA el navegador no reinicia el desplazamiento al cambiar de ruta:
 * quien bajaba por el feed y abría "Colecciones" aterrizaba a mitad de la
 * página siguiente, con el título fuera de pantalla. Esto lo devuelve arriba
 * en cada navegación nueva.
 *
 * El "atrás" del navegador queda exento: ahí la expectativa es volver al
 * punto exacto donde se estaba, y el propio navegador lo restaura.
 */
import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

export function ScrollToTop() {
  const { pathname } = useLocation();
  const tipo = useNavigationType();

  useEffect(() => {
    if (tipo === "POP") return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, tipo]);

  return null;
}
