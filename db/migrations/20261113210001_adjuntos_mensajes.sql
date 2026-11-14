-- migrate:up

-- ============================================================
-- Adjuntos de una publicación
-- ============================================================
-- Un mensaje puede traer consigo un libro de la biblioteca, un fragmento de
-- código o un repositorio. Es el cruce que da sentido al proyecto: el libro
-- que explica un tema y el código que lo practica, en la misma conversación.
--
-- El modelo es el mismo arco exclusivo de app.collection_items, a propósito:
-- una columna FK REAL por tipo (así Postgres mantiene la integridad de
-- verdad, cosa que un entity_type/entity_id suelto no hace), un enum que
-- discrimina y un CHECK que exige exactamente una no nula. Quien entienda
-- collections/service.ts entiende esto sin leerlo.
--
-- Enum NUEVO en vez de extender uno existente: dbmate envuelve cada
-- migración en una transacción, y 'ALTER TYPE ... ADD VALUE' seguido de un
-- uso del valor nuevo en el mismo archivo falla con "unsafe use of new
-- value". Crear el tipo evita esa trampa.
CREATE TYPE app.attachment_type AS ENUM ('book','repository','snippet');

CREATE TABLE app.post_attachments (
  id uuid PRIMARY KEY DEFAULT app.uuidv7(),
  post_id uuid NOT NULL REFERENCES app.posts(id) ON DELETE CASCADE,
  attachment_type app.attachment_type NOT NULL,
  book_id uuid REFERENCES app.books(id) ON DELETE CASCADE,
  repository_id uuid REFERENCES app.github_repositories(id) ON DELETE CASCADE,
  snippet_id uuid REFERENCES app.post_snippets(id) ON DELETE CASCADE,
  -- Por qué lo adjuntó: "el capítulo 4 explica justo esto".
  note varchar(300),
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_attachments_one_target_ck CHECK (
    (attachment_type = 'book'
      AND book_id IS NOT NULL AND repository_id IS NULL AND snippet_id IS NULL) OR
    (attachment_type = 'repository'
      AND repository_id IS NOT NULL AND book_id IS NULL AND snippet_id IS NULL) OR
    (attachment_type = 'snippet'
      AND snippet_id IS NOT NULL AND book_id IS NULL AND repository_id IS NULL)
  )
);

CREATE INDEX post_attachments_post_idx
  ON app.post_attachments (post_id, sort_order, created_at);

-- Uno por tipo, como en collection_items: adjuntar dos veces lo mismo al
-- mismo mensaje es un desliz, y conviene que choque contra la base en vez de
-- duplicar la tarjeta en la conversación.
CREATE UNIQUE INDEX post_attachments_book_uq
  ON app.post_attachments (post_id, book_id) WHERE book_id IS NOT NULL;
CREATE UNIQUE INDEX post_attachments_repo_uq
  ON app.post_attachments (post_id, repository_id) WHERE repository_id IS NOT NULL;
CREATE UNIQUE INDEX post_attachments_snip_uq
  ON app.post_attachments (post_id, snippet_id) WHERE snippet_id IS NOT NULL;

-- Nota sobre app.github_repositories: existe desde el esquema inicial y nadie
-- la escribía nunca, por eso el selector de colecciones deja los repositorios
-- fuera (elegir uno daba siempre "el repositorio no existe"). Para adjuntarlos
-- hay que darlos de alta, y el ON CONFLICT del upsert necesita una restricción
-- única sobre canonical_url: ya la tiene desde el inicio
-- (github_repositories_canonical_url_key), así que acá no hace falta nada.

-- migrate:down

DROP TABLE IF EXISTS app.post_attachments;
DROP TYPE IF EXISTS app.attachment_type;
