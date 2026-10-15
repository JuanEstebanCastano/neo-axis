# Cómo funciona

Vamos a seguir **un solo caso** de punta a punta: alguien escribe una
publicación y hace clic en "Publicar". Si entendés este recorrido, entendés el
90% del proyecto, porque todo lo demás sigue el mismo patrón.

---

## El recorrido completo

```
  1. El navegador envía la publicación
         │
         ▼
  2. apps/api/src/server.ts          ← la puerta de entrada
         │
         ▼
  3. apps/api/src/plugins/auth.ts    ← "¿quién sos?" y "¿qué podés hacer?"
         │
         ▼
  4. apps/api/src/modules/posts/routes.ts    ← "¿los datos están bien?"
         │
         ▼
  5. apps/api/src/modules/posts/service.ts   ← acá pasa lo importante
         │
         ├──▶ guarda en la tabla posts
         ├──▶ guarda las etiquetas
         ├──▶ guarda las menciones
         ├──▶ crea las notificaciones
         └──▶ actualiza el índice de búsqueda
         │
         ▼
  6. Responde al navegador: "listo, acá está tu publicación"

  ... mientras tanto, por su cuenta:

  7. apps/worker/   ← ve las notificaciones pendientes y envía los correos
```

Ahora cada paso, con el archivo real.

---

## 1 y 2. La puerta de entrada

**Archivo:** `apps/api/src/server.ts`

Es el primer archivo que corre. Enciende el API y le va montando capas, en
orden. Pensalo como la entrada de un edificio: guardia, recepción, ascensor.

```
helmet      → cabeceras de seguridad
cors        → sólo nuestro sitio puede hacer pedidos
cookie      → saber leer la cookie de sesión
rateLimit   → nadie puede hacer 10.000 pedidos por minuto
db          → conexión a la base de datos
auth        → identificar al visitante
rutas       → finalmente, atender el pedido
```

El orden importa: no se puede identificar al visitante antes de saber leer
cookies.

---

## 3. ¿Quién sos y qué podés hacer?

**Archivo:** `apps/api/src/plugins/auth.ts`

En **cada** pedido que llega, este archivo:

1. Lee la cookie de sesión del navegador.
2. Busca esa sesión en la base de datos. Si no existe, venció o fue anulada,
   el visitante queda como anónimo.
3. Si existe, carga la lista de permisos de esa persona.

Importante: **no bloquea a nadie**. Sólo averigua y anota. Quien decide
bloquear es cada ruta, más adelante. Un visitante anónimo puede leer el feed
perfectamente.

---

## 4. ¿Los datos están bien?

**Archivo:** `apps/api/src/modules/posts/routes.ts`

Acá se define el endpoint `POST /posts`. Hace dos controles antes de dejar
pasar nada:

**Control de permisos.** `app.requirePermission("posts.create")`. Si la persona
no tiene ese permiso, se corta con un error 403 y nunca se llega a la base de
datos.

**Control de datos.** Un esquema de `zod` revisa que lo que llegó tenga sentido:
que el título no pase de 240 caracteres, que no manden 500 etiquetas, que haya
al menos título o cuerpo. Todo lo que viene del navegador es sospechoso hasta
que se valida.

> **Por qué las rutas son tan cortas**
> Una ruta sólo valida y delega. No contiene lógica del negocio. Así, cuando
> mañana la misma acción tenga que dispararse desde otro lado (una tarea
> programada, un comando), se reutiliza la función y no hay que copiar nada.

---

## 5. Lo importante

**Archivo:** `apps/api/src/modules/posts/service.ts`, función `createPost`

Crear una publicación toca **cinco** tablas:

| Tabla | Para qué |
|---|---|
| `posts` | la publicación en sí |
| `post_tags` | sus etiquetas |
| `post_mentions` | a quién mencionó |
| `notifications` | avisarle a los mencionados |
| `search_documents` | que aparezca al buscar |

Todo eso va dentro de **una transacción**: o se escriben las cinco, o ninguna.

Imaginá que no fuera así y fallara la última. Quedaría una publicación
guardada que **nunca aparece al buscar**, y nadie se enteraría hasta que un
usuario reclame meses después. Esos son los errores más caros: los que no
avisan.

Por eso la línea clave del archivo es:

```ts
return db.transaction().execute(async (trx) => {
  // todo lo que pase acá adentro es todo-o-nada
});
```

---

## 7. El worker, por su cuenta

**Archivo:** `apps/worker/src/index.ts`

Corre en un ciclo infinito, simple:

```
mirar si hay correos pendientes
   ¿hay?  → enviarlos, marcarlos como enviados
   ¿no?   → dormir 5 segundos
repetir
```

**Por qué existe separado del API.** Enviar un correo puede tardar 3 segundos,
o fallar porque el servidor de correo está caído. Si lo hiciera el API, la
persona vería la pantalla congelada y, si fallara el correo, perdería la
publicación entera.

Con el worker aparte: el API guarda y responde al instante. El correo se manda
cuando se pueda, y si falla se reintenta solo, con esperas cada vez más largas
(1 minuto, 2, 4, 8...). A los 5 intentos se marca como fallido y alguien lo
revisa.

---

## El patrón que se repite

Todo el proyecto sigue esta forma. Cuando agregues comentarios, eventos o
reseñas, va igual:

```
routes.ts    →  valida permisos y datos. Corto.
service.ts   →  hace el trabajo real, en transacción. Acá va la lógica.
lib/         →  utilidades compartidas entre módulos
plugins/     →  cosas que corren en cada pedido
```

Si te encontrás escribiendo lógica de negocio dentro de un `routes.ts`, está en
el lugar equivocado.

---

## Dónde está cada cosa

| Quiero tocar... | Andá a |
|---|---|
| La estructura de la base de datos | `db/migrations/` |
| Una dirección del API | `apps/api/src/modules/<tema>/routes.ts` |
| La lógica de una acción | `apps/api/src/modules/<tema>/service.ts` |
| Inicio de sesión, registro | `apps/api/src/modules/auth/routes.ts` |
| Permisos | `apps/api/src/lib/rbac.ts` |
| Búsqueda | `apps/api/src/lib/search.ts` |
| Envío de correos | `apps/worker/src/jobs/email.ts` |
| Qué servicios se levantan | `docker-compose.yml` |
