# Instalar y configurar con Docker

Esta guía alcanza para dejar Neo Axis corriendo en contenedores, de cero. Si
sólo querés levantarlo rápido en tu máquina para mirarlo, [00-empezar-aqui.md](00-empezar-aqui.md)
es más corto. Acá está el detalle de **qué contenedor es cada cosa y cómo se
configura cada variable**, para quien tiene que dejarlo andando en serio.

---

## Qué corre en Docker y qué no

El proyecto son cinco piezas, pero **no todas van en Docker**:

```
  EN DOCKER (este repo)                 FUERA (servicios gestionados)
  ┌──────────────┐
  │     api      │ ───────────────────▶ PostgreSQL   (Supabase)
  │ (Fastify)    │ ───────────────────▶ Object storage S3 (Supabase Storage)
  └──────┬───────┘
         │
  ┌──────┴───────┐
  │    worker    │ ───────────────────▶ SMTP / MailerSend (correo)
  │ (correos)    │
  └──────────────┘
  ┌──────────────┐
  │    caddy     │  reverse-proxy + TLS automático
  └──────────────┘

  El frontend (apps/web) NO va en Docker: se publica en Vercel.
  Su única variable (VITE_API_URL) se configura allá, no acá.
```

- **api** — atiende al navegador. No se publica al host: la alcanza Caddy.
- **worker** — manda los correos pendientes en segundo plano. Escalable.
- **caddy** — expone la API en tu dominio por HTTPS, con certificado automático.

Postgres, el storage y el correo son **externos y se configuran por `.env`**. Es
una decisión de fondo: la base (Supabase) y los archivos (Supabase Storage) no
se rehospedan en el contenedor para no cargar con copias de seguridad, TLS ni
disco. Para desarrollo local sí hay una infra desechable (ver el final).

---

## Los dos archivos de compose

| Archivo | Para qué | Qué levanta |
|---|---|---|
| `docker-compose.yml` | **Producción / correr la app en contenedores.** Lee `.env`. | `api`, `worker`, `caddy` |
| `docker-compose.dev.yml` | **Infra local de desarrollo.** No lee `.env`: trae sus propias credenciales desechables. | `postgres` (pgvector), `minio` (S3), `mailpit` (correo), `migrate` |

No se pisan: uno corre la aplicación, el otro simula los servicios externos para
poder trabajar sin tocar Supabase.

---

## 1. Requisitos

