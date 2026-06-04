#!/bin/bash
# ╔═══════════════════════════════════════════╗
# ║  SONAR — Start Development (Mac)         ║
# ╚═══════════════════════════════════════════╝
set -e

cd "$(dirname "$0")/.."

echo "=== SONAR Dev Mode ==="
echo "  PostgreSQL:  256 MB limit"
echo "  Redis:        64 MB limit"
echo "  Backend:     512 MB limit (hot-reload)"
echo "  Frontend:    384 MB limit (hot-reload)"
echo "  Scan:        every 5 min (reduced)"
echo ""

# Check Ollama is running
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "[OK] Ollama is running"
    MODELS=$(curl -s http://localhost:11434/api/tags | python3 -c "import sys,json; [print(f'  - {m[\"name\"]}') for m in json.load(sys.stdin).get('models',[])]" 2>/dev/null)
    echo "$MODELS"
else
    echo "[!!] Ollama is NOT running — events won't be classified"
    echo "     Start it with: ollama serve"
fi
echo ""

# Build and start
docker compose -f docker-compose.dev.yml build
docker compose -f docker-compose.dev.yml up -d

echo ""
echo "=== Access ==="
echo "  Frontend:  http://localhost:3000"
echo "  API:       http://localhost:8001"
echo "  API Docs:  http://localhost:8001/docs"
echo ""
echo "=== Logs ==="
echo "  docker compose -f docker-compose.dev.yml logs -f backend"
echo ""
echo "=== Stop ==="
echo "  docker compose -f docker-compose.dev.yml down"
