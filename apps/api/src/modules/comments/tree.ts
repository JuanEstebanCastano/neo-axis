/**
 * EL HILO, DE LISTA PLANA A ÁRBOL
 * ──────────────────────────────────────────────────────────────────────
 * La base guarda cada comentario con su padre (parent_comment_id). Traerlos
 * en una sola consulta y armar el árbol acá es mucho más barato que bajar
 * nivel por nivel, que es una consulta por rama.
 *
 * Función pura y con pruebas: la recursión sobre datos que vienen de la base
 * es justo donde un ciclo o un padre ausente te cuelga el servidor.
 */

export interface ComentarioPlano {
  id: string;
  parentCommentId: string | null;
}

export type ConHijos<T> = T & { replies: ConHijos<T>[] };

/**
 * Arma el árbol respetando el orden de entrada (más viejo primero).
 *
 * Un comentario cuyo padre no está en la lista —porque fue borrado u
 * ocultado— sube a la raíz en vez de desaparecer: perder la respuesta
 * porque se moderó la pregunta sería peor que mostrarla suelta.
 */
export function armarArbol<T extends ComentarioPlano>(planos: T[]): ConHijos<T>[] {
  const porId = new Map<string, ConHijos<T>>();
  for (const c of planos) porId.set(c.id, { ...c, replies: [] });

  const raices: ConHijos<T>[] = [];
  for (const c of planos) {
    const nodo = porId.get(c.id)!;
    const padre = c.parentCommentId ? porId.get(c.parentCommentId) : undefined;
    // El `padre !== nodo` corta el caso degenerado de un comentario que se
    // apunta a sí mismo: la base no lo impide y colgaría el recorrido.
    if (padre && padre !== nodo) padre.replies.push(nodo);
    else raices.push(nodo);
  }
  return raices;
}
