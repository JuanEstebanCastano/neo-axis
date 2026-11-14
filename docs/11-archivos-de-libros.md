# Archivos de libros: subirlos y bajarlos

## Qué hace

En la ficha de un libro, bajo **"Archivos en Neo Axis"**, quien tenga sesión
puede subir un **EPUB, un PDF o un MOBI**. El archivo queda alojado por
nosotros y se descarga con una URL firmada que vive cinco minutos.

Esto convive con el [catálogo externo](10-catalogo-externo.md): un libro traído
de Gutenberg tiene sus enlaces a la fuente **y además** puede tener un archivo
nuestro. Son dos cosas distintas en la misma pantalla, no una en lugar de la
otra.

## La regla que ordena todo: el formato se lee del archivo

El formato **no se le cree a quien sube**. Se miran los primeros bytes:

| Formato | Cómo se reconoce |
|---|---|
| PDF | `%PDF-` en el primer KB |
| MOBI | `BOOKMOBI` en el byte 60, después de la cabecera PalmDB |
| EPUB | Es un ZIP cuyo primer archivo es `mimetype` con `application/epub+zip` (bytes 30 a 58) |

El nombre y el `Content-Type` los elige quien sube: renombrar `virus.exe` a
`libro.epub` es un segundo de trabajo, y el navegador manda el tipo que se le
antoja. Si guardáramos eso como formato, la biblioteca ofrecería descargar un
EPUB que no lo es, firmado por nosotros.

**Esto no es un antivirus.** Un ZIP con la firma de EPUB pasa igual. Lo que
evita es el engaño barato y que la columna `format` diga una cosa y el archivo
sea otra.

Si quien sube declara un formato en la query y no coincide con los bytes, el
API lo dice (`400`) en vez de guardar en silencio algo que miente sobre sí
mismo.

## Por qué la subida pasa por el API y la descarga no

Son dos decisiones opuestas y las dos son a propósito:

- **Descargar**: el API devuelve una URL firmada y el navegador baja directo
  del storage. El servidor no se satura con binarios, y descargar es lo que
  pasa todo el tiempo.
- **Subir**: los bytes pasan por el API. Es la única forma de medir el tamaño
  de verdad, calcular el checksum y mirar la cabecera antes de guardar nada.
  Con una URL firmada de subida, el servidor no ve el archivo y tiene que
  creerle al cliente lo que diga. Subir un libro es raro.

El costo está donde casi no ocurre.

### El cuerpo es el archivo, sin multipart

`multipart/form-data` es el formato de un `<form>`, y acá no hay formulario:
hay **un** archivo. Soportarlo sería sumar una dependencia que parsea límites,
cabeceras y codificaciones —que es donde viven los bugs de este terreno— para
transportar exactamente los mismos bytes. Lo que acompaña al archivo (formato y
nivel de acceso) cabe de sobra en la querystring.

### El límite de peso

`BOOK_FILE_MAX_MB` (25 por defecto, ver `.env.example`). Se declara en el
*content type parser*, así que **Fastify corta la lectura al pasarse**: un
archivo de 2 GB no llega nunca a ocupar memoria. El navegador también avisa
antes de empezar, pero quien decide es el servidor.

25 MB cubre cualquier EPUB y casi todo PDF de texto. Los escaneos de 300 MB
quedan afuera a propósito.

## El orden de las escrituras

Hay dos sistemas que pueden desincronizarse —el storage y la base—, así que el
orden se eligió mirando **qué basura deja cada falla**:

| Operación | Orden | Si se cae en el medio |
|---|---|---|
| Subir | Storage → base | Queda un objeto sin referencia. Se borra en el `catch`; si esa limpieza también falla, queda en el log. Cuesta plata, nada más. |
| Borrar | Base → storage | Queda un objeto sin referencia. Lo mismo. |

Al revés, en los dos casos, quedaría una fila prometiendo un archivo que no
existe, y el botón de descargar daría un error incomprensible.

