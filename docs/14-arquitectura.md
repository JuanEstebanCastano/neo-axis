# Arquitectura: cómo está organizado el código

Este documento es el **mapa**: qué vive dónde y por qué, y dónde va un archivo
nuevo. Para el recorrido de los *datos* por dentro, mirá
[02-como-funciona.md](02-como-funciona.md); para por qué se eligió cada
herramienta, [05-decisiones.md](05-decisiones.md).

---

## Los tres programas y lo compartido

```
neo-axis/
├── apps/
│   ├── api/        El servidor HTTP (Fastify). Atiende al navegador.
│   ├── worker/     Proceso en segundo plano. Manda correos, limpia la base.
│   └── web/        El frontend (React + Vite). Se publica en Vercel, no en Docker.
├── packages/
│   └── db/         La conexión a Postgres y los tipos del esquema (Kysely).
├── db/migrations/  El esquema de la base, versionado (dbmate).
├── docs/           Esta documentación.
└── ops/            Infra de despliegue (Caddy, certificados, Railway).
```

`api` y `worker` **no hablan entre sí**: se comunican por la base de datos. El
worker mira una cola de correos (`email_notification_queue`) y la vacía; el API
sólo encola. Por eso escalar el worker es seguro (lo soporta `SKIP LOCKED`).

`packages/db` es el único que sabe de Kysely y del esquema. Todos lo importan
como `@neoaxis/db`; nadie arma su propia conexión.

---

## Dentro de `apps/api/src`: las capas

El API es un **monolito modular por feature**, con una separación de
responsabilidades clara y liviana —sin la ceremonia de puertos/adaptadores de
hexagonal estricto, pero con la misma idea de fondo: la lógica no depende del
framework ni se mezcla con el HTTP (ver [Relación con hexagonal](#relación-con-hexagonal)).

```
apps/api/src/
├── server.ts            Composición: arma Fastify, registra plugins y rutas.
│                        Es el único lugar donde se conoce TODO. Empezá a leer acá.
├── config.ts            Lee y VALIDA el entorno al arrancar. Si falta algo, no prende.
│
├── plugins/             Lo transversal, que atraviesa todas las rutas:
│   ├── db.ts            · inyecta la conexión (app.db)
│   ├── auth.ts          · resuelve la sesión y los permisos en cada request
│   └── realtime.ts      · el bus de "mensajes nuevos" (LISTEN/NOTIFY)
│
├── modules/<feature>/   Una carpeta por dominio. Cada una, las mismas piezas:
│   ├── routes.ts        · ADAPTADOR HTTP: define las rutas, valida con los
│   │                      schemas, llama al service y devuelve. Nada de SQL acá.
│   ├── service.ts       · LÓGICA DE APLICACIÓN + acceso a datos (consultas Kysely).
│   │                      Es el corazón del módulo; se puede usar sin HTTP.
│   ├── schemas.ts       · Las formas de entrada/salida (zod). El contrato.
│   └── <puro>.ts        · Lógica PURA, sin red ni base: se prueba con
│                          <puro>.test.ts al lado. Ej.: fileformat, slug, tree,
│                          canonical, filenames, el normalizar de openlibrary.
│
└── lib/                 Utilidades COMPARTIDAS entre módulos (con IO):
    ├── errors.ts        · errores HTTP tipados (badRequest, notFound, …)
    ├── session.ts       · emitir/verificar/anular sesiones
    ├── rbac.ts          · permisos y roles
    ├── search.ts        · índice de búsqueda y recomendaciones (pgvector)
    ├── storage.ts       · S3 (subir, descargar firmado, borrar)
    ├── embeddings.ts    · llama a la Edge Function de embeddings
    ├── realtime.ts      · serialización de los avisos del bus
    └── validation.ts    · formatea los errores de zod para que se entiendan
```

### La regla de una mirada

- ¿Es **HTTP** (una ruta, un status, una cabecera)? → `routes.ts`.
- ¿Es **lógica de negocio o una consulta**? → `service.ts`.
- ¿Es una **forma de datos** que entra o sale? → `schemas.ts`.
- ¿Es lógica **pura** (entra un dato, sale otro, sin red ni base)? → su propio
  `<nombre>.ts` + `<nombre>.test.ts`. Sacarla del service es lo que hace que se
  pueda probar sin levantar nada.
- ¿Lo usan **dos o más módulos** y toca IO? → `lib/`.
- ¿Atraviesa **todas** las rutas (sesión, base, tiempo real)? → `plugins/`.

---

## Dentro de `apps/worker/src`

```
apps/worker/src/
├── index.ts            Arranque: valida el entorno, arma el mailer y el loop.
├── jobs/
│   ├── email.ts        Toma un lote de la cola y lo manda. Reintentos con tope.
│   └── maintenance.ts  Limpieza periódica (sesiones vencidas, soft-deletes…).
└── lib/
    └── mailer.ts       Dos transportes (SMTP / MailerSend) tras una interfaz.
```

`mailer.ts` es un buen ejemplo de la idea hexagonal aplicada en chico: `Mailer`
es la interfaz (el "puerto"), y `createSmtpMailer` / `createMailerSendMailer`
son las dos implementaciones (los "adaptadores"). El resto del worker no sabe
cuál está usando.

---

## Pruebas

Los tests viven **al lado** del archivo que prueban (`x.ts` → `x.test.ts`) y
corren con el runner nativo de Node (`node --test`), sin framework. Se prueban
sobre todo las piezas **puras**: detección de formato, slugs, árbol de
comentarios, normalización del catálogo externo, validación de schemas. Lo que
toca base o red se verifica corriendo, no con mocks.

```bash
pnpm test        # las 116 pruebas
pnpm typecheck   # tipos de API, worker, db y web
pnpm lint        # eslint
```

---

## Relación con hexagonal

La estructura **no es hexagonal estricta**, y es una decisión, no un descuido:

| Hexagonal | Acá | Nota |
|---|---|---|
| Adaptador de entrada | `routes.ts` | Traduce HTTP ↔ llamada a la aplicación. |
| Aplicación + dominio | `service.ts` | Van juntos. En un proyecto de este tamaño, separarlos en dos capas más agrega indirección sin pagar. |
| Adaptadores de salida | `packages/db`, `lib/storage.ts`, los clientes (`openlibrary.ts`, `github/client.ts`), `mailer.ts` | El acceso a datos y a servicios externos está aislado en piezas propias. |
| Puertos (interfaces) | explícitos sólo donde hay **más de una** implementación (`Mailer`) | Crear una interfaz para un único adaptador sería ceremonia vacía. |

En resumen: se tomó lo que hexagonal resuelve de verdad —la lógica no depende
del framework, lo externo está aislado y lo puro se prueba solo— sin el costo de
capas y puertos que acá no pagarían. Si el proyecto creciera (varios orígenes de
datos por dominio, equipos separados), el paso natural sería extraer repositorios
como puertos; hoy no hace falta.
