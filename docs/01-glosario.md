# Glosario

Términos que vas a encontrar en el código y en las conversaciones del equipo.
Ordenados por tema, no alfabéticamente, para que se puedan leer de corrido.

---

## Lo básico

**Repositorio (repo)**
La carpeta del proyecto con todo su historial de cambios. "Subir al repo" =
guardar tus cambios donde todo el equipo los ve.

**Dependencia**
Código que escribió otra gente y que usamos en lugar de rehacerlo. Están
listadas en los archivos `package.json`.

**Build (construir / compilar)**
Traducir el código que escribimos (TypeScript) al que la computadora ejecuta
(JavaScript). Pasa automáticamente.

**Variable de entorno**
Un dato de configuración que cambia según dónde corra el programa: la clave de
la base de datos es distinta en tu computador que en el servidor real. Viven en
el archivo `.env`, que **nunca** se sube al repositorio.

---

## Base de datos

**Base de datos**
Donde se guarda la información de forma permanente. Si apagás el programa, los
datos siguen ahí.

**Tabla**
Una planilla. `users` es la tabla de usuarios: cada fila es una persona, cada
columna un dato (nombre, correo, fecha de registro).

**Fila / registro**
Un elemento concreto: un usuario, una publicación, un comentario.

**Llave primaria (primary key)**
El identificador único de cada fila. Dos usuarios pueden llamarse igual, pero
nunca tienen la misma llave primaria.

**Llave foránea (foreign key)**
Una columna que apunta a una fila de otra tabla. En `posts`, la columna
`author_id` apunta al usuario que escribió esa publicación. La base de datos
impide que apunte a alguien que no existe.

**Índice**
Como el índice de un libro. Sin él, buscar una publicación obliga a revisar
todas; con él, se va directo. Hace las búsquedas miles de veces más rápidas.

**Migración**
Un archivo con instrucciones para modificar la estructura de la base de datos
(agregar una columna, crear una tabla). Se numeran y se aplican en orden, para
que la base de todo el equipo quede idéntica. Viven en `db/migrations/`.

**Transacción**
Un grupo de operaciones que pasan **todas o ninguna**. Al crear una publicación
se escriben 4 tablas distintas; si la cuarta falla, se deshacen las tres
anteriores. Evita que queden datos a medias.

**Borrado lógico (soft delete)**
En vez de borrar la fila, se le marca una fecha en la columna `deleted_at` y se
deja de mostrar. Permite recuperarla y no rompe lo que dependía de ella.

---

## La aplicación

**API**
El programa que atiende al navegador. Recibe pedidos ("dame el feed",
"guardá esta publicación") y responde.

**Endpoint (ruta)**
Una dirección concreta del API. `GET /api/v1/posts` es el endpoint que devuelve
las publicaciones. `GET` significa "leer"; `POST`, "crear"; `DELETE`, "borrar".

**Worker**
Un programa que corre solo, sin que nadie se lo pida, haciendo tareas lentas en
segundo plano. El nuestro manda los correos.

**Cola**
Una lista de tareas pendientes. El API anota "hay que enviar este correo" y
sigue. El worker la lee y las va haciendo. Así nadie espera.

**Transacción atómica, logs, healthcheck**
- *Log*: mensajes que el programa va escribiendo para contar qué hace. Se ven con `make logs`.
- *Healthcheck*: una dirección que responde "estoy vivo", para detectar caídas.

---

## Seguridad

**Autenticación**
Comprobar **quién sos**. Iniciar sesión.

**Autorización**
Comprobar **qué podés hacer**. Un moderador puede ocultar publicaciones; un
usuario común, no. Son cosas distintas y se confunden seguido.

**Sesión**
El sistema recuerda que iniciaste sesión. Se guarda una cookie en tu navegador
con un código que el servidor puede verificar y anular cuando quiera.

**Hash**
Transformar un texto en un código del que **no se puede volver atrás**. Las
contraseñas se guardan así: si alguien roba la base de datos, no obtiene las
contraseñas reales.

**Rol y permiso**
Un *permiso* es una acción concreta (`posts.create`). Un *rol* es un paquete de
permisos (`moderator`). A las personas se les dan roles; el código pregunta por
permisos. Así se cambia una política sin tocar el código.

---

## Herramientas

**Docker**
Empaqueta cada programa con todo lo que necesita. Garantiza que funcione igual
en cualquier computador.

**Docker Compose**
Levanta varios programas de Docker a la vez y los conecta entre sí. Es lo que
corre con `make dev`.

**PostgreSQL (Postgres)**
El motor de base de datos que usamos.

**TypeScript**
JavaScript con control de tipos: avisa de los errores mientras escribís, en vez
de cuando el usuario ya los sufrió.

**Kysely**
La biblioteca con la que el código le habla a la base de datos sin escribir SQL
a mano en todos lados.

**Fastify**
La biblioteca que atiende los pedidos del navegador.

**MinIO**
Un almacén de archivos (imágenes, videos) para tu computador. En el servidor
real se reemplaza por uno de pago, pero funciona igual.

**Mailpit**
Una bandeja de correo falsa. Atrapa los correos del sistema para que puedas
verlos sin enviarlos a nadie de verdad.
