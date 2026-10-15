#!/usr/bin/env bash
# Borra los datos locales y vuelve a empezar. Sólo para desarrollo.
set -euo pipefail

rojo='\033[0;31m'; verde='\033[0;32m'; fin='\033[0m'

echo ""
echo -e "  ${rojo}Atención:${fin} esto borra TODOS los datos de tu computador."
echo "  Usuarios, publicaciones, archivos subidos: todo."
echo ""
echo "  No afecta al servidor real, sólo a tu máquina."
echo ""
read -rp "  Escribí 'si' para continuar: " respuesta

if [ "$respuesta" != "si" ]; then
  echo "  Cancelado. No se borró nada."
  exit 0
fi

echo ""
echo "  Apagando y borrando volúmenes..."
docker compose down -v

echo "  Levantando de cero..."
docker compose up --build -d

echo ""
echo -e "  ${verde}Listo.${fin} Base de datos nueva con las migraciones aplicadas."
echo "  Mirá los logs con: make logs"
echo ""
