/**
 * LLEVARSE UN DEBATE
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Convierte los mensajes de una sección en Markdown o en JSON, para
 * guardarlos fuera o pasárselos a alguien.
 *
 * TENÉ EN CUENTA
 * El formateo vive acá, separado de la ruta y sin tocar la base, para poder
 * probarlo con datos a mano. La ruta se encarga de leer por lotes y escribir
 * al stream: una sección con cincuenta mil mensajes no cabe en memoria.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

export interface AdjuntoExportado {
  attachmentType: "book" | "repository" | "snippet";
  title: string | null;
  note: string | null;
  canonicalUrl: string | null;
}

export interface MensajeExportado {
  id: string;
  bodyMarkdown: string | null;
  createdAt: string | Date;
  authorDisplayName: string;
  authorUsername: string;
  attachments?: AdjuntoExportado[] | undefined;
  comments?: ComentarioExportado[] | undefined;
}

export interface ComentarioExportado {
  bodyMarkdown: string;
  createdAt: string | Date;
  authorDisplayName: string;
  authorUsername: string;
  /** Profundidad en el hilo; 0 es una respuesta directa al mensaje. */
  depth: number;
}

function fecha(valor: string | Date): string {
  const d = valor instanceof Date ? valor : new Date(valor);
  // ISO recortado al minuto: un debate no necesita milisegundos, y así la
  // línea se lee de un vistazo.
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/**
 * Las citas de Markdown ('>') y los encabezados ('#') al principio de una
 * línea del mensaje romperían la estructura del documento. Se escapan para
 * que el texto se vea tal cual lo escribió su autor.
 */
function escaparBloques(texto: string): string {
  return texto
    .split("\n")
    .map((linea) => linea.replace(/^(\s*)([>#])/, "$1\\$2"))
    .join("\n");
}

export function cabeceraMarkdown(canal: { name: string; topic: string | null }): string {
  const lineas = [`# ${canal.name}`];
  if (canal.topic) lineas.push("", `_${canal.topic}_`);
  return lineas.join("\n") + "\n";
}

export function mensajeAMarkdown(m: MensajeExportado): string {
  const lineas: string[] = [];
  lineas.push("", `## ${m.authorDisplayName} (@${m.authorUsername}) · ${fecha(m.createdAt)}`, "");
  lineas.push(escaparBloques(m.bodyMarkdown ?? ""));

  if (m.attachments?.length) {
    lineas.push("", "**Adjuntos:**");
    for (const a of m.attachments) {
      const titulo = a.title ?? "(sin título)";
      const enlace = a.canonicalUrl ? `[${titulo}](${a.canonicalUrl})` : titulo;
      lineas.push(`- ${a.attachmentType}: ${enlace}${a.note ? ` — ${a.note}` : ""}`);
    }
  }

  if (m.comments?.length) {
    lineas.push("", "**Respuestas:**");
    for (const c of m.comments) {
      // Dos espacios por nivel: la anidación se ve sin ensuciar el texto.
      const sangria = "  ".repeat(c.depth);
      lineas.push(
        `${sangria}- **${c.authorDisplayName}** (${fecha(c.createdAt)}): ${escaparBloques(
          c.bodyMarkdown,
        ).replace(/\n/g, " ")}`,
      );
    }
  }

  return lineas.join("\n") + "\n";
}

/** Nombre del archivo que se descarga. */
export function nombreDeExportacion(slug: string, formato: "md" | "json"): string {
  const limpio = slug.replace(/[^a-z0-9-]/gi, "") || "seccion";
  const hoy = new Date().toISOString().slice(0, 10);
  return `${limpio}-${hoy}.${formato}`;
}
