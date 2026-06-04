#!/bin/bash
# ╔═══════════════════════════════════════════╗
# ║  SONAR — Start Production (Server)       ║
# ╚═══════════════════════════════════════════╝
set -e

cd "$(dirname "$0")/.."

echo "=== SONAR Production Mode ==="
echo "  PostgreSQL:  optimized for server"
echo "  Redis:       256 MB with AOF persistence"
echo "  Backend:     production build (no reload)"
echo "  Frontend:    nginx static build"
echo "  Nginx:       reverse proxy + caching + gzip"
echo "  Scan:        full speed (60-120s)"
echo ""

# Safety check
if [ ! -f .env ]; then
    echo "[ERROR] .env file not found. Copy .env.example to .env and configure."
    exit 1
fi

# Check for default passwords
if grep -q "CHANGE_ME" .env 2>/dev/null; then
    echo "[WARNING] .env contains default 'CHANGE_ME' values."
    echo "          Please set proper secrets before deploying to production!"
    echo ""
fi

# Check Ollama
if [ -n "$OLLAMA_BASE_URL" ]; then
    if curl -s "${OLLAMA_BASE_URL:-http://localhost:11434}/api/tags" > /dev/null 2>&1; then
        echo "[OK] Ollama reachable"
    else
        echo "[!!] Ollama not reachable at ${OLLAMA_BASE_URL:-http://localhost:11434}"
    fi
fi
echo ""

# Build and start
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "=== Access ==="
echo "  Application:  http://localhost"
echo "  API:          http://localhost/api/"
echo "  Health:       http://localhost/health"
echo ""
echo "=== Monitoring ==="
echo "  docker compose -f docker-compose.prod.yml logs -f"
echo "  docker compose -f docker-compose.prod.yml ps"
echo "  docker stats"
echo ""
echo "=== Stop ==="
echo "  docker compose -f docker-compose.prod.yml down"
