# NEO_CONNECTOR -- SONAR Intelligence Terminal
- service: sonar
- base_url_prod: UNKNOWN -- self-hosted, no public domain. nginx server_name is `_` (catch-all); backend bound to 127.0.0.1:8001 (internal :8000). Dev: http://localhost (nginx :80) or http://localhost:8090. See nginx/nginx.prod.conf, docker-compose.prod.yml, README.md.
- framework: FastAPI (Python 3.12) + Socket.IO (python-socketio ASGI), SQLAlchemy async + PostgreSQL/PostGIS, Redis cache. Entry: backend/app/main.py -> app = FastAPI(...).
- auth: Bearer JWT (HS256, 7-day exp) for protected routes ; header: `Authorization: Bearer <token>` ; obtained via POST /api/auth/login or /api/auth/wallet ; secret env_var: JWT_SECRET. MOST endpoints are PUBLIC (no auth). Admin routes need role=admin in the JWT.
- env_required: [JWT_SECRET, SECRET_KEY, POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD, REDIS_HOST, REDIS_PORT]
- env_optional_for_ingestion: [OPENSKY_USERNAME, OPENSKY_PASSWORD, ADSB_EXCHANGE_API_KEY, AISSTREAM_API_KEY, NASA_FIRMS_MAP_KEY, WINDY_WEBCAMS_API_KEY, TWITTER_BEARER_TOKEN, YOUTUBE_API_KEY, ACLED_API_KEY, ACLED_EMAIL, SHODAN_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID, OLLAMA_BASE_URL, OLLAMA_MODEL, POLYMARKET_API_KEY, POLYMARKET_SECRET, POLYMARKET_PASSPHRASE]
- generated_at:

> Source of truth: backend/app/main.py mounts 11 routers + /health + Socket.IO + /data static.
> Router prefixes (from main.py include_router):
>   auth=/api/auth, events=/api/events, markets=/api/markets, signals=/api/signals,
>   map=/api/map, tracking=/api/tracking, dashboard=/api/dashboard, settings=/api/settings,
>   trading=/api/trading, analysis=/api/analysis, intel=/api (no extra segment).
> Amounts/prices are floats 0..1 (Polymarket probabilities), NOT centimes. lat/lon are decimal degrees.

## Endpoints

### GET /health
- auth: no
- async: false
- input: none
- output: `{status, service, version, redis: "connected"|"disconnected"}`
- errors: always 200
- example_curl: `curl http://localhost:8000/health`

--- AUTH (backend/app/auth/router.py) ---

### POST /api/auth/register
- auth: no (rate-limited 5/IP/hour via Redis)
- async: false
- input: JSON body `{email: EmailStr (req), username: str 3-50 (req), password: str 8-128 (req)}`
- output: `{access_token, token_type:"bearer", user:{id, email, username, wallet_address, auth_method, role}}`
- errors: 400 email/username taken ; 429 too many registrations ; 422 validation
- example_curl: `curl -X POST .../api/auth/register -H 'Content-Type: application/json' -d '{"email":"a@b.co","username":"neo","password":"hunter2hunter2"}'`

### POST /api/auth/login
- auth: no (rate-limited 8 failures per IP+email / 5min)
- async: false
- input: JSON body `{email: EmailStr (req), password: str (req)}`
- output: `{access_token, token_type, user{...}}`
- errors: 401 invalid credentials ; 429 too many failed attempts
- example_curl: `curl -X POST .../api/auth/login -H 'Content-Type: application/json' -d '{"email":"a@b.co","password":"hunter2hunter2"}'`

### GET /api/auth/nonce
- auth: no
- async: false
- input: query `wallet` (str, regex `^0x[a-fA-F0-9]{40}$`, req)
- output: `{nonce, message}` (message to be signed by the wallet)
- errors: 422 bad wallet format
- example_curl: `curl '.../api/auth/nonce?wallet=0x0000000000000000000000000000000000000000'`

