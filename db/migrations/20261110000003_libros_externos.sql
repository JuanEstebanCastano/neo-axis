-- migrate:up

-- Libros que vienen de un catálogo externo y se LEEN O DESCARGAN DE ALLÁ.
--
-- Hasta ahora, para que un libro se pudiera abrir hacía falta una fila en
-- app.book_files, y ésa exige un media_asset_id: un archivo alojado por
-- nosotros en el bucket. Eso sirve para lo que subimos, pero no para un
-- catálogo de dominio público donde quien hospeda el archivo es la fuente
-- (Project Gutenberg, Internet Archive). Copiarnos esos archivos sería
-- alojar obras ajenas sin necesidad; basta con apuntar a donde ya están.
--
-- Por eso dos columnas y no una:
--   read_url     -> para leer en el navegador (HTML)
--   download_url -> el archivo (EPUB, PDF)
-- Son enlaces externos, así que ninguna reemplaza a book_files: un libro
-- puede tener las dos cosas, o sólo una.
ALTER TABLE app.books
  ADD COLUMN read_url text,
  ADD COLUMN download_url text;

-- De dónde salió y bajo qué condiciones, para poder responder "¿por qué
-- este libro está acá?" sin tener que adivinarlo. external_provider ya
-- existía; esto es lo que faltaba para que el dato sea auditable.
ALTER TABLE app.books
  ADD COLUMN source_url text,
  ADD COLUMN rights_note varchar(200);

COMMENT ON COLUMN app.books.read_url IS
  'Enlace de lectura en la fuente externa. No es un archivo nuestro.';
COMMENT ON COLUMN app.books.download_url IS
  'Enlace al archivo en la fuente externa (EPUB/PDF). No es un archivo nuestro.';
COMMENT ON COLUMN app.books.source_url IS
  'Ficha del libro en la fuente, para poder verificar la procedencia.';
COMMENT ON COLUMN app.books.rights_note IS
  'Qué declara la fuente sobre los derechos (p. ej. "Public domain in the USA"). Es lo que dice la fuente, no un dictamen legal nuestro.';

-- migrate:down

ALTER TABLE app.books
  DROP COLUMN IF EXISTS rights_note,
  DROP COLUMN IF EXISTS source_url,
  DROP COLUMN IF EXISTS download_url,
  DROP COLUMN IF EXISTS read_url;
