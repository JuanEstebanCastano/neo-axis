/**
 * MENSAJES QUE LLEGAN SOLOS
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Avisa a los navegadores conectados de que una sección tiene un mensaje
 * nuevo, sin que tengan que preguntar cada pocos segundos.
 *
 * POR QUÉ SSE Y NO WEBSOCKETS
 * Lo único que hace falta es que el servidor empuje; las escrituras ya van
 * por POST con la cookie httpOnly y la verificación de Origin que hace el
 * servidor. Montar websockets obligaría a reimplementar esa defensa en el
 * handshake, y a cambio de nada visible.
 *
 * POR QUÉ HAY UN BUS Y NO UN set DE RESPUESTAS A SECAS
 * Con más de una réplica en Railway, cada una sólo conoce a SUS conectados.
 * Sin repartir el aviso entre réplicas, a la mitad de la gente deja de
 * llegarle los mensajes y NO HAY ERROR EN NINGÚN LOG: el fallo es mudo, que
 * es el peor tipo. Por eso el reparto va desde el primer día y por eso la
 * fuente de eventos es una interfaz con dos implementaciones.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

export interface AvisoDeMensaje {
  channelId: string;
  messageId: string;
}

type Oyente = (aviso: AvisoDeMensaje) => void;

/**
 * El reparto dentro de ESTE proceso. Quien escucha es cada conexión SSE
 * abierta contra esta réplica.
 */
export class BusDeEventos {
  private readonly porCanal = new Map<string, Set<Oyente>>();

  suscribir(channelId: string, oyente: Oyente): () => void {
    const actuales = this.porCanal.get(channelId) ?? new Set<Oyente>();
    actuales.add(oyente);
    this.porCanal.set(channelId, actuales);

    // Devolver la baja evita el error clásico: olvidarse de quitar al oyente
    // cuando el navegador cierra, y acumular conexiones muertas.
    return () => {
      const set = this.porCanal.get(channelId);
      if (!set) return;
      set.delete(oyente);
      if (set.size === 0) this.porCanal.delete(channelId);
    };
  }

  publicar(aviso: AvisoDeMensaje): void {
    const oyentes = this.porCanal.get(aviso.channelId);
    if (!oyentes) return;
    for (const oyente of oyentes) {
      try {
        oyente(aviso);
      } catch {
        // Un navegador que se fue a mitad de la escritura no puede tumbar el
        // aviso de los demás.
      }
    }
  }

  /** Cuántas conexiones hay abiertas; se usa para decidir si hace falta sondear. */
  get canalesActivos(): string[] {
    return [...this.porCanal.keys()];
  }

  get total(): number {
    let n = 0;
    for (const set of this.porCanal.values()) n += set.size;
    return n;
  }
}

/** De dónde salen los avisos. Dos implementaciones, una variable de entorno. */
export interface FuenteDeEventos {
  iniciar(): Promise<void>;
  detener(): Promise<void>;
}

/** El payload que viaja por pg_notify. Va mínimo a propósito. */
export function serializarAviso(aviso: AvisoDeMensaje): string {
  // pg_notify corta a 8000 bytes: se manda sólo el par de ids y el navegador
  // pide el detalle. Mandar el mensaje entero sería jugársela con cada texto
  // largo, y el fallo aparecería justo con el mensaje más interesante.
  return JSON.stringify(aviso);
}

export function parsearAviso(texto: string): AvisoDeMensaje | null {
  try {
    const dato = JSON.parse(texto) as Partial<AvisoDeMensaje>;
    if (typeof dato.channelId !== "string" || typeof dato.messageId !== "string") return null;
    return { channelId: dato.channelId, messageId: dato.messageId };
  } catch {
    // Lo que llega por el canal de Postgres es dato, no código: si no se
    // entiende, se descarta en silencio en vez de romper el proceso.
    return null;
  }
}

/** El nombre del canal de Postgres. Uno solo para todas las secciones. */
export const CANAL_PG = "neoaxis_mensajes";
