-- migrate:up

-- 1. Moderación simétrica: los comentarios también se pueden ocultar.
ALTER TABLE app.comments
  ADD COLUMN hidden_at timestamptz,
  ADD COLUMN hidden_by uuid REFERENCES app.users(id) ON DELETE SET NULL;

-- 2. Anti-spam de reportes: un reporte por usuario y objetivo.
CREATE UNIQUE INDEX moderation_reports_post_reporter_uq
  ON app.moderation_reports (reporter_id, post_id)
  WHERE post_id IS NOT NULL;

CREATE UNIQUE INDEX moderation_reports_comment_reporter_uq
  ON app.moderation_reports (reporter_id, comment_id)
  WHERE comment_id IS NOT NULL;

-- 3. Visibilidad 'restricted' de posts: las tablas que faltaban (espejo de los eventos).
CREATE TABLE app.post_allowed_roles (
  post_id uuid NOT NULL REFERENCES app.posts(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES app.roles(id) ON DELETE RESTRICT,
  PRIMARY KEY (post_id, role_id)
);

CREATE TABLE app.post_allowed_users (
  post_id uuid NOT NULL REFERENCES app.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  PRIMARY KEY (post_id, user_id)
);

-- 4. Integridad de libros: ISBN-13 con formato y único entre los vivos.
ALTER TABLE app.books
  ADD CONSTRAINT books_isbn13_format_ck
  CHECK (isbn13 IS NULL OR isbn13 ~ '^[0-9]{13}$');

CREATE UNIQUE INDEX books_isbn13_uq
  ON app.books (isbn13)
  WHERE isbn13 IS NOT NULL AND deleted_at IS NULL;

-- 5. Reseñas: permitir volver a reseñar si el post anterior fue borrado lógicamente.
DROP INDEX app.book_reviews_user_book_uq;

ALTER TABLE app.book_reviews
  ADD COLUMN deleted_at timestamptz;

CREATE UNIQUE INDEX book_reviews_user_book_active_uq
  ON app.book_reviews (reviewer_id, book_id)
  WHERE deleted_at IS NULL;

-- 6. search_documents: el trigger de updated_at que faltaba.
CREATE TRIGGER search_documents_set_updated_at
BEFORE UPDATE ON app.search_documents
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- 7. Cola de correo: índice por usuario.
CREATE INDEX email_queue_user_idx
  ON app.email_notification_queue (user_id, created_at DESC);

-- 8. Barrido de sesiones expiradas.
CREATE INDEX auth_sessions_expiry_idx
  ON app.auth_sessions (expires_at)
  WHERE revoked_at IS NULL;

-- 9. Preferencias de correo faltantes frente al enum notification_type.
ALTER TABLE app.user_notification_preferences
  ADD COLUMN email_follows boolean NOT NULL DEFAULT true,
  ADD COLUMN email_moderation boolean NOT NULL DEFAULT true;

-- migrate:down
ALTER TABLE app.user_notification_preferences
  DROP COLUMN email_moderation, DROP COLUMN email_follows;
DROP INDEX app.auth_sessions_expiry_idx;
DROP INDEX app.email_queue_user_idx;
DROP TRIGGER search_documents_set_updated_at ON app.search_documents;
DROP INDEX app.book_reviews_user_book_active_uq;
ALTER TABLE app.book_reviews DROP COLUMN deleted_at;
CREATE UNIQUE INDEX book_reviews_user_book_uq ON app.book_reviews (reviewer_id, book_id);
DROP INDEX app.books_isbn13_uq;
ALTER TABLE app.books DROP CONSTRAINT books_isbn13_format_ck;
DROP TABLE app.post_allowed_users;
DROP TABLE app.post_allowed_roles;
DROP INDEX app.moderation_reports_comment_reporter_uq;
DROP INDEX app.moderation_reports_post_reporter_uq;
ALTER TABLE app.comments DROP COLUMN hidden_by, DROP COLUMN hidden_at;
