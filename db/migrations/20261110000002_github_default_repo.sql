-- migrate:up

-- ============================================================
-- Repositorio elegido por el usuario
-- ============================================================
-- Guardamos el `owner/repo` con el que el usuario viene trabajando para no
-- hacerlo elegirlo otra vez en cada visita. Es una comodidad, no una fuente
-- de verdad: el repo vive en GitHub, acá sólo recordamos cuál miraba.
--
-- Sin FK ni tabla aparte a propósito: no somos dueños de ese dato. Si el
-- usuario renombra o borra el repo en GitHub, acá queda un nombre que ya no
-- resuelve, y la interfaz lo trata como "elegí otro".
ALTER TABLE app.github_connections
  ADD COLUMN default_repo varchar(255);

-- migrate:down
ALTER TABLE app.github_connections
  DROP COLUMN IF EXISTS default_repo;
