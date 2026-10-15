# apps/worker — El trabajador de fondo

Un programa que corre solo, sin que nadie lo llame, haciendo las tareas lentas.

## Qué hace

```
cada 5 segundos:
   ¿hay correos pendientes en la cola?
      sí → enviarlos y marcarlos como enviados
      no → dormir

cada hora (aprox.):
   limpiar sesiones vencidas
```

## Por qué existe separado del API

Enviar un correo puede tardar 3 segundos o fallar porque el servidor de correo
está caído.

Si lo hiciera el API, la persona que publicó algo vería la pantalla congelada
esperando que salga un correo que **ni siquiera es para ella**. Y si el correo
fallara, se perdería la publicación entera.

Con el worker aparte: el API guarda la publicación, anota "hay que mandar este
correo" y responde al instante. El worker lo manda cuando pueda.

## La cola es una tabla

No usamos Redis ni ningún sistema de colas externo. La tabla
`email_notification_queue` ya hace ese trabajo: tiene estado, cantidad de
intentos, fecha programada y último error.

Postgres permite que varios workers tomen tareas distintas sin pisarse
(`FOR UPDATE SKIP LOCKED`). Así que se puede escalar:

```bash
docker compose up --scale worker=3
```

Tres workers repartiéndose la cola, sin que dos tomen el mismo correo.

## Reintentos

Si un correo falla, no se descarta: se reprograma con esperas crecientes.

```
intento 1 falla → reintentar en 1 minuto
intento 2 falla → en 2 minutos
intento 3 falla → en 4 minutos
intento 4 falla → en 8 minutos
intento 5 falla → marcado como 'failed', alguien lo revisa
```

Se llama *espera exponencial* y evita castigar a un servidor que ya está en
problemas.

## Ver qué está haciendo

```bash
make logs-worker
```

Los correos enviados en desarrollo no salen a internet: los atrapa Mailpit, en
http://localhost:8025
