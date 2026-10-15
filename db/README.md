# db/ — La base de datos

Acá vive la **estructura** de la base de datos. No los datos: la forma.

## migrations/

Cada archivo es un cambio a la estructura. Se aplican en orden por su número
al inicio del nombre.

| Archivo | Qué hace |
|---|---|
| `20261015000001_init_schema.sql` | Crea las 42 tablas originales |
| `20261015000002_review_fixes.sql` | Correcciones encontradas al revisar el diseño |

## Las tres reglas

**1. Una migración aplicada no se edita nunca más.**
Si ya la subiste al repositorio y alguien más la aplicó, editarla deja la base
de cada persona distinta. Para cambiar algo, creá una migración nueva.

**2. Toda migración necesita su reverso.**
Cada archivo tiene dos partes: `-- migrate:up` (el cambio) y `-- migrate:down`
(cómo deshacerlo). La segunda parece innecesaria hasta la noche en que un
despliegue sale mal.

**3. Después de migrar, regenerá los tipos.**
```bash
make db-up
make db-types
```
Si no, TypeScript sigue creyendo que la tabla tiene las columnas viejas.

## Crear una migración

```bash
make db-new nombre=agregar_telefono_a_usuarios
```

Crea el archivo con la estructura lista. Lo llenás así:

```sql
-- migrate:up
ALTER TABLE app.users ADD COLUMN phone varchar(30);

-- migrate:down
ALTER TABLE app.users DROP COLUMN phone;
```

## Mirar la base por dentro

```bash
make db-shell
```

Comandos útiles una vez adentro:

```
\dt app.*              ver todas las tablas
\d app.users           ver las columnas de una tabla
SELECT * FROM app.users LIMIT 5;
\q                     salir
```
