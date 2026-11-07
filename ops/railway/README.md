# Deploy de api + worker en Railway

Dos servicios Railway (uno por app), construidos con sus Dockerfiles. La web va a
Vercel y Postgres/Storage/embeddings siguen en Supabase.

## Por qué el contexto de build es la RAÍZ del monorepo

`apps/api/Dockerfile` y `apps/worker/Dockerfile` copian archivos de **fuera** de su
carpeta: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`,
`packages/db/` y su propia `apps/<app>/`. Por eso el build necesita el **repo
completo** como contexto.

→ En Railway: **NO** setees "Root Directory" a `apps/api` (eso excluiría la raíz y
`packages/db` y rompería el build). Dejá **Root Directory vacío** (raíz del repo).

## Config por servicio (lo que no puede ir solo en railway.json)

Railway **no busca** un `railway.json` anidado solo: hay que indicarle la ruta del
config file por servicio (y no sigue el Root Directory → es absoluta desde la raíz):

| Servicio | Root Directory | Config file path | Dockerfile (en el json) |
|---|---|---|---|
| api | *(vacío)* | `/apps/api/railway.json` | `apps/api/Dockerfile` |
| worker | *(vacío)* | `/apps/worker/railway.json` | `apps/worker/Dockerfile` |

Settings → "Config-as-Code / Railway Config File" de cada servicio → poné esa ruta.

> Alternativa sin railway.json: variable `RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile`
> por servicio. Elegimos railway.json para versionarlo.
>
> ⚠️ Railway marca "Config as Code" como legado (funciona hasta 2026-12-01). Si lo
> desaprueban, se replica lo mismo en la UI (builder Dockerfile + dockerfilePath).

## Variables de entorno (en Railway, por servicio)

Mismas que `.env.example`, pero cargadas en el panel de cada servicio:
- **api**: `DATABASE_URL`, `NODE_ENV=production`, `PUBLIC_WEB_ORIGIN`, `COOKIE_SAMESITE=none`,
  `SESSION_COOKIE_NAME`, `SESSION_TTL_DAYS`, `SESSION_SECRET`, `S3_*` (Supabase Storage),
  `EMBEDDINGS_URL`, `EMBEDDINGS_TOKEN`, (opc.) OAuth. **No** setees `API_PORT`: Railway
  inyecta `PORT` y la api ya escucha en `process.env.PORT`.
- **worker**: `DATABASE_URL`, `SMTP_*`, `MAIL_FROM`, `WORKER_*`.

El `CORS` del front: `PUBLIC_WEB_ORIGIN` = dominio de prod de Vercel; los previews se
aceptan por el regex de `apps/api/src/lib/origins.ts`.

## Puertos / dominios

- **api**: Railway inyecta `PORT` y publica el servicio. Generá un dominio en Railway
  (ej. `neo-axis-api.up.railway.app`) o un dominio propio → eso es el `VITE_API_URL`
  de Vercel y debe estar en `PUBLIC_WEB_ORIGIN` si alguna vez sirve la web (no es el caso).
  TLS lo da Railway (no hace falta Caddy).
- **worker**: NO expone puerto ni dominio (es un proceso de fondo). Railway lo corre
  como servicio persistente (loop infinito) sin problema.

## Migraciones

Railway no corre las migraciones. Son un paso aparte (CI o manual) **antes** del
deploy: `pnpm db:up` contra Supabase (ver `ops/dbmate/README.md`).

## Notas del worker

- No usa disco local (usa Supabase + SMTP). ✔
- No hay `depends_on` ni orden de arranque: conecta directo a Supabase (externo).
  `assertDatabaseReady` corre al boot; si Supabase no responde en ese instante, el
  proceso sale y Railway lo reinicia (`restartPolicyType: ON_FAILURE`).
