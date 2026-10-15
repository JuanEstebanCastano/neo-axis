# Comandos del proyecto. Escribí `make` solo para ver la lista.
#
# Si nunca usaste make: es un atajo. En vez de recordar
#   docker compose up --build -d
# escribís
#   make dev

.DEFAULT_GOAL := help
.PHONY: help setup dev stop restart reset logs logs-api logs-worker db-up db-down db-new db-types db-shell doctor test

help: ## Muestra esta ayuda
	@echo ""
	@echo "  Neo Axis — comandos disponibles"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  ¿Primera vez?  ->  make setup   y luego   make dev"
	@echo "  ¿Algo falla?   ->  make doctor  o leé docs/04-problemas-comunes.md"
	@echo ""

setup: ## Prepara el proyecto por primera vez
	@bash scripts/setup.sh

dev: ## Levanta todo (API, base de datos, worker, correo)
	@echo "Levantando... la primera vez tarda unos minutos."
	@docker compose up --build

stop: ## Apaga todo
	@docker compose down
	@echo "Todo apagado. Los datos se conservan."

restart: ## Reconstruye y reinicia (usalo tras cambiar código)
	@docker compose up --build -d
	@echo "Reiniciado. Mirá los logs con: make logs"

reset: ## BORRA los datos locales y empieza de cero
	@bash scripts/reset.sh

logs: ## Muestra los mensajes de todos los servicios
	@docker compose logs -f --tail=100

logs-api: ## Sólo los mensajes del API
	@docker compose logs -f --tail=100 api

logs-worker: ## Sólo los mensajes del worker
	@docker compose logs -f --tail=100 worker

db-up: ## Aplica las migraciones pendientes
	@docker compose run --rm migrate up

db-down: ## Revierte la última migración
	@docker compose run --rm migrate down

db-new: ## Crea una migración nueva. Uso: make db-new nombre=agregar_columna
	@test -n "$(nombre)" || (echo "Falta el nombre. Ej: make db-new nombre=agregar_columna" && exit 1)
	@docker compose run --rm migrate new $(nombre)

db-types: ## Regenera los tipos de TypeScript desde la base de datos
	@pnpm db:types && echo "Tipos actualizados."

db-shell: ## Abre una consola SQL contra la base de datos
	@docker compose exec postgres psql -U $${POSTGRES_USER:-neoaxis} -d $${POSTGRES_DB:-neoaxis}

doctor: ## Revisa que tu entorno esté bien configurado
	@bash scripts/doctor.sh

test: ## Corre las pruebas
	@pnpm test
