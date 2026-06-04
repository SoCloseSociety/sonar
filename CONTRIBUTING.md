# Contributing to SONAR

Thank you for considering a contribution! SONAR is an open OSINT platform — every PR, bug report, and idea helps.

## Quick start for contributors

```bash
git clone https://github.com/soclosesociety/sonar.git
cd sonar
cp .env.example .env
# generate secrets:
echo "SECRET_KEY=$(openssl rand -hex 32)" >> .env
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
docker compose up -d
```

## Workflow

1. **Fork** the repo and create a feature branch:
   ```bash
   git checkout -b feat/your-feature
   ```
2. **Make your change** (see code style below)
3. **Run the verification gate** before pushing:
   ```bash
   # Frontend
   cd frontend && npx tsc --noEmit && npx vite build

   # Backend
   docker compose exec backend pytest tests/test_api.py -v
   ```
4. **Open a PR** with a clear title and description. Reference any related issues.

## Code style

### Python (backend)

- `snake_case` for files, functions, variables
- `PascalCase` for classes
- Async-first: use `async def` for I/O; never block the event loop with `requests`/`time.sleep`
- No bare `except:` — always catch specific exceptions and log
- Add type hints (`Mapped[str | None]`, `list[Event]`, etc.)
- Parameterized SQLAlchemy queries only — never f-string SQL

### TypeScript (frontend)

- `camelCase` files for hooks/stores/utils, `PascalCase` for React components
- No `any` unless truly unavoidable — prefer `unknown` + type guards
- `useEffect` MUST clean up timers, subscriptions, WebSocket listeners
- Validate API responses (`Array.isArray`, optional chaining)
- For URL inputs: validate with `^https?://` regex, never accept raw user URLs in `src`/`href`

### Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add weather overlay to globe
fix: handle null timestamp in tension chart
docs: clarify Ollama setup on Linux
chore: bump react-globe.gl to 2.38
```

## What needs help

- New ingestion sources (the more diverse, the better signal)
- Visualizations on the globe (new layer types, animations)
- Translations of UI strings (the codebase is English-first today)
- Documentation, screenshots, tutorials
- Performance: indexing tweaks, bundle-size reductions, query optimization
- Mobile responsive layouts

## Where to add a new source

1. Create `backend/app/ingestion/sources/your_source.py` extending `BaseSource`
2. Implement `async def fetch(self) -> list[RawEvent]`
3. Register it in `backend/app/ingestion/manager.py` (add to `_build_sources()`)
4. Add an `ENABLE_YOUR_SOURCE` flag to `backend/app/config.py` and `.env.example`
5. Document the source in this file and the README

## Tests

We currently have integration tests in `backend/tests/test_api.py` (13 tests covering events, signals, tension, intel, sensitive zones, tracking).

New endpoints **must** have at least one test verifying:
- Happy path returns 200 with the expected shape
- Invalid params return 4xx with a useful message

## Reporting bugs

Open a GitHub Issue with:
- What you expected vs. what happened
- Logs (`docker compose logs --tail=100 backend`)
- Environment (OS, Docker version)
- A minimal repro if possible

## Security issues

Do **not** open public issues for security vulnerabilities. See [SECURITY.md](SECURITY.md) for responsible disclosure.

## Code of conduct

Be kind. Critique the code, not the person. Assume good intent.

---

Thanks for making SONAR better. 🌍
