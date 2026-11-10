// Fija el tema (claro/oscuro) ANTES de pintar, para evitar el parpadeo.
// Vive como archivo externo (no inline) a propósito: el CSP del sitio es
// default-src 'self' y NO permite scripts inline, así que un <script> inline
// quedaba bloqueado y la preferencia nunca se restauraba al recargar.
(function () {
  try {
    var t = localStorage.getItem("neoaxis-theme");
    if (t !== "light" && t !== "dark") {
      t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", t);
  } catch {
    /* localStorage no disponible: se queda con el data-theme por defecto */
  }
})();