- **Docker** con Compose v2 (`docker compose`, con espacio, no `docker-compose`).
  - Windows / macOS: [Docker Desktop](https://www.docker.com/products/docker-desktop/)
  - Linux: `curl -fsSL https://get.docker.com | sh`
- Comprobalo: `docker --version` y `docker compose version`.
- Opcional: `make` (hay atajos) y Node 22+ (sólo para regenerar tipos; todo lo
  demás corre en contenedores).

---

## 2. Bajar el proyecto y crear el `.env`

```bash
git clone <url-del-repositorio>
cd neo-axis
make setup        # o, sin make:  cp .env.example .env
```

`make setup` copia `.env.example` a `.env` y le genera un `SESSION_SECRET` al
azar. **El resto de la configuración la ponés vos**, en la sección siguiente.

> El `.env` lleva secretos: ya está en `.gitignore`. Nunca lo subas al repo.

---

## 3. Configurar el `.env` (lo importante)

Cada variable, qué es y de dónde sale. Las marcadas **(obligatoria)** tienen que
tener un valor real o el API no arranca —falla al encender y dice cuál falta,
que es a propósito: mejor que fallar en el primer clic de alguien.

### Base de datos

| Variable | | Qué poner |
|---|---|---|
| `DATABASE_URL` | **(obligatoria)** | Cadena de conexión de Postgres. En Supabase: *Session pooler* (puerto 5432) con `sslmode=verify-full` y la CA del repo. Si el password tiene símbolos, URL-encodealos. |

Ejemplo (Supabase):
```
postgres://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=ops/certs/supabase-root-2021-ca.crt
```

### API y sesión

| Variable | | Qué poner |
|---|---|---|
| `PUBLIC_WEB_ORIGIN` | **(obligatoria)** | Dominio(s) del frontend, separados por coma (p. ej. `https://neo-axis.vercel.app`). Es el CORS. |
| `SESSION_SECRET` | **(obligatoria)** | Texto largo y secreto. Generalo con `openssl rand -hex 32` (`make setup` ya lo hace). |
| `COOKIE_SAMESITE` | | `none` si el front y la API están en dominios distintos (fuerza cookie *Secure*); `lax` si comparten dominio. Por defecto `lax`. |
| `API_PORT` | | Puerto interno del API. Por defecto `3000`; no hace falta cambiarlo. |
| `SESSION_COOKIE_NAME` / `SESSION_TTL_DAYS` | | Nombre y duración de la sesión. Valores por defecto razonables. |

### Object storage (S3 / Supabase Storage)

| Variable | | Qué poner |
|---|---|---|
| `S3_ENDPOINT` | **(obligatoria)** | Endpoint S3. En Supabase: `https://<ref>.storage.supabase.co/storage/v1/s3`. |
| `S3_REGION` | **(obligatoria)** | La región que muestra Supabase → Storage → *S3 Connection*. **Sin espacios**: la región se firma dentro del hostname, y un espacio tumba toda subida. |
| `S3_BUCKET` | **(obligatoria)** | Nombre del bucket, p. ej. `neoaxis-media`. Tiene que existir. |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | **(obligatorias)** | Clave S3. En Supabase: Storage → *S3 Access Keys* → generar. **Necesita permiso de escritura**, no sólo lectura. |
| `S3_FORCE_PATH_STYLE` | | `true` para Supabase/MinIO. Por defecto `true`. |
| `BOOK_FILE_MAX_MB` | | Tope de peso de un archivo de libro. Por defecto `25`. |

### Correo (lo usa el worker)

| Variable | | Qué poner |
|---|---|---|
| `MAIL_TRANSPORT` | | `smtp` o `mailersend`. Usá `mailersend` si el hosting bloquea SMTP saliente. |
| `MAIL_FROM` | **(obligatoria)** | Remitente, con el dominio verificado en el proveedor. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | | Requeridas **si** `MAIL_TRANSPORT=smtp`. |
| `MAILERSEND_API_KEY` | | Requerida **si** `MAIL_TRANSPORT=mailersend`. |
| `WORKER_BATCH_SIZE` / `WORKER_POLL_MS` / `WORKER_MAX_ATTEMPTS` | | Ritmo del worker. Valores por defecto razonables. |

### Integraciones opcionales

| Variable | | Qué poner |
|---|---|---|
| `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` + `GITHUB_CALLBACK_URL` + `TOKEN_ENCRYPTION_KEY` | | Snippets como gists de GitHub. **Van las cuatro juntas o ninguna**: si ponés el id y falta otra, el API no arranca. Ver [08-github-snippets.md](08-github-snippets.md). |
| `EMBEDDINGS_URL` + `EMBEDDINGS_TOKEN` | | Recomendaciones semánticas (Edge Function `embed` de Supabase). `EMBEDDINGS_TOKEN` es la *anon key*. Sin esto, `/recomendaciones` responde 503. |
| `REALTIME_SOURCE` | | De dónde salen los avisos de mensajes nuevos: `listen` (normal), `poll` o `off`. |

> **Un espacio pegado al copiar rompe la variable.** Ya pasó con `MAIL_TRANSPORT`,
> `SMTP_HOST` y `S3_REGION`. El API recorta los espacios al arrancar, pero
> revisá igual: pegá los valores sin espacios al principio ni al final.

---

## 4. Migraciones de la base

Las tablas se crean con **dbmate**, no por el contenedor del API.

- **Producción (Supabase):** aplicá las migraciones con dbmate apuntando al
  `DATABASE_URL` de Supabase, antes de levantar: `pnpm db:up`. Detalle en
  [07-despliegue.md](07-despliegue.md).
- **Local (infra de dev):** el `docker-compose.dev.yml` corre las migraciones
  solo (servicio `migrate`) contra su propia base. No tenés que hacer nada.

---

## 5. Levantar los contenedores

### En tu máquina (probar el compose de producción)

```bash
make dev           # equivale a:  docker compose up --build
```

La primera vez tarda unos minutos (construye las imágenes de `api` y `worker`).
Si no definís `API_DOMAIN`, Caddy sirve en `localhost` con su CA interna, útil
para probar. Apagar: `make stop`.

### En un VPS (producción real)

1. En el `.env` del servidor, definí el dominio público de la API:
   ```
   API_DOMAIN=api.midominio.com
   ```
   Caddy pide el certificado TLS para ese dominio solo (Let's Encrypt). El `80`
   y el `443` del host los toma Caddy; el `api` **no** se publica al host (lo
   alcanza Caddy por la red interna en `api:3000`).
2. Apuntá el DNS de `api.midominio.com` al servidor.
3. Levantá en segundo plano:
   ```bash
   docker compose up --build -d
   ```
4. El frontend va aparte en Vercel, con `VITE_API_URL=https://api.midominio.com`.

Más worker si hace falta: `docker compose up -d --scale worker=3` (lo soporta,
el reparto de trabajos usa `SKIP LOCKED`).

---

## 6. Comprobar que anda

```bash
# El API responde (dentro del server, o por el dominio si ya hay TLS)
curl http://localhost:3000/health      # {"status":"ok"} — sólo si publicaste el puerto
curl https://api.midominio.com/health  # en el VPS, a través de Caddy

docker compose ps                      # estado de los contenedores
make logs                              # logs de todos (o: make logs-api)
```

El `api` trae healthcheck propio: en `docker compose ps` figura como `healthy`
cuando `/health` responde.

---

## 7. Atajos del Makefile

| Comando | Qué hace |
|---|---|
| `make setup` | Prepara el `.env` la primera vez |
| `make dev` | Levanta todo (`docker compose up --build`) |
| `make stop` | Apaga (conserva los datos) |
| `make restart` | Reconstruye y reinicia en segundo plano |
| `make logs` / `make logs-api` / `make logs-worker` | Ver logs |
| `make reset` | **Borra** los datos locales y empieza de cero |
| `make doctor` | Revisa que el entorno esté bien |

`make` solo (sin argumentos) lista todo.

---

## 8. Alternativa: todo local, sin Supabase

Para desarrollar sin tocar Supabase, levantá la infra desechable:

```bash
docker compose -f docker-compose.dev.yml up
```

Esto arranca **Postgres** (con pgvector), **MinIO** (storage S3), **Mailpit**
(captura el correo, UI en http://localhost:8025) y corre las migraciones. Trae
credenciales locales fijas (`neoaxis/neoaxis/neoaxis`, `minioadmin/minioadmin`)
y **no lee tu `.env`**, para no migrar nunca contra producción por accidente.

Con la infra arriba, corré el API y el worker desde el host apuntando a esos
servicios locales (ver el bloque "DESARROLLO LOCAL" al final de `.env.example`
para los valores: Postgres en `localhost:5432` sin SSL, MinIO en
`localhost:9000`, etc.).

---

## 9. Si algo falla

- El API no arranca y el log dice qué variable falta → completá esa variable en
  `.env` (la validación de arranque es estricta a propósito).
- La subida de archivos devuelve error → revisá las `S3_*`, sobre todo que
  `S3_REGION` no tenga espacios y que la clave tenga permiso de escritura.
- Más casos en [04-problemas-comunes.md](04-problemas-comunes.md).
