## Summary

<!-- 1–3 sentences: what does this PR do? -->

## Why

<!-- The motivation. Linked issue: closes #123 -->

## Changes

<!-- Bullet list of the meaningful changes -->

-
-

## Test plan

- [ ] `cd frontend && npx tsc --noEmit` — 0 errors
- [ ] `cd frontend && npx vite build` — clean build
- [ ] `docker compose exec backend pytest tests/test_api.py -v` — all green
- [ ] Manual smoke test in the browser (describe what you clicked)

## Screenshots / logs

<!-- For UI changes, paste a screenshot. For bug fixes, show the before/after logs. -->
