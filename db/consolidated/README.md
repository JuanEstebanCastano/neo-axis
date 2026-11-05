# db/consolidated/ — Snapshots del esquema en un solo archivo

Estos archivos **no son la fuente de verdad**. La fuente de verdad son las
migraciones de [`../migrations/`](../migrations), que se aplican en orden.

Acá vive el esquema completo volcado en **un único archivo**, por comodidad
(levantar una base desde cero de una sola corrida, revisar todo junto, etc.).

| Archivo | Para qué | uuidv7() |
|---|---|---|
| `neo_axis_pg18.sql` | PostgreSQL 18 o superior (Docker local) | nativa |
| `neo_axis_supabase.sql` | Supabase / PostgreSQL 17 | `app.uuidv7()` de compatibilidad |

Ambos incluyen `init` + `review_fixes` y quedan equivalentes al resultado de
aplicar las dos migraciones en orden.

## Importante
- Si cambiás el esquema, **creá una migración nueva** en `../migrations/`
  (nunca edites una migración ya aplicada). Estos snapshots son secundarios:
  regeneralos a mano sólo si querés mantenerlos al día.
- El estado actual del proyecto Supabase se corresponde con
  `neo_axis_supabase.sql`.
