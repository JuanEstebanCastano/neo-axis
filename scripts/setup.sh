#!/usr/bin/env bash
# Prepara el proyecto por primera vez. Pensado para que se pueda correr
# varias veces sin romper nada.
set -euo pipefail

verde='\033[0;32m'; amarillo='\033[0;33m'; rojo='\033[0;31m'; fin='\033[0m'
ok()    { echo -e "  ${verde}✓${fin} $1"; }
aviso() { echo -e "  ${amarillo}!${fin} $1"; }
error() { echo -e "  ${rojo}✗${fin} $1"; }

echo ""
echo "  Preparando Neo Axis"
echo "  ───────────────────"
echo ""

# 1. Docker
if ! command -v docker >/dev/null 2>&1; then
  error "Docker no está instalado."
  echo ""
  echo "    Instalalo desde https://www.docker.com/products/docker-desktop/"
  echo "    y volvé a correr: make setup"
  echo ""
  exit 1
fi
ok "Docker instalado"

if ! docker info >/dev/null 2>&1; then
  error "Docker está instalado pero apagado."
  echo ""
  echo "    Abrí Docker Desktop y esperá a que termine de arrancar."
  echo "    En Linux:  sudo systemctl start docker"
  echo ""
  exit 1
fi
ok "Docker encendido"

# 2. Archivo de configuración
if [ -f .env ]; then
  aviso "Ya tenías un archivo .env — no se toca"
else
  cp .env.example .env
  ok "Archivo .env creado a partir de .env.example"

  if command -v openssl >/dev/null 2>&1; then
    secreto=$(openssl rand -hex 32)
    # Compatible con el sed de macOS y el de Linux
    if sed --version >/dev/null 2>&1; then
      sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=${secreto}|" .env
    else
      sed -i '' "s|^SESSION_SECRET=.*|SESSION_SECRET=${secreto}|" .env
    fi
    ok "Clave de sesión generada automáticamente"
  else
    aviso "No encontré openssl. Abrí .env y poné cualquier texto largo en SESSION_SECRET"
  fi
fi

# 3. Node (opcional: sólo para generar tipos)
if command -v node >/dev/null 2>&1; then
  version=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$version" -ge 22 ]; then
    ok "Node $(node -v) instalado"
  else
    aviso "Tenés Node $(node -v); el proyecto usa 22 o superior"
    aviso "No es urgente: todo corre dentro de Docker. Sólo hace falta para 'make db-types'"
  fi
else
  aviso "Node no está instalado. No pasa nada: todo corre dentro de Docker."
fi

echo ""
echo -e "  ${verde}Listo.${fin}"
echo ""
echo "  Siguiente paso:"
echo ""
echo "      make dev"
echo ""
echo "  La primera vez tarda unos minutos. Después abrí:"
echo "      http://localhost:3000/health   (el API)"
echo "      http://localhost:8025          (bandeja de correo de prueba)"
echo ""
echo "  Si algo falla:  docs/04-problemas-comunes.md"
echo ""
