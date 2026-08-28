#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env.production}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "File $ENV_FILE non trovato. Copia .env.production.example e configuralo."
  exit 1
fi

echo "==> Pull ultime modifiche..."
git pull --ff-only

echo "==> Build e avvio container..."
docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml up -d --build

echo "==> Pulizia immagini obsolete..."
docker image prune -f

echo "Deploy completato."
docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml ps
