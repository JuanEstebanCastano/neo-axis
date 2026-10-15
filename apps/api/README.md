# apps/api — El API

El programa que atiende al navegador. Recibe pedidos, consulta la base de
datos, responde.

## Estructura

```
src/
├── server.ts        Enciende todo. Empezá a leer por acá.
├── config.ts        Lee la configuración y la valida
├── plugins/         Cosas que corren en CADA pedido
│   ├── db.ts        Conexión a la base de datos
│   └── auth.ts      Identifica al visitante y carga sus permisos
├── lib/             Utilidades compartidas
│   ├── session.ts   Crear, verificar y anular sesiones
│   ├── rbac.ts      Permisos y visibilidad
│   ├── password.ts  Cifrado de contraseñas
│   ├── search.ts    Índice de búsqueda
│   └── errors.ts    Errores con su código HTTP
└── modules/         Un módulo por tema
    ├── auth/        Registro, inicio y cierre de sesión
    └── posts/       Publicaciones y búsqueda
```

## La regla de los dos archivos

Cada módulo se parte en dos, y la separación no es decorativa:

**`routes.ts`** — define las direcciones. Es **corto**. Sólo hace tres cosas:
1. verifica permisos
2. valida que los datos que llegaron tengan sentido
3. llama a `service.ts`

**`service.ts`** — hace el trabajo real. Acá va toda la lógica: transacciones,
escrituras, reglas del negocio.

**Por qué.** Mañana la misma acción va a tener que dispararse desde otro lado
—una tarea programada, un script de migración, un comando de consola— y ahí no
hay un pedido HTTP del que sacar los datos. Si la lógica vive en la ruta, hay
que copiarla; si vive en el servicio, se reutiliza.

Si estás escribiendo una transacción dentro de un `routes.ts`, está en el lugar
equivocado.

## Agregar un módulo nuevo

1. Creá la carpeta: `src/modules/eventos/`
2. Adentro, `service.ts` (la lógica) y `routes.ts` (las direcciones)
3. Registralo en `server.ts`:

```ts
await api.register(eventoRoutes);
```

## Probar sin frontend

```bash
curl http://localhost:3000/api/v1/posts
```

Para rutas que necesitan sesión, guardá la cookie con `-c` y reenviala con
`-b`. Hay un ejemplo completo en `docs/03-tu-primer-cambio.md`.
