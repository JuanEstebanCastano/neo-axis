-- migrate:up

-- ============================================================
-- Conexión con GitHub (OAuth) + snippets respaldados por gists
-- ============================================================
-- Cada usuario conecta SU cuenta de GitHub. El gist queda en su cuenta, con su
-- nombre en los commits; Neo Axis sólo guarda el vínculo y una copia local para
-- poder mostrar el snippet aunque GitHub esté caído o el token revocado.
--
-- El access_token NUNCA se guarda en claro: va cifrado con AES-256-GCM
-- (ver apps/api/src/lib/crypto.ts). Mismo criterio que app.auth_sessions, que
-- sólo guarda hashes. Acá no alcanza un hash porque el token hay que usarlo.
CREATE TABLE app.github_connections (
  id uuid PRIMARY KEY DEFAULT app.uuidv7(),
  user_id uuid NOT NULL UNIQUE REFERENCES app.users(id) ON DELETE CASCADE,
  -- Identidad en GitHub. El id numérico es el ancla estable: el login se puede
  -- cambiar, el id no.
  github_user_id bigint NOT NULL,
  github_login varchar(120) NOT NULL,
  github_avatar_url text,
  -- Sobre del token cifrado (iv || authTag || ciphertext).
  access_token_enc bytea NOT NULL,
  refresh_token_enc bytea,
  -- Las OAuth Apps clásicas devuelven tokens sin expiración; si la app tiene
  -- expiración activada, estos dos campos permiten refrescar sin reconectar.
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scopes text NOT NULL DEFAULT '',
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Una cuenta de GitHub no puede estar conectada a dos usuarios de Neo Axis.
  UNIQUE (github_user_id)
);

CREATE TRIGGER github_connections_set_updated_at
BEFORE UPDATE ON app.github_connections
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ── Vínculo snippet <-> gist ──────────────────────────────────────────
-- Un snippet puede vivir sólo en Neo Axis (gist_id NULL) o estar publicado en
-- GitHub. source_code sigue siendo la copia local de la última revisión vista.
ALTER TABLE app.post_snippets
  ADD COLUMN gist_id varchar(64),
  ADD COLUMN gist_html_url text,
  ADD COLUMN gist_owner_login varchar(120),
  -- SHA de la última revisión sincronizada. Permite detectar que alguien editó
  -- el gist desde GitHub y la copia local quedó vieja.
  ADD COLUMN gist_revision_sha varchar(64),
  ADD COLUMN gist_public boolean NOT NULL DEFAULT true,
  ADD COLUMN gist_synced_at timestamptz;

-- Para resolver "este gist ya está importado" sin escanear la tabla.
CREATE INDEX post_snippets_gist_id_idx
  ON app.post_snippets(gist_id) WHERE gist_id IS NOT NULL;

-- migrate:down
DROP INDEX IF EXISTS app.post_snippets_gist_id_idx;
ALTER TABLE app.post_snippets
  DROP COLUMN IF EXISTS gist_id,
  DROP COLUMN IF EXISTS gist_html_url,
  DROP COLUMN IF EXISTS gist_owner_login,
  DROP COLUMN IF EXISTS gist_revision_sha,
  DROP COLUMN IF EXISTS gist_public,
  DROP COLUMN IF EXISTS gist_synced_at;
DROP TABLE IF EXISTS app.github_connections;
