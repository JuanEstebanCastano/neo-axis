// Fija tema e idioma ANTES de pintar, para evitar el parpadeo del tema y el
// cambio de texto a mitad de carga.
//
// Vive como archivo externo (no inline) a propósito: el CSP del sitio es
// default-src 'self' y NO permite scripts inline, así que un <script> inline
// quedaba bloqueado y la preferencia nunca se restauraba al recargar.
(function () {
  var root = document.documentElement;

  try {
    var tema = localStorage.getItem("neoaxis-theme");
    if (tema !== "light" && tema !== "dark") {
      tema = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    root.setAttribute("data-theme", tema);

    // La barra del navegador móvil sigue al tema elegido, no al del sistema.
    // Los valores son --bg de tokens.css en cada tema.
    var barra = document.querySelector('meta[name="theme-color"]');
    if (barra) barra.setAttribute("content", tema === "dark" ? "#2a2d34" : "#e8ebf2");
  } catch {
    /* localStorage no disponible: se queda con el data-theme por defecto */
  }

  try {
    // A diferencia del tema, el idioma NO se adivina del navegador: el
    // español es el idioma base del producto y el inglés se pide a mano.
    var idioma = localStorage.getItem("neoaxis-lang");
    if (idioma === "es" || idioma === "en") root.setAttribute("lang", idioma);
  } catch {
    /* se queda con el lang por defecto del documento */
  }
})();
