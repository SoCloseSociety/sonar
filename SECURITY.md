# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in SONAR, **please do not open a public issue**. Instead, email the maintainers at:

**security@soclosesociety.org** *(or open a private security advisory on GitHub: [Security → Advisories → New draft](https://github.com/soclosesociety/sonar/security/advisories/new))*

Please include:

- A description of the vulnerability
- Steps to reproduce or a proof-of-concept
- The affected version / commit SHA
- Any suggested mitigation

We aim to acknowledge reports within 72 hours and to publish a fix or mitigation within 14 days for high-severity issues.

## Supported versions

Only the `main` branch is actively maintained. Pinned releases are not yet published — if you deploy SONAR in production, pin to a commit SHA.

## Hardening checklist for self-hosters

Before exposing SONAR to the internet:

- [ ] Set strong `SECRET_KEY` and `JWT_SECRET` (`openssl rand -hex 32`)
- [ ] Change `POSTGRES_PASSWORD` from the default
- [ ] Set `APP_ENV=production` — this enforces strict secret checks at startup
- [ ] Put nginx (or another reverse proxy) in front with TLS termination
- [ ] Restrict CORS origins in `backend/app/main.py` to your real frontend domain
- [ ] Disable account self-registration if not needed (comment out the `/register` route)
- [ ] Run behind a firewall — only expose port 443 to the public
- [ ] Rotate API keys (Telegram, OpenSky, Shodan, …) regularly
- [ ] Back up the `postgres-data/` Docker volume

## Built-in defences

| Defence | Where |
|---|---|
| Login rate limit (8 / 5 min per IP+email) | `backend/app/auth/router.py` |
| Registration rate limit (5 / hour per IP) | `backend/app/auth/router.py` |
| Webcam proxy SSRF protection | `backend/app/api/map_data.py` (no follow_redirects, host allowlist) |
| Production-mode secret check | `backend/app/config.py` |
| Parameterized SQL via SQLAlchemy | everywhere |
| JWT signature + expiration verification | `backend/app/auth/jwt_handler.py` |
| Bcrypt password hashing | `backend/app/auth/password_auth.py` |

## Known limitations

- Socket.IO connections are **not currently authenticated** — all connected clients can subscribe to public broadcast channels. Treat realtime channels as public data.
- No CSRF tokens — auth is Bearer-token via `Authorization` header, which is immune to CSRF for non-cookie flows.
- The frontend stores the JWT in `localStorage`, which is vulnerable to XSS. We mitigate by sanitizing URLs (`^https?://` validation) and never using `dangerouslySetInnerHTML` with untrusted data, but if you find an XSS, please report it as critical.

Thanks for keeping SONAR safe. 🛡️
