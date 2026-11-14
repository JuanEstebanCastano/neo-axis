# Recorrido de demo

Para la defensa: qué mostrar, en qué orden, y qué puede fallar en vivo.

No es documentación del sistema —eso está en los otros docs—, es el guion.

## Estado real de producción (13 de noviembre de 2026)

Medido contra la base, no de memoria:

| Qué | Cuánto | Qué significa para la demo |
|---|---|---|
| Usuarios | 10 | Alcanza |
| Libros | 2 | **Poco, y los dos son de prueba** |
| Libros traídos de Gutenberg | 0 | **La importación nunca corrió en producción** |
| Canales de comunidad | 1 ("General") | **Una sección sola no muestra para qué sirven las secciones** |
| Publicaciones | 8 | Alcanza |
| Colecciones | 1 | Justo |
| Conexiones de GitHub | 1 | Alcanza, pero ver abajo |
| Indexados para búsqueda | 5, todos publicaciones | **Ningún libro estaba indexado** (corregido; hay que reindexar) |
| Archivos de libro subidos | 0 | Nunca se ejercitó el storage |

Los dos libros se llaman "El libro de prueba" y "cien años de soledad" (sí, en
minúscula). En una pantalla compartida se leen como lo que son.

## Antes de la defensa: sembrar

En este orden, porque cada paso usa lo del anterior.

1. **Borrar "El libro de prueba"** y corregir el título de "cien años de
   soledad" → *Cien años de soledad*.
2. **Importar 4 o 5 libros de Gutenberg** desde *Biblioteca → Traer libros*.
   Esto es lo más importante de la lista: además de llenar el catálogo,
   **comprueba que el despliegue tiene salida a `gutendex.com`**, cosa que en
   la máquina de desarrollo no pasa (ver [10-catálogo externo](10-catalogo-externo.md)).
   Si falla, mejor saberlo ahora que frente al jurado.
3. **Subir un EPUB** a uno de esos libros. Es la prueba pendiente del storage
   (ver abajo).
4. **Crear 2 o 3 canales más** en Comunidad, con nombres que se entiendan solos.
5. **Reindexar en *Descubrir***. Hace tres cosas: mete al índice los libros
   que nunca entraron, completa los dos vectores que faltaban y deja
   "Parecidos a este" funcionando. Tiene que ir **después** de importar, para
   que los libros nuevos entren en la misma pasada; el reindex admite dos
   llamadas por hora.

   Cargales los autores a los libros que agregues a mano: el documento de un
   libro es su título más quien lo escribió, así que sin autor queda casi sin
   con qué parecerse a nada. Los dos que hay hoy no tienen ninguno.
6. **Armar una colección** con cosas de distinto tipo —un libro, un fragmento
   de código, una publicación—, porque el punto de las colecciones es
   justamente que mezclan.

## El recorrido, diez pasos

Pensado para contar una historia, no para recorrer el menú de izquierda a
derecha.

| # | Dónde | Qué mostrar | Qué decir mientras tanto |
|---|---|---|---|
| 1 | `/` | El feed, ya con contenido | Qué es Neo Axis en una frase |
| 2 | `/biblioteca` → Traer libros | Buscar e importar uno en vivo | "Enlazamos, no copiamos" y el plazo de dominio público en Colombia vs. EE. UU. |
| 3 | Ficha del libro importado | Los enlaces a la fuente **y** el bloque de archivos nuestros | Por qué conviven en vez de excluirse |
| 4 | Misma ficha | Subir un EPUB y descargarlo | El formato se lee de los bytes, no del nombre |
| 5 | Misma ficha | Intentar subir un `.txt` renombrado a `.epub` | **El error es la demo**: muestra que la validación es real |
| 6 | `/comunidad` | Un canal, un mensaje con un libro adjunto | El arco exclusivo y la visibilidad que se impone al leer |
| 7 | `/snippets` | Un fragmento publicado como gist | Versionado real, no una copia en nuestra base |
| 8 | `/repositorios` | Leer un archivo de un repo propio | Lo que el token puede y no puede hacer |
| 9 | `/descubrir` | Buscar algo y abrir "Parecidos a este" | Embeddings, no coincidencia de texto |
| 10 | Cualquier pantalla | Cambiar el idioma a inglés | Bilingüe de punta a punta, no sólo los botones |

El paso 5 es el que más conviene no saltear. Un sistema que acepta todo no
demuestra nada; uno que rechaza con un motivo entendible, sí.

## Lo que puede fallar en vivo

| Riesgo | Qué tan probable | Plan B |
|---|---|---|
| Gutendex no responde o el host no lo alcanza | **Media** — nunca corrió en producción | Tener libros ya importados de antes; mostrar la ficha en vez de la importación |
| La subida de archivo falla por permisos del bucket | Baja | Ver abajo: probarlo antes |
| "Parecidos a este" sale vacío | **Alta si no se reindexa**: los libros entraron al índice recién ahora | Reindexar en el paso 5 de la siembra y comprobarlo en una ficha antes |
| GitHub: publicar / sincronizar / importar | **Media** — están desplegadas pero nunca se ejercitaron | Probar las tres antes; si alguna falla, mostrar sólo lectura de archivos |
| La sesión expira en medio de la demo | Baja | Entrar justo antes, no la noche anterior |

## La prueba de storage que falta

Es la única pieza del sistema que escribe en un servicio externo y **nunca lo
hizo**: el bucket tiene 0 objetos.

Lo que ya está verificado contra la base, sin necesidad de probar:

- El bucket `neoaxis-media` existe y es **privado** (correcto: se descarga con
  URL firmada, no por enlace público).
- **No tiene** `file_size_limit` ni `allowed_mime_types`, así que nada del lado
  del bucket va a rechazar un EPUB de 25 MB.

Lo que no se puede verificar sin probarlo: que la credencial S3 que vive en
Railway tenga permiso de **escritura**, no sólo de lectura.

Cómo probarlo, en dos minutos: entrar al front desplegado, abrir un libro,
subir un EPUB cualquiera. Si aparece en la lista con su peso, la cadena entera
funciona —detección, subida, filas en la base, URL firmada— y el único paso que
queda es apretar *Borrar* para confirmar también la limpieza del objeto.

## Lo que conviene no mostrar

- **`access_level: restricted`**. Está deliberadamente cerrado hasta que exista
  un modelo de autorización. Si sale el tema, decirlo así: cerrarlo es una
  decisión, dejarlo entreabierto habría sido un descuido.
- **Datos de prueba con nombres de prueba.** Si queda alguno, se nota.