### POST /api/auth/wallet
- auth: no (signature is the auth)
- async: false
- input: JSON body `{wallet_address: str regex 0x..40 (req), signature: str (req)}`
- output: `{access_token, token_type, user{...}}`
- errors: 400 "Request a nonce first" ; 401 invalid signature
- example_curl: `curl -X POST .../api/auth/wallet -H 'Content-Type: application/json' -d '{"wallet_address":"0x..","signature":"0x.."}'`

### GET /api/auth/me
- auth: YES (Bearer)
- async: false
- input: none
- output: `{id, email, username, wallet_address, auth_method, role}`
- errors: 401 invalid/missing token
- example_curl: `curl .../api/auth/me -H 'Authorization: Bearer <token>'`

--- EVENTS (backend/app/api/events.py) ---

### GET /api/events
- auth: no
- async: false
- input: query `category` (str opt), `min_severity` / `severity_min` (int, both accepted, max wins), `source` (str opt, ILIKE), `country` (str opt), `hours` (int 1-168, def 48), `limit` (int <=200, def 50), `offset` (int def 0)
- output: JSON array of `{id, source, source_url, category, severity, confidence, impact_score, country, summary, keywords[], entities{people[],countries[],organizations[],assets_impacted[]}, latitude, longitude, image_url, video_url, media_urls[], created_at}`
- errors: 200 (empty array if none)
- example_curl: `curl '.../api/events?hours=24&min_severity=6&limit=20'`

### GET /api/events/stream
- auth: no
- async: SSE (long-lived stream, not generate->poll)
- input: none (server tracks last_id internally)
- output: `text/event-stream`; each message `data: {<event fields like list_events but no source_url/impact_score>}\n\n`; keepalive `data: {"type":"ping"}\n\n` every ~5s when idle
- errors: stream reconnect with exponential backoff on server errors
- example_curl: `curl -N .../api/events/stream`

### GET /api/events/{event_id}
- auth: no
- async: false
- input: path `event_id` (int)
- output: full event incl `raw_text, market_direction, processed_at`
- errors: 404 not found
- example_curl: `curl .../api/events/123`

--- MARKETS (backend/app/api/markets.py) — Polymarket prediction markets ---

### GET /api/markets
- auth: no
- async: false
- input: query `active` (bool def true), `category` (str opt), `search` (str opt, ILIKE on question), `limit` (int <=500, def 100), `offset` (int def 0)
- output: `{markets:[{id, condition_id, question, category, outcomes, active, tags, end_date, price_yes, price_no, volume_24h, liquidity, spread, updated_at}], total, limit, offset}`
- errors: 200
- example_curl: `curl '.../api/markets?search=taiwan&limit=10'`

### GET /api/markets/{market_id}
- auth: no
- async: false
- input: path `market_id` (int)
- output: market incl `description` + latest snapshot prices
- errors: 404 not found
- example_curl: `curl .../api/markets/42`

### GET /api/markets/{market_id}/snapshots
- auth: no
- async: false
- input: path `market_id` (int) ; query `limit` (int <=500, def 100)
- output: array `{price_yes, price_no, volume_24h, liquidity, spread, captured_at}`
- errors: 200
- example_curl: `curl '.../api/markets/42/snapshots?limit=50'`

--- SIGNALS (backend/app/api/signals.py) — trading signals from events x markets ---

### GET /api/signals
- auth: no
- async: false
- input: query `status` (one of active|filled|closed|expired, def active; invalid->active), `min_confidence` (float def 0), `limit` (int <=200, def 50)
- output: array `{id, event_id, market_id, signal_type, current_price, estimated_fair_value, edge_pct, confidence, direction, time_sensitivity, reasoning, status, created_at, market_question, market_condition_id, market_category, event_summary}`
- errors: 200
- example_curl: `curl '.../api/signals?status=active&min_confidence=0.5'`

