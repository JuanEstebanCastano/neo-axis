/**
 * EL REPARTO DE AVISOS ENTRE RÉPLICAS
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Pone `app.bus` a disposición de las rutas y lo alimenta con los avisos
 * que llegan de Postgres, para que un mensaje escrito contra una réplica le
 * llegue a quien está mirando desde otra.
 *
 * TENÉ EN CUENTA
 * La conexión que escucha es un cliente de pg APARTE, nunca uno del pool de
 * Kysely: si se devuelve al pool, el LISTEN se pierde o se le cuela a otra
 * consulta. Es una conexión fija por réplica, y el pooler de Supabase tiene
 * un tope de clientes: hay que contarla.
 *
 * REALTIME_SOURCE es la salida de emergencia. Si el pooler reciclara la
 * conexión en silencio, se cambia a "poll" y el servicio sigue, sin tocar
 * código ni esperar un despliegue. Con "off" se apaga del todo y queda sólo
 * el refresco del navegador.
 *
 * Dudas de vocabulario -> docs/01-glosario.md
 */

import fp from "fastify-plugin";
import pg from "pg";
import type { Notification } from "pg";
import { config } from "../config.js";
import { BusDeEventos, CANAL_PG, parsearAviso } from "../lib/realtime.js";

declare module "fastify" {
  interface FastifyInstance {
    bus: BusDeEventos;
  }
}

/** Cada cuánto mira la fuente de reserva si hay mensajes nuevos. */
const SONDEO_MS = 1000;

export default fp(
  async (app) => {
    const bus = new BusDeEventos();
    app.decorate("bus", bus);

    const modo = config.REALTIME_SOURCE;
    if (modo === "off") {
      app.log.info("Tiempo real apagado (REALTIME_SOURCE=off)");
      return;
    }

    if (modo === "listen") {
      const cliente = new pg.Client({ connectionString: config.DATABASE_URL });

      cliente.on("notification", (msg: Notification) => {
        const aviso = msg.payload ? parsearAviso(msg.payload) : null;
        if (aviso) bus.publicar(aviso);
      });

      // Si la conexión se cae, el tiempo real deja de funcionar en silencio.
      // Al menos que quede dicho en el log, con lo que hay que hacer.
      cliente.on("error", (err: Error) => {
        app.log.error(
          { err },
          "Se cortó la conexión que escucha los mensajes nuevos. " +
            "Si se repite, poné REALTIME_SOURCE=poll.",
        );
      });

      await cliente.connect();
      await cliente.query(`LISTEN ${CANAL_PG}`);
      app.log.info("Escuchando mensajes nuevos por LISTEN/NOTIFY");

      app.addHook("onClose", async () => {
        await cliente.end().catch(() => undefined);
      });
      return;
    }

    // Fuente de reserva: una consulta por segundo y por réplica, no por
    // usuario. Mira sólo las secciones que alguien está viendo.
    let ultimoVisto: string | null = null;
    const timer = setInterval(() => {
      void (async () => {
        const canales = bus.canalesActivos;
        if (canales.length === 0) return;

        try {
          let q = app.db
            .selectFrom("posts")
            .select(["id", "channelId"])
            .where("channelId", "in", canales)
            .where("deletedAt", "is", null)
            .where("status", "=", "published")
            .where("hiddenAt", "is", null)
            .orderBy("id", "asc")
            .limit(100);

          if (ultimoVisto) q = q.where("id", ">", ultimoVisto);
          else q = q.orderBy("id", "desc").limit(1);

          const filas = await q.execute();
          for (const fila of filas) {
            ultimoVisto = fila.id as string;
            if (fila.channelId) {
              bus.publicar({ channelId: fila.channelId, messageId: fila.id as string });
            }
          }
        } catch (err) {
          // Un fallo puntual no puede matar el sondeo: el siguiente tic
          // vuelve a intentarlo.
          app.log.warn({ err }, "Falló el sondeo de mensajes nuevos");
        }
      })();
    }, SONDEO_MS);

    // unref: un temporizador no puede impedir que el proceso termine.
    timer.unref();
    app.log.info("Mensajes nuevos por sondeo (REALTIME_SOURCE=poll)");

    app.addHook("onClose", async () => {
      clearInterval(timer);
    });
  },
  { name: "realtime", dependencies: ["db"] },
);
