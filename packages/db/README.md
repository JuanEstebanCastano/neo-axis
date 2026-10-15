# packages/db — La conexión a la base de datos

Paquete compartido: lo usan tanto el API como el worker.

## Qué contiene

- **`index.ts`** — crea la conexión y verifica al arrancar que la versión de
  PostgreSQL sea la correcta.
- **`schema.d.ts`** — **archivo generado, no lo edites.** Contiene el tipado de
  todas las tablas, creado automáticamente leyendo la base de datos real.

## La idea central del proyecto

**La base de datos es la fuente de verdad.** El código TypeScript se genera a
partir de ella, nunca al revés.

Esto significa que si agregás una columna con una migración y después escribís
mal su nombre en el código, el editor te lo marca en rojo al instante — antes
de ejecutar nada, antes de que un usuario lo sufra.

Para que eso funcione, cada vez que cambia la estructura:

```bash
make db-up      # aplicar la migración
make db-types   # regenerar el tipado
```

Si te saltás el segundo paso, TypeScript sigue creyendo que la tabla tiene las
columnas viejas y vas a ver errores confusos.