### POST /api/signals/regenerate
- auth: YES (admin only — Depends(get_admin_user), role=admin)
- async: true (runs in BackgroundTasks; returns immediately)
- input: query `min_severity` (int 5-10, def 7), `limit` (int <=50, def 20)
- output: `{status:"running", events_queued:<n>}`
- errors: 401/403 if not admin
- example_curl: `curl -X POST '.../api/signals/regenerate?min_severity=8' -H 'Authorization: Bearer <admin-token>'`

--- MAP DATA (backend/app/api/map_data.py) ---

### GET /api/map/layers
- auth: no
- async: false (static, cached 5min)
- input: none
- output: `{layers:[{id,name,icon,visible,description,group}], groups:[{key,label,color}]}`
- errors: 200
- example_curl: `curl .../api/map/layers`

### GET /api/map/events
- auth: no
- async: false (cached 45s)
- input: query `hours` (int <=168, def 24), `min_severity` (int def 0), `category` (str opt)
- output: array geolocated events `{id, source, category, severity, summary, country, impact_score, keywords, latitude, longitude, created_at}`
- errors: 200
- example_curl: `curl '.../api/map/events?hours=48'`

### GET /api/map/flights
- auth: no
- async: false (cached 15s)
- input: query `military_only` (bool def false)
- output: array `{icao24, callsign, origin_country, altitude, velocity, heading, squawk, is_military, is_government, latitude, longitude, captured_at}`
- errors: 200 (empty array on error)
- example_curl: `curl '.../api/map/flights?military_only=true'`

### GET /api/map/vessels
- auth: no
- async: false (cached 30s)
- input: query `military_only` (bool def false)
- output: array `{mmsi, vessel_name, vessel_type, vessel_type_name, flag, speed, heading, destination, imo, is_military, is_dark, latitude, longitude, captured_at}`
- errors: 200 (empty array on error)
- example_curl: `curl .../api/map/vessels`

### GET /api/map/sensitive-zones
- auth: no
- async: false (cached 60s)
- input: none
- output: array per zone `{name, lat, lon, bbox, flights, military_flights, vessels, military_vessels, dark_vessels, total_activity, military_activity, risk_score}` sorted by risk_score desc
- errors: 200
- example_curl: `curl .../api/map/sensitive-zones`

### GET /api/map/webcams
- auth: no
- async: false
- input: none
- output: cached webcam list (shape defined in app/ingestion/sources/webcams.py)
- errors: 200
- example_curl: `curl .../api/map/webcams`

### GET /api/map/webcams/near
- auth: no
- async: false
- input: query `lat` (float -90..90, req), `lon` (float -180..180, req), `radius_km` (float <=500, def 100)
- output: webcam array near point
- errors: 422 bad coords
- example_curl: `curl '.../api/map/webcams/near?lat=25.0&lon=121.5&radius_km=200'`

### GET /api/map/webcams/near-event/{event_id}
- auth: no
- async: false
- input: path `event_id` (int) ; query `radius_km` (float <=500, def 100)
- output: webcam array near the event location ([] if event has no location)
- errors: 200
- example_curl: `curl .../api/map/webcams/near-event/123`

