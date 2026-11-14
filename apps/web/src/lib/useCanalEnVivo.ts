/**
 * ESCUCHAR UNA SECCIÓN
 * ──────────────────────────────────────────────────────────────────────
 * Abre la conexión por la que el servidor avisa de los mensajes nuevos y,
 * cuando llega uno, pide la lista otra vez.
 *
 * EventSource reconecta solo si se corta la red, así que no hace falta
 * escribir reintentos a mano. Y el refresco periódico de la consulta se
 * queda como red de seguridad: si el empuje fallara en silencio —el caso
 * malo de verdad, porque no da error en ningún sitio—, los mensajes
 * seguirían apareciendo, sólo que unos segundos más tarde.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiUrl } from "./api";

export function useCanalEnVivo(channelId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!channelId) return;
    // El navegador lo soporta desde hace años, pero si alguno no lo tiene,
    // la página sigue funcionando con el refresco periódico.
    if (typeof EventSource === "undefined") return;

    const fuente = new EventSource(apiUrl(`/channels/${channelId}/stream`), {
      withCredentials: true,
    });

    const alLlegar = () => {
      void qc.invalidateQueries({ queryKey: ["messages", channelId] });
    };

    fuente.addEventListener("mensaje", alLlegar);

    // Un error acá casi siempre es "se cortó la red". EventSource reintenta
    // por su cuenta, así que no cerramos: cerrar dejaría la sección muda
    // hasta recargar la página.
    fuente.onerror = () => undefined;

    return () => {
      fuente.removeEventListener("mensaje", alLlegar);
      fuente.close();
    };
  }, [channelId, qc]);
}
