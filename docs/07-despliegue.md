# Despliegue

Tres piezas: **base de datos** (ya en Supabase), **API** (contenedor Node) y
**frontend** (sitio estático). El código ya está preparado para separarlas en
dominios distintos.

## 1. Base de datos — Supabase ✅
Ya está. El esquema vive en el schema `app` (ver `db/migrations/` y
`db/consolidated/`). Para una instancia nueva, aplicás las migraciones en orden.

## 2. API — contenedor Node
Hay un `apps/api/Dockerfile`. Desplegala en Render, Railway o Fly.io.

Variables de entorno (de `.env.example`):
- `DATABASE_URL` → Session pooler de Supabase + `sslmode=verify-full` + la CA
  (`ops/certs/supabase-root-2021-ca.crt`). En el contenedor, copiá la CA o usá
  `sslmode=no-verify` sólo si el proveedor no deja montar archivos.
- `NODE_ENV=production`
- `PUBLIC_WEB_ORIGIN=https://TU-FRONT.vercel.app` (uno o varios, separados por coma)
- `COOKIE_SAMESITE=none` (front y API en dominios distintos → cookie cross-site)
- `SESSION_SECRET` (32+ chars), `S3_*`, `SMTP_*`, `EMBEDDINGS_URL/TOKEN`.

> **Cookie cross-site:** con `COOKIE_SAMESITE=none` la cookie se marca `Secure`
> automáticamente; por eso la API debe servirse por **HTTPS**.

## 3. Frontend — sitio estático (Vercel / Netlify)
`apps/web` compila a estáticos (`pnpm --filter @neoaxis/web build` → `dist/`).
Hay un `apps/web/vercel.json` con el rewrite de SPA.

Variable de entorno:
- `VITE_API_URL=https://TU-API.onrender.com` (sin barra final)

En Vercel: *Root Directory* = `apps/web`, *Build* = `pnpm build`, *Output* = `dist`.

## Checklist de corte
1. API arriba por HTTPS, `/health` responde `ok`.
2. `PUBLIC_WEB_ORIGIN` incluye el dominio real del front.
3. `COOKIE_SAMESITE=none` si están en dominios distintos.
4. `VITE_API_URL` apunta a la API en el build del front.
5. Reseteá la contraseña de la base y poné la nueva en el `DATABASE_URL` del hosting.

## Alternativa monodominio
Si servís el front detrás de la misma URL que la API (reverse proxy `/` → front,
`/api` → API), dejá `COOKIE_SAMESITE=lax` y `VITE_API_URL` vacío. Es lo más
simple para cookies, pero requiere un proxy (Nginx/Caddy) adelante.
