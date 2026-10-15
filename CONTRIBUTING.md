# Cómo contribuir

Este proyecto es para aprender. **No hace falta experiencia previa.** Si algo de
acá no se entiende, eso es un error de la documentación y vale la pena
reportarlo.

---

## El ciclo completo

```
1. Elegí una tarea
2. Creá tu rama
3. Hacé el cambio
4. Probá que funcione
5. Subilo y abrí un Pull Request
6. Alguien lo revisa, charlan, se corrige
7. Se integra
```

---

## 1. Elegir una tarea

Mirá los issues marcados `good first issue`. Están pensados para quien recién
llega.

Dejá un comentario diciendo "tomo esta" antes de empezar, para que dos personas
no hagan lo mismo.

## 2. Crear tu rama

Nunca se trabaja directo sobre `main`.

```bash
git checkout main
git pull
git checkout -b feat/nombre-corto
```

Prefijos:

| Prefijo | Para |
|---|---|
| `feat/` | funcionalidad nueva |
| `fix/` | arreglar algo roto |
| `docs/` | documentación |
| `refactor/` | reorganizar código sin cambiar lo que hace |

## 3. Hacer el cambio

Seguí el patrón que ya existe. Si agregás una ruta, copiá la forma de las
rutas que están. La consistencia vale más que la originalidad.

**Comentá el "por qué", no el "qué".**

```ts
// ✗ sobra: el código ya lo dice
// incrementa el contador en uno
contador += 1;

// ✓ sirve: explica algo que el código no puede
// Se verifica contra un hash falso cuando el usuario no existe, para que el
// tiempo de respuesta no revele qué correos están registrados.
```

## 4. Probar

```bash
make restart
make logs
```

Probá tu cambio de verdad, a mano. Y probá también **el caso que falla**: ¿qué
pasa si mando datos inválidos? ¿Si no inicié sesión?

## 5. Subirlo

```bash
git add .
git commit -m "feat: agregar favoritos en publicaciones"
git push origin feat/favoritos
```

El mensaje del commit arranca con el mismo prefijo de la rama y describe el
cambio en una línea, en presente.

## 6. El Pull Request

En la descripción contá:

- **Qué** hace el cambio
- **Por qué** hacía falta
- **Cómo probarlo** (los pasos exactos)

No expliques *cómo* lo hiciste: eso ya se ve en el código.

---

## La revisión de código

Alguien va a leer tu cambio y va a dejar comentarios. **Eso no es una crítica
personal.** Es el mecanismo por el que el proyecto no se degrada y por el que
todos aprenden.

**Si recibís comentarios:** preguntá lo que no entiendas. "¿Por qué es mejor
así?" es una pregunta excelente y nadie se molesta.

**Si revisás a otra persona:** explicá el motivo, no sólo el cambio. "Esto
debería ir en `service.ts`" ayuda a medias; "esto debería ir en `service.ts`
porque mañana el worker va a necesitar lo mismo y desde ahí no hay un pedido
HTTP" enseña.

---

## Reglas que no se negocian

**1. El `.env` no se sube.** Tiene contraseñas. Ya está en `.gitignore`; no lo
saques de ahí.

**2. Una migración publicada no se edita.** Si ya está en `main`, creá una
nueva.

**3. Verificá permisos antes de tocar datos.** En toda ruta que lea o escriba
algo de alguien, preguntá primero si esta persona puede.

**4. Nada de `console.log` olvidados.** Para mensajes permanentes usá el logger
del proyecto (`req.log.info`).

---

## Preguntar está bien

Preguntar temprano ahorra días. El orden sugerido:

1. [Problemas comunes](docs/04-problemas-comunes.md)
2. `make doctor`
3. Buscá en los issues cerrados: quizás ya pasó
4. Preguntá, pegando el comando, el error completo y la salida de `make doctor`

Nadie va a juzgarte por preguntar. Sí se nota cuando alguien pierde tres días
callado por un problema de diez minutos.
