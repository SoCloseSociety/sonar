# Docs

## Screenshots

The PNGs in [`screenshots/`](screenshots/) are referenced from the root `README.md`.

To regenerate them:

```bash
# Make sure the stack is running:
docker compose up -d
# Wait until http://localhost:8090 responds.

# Capture:
cd docs
npm install        # one-off: pulls playwright
node capture.mjs
```

The script logs into the dashboard with the seeded admin credentials (`admin@sonar.io / Sonar2024`) — adjust the selectors in [`capture.mjs`](capture.mjs) if your auth flow differs.

Captures are taken at 1920×1080 with 2× DPI, so files are large (~1 MB for the globe). If you'd prefer smaller, lower `deviceScaleFactor` in the script.
