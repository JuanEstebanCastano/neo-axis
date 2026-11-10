# Repositorios de GitHub

La pantalla **Repos** te deja trabajar con tus repositorios de GitHub sin salir
de Neo Axis: mirar sus carpetas, abrir un archivo, editarlo, subir archivos del
disco y ver el historial.

Es la otra mitad de [Snippets con GitHub](08-github-snippets.md). Un gist sirve
para un archivo suelto con historial; un repositorio, para un proyecto con
carpetas.

---

## Lo que podés hacer

| En la pantalla | Qué pasa en GitHub |
|---|---|
| Elegir un repositorio | Nada. Sólo se recuerda cuál para la próxima vez. |
| **Repositorio nuevo** | `POST /user/repos`: se crea público y con README. |
| Navegar carpetas | Se lee en vivo. Acá no se guarda ningún archivo. |
| Abrir un archivo | Se baja su contenido y se muestra editable. |
| **Guardar en GitHub** | Un commit con tu nombre, en tu cuenta. |
| **Subir archivos** | Un commit por archivo, en orden. |
| **Borrar** | Un commit que elimina el archivo (queda en el historial). |
| **Historial** | Los commits del repo, o los de un archivo si tenés uno abierto. |

---

## El permiso que hace falta

`public_repo`. Es el más acotado que permite escribir: sólo repositorios
**públicos**. Neo Axis no puede ni ver tus repositorios privados.

Se pide junto con los otros al conectar la cuenta. **Si conectaste tu cuenta
antes de que esto existiera**, tu token no lo tiene: la pantalla te lo dice y te
ofrece reconectar. Los gists que ya hayas publicado no se tocan.

Si alguna vez hiciera falta trabajar con repositorios privados, el permiso sería
`repo` — que da lectura y escritura sobre **todos**, públicos y privados, sin
término medio. Es una decisión a tomar con quien usa la app, no un cambio de una
línea.

---

## Decisiones que vale la pena conocer

**Un archivo, un commit.** Cuando subís diez archivos se hacen diez commits, no
uno. Es a propósito: así el historial de GitHub dice qué cambió y cuándo, archivo
por archivo, que es lo que uno busca cuando algo se rompe. Si uno falla a la
mitad, los anteriores ya están subidos —contra una API remota no hay
transacción— y por eso la pantalla muestra qué entró y qué no, en vez de un sí o
no global.

**El `sha` es lo que evita pisar el trabajo ajeno.** Para reemplazar un archivo,
GitHub exige el sha de la versión que creés estar reemplazando. Si alguien lo
cambió mientras lo editabas, responde un conflicto en vez de aplastar ese cambio.
Cuando el frontend no lo manda, el API lo averigua antes de escribir.

**Los repos nuevos nacen con README.** Sin ese primer commit, un repositorio no
tiene rama todavía, y la API de contenidos no tiene dónde poner el archivo. Es la
causa número uno de "creé el repo y no puedo subir nada".

**Nada se guarda acá.** Los archivos viven en GitHub y se consultan en vivo. Lo
único que persiste Neo Axis es qué repositorio elegiste (`default_repo`), para no
preguntártelo cada vez. Si lo renombrás o lo borrás en GitHub, acá queda un
nombre que ya no resuelve y la pantalla te pide elegir otro.

**Binarios y archivos grandes se muestran, no se editan.** Un PNG no es texto: se
detecta y se ofrece verlo en GitHub en vez de romper el editor. Arriba de 1 MB,
GitHub directamente no manda el contenido por esta vía.

---

## Límites

- **5 MB por archivo** y **20 archivos por subida**. Por encima de eso, la API de
  contenidos deja de ser la herramienta correcta.
- **5.000 peticiones por hora**, compartidas con cualquier otro token tuyo.
  Navegar carpetas consume de ahí: cada carpeta es una petición.
- Se listan sólo tus repositorios **públicos** y donde sos dueño. Aquellos en los
  que sólo colaborás no aparecen: con `public_repo` quizá no puedas escribir, y
  ofrecerlo sería prometer algo que después falla.

---

## Direcciones del API

| Método y ruta | Qué hace |
|---|---|
| `GET /api/v1/repos` | Tus repositorios y cuál está elegido. |
| `POST /api/v1/repos` | Crea uno público. |
| `PUT /api/v1/repos/default` | Fija cuál se abre al entrar. |
| `GET /api/v1/repos/:owner/:repo/contents?path=` | Carpeta o archivo, según la ruta. |
| `PUT /api/v1/repos/:owner/:repo/contents` | Crea o reemplaza un archivo (un commit). |
| `POST /api/v1/repos/:owner/:repo/upload` | Varios archivos, un commit cada uno. |
| `DELETE /api/v1/repos/:owner/:repo/contents` | Borra un archivo. |
| `GET /api/v1/repos/:owner/:repo/commits?path=` | Historial del repo o de un archivo. |

Todas piden sesión iniciada y verifican el permiso `public_repo` antes de hablar
con GitHub.
