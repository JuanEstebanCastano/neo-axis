# packages/db — La conexión a la base de datos

Paquete compartido: lo usan tanto el API como el worker.

## Qué contiene

- **`index.ts`** — crea la conexión y verifica al arrancar que la versión de
  PostgreSQL sea la correcta.
- **`schema.d.ts`** — **archivo generado, no lo edites a mano.** Contiene el tipado
  de todas las tablas, creado leyendo la base de datos real. ⚠️ **Está versionado
  (commiteado), no ignorado**: es *input* del build de Docker/Railway, que no tiene
  BD para generarlo en la construcción. Como queda en git, **se puede desincronizar**
  del esquema si alguien cambia la base y no lo regenera (ver abajo).

## La idea central del proyecto

**La base de datos es la fuente de verdad.** El código TypeScript se genera a
partir de ella, nunca al revés.

Esto significa que si agregás una columna con una migración y después escribís
mal su nombre en el código, el editor te lo marca en rojo al instante — antes
de ejecutar nada, antes de que un usuario lo sufra.

Para que eso funcione, cada vez que cambia la estructura:

```bash
make db-up      # aplicar la migración   (o: pnpm db:up)
make db-types   # regenerar el tipado     (o: pnpm db:types)
git add packages/db/src/schema.d.ts && git commit   # ⚠️ ¡commitealo!
```

Si te saltás `db-types`, TypeScript sigue creyendo que la tabla tiene las columnas
viejas y vas a ver errores confusos. Y si no **commiteás** el `schema.d.ts`
regenerado, el build de Railway (que no tiene BD) compila con el tipado viejo o
falla. Regla: **cambió el esquema → `db:types` → commit del `schema.d.ts`.**
