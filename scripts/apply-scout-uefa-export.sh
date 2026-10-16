#!/usr/bin/env bash
# Importa in PostgreSQL lo snapshot UEFA generato in locale (scout-multigol-uefa-cups.sql).
# ATTENZIONE: opt-in (SCOUT_APPLY_UEFA_EXPORT=1). Il server ricalcola già le pick col modello
# corrente al boot/di notte; lo SQL può contenere numeri di un modello precedente.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
SQL_FILE="$ROOT_DIR/scout-multigol-uefa-cups.sql"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.prod.yml}"

if [[ "${SCOUT_APPLY_UEFA_EXPORT:-0}" != "1" ]]; then
  echo "==> Skip import UEFA scout (opt-in: SCOUT_APPLY_UEFA_EXPORT=1)"
  exit 0
fi

if [[ ! -f "$SQL_FILE" ]]; then
  echo "==> Skip import UEFA scout: file mancante ($SQL_FILE)"
  exit 0
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "File $ENV_FILE non trovato."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${DB_USERNAME:?DB_USERNAME mancante in $ENV_FILE}"
: "${DB_DATABASE:?DB_DATABASE mancante in $ENV_FILE}"

if ! docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_isready -U "$DB_USERNAME" -d "$DB_DATABASE" >/dev/null 2>&1; then
  echo "Postgres non pronto. Avvia lo stack prima dell'import."
  exit 1
fi

echo "==> Import snapshot Scout UEFA (UCL/UEL/UECL) in PostgreSQL…"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$DB_USERNAME" -d "$DB_DATABASE" < "$SQL_FILE"
echo "==> Import UEFA completato."
