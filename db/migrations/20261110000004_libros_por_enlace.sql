-- migrate:up

-- Quién trajo cada libro.
--
-- Hasta ahora todos venían de Gutendex, donde la procedencia la respalda la
-- fuente. Si la gente puede pegar enlaces, hace falta saber quién puso cada
-- uno: para poder preguntar de dónde salió, para moderar, y porque un enlace
-- a una obra protegida es responsabilidad de alguien concreto.
--
-- NULL = lo trajo una importación automática, no una persona.
-- ON DELETE SET NULL y no CASCADE: si alguien borra su cuenta, el libro se
-- queda en la biblioteca (otros pueden tenerlo en sus colecciones); lo que se
-- pierde es la atribución.
ALTER TABLE app.books
  ADD COLUMN IF NOT EXISTS added_by uuid REFERENCES app.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN app.books.added_by IS
  'Quién agregó el libro. NULL si vino de una importación automática.';

-- Para "mis libros" y para moderar lo que subió una persona.
CREATE INDEX IF NOT EXISTS books_added_by_idx
  ON app.books (added_by) WHERE added_by IS NOT NULL;

-- Filtro por idioma: hoy son pocos libros, pero es el filtro que más se va a
-- usar y el índice no cuesta nada.
CREATE INDEX IF NOT EXISTS books_language_active_idx
  ON app.books (language_code) WHERE deleted_at IS NULL;

-- migrate:down

DROP INDEX IF EXISTS app.books_language_active_idx;
DROP INDEX IF EXISTS app.books_added_by_idx;
ALTER TABLE app.books DROP COLUMN IF EXISTS added_by;
