# Empezar acá

Bienvenido/a. Este documento es el único que tenés que leer para arrancar.
No necesitás saber de bases de datos, ni de Docker, ni de TypeScript.

Toma unos 20 minutos. Si algo falla, no es tu culpa: andá directo a
[Problemas comunes](04-problemas-comunes.md), ahí está casi todo resuelto.

---

## Qué es este proyecto

Neo Axis es una red social para una comunidad: la gente publica, comenta,
reacciona, reseña libros, comparte código y organiza eventos.

Está partido en tres programas que corren al mismo tiempo:

```
   ┌──────────────┐
   │   Navegador  │   la persona que usa la app
   └──────┬───────┘
          │ pide y envía datos
          ▼
   ┌──────────────┐        ┌──────────────────────┐
   │     API      │───────▶│   Base de datos      │
   │ (apps/api)   │        │   (PostgreSQL)       │
   └──────────────┘        └──────────┬───────────┘
                                      │
   ┌──────────────┐                   │
   │   Worker     │◀──────────────────┘
   │(apps/worker) │   revisa si hay correos pendientes y los manda
   └──────────────┘
```

- **API** — atiende al navegador. Alguien hace clic en "Publicar" y el API
  guarda la publicación. Responde rápido y se olvida.
- **Base de datos** — donde vive toda la información. Es el corazón del
  proyecto: todo lo demás se adapta a ella.
- **Worker** — trabaja solo, en segundo plano. Nadie lo llama: cada 5 segundos
  mira si hay correos por enviar y los envía. Si el API tuviera que mandar los
  correos, la persona esperaría 3 segundos mirando una pantalla congelada.

---

## Instalación

### 1. Instalá Docker

Docker hace que todo el proyecto (la base de datos, el API, el worker, el
servidor de correo de prueba) se levante con **un solo comando**, igual en tu
computador que en el de cualquier otro. Sin Docker tendrías que instalar y
configurar cinco cosas a mano.

- Windows / macOS: [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Linux: `curl -fsSL https://get.docker.com | sh`

Verificá que quedó bien:

```bash
docker --version
```

Si te responde algo como `Docker version 27.x`, listo.

### 2. Descargá el proyecto

```bash
git clone <url-del-repositorio>
cd neo-axis
```

### 3. Preparalo

```bash
make setup
```

Este comando revisa que tengas todo lo necesario, crea tu archivo de
configuración personal y genera las claves secretas. Te va diciendo qué hace.

### 4. Prendelo

```bash
make dev
```

La primera vez tarda varios minutos: está descargando y construyendo todo.
Las siguientes veces arranca en segundos.

Cuando termine, abrí estas direcciones en el navegador:

| Dirección | Qué es |
|---|---|
| http://localhost:3000/health | El API respondiendo. Si ves `{"status":"ok"}`, funciona. |
| http://localhost:8025 | Bandeja de correo de prueba. Los correos del sistema caen acá, no se envían de verdad. |
| http://localhost:9001 | Donde se guardan las imágenes y archivos subidos. |

Para apagar todo: `make stop`

---

## Ya está corriendo. ¿Ahora qué?

Elegí según lo que vayas a hacer:

| Si querés... | Leé |
|---|---|
| Entender cómo se mueven los datos adentro | [Cómo funciona](02-como-funciona.md) |
| Hacer tu primer cambio de verdad | [Tu primer cambio](03-tu-primer-cambio.md) |
| Saber qué significa una palabra rara | [Glosario](01-glosario.md) |
| Algo se rompió | [Problemas comunes](04-problemas-comunes.md) |
| Entender por qué se eligió cada herramienta | [Decisiones](05-decisiones.md) |

---

## Regla de oro

**Si algo no se entiende, el problema es de la documentación, no tuyo.**

Abrí un issue con el título "No entiendo X" y describilo con tus palabras. Eso
es una contribución real y de las más valiosas: quien escribió el código ya
perdió la capacidad de ver qué parte es confusa.
