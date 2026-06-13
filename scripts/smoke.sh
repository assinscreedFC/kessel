#!/usr/bin/env bash
set -euo pipefail

# Smoke-test de la stack Kessel (FOUND-04). Démarre le compose, attend Postgres healthy + l'api,
# puis vérifie via Caddy : /api/health -> 200 {"status":"ok"} et / -> 200 HTML web.
# Sort non-zéro au moindre échec (utilisable en CI / phase gate).

cd "$(dirname "$0")/.."

BASE="${SMOKE_BASE_URL:-http://localhost}"

echo "[smoke] docker compose up -d --build"
docker compose up -d --build

cleanup() {
  if [ "${KEEP_UP:-0}" != "1" ]; then
    echo "[smoke] docker compose down"
    docker compose down
  fi
}
trap cleanup EXIT

# 1. Attendre que Postgres soit healthy (depends_on service_healthy gère l'api, mais on log l'état).
echo "[smoke] attente Postgres healthy..."
for i in $(seq 1 30); do
  status=$(docker compose ps postgres --format '{{.Health}}' 2>/dev/null || echo "")
  echo "  postgres health: ${status:-unknown} (${i}/30)"
  [ "$status" = "healthy" ] && break
  sleep 2
done

# 2. Attendre que l'api réponde via Caddy (migrations + boot NestJS peuvent prendre du temps).
echo "[smoke] attente api /api/health via Caddy..."
health_ok=0
for i in $(seq 1 60); do
  body=$(curl -fsS "${BASE}/api/health" 2>/dev/null || echo "")
  if echo "$body" | grep -q '"status":"ok"'; then
    echo "  /api/health OK : $body"
    health_ok=1
    break
  fi
  echo "  pas encore prêt (${i}/60)"
  sleep 2
done

if [ "$health_ok" != "1" ]; then
  echo "[smoke] ECHEC : /api/health n'a pas renvoyé {\"status\":\"ok\"} via Caddy" >&2
  echo "----- docker compose ps -----" >&2
  docker compose ps >&2
  echo "----- logs api -----" >&2
  docker compose logs --tail=50 api >&2
  exit 1
fi

# 3. Le front web doit être servi par Caddy (200 + HTML).
echo "[smoke] vérification du front web /..."
web_code=$(curl -fsS -o /tmp/kessel-smoke-web.html -w '%{http_code}' "${BASE}/" 2>/dev/null || echo "000")
if [ "$web_code" != "200" ]; then
  echo "[smoke] ECHEC : / a renvoyé HTTP ${web_code} (attendu 200)" >&2
  docker compose logs --tail=30 web caddy >&2
  exit 1
fi
if ! grep -qi "<div id=\"root\"" /tmp/kessel-smoke-web.html; then
  echo "[smoke] ECHEC : le front ne contient pas le point de montage React (#root)" >&2
  exit 1
fi
echo "  / OK : HTTP 200, HTML web servi (#root présent)"

echo "[smoke] SUCCÈS : stack complète démarrée, /api/health 200 {\"status\":\"ok\"}, web servi via Caddy."
