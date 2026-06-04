# SONAR Intelligence Terminal -- CLAUDE.md

---

## 1. Project Identity

**Name:** SONAR -- Real-Time Geopolitical Intelligence Terminal
**Role:** Full-stack OSINT platform aggregating 20+ intelligence sources, rendering events on a 3D globe, generating trading signals correlated to Polymarket prediction markets, and streaming real-time alerts.

### Exact Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend | Python / FastAPI | 3.12 / 0.115.6 |
| ORM | SQLAlchemy (async) + GeoAlchemy2 | 2.0.36 / 0.15.2 |
| Migrations | Alembic | 1.14.1 |
| Database | PostgreSQL + PostGIS | 16 / 3.4 |
| Cache | Redis | 7 (alpine) |
| Frontend | React + TypeScript | 18.3.1 / 5.6.3 |
| Bundler | Vite | 6.0.5 |
| 3D Globe | Three.js + react-globe.gl | 0.183.2 / 2.37.0 |
| Maps | MapLibre GL | 4.7.1 |
| Charts | Recharts | 2.14.1 |
| State | Zustand | 5.0.2 |
| Real-time | Socket.IO (python-socketio + socket.io-client) | 5.12.0 / 4.8.1 |
| Auth | JWT (python-jose) + bcrypt + ethers.js (Web3) | 3.3.0 / 4.2.1 / 6.13.4 |
| LLM | Ollama (llama3.2:3b) with keyword fallback | local |
| CSS | Tailwind CSS | 3.4.17 |
| Testing | Pytest + pytest-asyncio + httpx | 8.3.4 / 0.25.0 / 0.28.1 |
| Containers | Docker Compose (5 services) | -- |

### Architecture

```
┌─────────┐     ┌──────────┐     ┌───────────┐
│  nginx  │────▶│ frontend │     │  postgres  │
│  :80    │     │  :3000   │     │  :5432     │
└─────────┘     └──────────┘     │  (PostGIS) │
                                 └─────┬──────┘
┌──────────────────────────────────────┤
│           backend :8001 (→:8000)     │
│  ┌────────────┐  ┌──────────────┐   │
│  │ Ingestion  │  │  Analyzer    │   │
│  │ 20 sources │  │  Pipeline    │   │
│  └─────┬──────┘  └──────┬───────┘   │
│        │    ┌────────┐   │           │
│        └───▶│ Redis  │◀──┘           │
│             │ :6379  │               │
│             └────────┘               │
└──────────────────────────────────────┘
```

**Docker Ports:** postgres=5432, redis=6379, backend=8001 (internal 8000), frontend=3000, nginx=80
**Network:** `sonar-network` (bridge)
**Memory Limits:** postgres 384M, redis 64M, backend 512M/1.5CPU, frontend 128M, nginx 128M

### API Routers (all mounted under `/api`)

auth, events, markets, signals, map, tracking, dashboard, settings, trading, intel

### 20 Ingestion Sources

RSS (80+ feeds), GDELT, Twitter (60+ accounts), Telegram (38+ channels), OpenSky flights, AISstream vessels, USGS earthquakes, NOAA weather, NASA FIRMS fire, nuclear (safecast), YouTube Live (33 channels), Reddit OSINT, ACLED, cyber threats, sanctions/trade, Shodan, Polymarket (Gamma API), webcams (Windy), government feeds, conflict monitor (LiveUAMap)

### Critical Files -- Never Touch Without a Plan

| File | Lines | Why |
|------|-------|-----|
| `frontend/src/components/globe/GlobeView.tsx` | 2400+ | Core 3D rendering, textures, hover, layers -- single breakage = blank globe |
| `backend/app/main.py` | -- | All routers, CORS, startup hooks -- misconfig = full outage |
| `backend/app/analyzer/pipeline.py` | 275 | Event processing + signal generation chain |
| `backend/app/analyzer/rule_based_signals.py` | 325 | Signal quality thresholds, sport/military filters |
| `backend/app/ingestion/manager.py` | -- | Orchestrates all 20 sources |
| `docker-compose.yml` | -- | Service definitions, health checks, memory limits |
| `.env` | 38+ vars | Secrets and tuning params -- never commit |

---

## 2. Workflow Orchestration

### Planning Rules

- **Enter plan mode for ANY non-trivial task** (3+ steps or architectural decisions)
- If something goes sideways, **STOP and re-plan immediately** -- never keep pushing a broken approach
- Write detailed specs upfront before touching code
- Use subagents for research, exploration, parallel analysis -- one task per subagent
- After any correction from user: update `tasks/lessons.md` with the pattern

### Research First

- Before modifying any file, **read it first** to understand current state
- Check related files (types, stores, API endpoints) before making changes
- Use `git log` / `git blame` to understand history when needed

### Parallelism

- Launch independent subagents in parallel (e.g., backend + frontend research simultaneously)
- Run independent bash commands in parallel (e.g., `tsc --noEmit` + `pytest` simultaneously)
- Never duplicate work that a subagent is already doing

---

## 3. Verification Before Done

### Checklist -- Every Task

1. **TypeScript check:** `cd frontend && npx tsc --noEmit` -- zero errors
2. **Vite build:** `cd frontend && npx vite build` -- clean build
3. **Docker build:** `docker compose build` -- all services build
4. **Docker health:** `docker compose up -d && docker compose ps` -- all healthy
5. **Backend tests:** `docker compose exec backend pytest tests/test_api.py -v` -- 13/13 pass
6. **Endpoint spot-check:** `curl` the relevant API endpoints
7. **Logs clean:** `docker compose logs --tail=50 backend` -- no tracebacks

### Quality Gate

