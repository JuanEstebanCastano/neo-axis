/**
 * EMBEDDINGS
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Convierte un texto en un vector de 384 dimensiones llamando a la Edge
 * Function `embed` de Supabase (modelo gte-small).
 *
 * TENÉ EN CUENTA
 * El modelo corre en Supabase, no en Node. El API sólo pide el vector y después
 * lo guarda/consulta en app.search_documents.embedding.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import { config } from "../config.js";

export function embeddingsEnabled(): boolean {
  return Boolean(config.EMBEDDINGS_URL);
}

export async function embedText(text: string): Promise<number[]> {
  if (!config.EMBEDDINGS_URL) throw new Error("EMBEDDINGS_URL no configurada");

  const res = await fetch(config.EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.EMBEDDINGS_TOKEN ? { Authorization: `Bearer ${config.EMBEDDINGS_TOKEN}` } : {}),
    },
    body: JSON.stringify({ text }),
    // No colgar el request si la Edge Function no responde.
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`La función embed falló: HTTP ${res.status}`);

  const data = (await res.json()) as { embedding?: number[] };
  if (!Array.isArray(data.embedding)) throw new Error("Respuesta de embed inválida");
  return data.embedding;
}
