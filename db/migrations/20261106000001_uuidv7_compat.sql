-- migrate:up

-- Función de compatibilidad uuidv7() para PostgreSQL < 18 (Supabase corre PG17).
-- En PG18 existe uuidv7() nativo; esta vive en el esquema app y el código la
-- resuelve por search_path=app,public. Es idempotente (CREATE OR REPLACE), así
-- que correrla cuando ya existe en Supabase no hace daño.
--
-- NOTA: las migraciones iniciales (20261015000001/2, 20261105120001/2) usan el
-- uuidv7() NATIVO (PG18). En Supabase ya están aplicadas y se registran como
-- tales (ver ops/dbmate/README), por eso su uuidv7() nativo nunca se ejecuta ahí.

CREATE OR REPLACE FUNCTION app.uuidv7()
RETURNS uuid
LANGUAGE sql
VOLATILE
SET search_path = pg_catalog
AS $$
  SELECT encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          PLACING substring(int8send((extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
          FROM 1 FOR 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid;
$$;

-- migrate:down
DROP FUNCTION IF EXISTS app.uuidv7();
