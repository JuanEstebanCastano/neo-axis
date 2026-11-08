-- migrate:up

-- Tokens de restablecimiento de contraseña. Mismo patrón que app.auth_sessions:
-- se guarda SOLO el hash del token (bytea), nunca el token en claro. El token
-- real viaja por correo en el enlace y el servidor lo compara por hash.
-- En Supabase (PG17) el generador de id es app.uuidv7() (uuidv7() nativo no existe).
CREATE TABLE app.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT app.uuidv7(),
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token_hash)
);

-- Para invalidar/limpiar todos los tokens de un usuario rápido.
CREATE INDEX password_reset_tokens_user_id_idx
  ON app.password_reset_tokens (user_id);

-- migrate:down
DROP TABLE IF EXISTS app.password_reset_tokens;
