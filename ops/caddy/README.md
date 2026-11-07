# Caddy (reverse-proxy + TLS)

Caddy expone la API en `API_DOMAIN_PLACEHOLDER`, saca el certificado solo
(Let's Encrypt) y redirige HTTP→HTTPS. El CORS lo pone **solo Fastify**; Caddy no
agrega cabeceras CORS (ver `Caddyfile`).

> Antes de levantarlo: reemplazá `API_DOMAIN_PLACEHOLDER` en `Caddyfile`, y
> apuntá el DNS de ese dominio a la IP del VPS (A/AAAA). Sin DNS correcto, el
> certificado no se emite.

## 1. Verificar que los puertos 80 y 443 estén libres

```bash
sudo ss -ltnp 'sport = :80 or sport = :443'     # Linux (recomendado)
# o:
sudo lsof -i :80 -i :443
```

Si **no** hay salida, están libres. Si aparece algo (ver abajo), liberalos primero.

## 2. Si ya hay un nginx / apache escuchando

Caddy necesita 80 y 443 en exclusiva. Opciones:

- **Apagarlo** (si no lo usás):
  ```bash
  sudo systemctl stop nginx    && sudo systemctl disable nginx
  sudo systemctl stop apache2  && sudo systemctl disable apache2
  ```
- **Convivir**: dejá al proxy existente como front y que haga `proxy_pass` a la API
  (sin Caddy), o poné Caddy en otros puertos y que el proxy de adelante le hable.
  Mantené una sola capa que termine TLS.

Confirmá que el puerto quedó libre repitiendo el paso 1 antes de seguir.

## 3. Primer arranque y logs del certificado

```bash
docker compose up -d caddy
docker compose logs -f caddy
```

Buscá en los logs líneas como:
- `certificate obtained successfully` / `obtaining certificate` → emisión OK.
- `serving initial configuration`
Errores típicos: `could not get certificate from issuer` (DNS mal apuntado, puerto
80/443 tomado o bloqueado por firewall), `too many certificates already issued`
(pegaste el rate limit → usá staging, paso 4).

Verificación externa:
```bash
curl -I https://API_DOMAIN_PLACEHOLDER/health   # 200 y cadena TLS válida
```

## 4. Modo STAGING de Let's Encrypt (no gastar el rate limit)

El endpoint de producción de Let's Encrypt limita a pocos intentos por semana.
Mientras probás DNS/puertos, usá el **staging** (cert NO confiable por el navegador,
pero no cuenta para el límite). Agregá un bloque de opciones globales **al principio**
del `Caddyfile`:

```caddyfile
{
	acme_ca https://acme-staging-v02.api.letsencrypt.org/directory
	email vos@tudominio.com
}

API_DOMAIN_PLACEHOLDER {
	reverse_proxy api:3000
}
```

Reiniciá (`docker compose up -d caddy`) y revisá los logs. `curl` dará aviso de
certificado no confiable (normal en staging): `curl -vk https://...` para ver que
igual emitió.

Cuando esté todo OK, **quitá el bloque global** (o dejá solo `email`) para volver a
producción, y forzá una emisión limpia:
```bash
docker compose down caddy && docker volume rm neo-axis_caddy_data && docker compose up -d caddy
```
(Borrar el volumen `caddy_data` descarta el cert de staging para que pida el real.)