### GET /api/map/webcams/proxy-thumb
- auth: no
- async: false (cached 30min)
- input: query `url` (str, max 500 chars, req) — host must be in allowlist (images-webcams.windy.com, images.webcams.travel, webcams.windy.com)
- output: raw image bytes (image/*); SSRF-guarded (no redirect follow, host allowlist)
- errors: 403 blocked host ; 502 upstream/fetch error
- example_curl: `curl '.../api/map/webcams/proxy-thumb?url=https://images-webcams.windy.com/...'`

### GET /api/map/live-check
- auth: no
- async: false (cached 3min)
- input: none
- output: `{<channel_id>: "live"|"offline"|"unknown", ...}` for ~34 YouTube news channels
- errors: 200
- example_curl: `curl .../api/map/live-check`

--- TRACKING (backend/app/api/tracking.py) ---

### GET /api/tracking/flights
- auth: no
- async: false
- input: query `military_only` (bool def false), `limit` (int <=500, def 50)
- output: array `{icao24, callsign, aircraft_type, origin_country, altitude, velocity, heading, squawk, is_military, is_government, captured_at}` (last 1h)
- errors: 200
- example_curl: `curl .../api/tracking/flights`

### GET /api/tracking/vessels
- auth: no
- async: false
- input: query `military_only` (bool def false), `limit` (int <=500, def 50)
- output: array `{mmsi, vessel_name, vessel_type, flag, speed, heading, destination, is_military, is_dark, captured_at}` (last 1h)
- errors: 200
- example_curl: `curl .../api/tracking/vessels`

### GET /api/tracking/anomalies
- auth: no
- async: false (cached 60s)
- input: query `limit` (int <=100, def 50)
- output: array `{type:"DARK_VESSEL"|"UNIDENTIFIED_MILITARY_VESSEL"|"NO_SQUAWK_MILITARY", severity, description, asset_id, asset_name, latitude, longitude, zone, detected_at}` sorted by severity desc
- errors: 200
- example_curl: `curl .../api/tracking/anomalies`

--- DASHBOARD (backend/app/api/dashboard.py) ---

### GET /api/dashboard/stats
- auth: no
- async: false (cached 30s)
- input: none
- output: `{events_per_hour, events_24h, markets, active_signals, flights, vessels}`
- errors: 200
- example_curl: `curl .../api/dashboard/stats`

### GET /api/dashboard/tension
- auth: no
- async: false (cached 30s)
- input: none
- output: `{score, level, trend:"rising"|"falling"|"stable", breakdown, calculated_at}` (or `{score:0, level:"CALM", trend:"stable", breakdown:{}}` if no data)
- errors: 200
- example_curl: `curl .../api/dashboard/tension`

### GET /api/dashboard/sources
- auth: no
- async: false
- input: none
- output: ingestion source health array from IngestionManager.get_status() ([] if manager not ready)
- errors: 200
- example_curl: `curl .../api/dashboard/sources`

### GET /api/dashboard/tension/history
- auth: no
- async: false (cached 60s, hour-bucketed key)
- input: query `hours` (int def 24)
- output: array `{score, level, calculated_at}`
- errors: 200
- example_curl: `curl '.../api/dashboard/tension/history?hours=72'`

--- SETTINGS (backend/app/api/settings.py) ---

### GET /api/settings
- auth: YES (Bearer)
- async: false
- input: none
- output: the user's `preferences` dict ({} if none)
- errors: 401
- example_curl: `curl .../api/settings -H 'Authorization: Bearer <token>'`

### PUT /api/settings
- auth: YES (Bearer)
- async: false
- input: JSON body = arbitrary `preferences` dict (merged into existing)
- output: merged preferences dict
- errors: 401
- example_curl: `curl -X PUT .../api/settings -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' -d '{"theme":"dark"}'`

--- TRADING (backend/app/api/trading.py) — Polymarket order placement, wallet-gated ---

### POST /api/trading/orders
- auth: YES (Bearer + user.wallet_address must be set)
- async: false
- input: JSON body `{condition_id: str, side: "BUY"|"SELL", outcome: "YES"|"NO", price: float 0.01-0.99, size: float >0}`
- output: OrderResponse `{id, market_id, condition_id, wallet_address, side, outcome, price, size, status, tx_hash, error_message, created_at, filled_at}`
- errors: 400 wallet not connected / ValueError from TradingService ; 401 ; 422 validation
- example_curl: `curl -X POST .../api/trading/orders -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' -d '{"condition_id":"0x..","side":"BUY","outcome":"YES","price":0.55,"size":10}'`

### DELETE /api/trading/orders/{order_id}
- auth: YES (Bearer + wallet)
- async: false
- input: path `order_id` (int)
- output: `{status:"cancelled"}`
- errors: 400 wallet not connected ; 404 not found/not cancellable
- example_curl: `curl -X DELETE .../api/trading/orders/7 -H 'Authorization: Bearer <token>'`

### GET /api/trading/orders
- auth: YES (Bearer + wallet)
- async: false
- input: query `status` (opt, one of pending|filled|cancelled|failed), `limit` (int <=200, def 50)
- output: array of OrderResponse
- errors: 400 wallet ; 401 ; 422 invalid status
- example_curl: `curl '.../api/trading/orders?status=pending' -H 'Authorization: Bearer <token>'`

### GET /api/trading/positions
- auth: YES (Bearer + wallet)
- async: false
- input: none
- output: array `{id, market_id, condition_id, outcome, size, avg_price, current_price, unrealized_pnl}`
- errors: 400 wallet ; 401
- example_curl: `curl .../api/trading/positions -H 'Authorization: Bearer <token>'`

--- INTEL (backend/app/api/intel.py) — mounted at prefix /api (no extra segment) ---

### GET /api/intel
- auth: no
- async: false (cached 45s)
- input: none
- output: `{generated_at, threat_level{score,level,trend}, top_events[], active_conflicts[], nuclear_alerts[], cyber_threats[], maritime_anomalies[], tension_history[]}`
- errors: 200
- example_curl: `curl .../api/intel`

--- ANALYSIS (backend/app/api/analysis.py) — multi-agent consensus AI analysis ---

### GET /api/analysis
- auth: no
- async: false
- input: query `analysis_type` (str opt), `limit` (int <=50, def 20), `offset` (int def 0)
- output: array of analysis objects (see _fmt_analysis: id, event_id, market_id, analysis_type, title, summary, agent_assessments, consensus_*, prediction*, accuracy_score, agent_count, model_used, processing_time_ms, categories, entities_mentioned, created_at, resolved_at)
- errors: 200
- example_curl: `curl '.../api/analysis?limit=10'`

### GET /api/analysis/agents
- auth: no
- async: false
- input: none
- output: array `{id, name, icon, focus, bias, primary_categories}` (analyst archetypes)
- errors: 200
- example_curl: `curl .../api/analysis/agents`

### GET /api/analysis/stats
- auth: no
- async: false (cached 60s)
- input: none
- output: `{total_analyses, analyses_24h, avg_confidence_7d, direction_distribution, avg_accuracy, agent_count}`
- errors: 200
- example_curl: `curl .../api/analysis/stats`

### POST /api/analysis/event/{event_id}
- auth: no
- async: true (BackgroundTasks; poll GET /api/analysis?... or /api/analysis/{id} for result)
- input: path `event_id` (int)
- output: `{status:"queued", event_id, message}`
- errors: 409 analysis already exists for this event
- example_curl: `curl -X POST .../api/analysis/event/123`

### POST /api/analysis/situation
- auth: no
- async: true (BackgroundTasks)
- input: query `topic` (str 2-200, req), `hours` (int 1-168, def 48)
- output: `{status:"queued", topic, hours, message}`
- errors: 422 validation
- example_curl: `curl -X POST '.../api/analysis/situation?topic=taiwan&hours=72'`

### GET /api/analysis/{analysis_id}
- auth: no
- async: false
- input: path `analysis_id` (int)
- output: single analysis object (_fmt_analysis)
- errors: 404 not found
- example_curl: `curl .../api/analysis/55`

--- REALTIME (Socket.IO, backend/app/websocket.py) ---

### WS /socket.io  (Socket.IO ASGI, not raw WebSocket)
- auth: no
- async: realtime
- protocol: Socket.IO (engine.io). Client events: `connect`, `disconnect`, `subscribe` `{channels:["events","markets","flights","vessels","tension"]}`, `unsubscribe` `{channels:[...]}`. Server emits per-channel event types via emit_event(channel, event_type, data).
- note: server-side emit helpers exist (emit_event / emit_to_all); confirm which background services actually emit (see Gaps).
- example: socket.io-client -> `io(BASE).emit('subscribe', {channels:['events']})`

--- STATIC ---

### GET /data/*  (StaticFiles mount)
- auth: no
- async: false
- input: path to a file under repo `data/` (e.g. conflict_zones.geojson, nuclear_sites.geojson, strategic_infrastructure.geojson, military_bases.geojson, sources.json, webcam_feeds.json, market_mappings.json, keywords.json)
- output: raw file (GeoJSON / JSON)
- errors: 404 if file missing
- example_curl: `curl .../data/conflict_zones.geojson`

## Flows

1. Authenticated session (email):
   POST /api/auth/login -> {access_token} ; send `Authorization: Bearer <token>` on /api/auth/me, /api/settings, /api/trading/*.

2. Wallet auth (web3):
   GET /api/auth/nonce?wallet=0x.. -> {nonce, message} ; client signs `message` ; POST /api/auth/wallet {wallet_address, signature} -> {access_token}.

3. Place a trade (Polymarket):
   (auth + wallet) POST /api/trading/orders -> OrderResponse(status pending) ; poll GET /api/trading/orders?status=... ; DELETE /api/trading/orders/{id} to cancel ; GET /api/trading/positions for holdings.

4. AI analysis (async background, no job-id endpoint — poll by listing):
   POST /api/analysis/event/{event_id} -> {status:"queued"} ; then poll GET /api/analysis?limit=.. (or GET /api/analysis/{id} once id known) until the Analysis row appears.
   POST /api/analysis/situation?topic=.. -> {status:"queued"} ; poll GET /api/analysis?analysis_type=situation (analysis_type value unconfirmed — see Gaps).

5. Admin signal bootstrap:
   (admin JWT) POST /api/signals/regenerate?min_severity=8 -> {status:"running", events_queued} ; new signals appear via GET /api/signals.

6. Realtime feed:
   Connect Socket.IO at /socket.io ; emit `subscribe` {channels:[...]} ; receive emitted event types. OR poll SSE GET /api/events/stream for new events only.

## Gaps
- base_url_prod: UNKNOWN. No production domain in repo (server_name `_`, README points at localhost / localhost:8090). Self-hosted OSS app. Verify: docker-compose.prod.yml, nginx/nginx.prod.conf, any external deploy config not in repo.
- Async analysis has no dedicated status/result endpoint that returns a job id at submit time. POST /api/analysis/event returns no analysis_id; you must poll the list. Verify: backend/app/analyzer/consensus_engine.py (does analyze_event set a discoverable id/status?).
- analysis_type filter values for GET /api/analysis are not enumerated in the router. Verify: app/models/analysis.py + consensus_engine.py for the exact strings (e.g. "event" vs "situation").
- Socket.IO emitted event_type names per channel are not defined in websocket.py (only emit helpers). Verify which background services (ingestion/manager.py, market_tracker.py, tension_index.py) call emit_event and with what event types.
- /api/map/webcams + /api/map/webcams/near* response shape: defined in app/ingestion/sources/webcams.py (get_cached_webcams / find_webcams_near), not inlined here. Verify that file for exact fields.
- /api/dashboard/sources response shape comes from IngestionManager.get_status(). Verify app/ingestion/manager.py.
- TradingService.place_order may raise non-ValueError errors (e.g. on-chain failures) -> mapped to 500. Verify app/polymarket/trading.py for failure modes before wiring automated trades.
- Trading endpoints execute REAL Polymarket on-chain orders with the user's wallet. Treat as high blast radius; do NOT wire as an unattended Neo tool without explicit confirmation.

## Recap
- 41 HTTP endpoints found (auth 5, events 3, markets 3, signals 2, map 11, tracking 3, dashboard 4, settings 2, trading 4, intel 1, analysis 6, health 1) + 1 SSE (events/stream, counted within events) + 1 Socket.IO mount (/socket.io) + /data static.
- Auth: mostly PUBLIC read endpoints; Bearer JWT for /me, /settings, /trading/*; admin role for POST /signals/regenerate.
- Coverage vs NeoBot today: 0 currently wired. SONAR is a NEW backend for Neo. Safe candidates to wire as read tools: /api/intel, /api/dashboard/{stats,tension}, /api/events, /api/signals, /api/map/sensitive-zones, /api/tracking/anomalies, /api/analysis/stats. Keep /api/trading/* manual-confirm only.
