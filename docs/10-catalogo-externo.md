# Traer libros de un catálogo externo

## Qué hace

Desde **Biblioteca → "Traer libros"** se busca en Open Library y se agrega un
libro al catálogo de Neo Axis. El libro queda con su portada, sus autores y
**un enlace para leerlo** en la fuente.

La fuente es [Open Library](https://openlibrary.org), el catálogo del Internet
Archive. Su buscador devuelve JSON, no pide clave, y marca qué obras son de
lectura pública.

## La regla que ordena todo: enlazamos, no copiamos

Neo Axis **no descarga ni rehospeda** el archivo. Guarda el enlace a donde ya
está publicado.

No es una limitación técnica, es la decisión de fondo. Copiar obras ajenas a
nuestro bucket no aporta nada —el archivo ya está disponible y estable— y nos
convertiría en quien las distribuye. Enlazando, la fuente sigue siendo la
responsable de lo que publica y nosotros mantenemos la trazabilidad.

Por eso estas columnas **no reemplazan a `book_files`**:

| Columna | Qué guarda |
|---|---|
| `read_url` | Enlace de lectura en la fuente (el lector de Internet Archive) |
| `download_url` | Nulo para Open Library: Internet Archive no da una URL de archivo estable por ítem, y un enlace muerto es peor que ninguno |
| `source_url` | Ficha de la obra en Open Library, para verificar la procedencia |
| `rights_note` | Lo que **la fuente declara** sobre acceso, en nuestros términos |

`book_files` sigue siendo para los archivos que alojamos nosotros, que se bajan
con una URL firmada ([11-archivos-de-libros.md](11-archivos-de-libros.md)). Un
libro traído de fuera no tiene filas ahí.

## Por qué Open Library y no Gutendex

La primera versión de esto hablaba con [Gutendex](https://gutendex.com), la API
JSON de Project Gutenberg. **Funciona desde una máquina cualquiera, pero no
desde el despliegue.** Vale la pena contar cómo se descubrió, porque el síntoma
engañaba:

- Desde Railway, la búsqueda daba `503` (timeout) de forma intermitente.
- La tentación era culpar a la red de Railway. Se verificó capa por capa:
  **DNS** resuelve en 1 ms; el **socket TCP** a `gutendex.com:443` abre en 2-3
  ms, siempre; el **GET HTTP** se cuelga el timeout completo. Y el mismo socket
  TCP abre bien contra MailerSend y Supabase, que el API ya usa por 443.
- O sea: la salida de Railway funciona. Lo que falla es **la respuesta HTTP**, y
  sólo con Gutendex. Es **Cloudflare, delante de Gutendex, tarpiteando a nivel
  HTTP las IP de datacenter**: acepta la conexión y se traga la petición. No es
  DNS, no es el User-Agent (se probó con uno de navegador, idéntico), no es un
  timeout corto (se probó con 30 s, cuelga igual). Es un muro anti-bot contra
  el tráfico servidor-a-servidor.

Se probó incluso **proxear a través de una Edge Function de Supabase**: su IP
pasaba… hasta que el volumen de pruebas la hizo marcar también. El muro no es
"la IP de Railway", es "cualquier IP de datacenter con suficiente tráfico".

Open Library, en cambio, **responde desde datacenter** (verificado desde
Railway: `200` en ~40 ms, de forma estable). Por eso es la fuente. La contra es
que su modelo no es "sólo Project Gutenberg", así que el filtro de acceso lo
ponemos nosotros (ver abajo).

## Sobre "lectura pública" y "dominio público"

**No son lo mismo, y el dominio público depende del país.** Open Library marca
cada obra con `ebook_access`:

- `"public"` → se lee entera y gratis (lo que traemos).
- `"borrowable"`, `"printdisabled"`, `"no_ebook"` → no se importan.

Que algo sea de **lectura pública** en Internet Archive no equivale a que sea de
**dominio público** en Colombia:

- Muchas obras `public` lo son porque su dominio público se razona sobre la ley
  de **Estados Unidos**.
- En **Colombia** el plazo es vida del autor + **80 años**, más largo.

El sistema hace lo que puede, que es ser honesto sobre lo que sabe:

1. La búsqueda **sólo muestra** lo que viene con `ebook_access = "public"`.
2. Al importar se **vuelve a comprobar** contra la fuente, porque la clave llega
   del cliente y podría ser cualquiera.
3. `rights_note` guarda `"Lectura pública (Open Library / Internet Archive)"`:
   describe lo que la fuente garantiza —que se puede leer— sin afirmar nada
   sobre derechos que no nos consta.
4. El aviso sobre el plazo colombiano sale **en la pantalla de importación**,
   junto al botón, no enterrado acá.

Nada de esto es un dictamen legal. Es trazabilidad: deja constancia de de dónde
salió cada libro y qué decía la fuente, para que alguien con criterio jurídico
pueda revisarlo.

## Direcciones del API

| Método y ruta | Qué hace |
|---|---|
| `GET /api/v1/books/external/search?q=&lang=` | Busca en Open Library. Sólo lectura pública. |
| `POST /api/v1/books/external/import` | Importa por `externalId` (la *work key*, p. ej. `OL2000W`). Idempotente. |

**Las dos piden sesión.** Buscar no cambia nada nuestro, pero sin sesión el API
quedaría de proxy gratuito hacia un servicio que no es nuestro, y quien se
lleva ese tráfico es Open Library.

Importar es **idempotente**: si el libro ya está, devuelve `200` con el que hay
en vez de duplicarlo. Lo respalda el `UNIQUE (external_provider, external_id)`
que `app.books` ya tenía.

Al importar, el servidor **vuelve a pedir el libro a la fuente** en vez de
confiar en lo que mande el cliente. Así el título, los enlaces y la nota de
acceso salen siempre de Open Library.

## Qué hace cada pieza

| Archivo | Para qué |
|---|---|
| `apps/api/src/modules/books/openlibrary.ts` | Lo único que conoce `openlibrary.org`. Entra una búsqueda, sale un libro normalizado. Las partes puras (`normalizar`, `esPublico`) tienen tests. |
| `apps/api/src/modules/books/service.ts` | `importarLibroExterno`: inserta el libro, enlaza sus autores y lo mete al índice de búsqueda. |
| `apps/web/src/pages/Library.tsx` | Panel de búsqueda e importación. |
| `apps/web/src/pages/BookDetail.tsx` | Los botones de leer / ficha de origen. |

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

El entorno de desarrollo de esta máquina alcanza `openlibrary.org` y
`archive.org` (están en los hosts permitidos; `gutendex.com` no, que fue parte
de cómo se detectó el problema de arriba). Una búsqueda de ejemplo:

```bash
curl "https://openlibrary.org/search.json?q=quijote&language=spa&fields=key,title,ebook_access&limit=5"
```

Los que importamos son los que traen `"ebook_access": "public"`.
