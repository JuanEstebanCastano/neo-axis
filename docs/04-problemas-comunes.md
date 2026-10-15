# Problemas comunes

Buscá tu error acá antes de pedir ayuda. Si no está, agregalo cuando lo
resuelvas: eso le ahorra una hora a la siguiente persona.

---

## No arranca

### `docker: command not found`
Docker no está instalado o no está encendido. En Windows y macOS hay que abrir
Docker Desktop **antes** de correr cualquier comando.

### `Cannot connect to the Docker daemon`
Docker está instalado pero apagado. Abrí Docker Desktop y esperá a que el ícono
deje de moverse. En Linux: `sudo systemctl start docker`.

### `port is already allocated`
Otro programa está usando el mismo puerto (casi siempre el 5432, de otra
instalación de PostgreSQL).

Dos salidas: apagar el otro programa, o cambiar el puerto en `docker-compose.yml`:

```yaml
ports: ["5433:5432"]   # 5433 por fuera, 5432 adentro
```

### `no configuration file provided`
Estás parado en la carpeta equivocada. Tenés que estar en la raíz del proyecto,
donde está `docker-compose.yml`. Verificá con `ls`.

---

## La base de datos

### `Se requiere PostgreSQL 18 o superior`
Aparece si el contenedor de Postgres quedó de una versión vieja. Se arregla
borrando los datos locales y volviendo a crearlos:

```bash
make reset
```

⚠️ Esto **borra todos los datos** de tu computador. No pasa nada: son datos de
prueba. Nunca lo corras en el servidor real.

### `relation "app.xxx" does not exist`
La tabla no existe porque faltan aplicar las migraciones:

```bash
make db-up
```

### `database "neoaxis" does not exist`
El contenedor arrancó antes de terminar de crearse. Casi siempre se arregla con
`make restart`. Si insiste, `make reset`.

### Cambié una migración ya aplicada y no pasa nada
Las migraciones se aplican **una sola vez** y el sistema recuerda cuáles ya
corrió. Editar un archivo viejo no tiene efecto.

- Si estás en tu computador y no importa perder datos: `make reset`.
- Si ya la subiste y otros la aplicaron: **no la toques**. Creá una migración
  nueva con `make db-new nombre_del_cambio`. Modificar una migración publicada
  deja la base de cada persona distinta, y ese problema es muy difícil de
  detectar.

---

## El código

### `Property 'xxx' does not exist on type...`
Los tipos de la base de datos están desactualizados. Regeneralos:

```bash
make db-types
```

Hay que correrlo cada vez que cambia la estructura de una tabla.

### `Cannot find module './algo.js'` pero el archivo es `.ts`
No es un error. En este proyecto los imports llevan `.js` aunque los archivos
sean `.ts`. Es un requisito del estándar de módulos de Node. Escribilo con
`.js` y funciona.

### Cambié el código y no se refleja
Hay que reconstruir:

```bash
make restart
```

### `Configuración inválida` al arrancar
Falta una variable en tu archivo `.env`, o tiene un valor inválido. El mensaje
dice exactamente cuál. Comparalo con `.env.example`.

Si te falta `SESSION_SECRET`:

```bash
openssl rand -hex 32
```

y pegá el resultado en el `.env`.

---

## El API

### `401 unauthorized`
No iniciaste sesión, o la cookie no se está enviando.
- Con `curl`: te falta `-b galletas.txt`.
- Desde el navegador: `credentials: "include"` en el `fetch`.

### `403 forbidden`
Iniciaste sesión pero te falta el permiso. Es correcto que pase: así funciona
el sistema. Mirá qué permisos tenés en `GET /api/v1/auth/me`.

### `429 Too Many Requests`
Hiciste demasiados pedidos seguidos. El límite está para frenar ataques. Esperá
un minuto. Si te molesta mientras desarrollás, subí el `max` en `server.ts`.

### `500 internal_error`
Un error no previsto. El mensaje al cliente es genérico a propósito (no se
filtran detalles internos). El error real está en los logs:

```bash
make logs-api
```

---

## Los correos

### No llega ningún correo
Correcto: en desarrollo **no se envía nada de verdad**. Los correos los atrapa
Mailpit. Abrí http://localhost:8025 y están ahí.

### Mailpit está vacío
El worker no los procesó. Revisá que esté corriendo:

```bash
make logs-worker
```

Si el worker está caído, `make restart`.

---

## Cuando nada funciona

El botón de pánico, en orden:

```bash
make stop      # apagar todo
make reset     # borrar datos locales y empezar de cero
make dev       # levantar de nuevo
```

Si después de eso sigue fallando, es un problema real. Pedí ayuda y pegá:

1. El comando que corriste
2. El error completo (todo, no solo la última línea)
3. La salida de `make doctor`

Con eso se resuelve rápido. Sin eso, nadie puede ayudarte.
