-- migrate:up

-- Enums nuevos
CREATE TYPE app.collection_item_type AS ENUM ('book','repository','snippet','post');
CREATE TYPE app.book_file_format AS ENUM ('epub','pdf','mobi');
CREATE TYPE app.book_access_level AS ENUM ('public','community','restricted');
CREATE TYPE app.shelf_status AS ENUM ('want','reading','read');

-- Colecciones / rutas de aprendizaje: el eje que une libros + código.
CREATE TABLE app.collections (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  owner_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  title varchar(240) NOT NULL,
  slug varchar(280),
  description text,
  visibility app.visibility NOT NULL DEFAULT 'community',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX collections_slug_active_uq
  ON app.collections (slug) WHERE slug IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX collections_owner_idx
  ON app.collections (owner_id, created_at DESC) WHERE deleted_at IS NULL;

-- Ítems de una colección: polimórficos (libro | repo | snippet | post).
CREATE TABLE app.collection_items (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  collection_id uuid NOT NULL REFERENCES app.collections(id) ON DELETE CASCADE,
  item_type app.collection_item_type NOT NULL,
  book_id uuid REFERENCES app.books(id) ON DELETE CASCADE,
  repository_id uuid REFERENCES app.github_repositories(id) ON DELETE CASCADE,
  snippet_id uuid REFERENCES app.post_snippets(id) ON DELETE CASCADE,
  post_id uuid REFERENCES app.posts(id) ON DELETE CASCADE,
  note text,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collection_items_one_target_ck CHECK (
    (item_type='book'       AND book_id IS NOT NULL AND repository_id IS NULL AND snippet_id IS NULL AND post_id IS NULL) OR
    (item_type='repository' AND repository_id IS NOT NULL AND book_id IS NULL AND snippet_id IS NULL AND post_id IS NULL) OR
    (item_type='snippet'    AND snippet_id IS NOT NULL AND book_id IS NULL AND repository_id IS NULL AND post_id IS NULL) OR
    (item_type='post'       AND post_id IS NOT NULL AND book_id IS NULL AND repository_id IS NULL AND snippet_id IS NULL)
  )
);
CREATE INDEX collection_items_collection_idx
  ON app.collection_items (collection_id, sort_order, created_at);
CREATE UNIQUE INDEX collection_items_book_uq ON app.collection_items (collection_id, book_id) WHERE book_id IS NOT NULL;
CREATE UNIQUE INDEX collection_items_repo_uq ON app.collection_items (collection_id, repository_id) WHERE repository_id IS NOT NULL;
CREATE UNIQUE INDEX collection_items_snip_uq ON app.collection_items (collection_id, snippet_id) WHERE snippet_id IS NOT NULL;
CREATE UNIQUE INDEX collection_items_post_uq ON app.collection_items (collection_id, post_id) WHERE post_id IS NOT NULL;

-- Archivo real del libro (EPUB/PDF): convierte el catálogo en biblioteca que se lee.
CREATE TABLE app.book_files (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  book_id uuid NOT NULL REFERENCES app.books(id) ON DELETE CASCADE,
  media_asset_id uuid NOT NULL REFERENCES app.media_assets(id) ON DELETE RESTRICT,
  format app.book_file_format NOT NULL,
  access_level app.book_access_level NOT NULL DEFAULT 'community',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_id, format)
);
CREATE INDEX book_files_book_idx ON app.book_files (book_id);

-- Estantería del usuario + progreso de lectura.
CREATE TABLE app.book_shelves (
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES app.books(id) ON DELETE CASCADE,
  status app.shelf_status NOT NULL DEFAULT 'want',
  progress smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_id)
);
CREATE INDEX book_shelves_user_status_idx ON app.book_shelves (user_id, status);
CREATE INDEX book_shelves_book_idx ON app.book_shelves (book_id);

-- Triggers updated_at
CREATE TRIGGER collections_set_updated_at
  BEFORE UPDATE ON app.collections FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER book_shelves_set_updated_at
  BEFORE UPDATE ON app.book_shelves FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- migrate:down
DROP TABLE IF EXISTS app.collection_items;
DROP TABLE IF EXISTS app.collections;
DROP TABLE IF EXISTS app.book_files;
DROP TABLE IF EXISTS app.book_shelves;
DROP TYPE IF EXISTS app.shelf_status;
DROP TYPE IF EXISTS app.book_access_level;
DROP TYPE IF EXISTS app.book_file_format;
DROP TYPE IF EXISTS app.collection_item_type;
