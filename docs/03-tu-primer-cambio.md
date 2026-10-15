# Tu primer cambio

Un ejercicio real, de principio a fin: vamos a agregar la función de
**guardar una publicación en favoritos**.

Es un cambio pequeño pero completo — toca la base de datos, el API y los
permisos — así que al terminarlo vas a haber recorrido todo el circuito.

Tiempo estimado: 1 hora la primera vez.

> La tabla `post_bookmarks` ya existe en la base de datos. Lo que falta es el
> endpoint para usarla. Eso es normal y es buena señal: la estructura de datos
> se diseña antes que las pantallas.

---

## Paso 0. Rama propia

Nunca se trabaja directo sobre `main`. Creá tu rama:

```bash
git checkout -b feat/favoritos
```

El prefijo `feat/` indica que es una funcionalidad nueva. Otros: `fix/` para
arreglos, `docs/` para documentación.

---

## Paso 1. Mirá la tabla

Abrí `db/migrations/20261015000001_init_schema.sql` y buscá `post_bookmarks`:

```sql
CREATE TABLE app.post_bookmarks (
  post_id uuid NOT NULL REFERENCES app.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
```

Leído en castellano:

- Guarda **qué publicación** guardó **qué persona** y **cuándo**.
- `PRIMARY KEY (post_id, user_id)` — la combinación es única. La misma persona
  no puede guardar dos veces la misma publicación. **La base de datos ya lo
  impide**, no hace falta programarlo.
- `ON DELETE CASCADE` en `post_id` — si se borra la publicación, sus favoritos
  desaparecen solos.

No hace falta crear ninguna migración. La tabla ya está.

---

## Paso 2. La lógica

Abrí `apps/api/src/modules/posts/service.ts` y agregá al final:

```ts
/**
 * Guarda o quita una publicación de favoritos.
 *
 * Es un interruptor: si ya estaba guardada la quita, si no estaba la guarda.
 * Así el frontend usa un solo botón en vez de dos.
 */
export async function toggleBookmark(
  db: Database,
  postId: string,
  userId: string,
): Promise<{ bookmarked: boolean }> {
  // ¿ya estaba guardada?
  const existing = await db
    .selectFrom("postBookmarks")
    .select("postId")
    .where("postId", "=", postId)
    .where("userId", "=", userId)
    .executeTakeFirst();

  if (existing) {
    await db
      .deleteFrom("postBookmarks")
      .where("postId", "=", postId)
      .where("userId", "=", userId)
      .execute();
    return { bookmarked: false };
  }

  await db
    .insertInto("postBookmarks")
    .values({ postId, userId })
    .execute();

  return { bookmarked: true };
}
```

**Qué hace cada parte:**

- `selectFrom(...).executeTakeFirst()` — buscá una fila; si no hay, devuelve
  `undefined`. (`executeTakeFirstOrThrow` sería: si no hay, lanzá error.)
- `.where(...)` encadenados — son condiciones unidas con "y".
- `postBookmarks` en vez de `post_bookmarks` — en la base de datos se escribe
  con guión bajo y en el código con mayúscula intermedia. La traducción es
  automática.

---

## Paso 3. El endpoint

En `apps/api/src/modules/posts/routes.ts`, importá la función nueva arriba:

```ts
import { createPost, softDeletePost, toggleBookmark } from "./service.js";
```

Y agregá la ruta dentro de `postRoutes`:

```ts
app.post("/posts/:id/bookmark", async (req, reply) => {
  // 1. Tiene que haber iniciado sesión
  const session = app.requireAuth(req);

  // 2. El id tiene que ser un uuid válido
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

  // 3. Sólo puede guardar lo que puede ver
  const allowed = await canViewPost(app.db, id, session.userId);
  if (!allowed) throw notFound("El post no existe o no tenés acceso");

  // 4. Hacer el trabajo
  const result = await toggleBookmark(app.db, id, session.userId);
  return reply.send(result);
});
```

**Leé el paso 3 otra vez.** Es el más fácil de olvidar y el más grave. Sin esa
verificación, cualquiera podría probar identificadores al azar y confirmar si
existen publicaciones privadas. Se llama *fuga por referencia directa* y es uno
de los agujeros de seguridad más comunes que hay.

Fijate que no se usa `requirePermission`: guardar en favoritos es algo que
cualquier persona registrada puede hacer, no hay un permiso específico. Los
permisos son para acciones que **no** todos tienen.

---

## Paso 4. Probalo

```bash
make restart
```

Después, en otra terminal:

```bash
# Crear un usuario de prueba
curl -c galletas.txt -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"prueba","displayName":"Prueba","email":"prueba@test.co","password":"contrasena-larga-123"}'

# Crear una publicación
curl -b galletas.txt -X POST http://localhost:3000/api/v1/posts \
  -H "Content-Type: application/json" \
  -d '{"title":"Hola","bodyMarkdown":"Mi primera publicación"}'
```

Copiá el `id` que devuelve y probá tu endpoint:

```bash
curl -b galletas.txt -X POST http://localhost:3000/api/v1/posts/EL_ID_ACA/bookmark
```

Debería responder `{"bookmarked":true}`. Repetí el mismo comando: ahora
`{"bookmarked":false}`. El interruptor funciona.

> `-c galletas.txt` guarda la cookie de sesión en un archivo; `-b galletas.txt`
> la vuelve a mandar. Es lo que hace el navegador solo.

---

## Paso 5. Subilo

```bash
git add .
git commit -m "feat: agregar favoritos en publicaciones"
git push origin feat/favoritos
```

Después abrí un Pull Request en la plataforma. En la descripción contá **qué
hiciste y por qué**, no cómo — el cómo ya se ve en el código.

---

## Si algo falló

Es lo normal. Mirá los logs:

```bash
make logs
```

Los errores más frecuentes:

| Dice | Significa |
|---|---|
| `relation "post_bookmarks" does not exist` | Faltan aplicar las migraciones: `make db-up` |
| `Property 'postBookmarks' does not exist` | Faltan generar los tipos: `make db-types` |
| `401 unauthorized` | La cookie no se está mandando. Revisá el `-b galletas.txt` |
| `Cannot find module './service.js'` | En los imports va `.js` aunque el archivo sea `.ts`. No es un error tuyo, es así. |

---

## Lo que practicaste

- Leer una tabla y entender qué garantiza por sí sola
- Separar la lógica (`service.ts`) de la validación (`routes.ts`)
- Verificar permisos **antes** de tocar datos
- Probar un endpoint sin frontend
- El flujo de rama → commit → pull request

Con eso podés tomar cualquier tarea del backlog.
