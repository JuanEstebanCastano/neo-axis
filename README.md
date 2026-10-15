# Neo Axis

Plataforma de comunidad: publicaciones, comentarios, reseñas de libros,
fragmentos de código y eventos.

Proyecto abierto a colaboradores **con y sin experiencia técnica**. Si nunca
programaste, empezá por [Empezar acá](docs/00-empezar-aqui.md) — está escrito
para eso.

---

## Arranque rápido

```bash
git clone <url-del-repositorio>
cd neo-axis
make setup     # revisa requisitos y prepara la configuración
make dev       # levanta todo
```

Listo. Abrí http://localhost:3000/health

¿Problemas? → [Problemas comunes](docs/04-problemas-comunes.md) o `make doctor`

---

## ¿Por dónde empiezo?

| Si sos... | Leé esto |
|---|---|
| Nuevo/a en el proyecto | [Empezar acá](docs/00-empezar-aqui.md) |
| Nuevo/a en programación | [Glosario](docs/01-glosario.md) → [Cómo funciona](docs/02-como-funciona.md) |
| Alguien que quiere contribuir ya | [Tu primer cambio](docs/03-tu-primer-cambio.md) |
| Programador/a con experiencia | [Decisiones](docs/05-decisiones.md) + lo que sigue acá abajo |

---

## Qué hay adentro

Tres programas que corren juntos:

```
Navegador ──▶ API ──▶ Base de datos ◀── Worker
                                        (envía correos en segundo plano)
```

| Carpeta | Qué es | Detalle |
|---|---|---|
| `db/` | Estructura de la base de datos | [README](db/README.md) |
| `apps/api/` | Atiende al navegador | [README](apps/api/README.md) |
| `apps/worker/` | Tareas de fondo | [README](apps/worker/README.md) |
| `packages/db/` | Conexión compartida | [README](packages/db/README.md) |
| `ops/` | Puesta en producción | [README](ops/README.md) |
| `docs/` | Documentación | [índice](docs/README.md) |

Cada carpeta explica qué vive ahí. No hace falta leer todo.

---

## Comandos

Escribí `make` solo para ver la lista completa. Los más usados:

| Comando | Qué hace |
|---|---|
| `make setup` | Preparar el proyecto (sólo la primera vez) |
| `make dev` | Levantar todo |
| `make stop` | Apagar |
| `make restart` | Reiniciar tras cambiar código |
| `make logs` | Ver qué está pasando |
| `make doctor` | Diagnosticar el entorno |
| `make reset` | Borrar datos locales y empezar de cero |
| `make db-up` | Aplicar migraciones |
| `make db-types` | Regenerar tipos tras cambiar la base |

---

## Tecnologías

TypeScript · Node 22 · Fastify · PostgreSQL 18 · Kysely · Docker

El [documento de decisiones](docs/05-decisiones.md) explica por qué cada una,
y qué se descartó.

---

## Durante el desarrollo

| Dirección | Qué es |
|---|---|
| http://localhost:3000/health | El API |
| http://localhost:8025 | Correos de prueba (no se envían de verdad) |
| http://localhost:9001 | Archivos subidos |

---

## Contribuir

Leé [CONTRIBUTING.md](CONTRIBUTING.md). Resumen: rama propia, cambio,
prueba, pull request.

Los issues marcados `good first issue` están pensados para quien recién llega.

**Si algo no se entiende, abrí un issue titulado "No entiendo X".** Es una
contribución real: quien escribió el código ya perdió la capacidad de ver qué
parte resulta confusa.
