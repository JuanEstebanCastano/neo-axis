-- migrate:up

-- Búsqueda/recomendación semántica sobre el índice ya existente (search_documents).
-- En Supabase la extensión vive en el schema 'extensions'; en una instalación
-- vanilla de PostgreSQL 18 cae en 'public'. Por eso NO calificamos el tipo:
-- se resuelve por el search_path del entorno.
CREATE EXTENSION IF NOT EXISTS vector;

-- 384 dimensiones = modelo gte-small (el que ofrece Supabase vía Edge Functions).
ALTER TABLE app.search_documents ADD COLUMN embedding vector(384);

-- Índice ANN (HNSW) por similitud coseno para "parecidos a esto".
CREATE INDEX search_documents_embedding_idx
  ON app.search_documents
  USING hnsw (embedding vector_cosine_ops);

-- migrate:down
DROP INDEX IF EXISTS app.search_documents_embedding_idx;
ALTER TABLE app.search_documents DROP COLUMN IF EXISTS embedding;
-- La extensión 'vector' no se elimina: puede estar en uso por otros objetos.
