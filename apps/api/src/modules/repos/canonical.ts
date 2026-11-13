/**
 * LA DIRECCIÓN CANÓNICA DE UN REPOSITORIO
 * ──────────────────────────────────────────────────────────────────────
 * "Castano/Neo-Axis", "github.com/castano/neo-axis/", "https://GitHub.com/
 * Castano/Neo-Axis.git" son el mismo repositorio. Si cada forma entra tal
 * cual a la base, el índice único de canonical_url no sirve de nada y el
 * mismo repo aparece tres veces en la lista.
 *
 * Función pura y con pruebas: es la que decide si dos cosas son la misma.
 *
 * OJO con las mayúsculas. GitHub no distingue mayúsculas para resolver un
 * repositorio, pero sí conserva cómo lo escribió su dueño. Acá se guarda en
 * minúsculas para comparar, y el nombre "bonito" se guarda aparte en
 * repository_name.
 */

/** Dueño y nombre, tal como GitHub los llama. */
export interface RepoRef {
  owner: string;
  repo: string;
  /** "owner/repo" en minúsculas: lo que se compara. */
  fullName: string;
  /** La URL que se guarda en canonical_url. */
  canonicalUrl: string;
}

// GitHub permite letras, números, guion, guion bajo y punto. El nombre no
// puede ser sólo puntos, pero eso lo rechaza la propia API; acá basta con
// no aceptar barras ni espacios, que es lo que rompería la URL.
const SEGMENTO = /^[A-Za-z0-9._-]+$/;

/**
 * Acepta "owner/repo" o cualquier URL de GitHub y devuelve la forma
 * canónica. Devuelve null si no se parece a un repositorio: quien llame
 * decide el error, para que el mensaje lo ponga la ruta y no esta función.
 */
export function canonicalizarRepo(entrada: string): RepoRef | null {
  const texto = entrada.trim();
  if (!texto) return null;

  let owner: string | undefined;
  let repo: string | undefined;

  if (texto.includes("://") || texto.toLowerCase().startsWith("github.com")) {
    // Sin esquema, URL() no puede parsear: se lo ponemos para no tener que
    // partir la cadena a mano.
    const conEsquema = texto.includes("://") ? texto : `https://${texto}`;
    let url: URL;
    try {
      url = new URL(conEsquema);
    } catch {
      return null;
    }

    // Sólo github.com. Un enlace a otro servidor no es un repo de GitHub, y
    // aceptarlo guardaría una fila que después nadie puede abrir.
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "github.com") return null;

    const partes = url.pathname.split("/").filter(Boolean);
    owner = partes[0];
    repo = partes[1];
  } else {
    const partes = texto.split("/").filter(Boolean);
    // Más de dos partes sería una ruta dentro del repo, no el repo.
    if (partes.length !== 2) return null;
    owner = partes[0];
    repo = partes[1];
  }

  if (!owner || !repo) return null;

  // ".git" al final es cómo se clona, no cómo se nombra.
  repo = repo.replace(/\.git$/i, "");

  if (!SEGMENTO.test(owner) || !SEGMENTO.test(repo)) return null;

  const ownerLower = owner.toLowerCase();
  const repoLower = repo.toLowerCase();

  return {
    owner,
    repo,
    fullName: `${ownerLower}/${repoLower}`,
    canonicalUrl: `https://github.com/${ownerLower}/${repoLower}`,
  };
}
