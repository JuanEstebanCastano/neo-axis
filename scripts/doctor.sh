#!/usr/bin/env bash
# Diagnóstico del entorno. Pegá su salida cuando pidas ayuda.
set -uo pipefail

verde='\033[0;32m'; rojo='\033[0;31m'; amarillo='\033[0;33m'; fin='\033[0m'
ok()    { echo -e "  ${verde}✓${fin} $1"; }
mal()   { echo -e "  ${rojo}✗${fin} $1"; }
aviso() { echo -e "  ${amarillo}!${fin} $1"; }

echo ""
echo "  Diagnóstico de Neo Axis"
echo "  ───────────────────────"
echo ""
echo "  Sistema: $(uname -s) $(uname -m)"
echo ""

command -v docker >/dev/null 2>&1 && ok "Docker: $(docker --version)" || mal "Docker no instalado"
docker info >/dev/null 2>&1 && ok "Docker encendido" || mal "Docker apagado"
command -v node >/dev/null 2>&1 && ok "Node: $(node -v)" || aviso "Node no instalado (opcional)"
[ -f .env ] && ok "Archivo .env presente" || mal "Falta .env — corré: make setup"

if [ -f .env ]; then
  secreto=$(grep '^SESSION_SECRET=' .env | cut -d= -f2-)
  if [ -z "$secreto" ] || [ "$secreto" = "generate-with-openssl-rand-hex-32" ]; then
    mal "SESSION_SECRET sin configurar — corré: make setup"
  elif [ ${#secreto} -lt 32 ]; then
    mal "SESSION_SECRET demasiado corto (mínimo 32 caracteres)"
  else
    ok "SESSION_SECRET configurado"
  fi
fi

echo ""
echo "  Servicios:"
if docker compose ps --format '{{.Service}} {{.State}}' 2>/dev/null | grep -q .; then
  docker compose ps --format '  {{.Service}}\t{{.State}}' 2>/dev/null
else
  aviso "Ninguno corriendo — levantalos con: make dev"
fi

echo ""
echo "  Base de datos:"
v=$(docker compose exec -T postgres psql -U "${POSTGRES_USER:-neoaxis}" -d "${POSTGRES_DB:-neoaxis}" \
     -tAc "select current_setting('server_version_num')::int" 2>/dev/null | tr -d '[:space:]')
if [ -n "${v:-}" ]; then
  if [ "$v" -ge 180000 ]; then ok "PostgreSQL $v (18+, correcto)"; else mal "PostgreSQL $v — se requiere 18+. Corré: make reset"; fi
  t=$(docker compose exec -T postgres psql -U "${POSTGRES_USER:-neoaxis}" -d "${POSTGRES_DB:-neoaxis}" \
       -tAc "select count(*) from information_schema.tables where table_schema='app'" 2>/dev/null | tr -d '[:space:]')
  [ "${t:-0}" -gt 0 ] && ok "Tablas creadas: $t" || mal "Sin tablas — corré: make db-up"
else
  aviso "No se pudo consultar (¿está levantada? make dev)"
fi

echo ""