- Ask: "Would a senior engineer approve this?"
- No `any` types in TypeScript unless truly unavoidable
- No unhandled promise rejections
- No SQL injection vectors (use parameterized queries via SQLAlchemy)
- No hardcoded secrets

---

## 4. Autonomous Bug Fixing

When given a bug report:

1. **Reproduce** -- find the error in logs, traces, or failing tests
2. **Root cause** -- trace through the code path, don't guess
3. **Fix** -- minimal, targeted change
4. **Verify** -- run the relevant test suite, check logs
5. **Report** -- one-line summary of what was wrong and what was fixed

Zero context switching required from the user. Point at logs, errors, failing tests -- resolve them.

---

## 5. Task Management

### Workflow

1. **Plan First:** write plan to `tasks/todo.md` with checkable items
2. **Verify Plan:** check in before starting implementation (unless user says "just do it")
3. **Track Progress:** mark items complete as you go
4. **Explain Changes:** high-level summary at each step
5. **Document Results:** add review section to `tasks/todo.md`
6. **Capture Lessons:** update `tasks/lessons.md` after corrections

### File Locations

- `tasks/todo.md` -- current task plan with `[ ]` / `[x]` checkboxes
- `tasks/lessons.md` -- patterns learned from user corrections and bugs

---

## 6. Project-Specific Rules

### Naming Conventions

| Context | Convention | Example |
|---------|-----------|---------|
| Python files | snake_case | `rule_based_signals.py` |
| Python functions/vars | snake_case | `process_event()` |
| Python classes | PascalCase | `AnalysisPipeline` |
| React components | PascalCase files | `GlobeView.tsx` |
| Stores/hooks/utils | camelCase files | `eventStore.ts` |
| TypeScript interfaces | PascalCase | `GlobeEvent` |
| API routes | snake_case URLs | `/api/map/events` |
| DB columns | snake_case | `created_at` |

### Architectural Patterns

- **Backend:** FastAPI routers -> service layer -> SQLAlchemy async models -> PostgreSQL
- **Frontend:** React components -> Zustand stores -> Axios/fetch -> Backend API
- **Real-time:** Backend emits via Socket.IO + SSE; frontend subscribes in stores
- **Signal pipeline:** `IngestionManager._process_event` -> `AnalysisPipeline.process` -> `RuleBasedSignalGenerator.generate`
- **LLM fallback:** When Ollama is down, severity is estimated via `_estimate_severity_from_text()` (keyword-based)

### Known Fragile Areas

- `vessel_tracker.py` (18,000+ lines) -- massive file, refactoring candidate
- AISstream WebSocket times out from Docker (TLS handshake blocked)
- OpenSky API returns 401 with credentials, falls back to unauthenticated
- YouTube RSS client-side check needed to bypass Docker IP blocking
- `SIGNAL_MIN_CONFIDENCE=0.45` (was 0.70 -- too high for rule-based signals)
- `MISPRICING_MIN_PCT=5` (was 10)
- `MIN_KEYWORD_HITS=1` in rule_based_signals.py (was 2 -- too strict)
- Edge_pct capped at 200%, min market price 0.03 to prevent aberrant signals

### Dev / Build / Test / Deploy Commands

```bash
# Development
make dev                    # Hot-reload mode (compose.dev.yml overlay)
make logs                   # Follow all container logs
make logs-backend           # Follow backend logs only

# Build & Deploy
make build                  # docker compose build --no-cache
make up                     # docker compose up -d
make down                   # docker compose down
make reset                  # down -v + up (destroys volumes!)

# Database
make db-shell               # psql into postgres
make migrate                # alembic upgrade head
make migration msg="desc"   # alembic autogenerate revision

# Testing
docker compose exec backend pytest tests/test_api.py -v    # 13 integration tests
cd frontend && npx tsc --noEmit                             # TypeScript check
cd frontend && npx vite build                               # Production build check

# Shell Access
make backend-shell          # bash into backend container
make frontend-shell         # sh into frontend container
make redis-shell            # redis-cli
```

### Critical Environment Variables

```
# App
APP_NAME, APP_ENV, SECRET_KEY, JWT_SECRET

# Database
POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD

# Redis
REDIS_HOST, REDIS_PORT

# LLM
OLLAMA_BASE_URL (host.docker.internal:11434), OLLAMA_MODEL (llama3.2:3b)

# Ingestion Sources
TELEGRAM_BOT_TOKEN, TELEGRAM_API_ID, TELEGRAM_API_HASH
TWITTER_BEARER_TOKEN
OPENSKY_USERNAME, OPENSKY_PASSWORD
AISSTREAM_API_KEY
NASA_FIRMS_MAP_KEY
WINDY_WEBCAMS_API_KEY
YOUTUBE_API_KEY
ACLED_API_KEY, ACLED_EMAIL
SHODAN_API_KEY

# Tuning
SCAN_INTERVAL_SECONDS, ALERT_MIN_SEVERITY
SIGNAL_MIN_CONFIDENCE (0.45), MISPRICING_MIN_PCT (5)
TENSION_UPDATE_INTERVAL, FLIGHT_SCAN_INTERVAL, VESSEL_SCAN_INTERVAL
```

---

## 7. Core Principles

- **Simplicity First:** make every change as simple as possible, minimal code impact
- **No Laziness:** find root causes, no temporary fixes, senior developer standards
- **Minimal Impact:** changes should only touch what's necessary, avoid introducing bugs
- **Never use em dashes** in any output (use -- instead)
- **Ollama-first** for any local LLM calls (RTX 4070 available)
- **No over-engineering:** don't add features, refactor code, or make "improvements" beyond what was asked
- **Security conscious:** no command injection, no XSS, no SQL injection, never commit secrets
- **French-speaking user:** understand French instructions, respond in English unless asked otherwise
