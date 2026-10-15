# ops/ — Puesta en producción

Archivos para cuando el proyecto corre en un servidor real, no en tu
computador.

| Archivo | Para qué |
|---|---|
| `Caddyfile` | El servidor web que recibe el tráfico de internet y gestiona el certificado de seguridad (HTTPS) automáticamente |
| `backup.sh` | Respaldo diario de la base de datos |

## Antes de publicar: lista de verificación

- [ ] Cambiar **todas** las contraseñas del `.env`. Las de ejemplo son públicas.
- [ ] Poner el dominio real en `Caddyfile`
- [ ] Quitar del `docker-compose.yml` el mapeo del puerto `5432`. En producción
      la base de datos no se expone a internet: sólo la ven los contenedores.
- [ ] Programar el respaldo en cron: `0 3 * * * /ruta/al/proyecto/ops/backup.sh`
- [ ] **Probar la restauración de un respaldo.** Un respaldo que nunca se
      restauró no es un respaldo: es una suposición.
- [ ] Verificar que los contenedores no corran como root (ya está configurado,
      pero confirmalo)

## Respaldos

```bash
./ops/backup.sh
```

Guarda un archivo comprimido con fecha y borra los de más de 14 días.

Para restaurar:

```bash
gunzip -c respaldo.dump.gz | docker compose exec -T postgres \
  pg_restore -U neoaxis -d neoaxis --clean
```
