# Traer libros de un catálogo externo

## Qué hace

Desde **Biblioteca → "Traer libros"** se busca en Project Gutenberg y se agrega
un libro al catálogo de Neo Axis. El libro queda con su portada, sus autores y
**un enlace para leerlo y otro para descargarlo**.

La fuente es [Gutendex](https://gutendex.com), la API JSON de Project
Gutenberg. No pide clave.

## La regla que ordena todo: enlazamos, no copiamos

Neo Axis **no descarga ni rehospeda** el archivo. Guarda el enlace a donde ya
está publicado.

No es una limitación técnica, es la decisión de fondo. Copiar obras ajenas a
nuestro bucket no aporta nada —el archivo ya está disponible y estable— y nos
convertiría en quien las distribuye. Enlazando, la fuente sigue siendo la
responsable de lo que publica y nosotros mantenemos la trazabilidad.

Por eso estas columnas son nuevas y **no reemplazan a `book_files`**:

| Columna | Qué guarda |
|---|---|
| `read_url` | Enlace de lectura en la fuente (HTML) |
| `download_url` | Enlace al archivo en la fuente (EPUB/PDF) |
| `source_url` | Ficha del libro en la fuente, para verificar la procedencia |
| `rights_note` | Lo que **la fuente declara** sobre derechos, literal |

`book_files` sigue siendo para los archivos que alojamos nosotros, que se bajan
con una URL firmada. Un libro traído de fuera no tiene filas ahí.

## Sobre "dominio público"

**El dominio público depende del país.** Esto no es un detalle menor:

- Project Gutenberg razona sobre la ley de **Estados Unidos**: vida del autor
  + 70 años.
- En **Colombia** el plazo es vida del autor + **80 años**.

Una obra libre en Gutenberg puede seguir protegida acá. El sistema hace lo que
puede, que es ser honesto sobre lo que sabe:

1. La búsqueda va con `copyright=false`, así que **lo que está bajo derechos ni
   se muestra**.
2. Al importar se vuelve a comprobar contra la fuente, porque el id llega del
   cliente y podría ser cualquiera.
3. `rights_note` guarda la declaración de la fuente **en sus términos**
   (`"Public domain in the USA (Project Gutenberg)"`), sin traducirla a una
   afirmación nuestra.
4. El aviso sobre el plazo colombiano sale **en la pantalla de importación**,
   junto al botón, no enterrado acá.

Nada de esto es un dictamen legal. Es trazabilidad: deja constancia de de dónde
salió cada libro y qué decía la fuente, para que alguien con criterio jurídico
pueda revisarlo.

## Direcciones del API

| Método y ruta | Qué hace |
|---|---|
| `GET /api/v1/books/external/search?q=&lang=` | Busca en Gutendex. Sólo dominio público. |
| `POST /api/v1/books/external/import` | Importa por `externalId`. Idempotente. |

**Las dos piden sesión.** Buscar no cambia nada nuestro, pero sin sesión el API
quedaría de proxy gratuito hacia un servicio que no es nuestro, y quien se
lleva ese tráfico es Gutendex.

Importar es **idempotente**: si el libro ya está, devuelve `200` con el que hay
en vez de duplicarlo. Lo respalda el `UNIQUE (external_provider, external_id)`
que `app.books` ya tenía.

Al importar, el servidor **vuelve a pedir el libro a la fuente** en vez de
confiar en lo que mande el cliente. Así el título, los enlaces y la nota de
derechos salen siempre de Gutendex.

## Qué hace cada pieza

| Archivo | Para qué |
|---|---|
| `apps/api/src/modules/books/gutendex.ts` | Lo único que conoce `gutendex.com`. Entra una búsqueda, sale un libro normalizado. |
| `apps/api/src/modules/books/service.ts` | `importarLibroExterno`: inserta el libro y enlaza sus autores. |
| `apps/web/src/pages/Library.tsx` | Panel de búsqueda e importación. |
| `apps/web/src/pages/BookDetail.tsx` | Los botones de leer / descargar / ficha de origen. |

## Cómics y manga: por qué no están

Se investigaron las tres categorías. **No son equivalentes legalmente.**

**Cómics — se puede, pero sólo Golden Age.** [Internet
Archive](https://archive.org/advancedsearch.php) tiene API real (sin clave) y
aloja cómics de dominio público (≈1938-1956). [Digital Comic
Museum](https://digitalcomicmuseum.com) y [Comic Book
Plus](https://comicbookplus.com) tienen mejor catálogo pero **no publican API**
y exigen registro. Nada de DC ni Marvel moderno.

**Manga — no hay fuente legal con archivo.** Ninguna API entrega manga con
licencia vigente para leer. Shueisha, Viz y Kodansha no exponen APIs de lectura.

Queda descartado **MangaDex**, que es la opción tentadora: su propia
documentación exige que, si permitís lectura de capítulos, acredites a los
grupos de *scanlation* y atiendas sus peticiones de retirada. Eso describe
traducciones de aficionados sin licencia. Además prohíbe anuncios y servicios
de pago sobre su API.

Lo legal para manga es **metadatos y enlazar a las plataformas oficiales**:
[AniList](https://anilist.co) (gratis por debajo de ~150 USD/mes de ingresos) o
[Kitsu](https://kitsu.docs.apiary.io) (lectura pública sin clave). Eso encaja
con `read_url` apuntando a la plataforma oficial, sin archivo.

## Probarlo

El entorno de desarrollo de esta máquina **no tiene salida a `gutendex.com`**
(sólo a hosts permitidos, como Supabase). La búsqueda falla con "No pudimos
consultar el catálogo externo" hasta probarla desde una red con salida abierta
o desde el despliegue.
