# Variables de entorno en Railway

Cargá estas variables en el panel de cada servicio (Railway → servicio → Variables).
Formato `CLAVE=` (sin valores). El comentario dice de dónde sale cada una.

> Railway **inyecta `PORT`** automáticamente. **NO** cargues `PORT` ni `API_PORT`:
> la api ya escucha en `process.env.PORT`.

---

## Servicio: `api`

```
DATABASE_URL=            # Supabase → Project Settings → Database → Connection string (Session pooler, 5432). OJO sslrootcert (abajo).
NODE_ENV=                # production
SESSION_SECRET=          # generar: openssl rand -hex 32
SESSION_COOKIE_NAME=     # neoaxis_session
SESSION_TTL_DAYS=        # 30
COOKIE_SAMESITE=         # none  (front en Vercel y api en Railway = dominios distintos)
PUBLIC_WEB_ORIGIN=       # ⏳ PENDIENTE hasta tener la URL de Vercel: dominio de prod de la web (https://...)
S3_ENDPOINT=             # Supabase → Storage → S3 Connection (https://<ref>.storage.supabase.co/storage/v1/s3)
S3_REGION=               # Supabase → Storage → S3 Connection (la región que muestra)
S3_BUCKET=               # nombre del bucket (p. ej. neoaxis-media)
S3_ACCESS_KEY=           # Supabase → Storage → S3 Access Keys
S3_SECRET_KEY=           # Supabase → Storage → S3 Access Keys
S3_FORCE_PATH_STYLE=     # true
EMBEDDINGS_URL=          # Supabase → Edge Functions (https://<ref>.supabase.co/functions/v1/embed)
EMBEDDINGS_TOKEN=        # Supabase → Project Settings → API → anon key (pública, es un JWT)
GITHUB_CLIENT_ID=        # (opcional) GitHub → Developer settings → OAuth Apps
GITHUB_CLIENT_SECRET=    # (opcional) GitHub OAuth App
GOOGLE_CLIENT_ID=        # (opcional) Google Cloud Console → Credentials
GOOGLE_CLIENT_SECRET=    # (opcional) Google Cloud Console → Credentials
```

- **NO cargar**: `PORT` / `API_PORT` → los maneja Railway.
- **Pendiente (Vercel)**: `PUBLIC_WEB_ORIGIN` → recién cuando tengas el dominio de la web en Vercel. Los *previews* de Vercel ya se aceptan por el regex de `apps/api/src/lib/origins.ts` (no hay que listarlos).

## Servicio: `worker`

```
DATABASE_URL=            # la MISMA que api (Supabase pooler)
SMTP_HOST=               # tu proveedor SMTP (Resend / SES / Mailgun / etc.)
SMTP_PORT=               # 587 (o 465)
SMTP_USER=               # usuario / API key del proveedor SMTP
SMTP_PASSWORD=           # password / secret del proveedor SMTP
MAIL_FROM=               # "Neo Axis <no-reply@TU_DOMINIO>"
WORKER_BATCH_SIZE=       # 25
WORKER_POLL_MS=          # 5000
WORKER_MAX_ATTEMPTS=     # 5
```

- El worker **no** expone puerto ni web: no lleva `PORT`, `PUBLIC_WEB_ORIGIN`, `S3_*` ni `COOKIE_*`.

## Va en VERCEL, NO en Railway

```
VITE_API_URL=            # ⏳ PENDIENTE hasta tener la URL pública de la api en Railway.
                         #   (p. ej. https://neo-axis-api.up.railway.app). Se setea en Vercel,
                         #   Project → Settings → Environment Variables (Production + Preview).
```

---

## ⚠️ DATABASE_URL + `sslrootcert`: NO funciona tal cual en Railway

El `DATABASE_URL` que usamos lleva `...&sslmode=verify-full&sslrootcert=ops/certs/supabase-root-2021-ca.crt`,
una **ruta relativa al repo**. En Railway el contenedor corre desde `/app` con **solo
el paquete desplegado** (`pnpm deploy`): **`ops/certs/` NO está en la imagen**, así que
esa ruta no existe y el TLS fallaría.

Dos opciones (elegí una):

- **A) Segura (recomendada):** incluir la CA en la imagen y usar **ruta absoluta**.
  Requiere 1 línea en `apps/api/Dockerfile` y `apps/worker/Dockerfile`:
  ```dockerfile
  COPY ops/certs/supabase-root-2021-ca.crt /app/certs/supabase-ca.crt
  ```
  y en `DATABASE_URL`: `...&sslmode=verify-full&sslrootcert=/app/certs/supabase-ca.crt`.
  *(No lo apliqué todavía: toca los Dockerfiles. Decime y lo hago.)*

- **B) Simple (tu riesgo):** `...&sslmode=no-verify` → conexión **cifrada** pero **sin
  verificar** el certificado. No toca Dockerfiles. Es la que se usa habitualmente en
  PaaS que no permiten montar archivos.

> No uses `sslmode=require`: con el driver `pg` actual se comporta como verify y falla
> con "self-signed certificate in chain".
