# Snippets con control de versiones (GitHub)

Los snippets de Neo Axis pueden publicarse como **gists** en la cuenta de
GitHub de su autor. A partir de ahí, cada edición queda versionada: GitHub
guarda el historial, los diffs y quién hizo cada cambio.

Neo Axis **no reimplementa Git**. Habla con la API de GitHub.

---

## Por qué gists y no repositorios

Un gist *es* un repositorio de Git, sólo que de fragmentos sueltos y sin ramas.
Para lo que hace este apartado —compartir un archivo de código y poder ver su
historia— alcanza y sobra, con una fracción del trabajo que lleva manejar
árboles de archivos, ramas y pull requests.

La fase siguiente (repos completos con la API de repos: `POST /user/repos`,
Contents API y Git Data API) reutiliza tal cual el OAuth, el cliente HTTP y la
tabla de conexiones que ya están hechos.

---

## Qué hace cada pieza

| Archivo | Para qué |
|---|---|
| `apps/api/src/modules/github/client.ts` | Lo único que conoce `api.github.com`. Entra un token, sale un dato. |
| `apps/api/src/modules/github/service.ts` | Guarda y renueva el token de cada usuario, cifrado. |
| `apps/api/src/modules/github/routes.ts` | El baile de OAuth: conectar, callback, desconectar. |
| `apps/api/src/modules/snippets/service.ts` | Publicar, editar, sincronizar, importar e historial. |
| `apps/api/src/lib/crypto.ts` | Cifra el token con AES-256-GCM. |

---

## Configuración (una sola vez)

**1. Creá una OAuth App en GitHub**

Settings → Developer settings → OAuth Apps → *New OAuth App*.

- **Homepage URL**: la del frontend (por ejemplo `https://neo-axis.vercel.app`).
- **Authorization callback URL**: la del API, exactamente esta ruta:
  `https://TU-API/api/v1/github/callback`

Si no coincide carácter por carácter con `GITHUB_CALLBACK_URL`, GitHub rechaza
el flujo.

**2. Generá la clave de cifrado**

```bash
openssl rand -hex 32
```

**3. Completá el `.env`**

```
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_CALLBACK_URL=https://TU-API/api/v1/github/callback
TOKEN_ENCRYPTION_KEY=<los 64 caracteres del paso 2>
```

Las cuatro van juntas: si ponés `GITHUB_CLIENT_ID` y falta alguna, **el API no
arranca** y te dice cuál. Si no ponés ninguna, la integración queda apagada y
los snippets funcionan como siempre (el panel de GitHub ni aparece).

**4. Migrá la base y regenerá los tipos**

```bash
pnpm db:up
pnpm db:types
```

---

## Permisos que se le piden a GitHub

Tres, y son los mínimos para lo que hace la app:

- `gist` — crear y editar gists del usuario.
- `read:user` — saber qué cuenta se conectó (login y avatar).
- `public_repo` — leer y escribir en sus repositorios **públicos**
  (ver `docs/09-github-repositorios.md`).

No se pide `repo`, que es el permiso amplio: ese incluiría también los
repositorios **privados**, y daría escritura sobre todos ellos. Con
`public_repo`, Neo Axis no puede ni ver un repositorio privado.

> Si conectaste tu cuenta antes de que existiera la parte de repositorios, tu
> token es anterior a `public_repo` y no alcanza. La interfaz lo detecta y te
> ofrece reconectar; los gists que ya publicaste no se tocan.

---

## Direcciones del API

| Método y ruta | Qué hace |
|---|---|
| `GET /api/v1/github/status` | Si la integración está encendida y qué cuenta hay conectada. |
| `GET /api/v1/github/connect` | Manda al usuario a GitHub. Es una navegación, no un fetch. |
| `GET /api/v1/github/callback` | Vuelta de GitHub. Redirige al frontend con `?github=...`. |
| `DELETE /api/v1/github/connection` | Borra el token. Los gists quedan intactos. |
| `POST /api/v1/snippets/:id/gist` | Publica el snippet como gist. |
| `PUT /api/v1/snippets/:id` | Edita. Si hay gist, genera una revisión nueva. |
| `POST /api/v1/snippets/:id/sync` | Trae de GitHub la última versión. |
| `DELETE /api/v1/snippets/:id/gist` | Corta el vínculo (el gist sobrevive). |
| `GET /api/v1/snippets/:id/revisions` | Historial de revisiones. |
| `GET /api/v1/snippets/:id/revisions/:sha` | Contenido en esa revisión. |
| `POST /api/v1/snippets/import` | Importa un gist que ya existe. |

---

## Decisiones que vale la pena conocer

**El token se cifra, no se hashea.** Una contraseña se guarda hasheada porque
nunca hay que recuperarla. Un token de GitHub hay que usarlo, así que se cifra
con AES-256-GCM y la clave vive en el entorno, no en la base. Si se filtra la
base sin la clave, los tokens no sirven.

**El token nunca llega al navegador.** Todas las llamadas a GitHub las hace el
servidor. El frontend sólo se entera de si hay conexión y de qué cuenta es.

**El `state` del OAuth viaja en una cookie firmada** y se consume en el primer
intento. Sin eso, cualquiera podría enganchar su cuenta de GitHub a la sesión
de otra persona.

**La copia local no es decorativa.** `source_code` guarda la última revisión
vista. Si GitHub se cae, se agota el límite de peticiones o el usuario revoca
el permiso, el snippet se sigue viendo; lo único que se pierde es el historial.

**Un archivo por snippet.** El modelo local tiene un `source_code` y un
`filename`. Un gist puede tener varios archivos: al importarlo, la copia local
toma el primero, y el historial muestra todos.

---

## Límites de GitHub que te van a morder

- **5.000 peticiones por hora** por usuario autenticado, y ese cupo se
  **comparte** con cualquier otro token de esa persona. Al agotarlo, la API
  devuelve 403 o 429 con `x-ratelimit-remaining: 0`; el cliente lo traduce a un
  429 nuestro con el mensaje de cuántos minutos faltan.
- **Lectura anónima: 60 por hora.** Por eso, cuando el que mira es el autor y
  tiene su cuenta conectada, se usa su token.
- **2.000 canjes de token por hora** por OAuth App.
- Si el usuario revoca el acceso desde GitHub, la próxima llamada da 401 y la
  interfaz le pide reconectar.

---

## Probarlo en local

El callback tiene que ser una URL a la que GitHub pueda llegar. En local, o
exponés el API con un túnel (`ngrok http 3000`) y usás esa URL en la OAuth App,
o creás una segunda OAuth App de desarrollo apuntando a `http://localhost:3000`
(GitHub acepta `localhost` sin HTTPS sólo para desarrollo).
