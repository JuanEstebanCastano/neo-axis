/**
 * NOMBRES DE ARCHIVO PARA LOS GISTS (puro)
 * ──────────────────────────────────────────────────────────────────────
 * En un gist el archivo SIEMPRE tiene nombre, y su extensión es lo que hace
 * que GitHub coloree el código. Acá se decide ese nombre cuando el autor no
 * puso ninguno.
 *
 * Sin dependencias a propósito: así se prueba sin base de datos ni config.
 */

/** Extensión por lenguaje. Lo que no esté acá cae a .txt. */
const EXTENSIONES: Record<string, string> = {
  typescript: "ts", tsx: "tsx", javascript: "js", jsx: "jsx", python: "py",
  java: "java", csharp: "cs", "c#": "cs", c: "c", cpp: "cpp", "c++": "cpp",
  go: "go", rust: "rs", ruby: "rb", php: "php", kotlin: "kt", swift: "swift",
  sql: "sql", html: "html", css: "css", scss: "scss", bash: "sh", shell: "sh",
  powershell: "ps1", json: "json", yaml: "yml", markdown: "md", dart: "dart",
  scala: "scala", elixir: "ex", r: "r", lua: "lua",
};

/** "Debounce en TypeScript" + typescript -> "debounce-en-typescript.ts" */
export function nombreDeArchivo(
  title: string,
  language: string,
  filename?: string | null,
): string {
  if (filename && filename.trim()) return filename.trim();

  const base =
    title
      .toLowerCase()
      .normalize("NFD") // Separa la tilde de la letra...
      .replace(/[̀-ͯ]/g, "") // ...y la tilde se va.
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "snippet";

  return `${base}.${EXTENSIONES[language.toLowerCase()] ?? "txt"}`;
}
