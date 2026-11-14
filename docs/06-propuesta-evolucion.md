# Propuesta de evolución

Documento de propuesta para el trabajo final. Parte del esquema que **ya existe**
y plantea hacia dónde crece Neo Axis.

---

## La idea en una frase

> **Una _Colección_ reúne el libro que explica un tema y el código que lo
> practica.** Goodreads no tiene código; GitHub no tiene libros. El cruce es el
> diferenciador de Neo Axis.

---

## De qué parte (lo que ya había)

El esquema gira alrededor de `posts`: todo "cuelga" de un post (reseñas,
snippets, repos, videos, eventos) y encima tiene lo social, moderación,
notificaciones y un índice de búsqueda full-text (`search_documents`).

Dos brechas frente al nombre del proyecto:

| Pilar | Antes | Problema |
|---|---|---|
| Biblioteca virtual | `books` = solo ficha (título, ISBN, `cover_url`) | No se podía **leer** un libro ni llevar una estantería. |
| Repositorio estilo GitHub | `github_repositories` = solo un enlace | No agrupa ni da contexto de aprendizaje. |

---

## El esquema nuevo

```
                    ┌───────────────────────┐
                    │      COLECCIÓN         │  "Aprender Clean Architecture"
                    │  app.collections       │
                    └───────────┬───────────┘
                                │ app.collection_items (orden + nota)
          ┌──────────────┬──────┴───────┬──────────────┐
          ▼              ▼              ▼              ▼
      LIBRO           REPO           SNIPPET         POST / evento
   app.books   app.github_repos  app.post_snippets  app.posts
          │
          │ el catálogo se vuelve biblioteca REAL:
          ├── app.book_files   → archivo EPUB/PDF (usa app.media_assets)
          └── app.book_shelves → quiero leer / leyendo / leído + progreso
```

### Tablas agregadas

| Tabla | Qué guarda | Claves |
|---|---|---|
| `app.collections` | Una colección/ruta de aprendizaje | `owner_id`, `visibility` (reusa el enum existente), soft-delete |
| `app.collection_items` | Ítems ordenados; **polimórficos** | `item_type` + FK a book/repo/snippet/post, con CHECK de "exactamente uno" |
| `app.book_files` | El archivo descargable del libro | `media_asset_id`, `format` (epub/pdf/mobi), `access_level` |
| `app.book_shelves` | Estantería del usuario | PK (`user_id`,`book_id`), `status`, `progress 0–100` |

### Recomendaciones semánticas (pgvector)

- Extensión `vector` activada (schema `extensions`).
- Columna `app.search_documents.embedding vector(384)` + índice **HNSW** (coseno).
- 384 dimensiones = modelo `gte-small` de Supabase.
- **Pendiente de app:** generar los embeddings (Edge Function con `gte-small`) al
  indexar cada entidad. El esquema ya está listo para recibirlos.

---

## Alcance sugerido para el trabajo final

1. **Colecciones** (`collections` + `collection_items`) — el diferenciador.
2. **Biblioteca real** (`book_files` + `book_shelves`) — leer y seguir progreso.
3. **Recomendaciones** (pgvector) — "libros y repos parecidos a este".

Acotado, demostrable y con una historia clara para la defensa.

---

## Estado

- Las 4 tablas y pgvector **ya están aplicados en Supabase** (schema `app`, 46 tablas).
- Migraciones versionadas en `db/migrations/`:
  - `20261105120001_colecciones_biblioteca.sql`
  - `20261105120002_pgvector_recomendaciones.sql`
- Tipos de TypeScript regenerados (`pnpm db:types`).

## Próximos pasos (capa de aplicación)

1. Endpoints de colecciones (crear, agregar ítem, listar) — reusa el patrón de `modules/posts`.
2. ~~Subida y lectura protegida de `book_files` (presigned URLs de S3 según `access_level`).~~
   **Hecho** → [11-archivos-de-libros.md](11-archivos-de-libros.md).
3. Edge Function de embeddings + endpoint `/recomendaciones`.
