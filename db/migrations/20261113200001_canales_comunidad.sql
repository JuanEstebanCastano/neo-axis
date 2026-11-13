-- migrate:up

-- ============================================================
-- Secciones de la comunidad (canales temáticos)
-- ============================================================
-- El feed era una lista plana. Ahora la conversación vive en secciones:
-- "Libros", "Desarrollo", las que haga falta. Cada sección es un lugar donde
-- se publica y se debate.
--
-- POR QUÉ LOS MENSAJES SON POSTS Y NO UNA TABLA NUEVA
-- El esquema ya decidió que todo es un post: un snippet se guarda como post
-- para heredar el feed, los comentarios y la búsqueda. Un mensaje de sección
-- sigue esa misma decisión y hereda gratis comentarios, moderación
-- (hidden_at), borrado lógico, búsqueda, reacciones y menciones. Una tabla
-- aparte ahorraría unos 50 bytes por fila y obligaría a duplicar esas seis
-- cosas, además de volver los adjuntos polimórficos en el dueño además de en
-- el objetivo. No compensa.
CREATE TABLE app.channels (
  id uuid PRIMARY KEY DEFAULT app.uuidv7(),
  slug varchar(100) NOT NULL,
  name varchar(120) NOT NULL,
  description text,
  -- Línea de contexto que se muestra en la cabecera de la sección.
  topic varchar(300),
  -- Reusa el enum existente: hoy todo es 'community'. El día que haga falta
  -- una sección privada, el modelo a copiar es post_allowed_roles.
  visibility app.visibility NOT NULL DEFAULT 'community',
  sort_order smallint NOT NULL DEFAULT 0,
  created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Archivada: se sigue leyendo, ya no se escribe.
  archived_at timestamptz,
  deleted_at timestamptz
);

-- Espeja posts_slug_active_uq: el slug es único entre las vivas, así una
-- sección borrada no bloquea el nombre para siempre.
CREATE UNIQUE INDEX channels_slug_active_uq
  ON app.channels (slug) WHERE deleted_at IS NULL;

CREATE INDEX channels_order_idx
  ON app.channels (sort_order, created_at) WHERE deleted_at IS NULL;

CREATE TRIGGER channels_set_updated_at
BEFORE UPDATE ON app.channels
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ============================================================
-- El post pasa a saber en qué sección vive
-- ============================================================
-- Nullable sin default: ALTER instantáneo, no reescribe la tabla.
--   channel_id IS NULL     -> no vive en una sección (los snippets).
--   channel_id IS NOT NULL -> es un mensaje de esa sección.
-- No hace falta una columna de tipo: el esquema ya clasifica por presencia.
--
-- RESTRICT y no CASCADE a propósito: borrar una sección no puede evaporar
-- cinco mil mensajes por un clic. Las secciones se archivan.
ALTER TABLE app.posts
  ADD COLUMN channel_id uuid REFERENCES app.channels(id) ON DELETE RESTRICT;

-- posts_feed_idx no contiene channel_id, así que no sirve para abrir una
-- sección: habría que escanearlo entero y descartar. Este índice parcial es
-- el que sostiene el listado de mensajes.
--
-- OJO al escribir la consulta: tiene que repetir LITERALMENTE estos tres
-- predicados (mismos literales de enum) o el planner no puede probar que el
-- índice parcial aplica y se va a secuencial.
--
-- Ordena por id DESC, no por created_at: los uuidv7 ya están ordenados por
-- tiempo y dan un orden TOTAL, que es lo que la paginación necesita. Con
-- created_at, dos mensajes del mismo milisegundo hacen que el segundo se
-- salte entre páginas sin que nadie lo note.
CREATE INDEX posts_channel_idx
  ON app.posts (channel_id, id DESC)
  WHERE channel_id IS NOT NULL
    AND deleted_at IS NULL
    AND status = 'published'
    AND hidden_at IS NULL;

-- ============================================================
-- Sección General y mudanza de lo que ya existía
-- ============================================================
-- ON CONFLICT sobre un índice único PARCIAL exige repetir el predicado, o
-- Postgres no infiere el índice y esto falla con "no unique or exclusion
-- constraint matching".
INSERT INTO app.channels (slug, name, description, topic, sort_order)
VALUES (
  'general',
  'General',
  'La conversación de siempre: lo que no cae en ninguna otra sección.',
  'Bienvenida a la comunidad',
  0
)
ON CONFLICT (slug) WHERE deleted_at IS NULL DO NOTHING;

-- Las publicaciones que ya existían pasan a General para que nada quede
-- huérfano. Los snippets se quedan fuera: viven en su propia sección del
-- producto y el feed los excluye a propósito.
UPDATE app.posts p
SET channel_id = (SELECT id FROM app.channels WHERE slug = 'general' AND deleted_at IS NULL)
WHERE p.channel_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM app.post_snippets s WHERE s.post_id = p.id);

-- ============================================================
-- Permisos
-- ============================================================
-- El código pregunta por permisos, nunca por roles (docs/05-decisiones.md).
-- Crear secciones queda en manos de administradores y moderadores; para
-- dárselo a otro rol mañana basta una fila, sin tocar código ni desplegar.
INSERT INTO app.permissions (code, name, description)
VALUES
  ('channels.create', 'Create channels', 'Create community sections'),
  ('channels.manage', 'Manage channels', 'Rename, reorder or archive sections')
ON CONFLICT (code) DO NOTHING;

INSERT INTO app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app.roles r
JOIN app.permissions p ON p.code IN ('channels.create', 'channels.manage')
WHERE r.code IN ('admin', 'moderator')
ON CONFLICT DO NOTHING;

-- migrate:down

DELETE FROM app.role_permissions
WHERE permission_id IN (
  SELECT id FROM app.permissions WHERE code IN ('channels.create', 'channels.manage')
);
DELETE FROM app.permissions WHERE code IN ('channels.create', 'channels.manage');

DROP INDEX IF EXISTS app.posts_channel_idx;
ALTER TABLE app.posts DROP COLUMN IF EXISTS channel_id;

DROP TRIGGER IF EXISTS channels_set_updated_at ON app.channels;
DROP TABLE IF EXISTS app.channels;
