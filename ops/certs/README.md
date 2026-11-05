# ops/certs/

## supabase-root-2021-ca.crt
Certificado de la **CA raíz de Supabase** (`CN = Supabase Root 2021 CA`).

El Session pooler de Supabase presenta un certificado firmado por esta CA, que
no está en el almacén de confianza del sistema. Por eso el `DATABASE_URL` de
producción/Supabase usa:

```
...?sslmode=verify-full&sslrootcert=ops/certs/supabase-root-2021-ca.crt
```

Así la conexión queda **cifrada y verificada** (no se desactiva la verificación
del certificado). Es un certificado público, no un secreto; por eso se versiona.

> La ruta es relativa a la raíz del repo: ejecutá los comandos (API, worker,
> `pnpm db:types`) desde la raíz, o usá una ruta absoluta en `sslrootcert`.