Las dos filas de una subida (`media_assets` y `book_files`) van en **una
transacción**: por separado dejan un `media_asset` huérfano, que es un archivo
pago y escondido.

El `UNIQUE (book_id, format)` hace que dos personas no puedan subir el mismo
formato del mismo libro. El choque es esperable y sale como `409` con un
mensaje, no como un `500`.

## Quién puede qué

| Nivel (`access_level`) | Quién descarga |
|---|---|
| `public` | Cualquiera, sin sesión |
| `community` | Quien tenga cuenta |
| `restricted` | **Nadie**, hasta que exista un modelo de autorización |

Por eso `restricted` **no se ofrece al subir**: guardar un archivo con ese nivel
sería esconderlo de quien lo acaba de subir.

**Borrar sólo puede quien subió.** Es la misma regla que usa el resto del
proyecto mientras no haya roles finos, y alcanza para que nadie te vacíe la
biblioteca.

## El nombre con el que cae el archivo

Dentro del bucket el objeto se llama como un uuid
(`libros/<bookId>/<uuid>.epub`). El nombre lo pone el servidor, nunca quien
sube: con el nombre del cliente de por medio habría que defenderse de `../`, de
barras y de nombres repetidos; con un uuid no hay nada de qué defenderse.

El nombre bonito se arma recién al descargar, a partir del **título del libro**
y sin tildes ni símbolos, y viaja **dentro de la firma**
(`ResponseContentDisposition`). Tiene que ir ahí: el navegador baja directo del
storage, así que una cabecera que pusiera el API no la vería nadie.

## Direcciones del API

| Método y ruta | Sesión | Qué hace |
|---|---|---|
| `GET /api/v1/books/:bookId/files` | No | Formatos disponibles, con su peso |
| `POST /api/v1/books/:bookId/files?format=&accessLevel=` | Sí | Sube. El cuerpo es el archivo crudo. `format` es opcional y se verifica. |
| `GET /api/v1/book-files/:id/download` | Según `access_level` | Devuelve `{ url, expiresInSeconds }` |
| `DELETE /api/v1/book-files/:id` | Sí (quien subió) | Saca la fila y borra el objeto |

La subida está limitada a **10 cada 5 minutos**: cada llamada mueve hasta 25 MB
por la memoria del API y los escribe en el storage. Es lo más caro que puede
pedir una sola persona.

## Qué hace cada pieza

| Archivo | Para qué |
|---|---|
| `apps/api/src/modules/books/fileformat.ts` | Reconoce el formato por los bytes, arma la clave del objeto y el nombre de descarga. Sin base, sin red: por eso se prueba con buffers escritos a mano. |
| `apps/api/src/modules/books/fileformat.test.ts` | Los casos de esa detección, incluido el ZIP que no es EPUB. |
| `apps/api/src/lib/storage.ts` | El cliente S3: firmar descargas, subir y borrar objetos. |
| `apps/api/src/modules/books/service.ts` | `guardarArchivoDeLibro` y `eliminarArchivoDeLibro`, las dos transaccionales. |
| `apps/api/src/modules/books/routes.ts` | Las cuatro rutas de arriba y el parser del cuerpo binario. |
| `apps/web/src/pages/BookDetail.tsx` | El bloque `ArchivosDelLibro`: lista, subida y borrado. |

## Probarlo

Hace falta un storage S3 configurado (`S3_*` en `.env`); en desarrollo, el
MinIO que levanta `docker compose`. Con eso:

```bash
# Subir (el cuerpo es el archivo tal cual, con la cookie de sesión)
curl -X POST "http://localhost:3000/api/v1/books/$BOOK_ID/files?accessLevel=community" \
  -H "Content-Type: application/epub+zip" \
  -b "neoaxis_session=$COOKIE" \
  --data-binary "@libro.epub"
```

Para ver que la detección funciona, renombrá cualquier `.txt` a `.epub` y
subilo: tiene que salir el `400` que habla de los primeros bytes.
