# Migraciones (dbmate) contra Supabase

dbmate lleva su propia tabla de control: `public.schema_migrations` (una fila por
versión, el prefijo numérico del archivo). Las migraciones de `db/migrations/`
usan `uuidv7()` **nativo (PG18)**; Supabase es **PG17** y el esquema ya se aplicó
ahí vía `db/consolidated/neo_axis_supabase.sql` (con la función de compatibilidad
`app.uuidv7()`). Por eso, en Supabase, esas migraciones se **registran como ya
aplicadas** y dbmate solo corre las nuevas.

## Sincronización inicial (una sola vez por base Supabase)

Marca como aplicadas las migraciones que ya corrieron vía el SQL consolidado.
Ejecutá este SQL **una vez** (SQL Editor de Supabase, `psql`, o el MCP):

```sql
CREATE TABLE IF NOT EXISTS public.schema_migrations (version varchar(255) PRIMARY KEY);
INSERT INTO public.schema_migrations (version) VALUES
  ('20261015000001'),  -- init_schema
  ('20261015000002'),  -- review_fixes
  ('20261105120001'),  -- colecciones_biblioteca
  ('20261105120002')   -- pgvector_recomendaciones
ON CONFLICT (version) DO NOTHING;
```

> Ya ejecutado en el proyecto Supabase actual. Solo hace falta repetirlo si creás
> una base Supabase nueva a partir del consolidado.

La migración `20261106000001_uuidv7_compat.sql` **sí** la corre dbmate (es
`CREATE OR REPLACE`, idempotente): deja la función de compatibilidad versionada.

## Paso de deploy

Desde la raíz del repo, con `DATABASE_URL` apuntando a Supabase:

```bash
pnpm db:up   # = dbmate --migrations-dir ./db/migrations --no-dump-schema up
```

- `--no-dump-schema`: evita el `pg_dump` posterior (que falla contra Supabase por
  versión/ausencia de binario). Para ver el estado: `dbmate ... status`.
- **CA (TLS):** `DATABASE_URL` incluye `?sslmode=verify-full&sslrootcert=ops/certs/supabase-root-2021-ca.crt`.
  La ruta es **relativa a la raíz del repo**, así que corré `pnpm db:up` desde la
  raíz (o usá una ruta absoluta en CI).

## ¿Pooler o conexión directa para dbmate?

dbmate toma un **advisory lock** de Postgres durante la migración.

- **Session pooler (5432, el actual):** mantiene la sesión → el advisory lock y el
  estado de sesión funcionan. **Verificado: dbmate corre bien por acá.** Es la
  opción recomendada por simplicidad (ya está configurado).
- **Conexión directa (`db.<ref>.supabase.co`, 5432):** la más robusta para DDL,
  pero es **solo IPv6** (necesitás egress IPv6 en el CI/VPS). Usala solo si querés
  máxima aislación y tenés IPv6.
- **Transaction pooler (6543): NO.** Es por-statement → rompe advisory locks y
  prepared statements.

## Nueva migración

```bash
pnpm db:new nombre=lo_que_sea      # crea db/migrations/<ts>_lo_que_sea.sql
# editás up/down y luego:
pnpm db:up
```

## Estado de `public.schema_migrations` en Supabase (y cómo revertir)

Este trabajo **escribió en la base de producción** (creó `public.schema_migrations`,
insertó las 4 versiones existentes y `dbmate up` agregó `20261106000001`). git NO
revierte eso. Antes de este trabajo la tabla **no existía**.

**Consultar el estado actual:**
```sql
SELECT version FROM public.schema_migrations ORDER BY version;
-- Esperado: 20261015000001, 20261015000002, 20261105120001, 20261105120002, 20261106000001
```

**Revertir a como estaba (si descartás la rama `feat/hybrid-vercel`):**
```sql
-- Borra SOLO el bookkeeping de dbmate. El esquema real (tablas y la función
-- app.uuidv7()) queda intacto: se aplicó por el SQL consolidado vía MCP, no por
-- dbmate, así que esto no toca datos ni estructura.
DROP TABLE IF EXISTS public.schema_migrations;
```

> La migración `20261106000001_uuidv7_compat` solo hizo `CREATE OR REPLACE` de una
> función que ya existía (idempotente): no hay nada que deshacer en el esquema.
