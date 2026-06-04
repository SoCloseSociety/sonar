// Capture SONAR screenshots via Playwright.
// Run: node docs/capture.mjs   (after `docker compose up -d`)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.SONAR_URL || 'http://localhost:8090';
const OUT  = join(import.meta.dirname, 'screenshots');
mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 1920, height: 1080 };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  // Best-effort: locate the email/password fields by their visible labels or placeholders.
  const email = page.getByPlaceholder(/email/i).or(page.locator('input[type="email"]')).first();
  const pwd   = page.getByPlaceholder(/password|mot de passe/i).or(page.locator('input[type="password"]')).first();
  await email.fill('admin@sonar.io').catch(() => {});
  await pwd.fill('Sonar2024').catch(() => {});
  const submit = page.getByRole('button', { name: /sign.?in|login|log.?in|connecter/i }).first();
  await submit.click({ timeout: 3000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await wait(2000);
}

async function shot(page, path, opts = {}) {
  await page.screenshot({ path: join(OUT, path), fullPage: false, ...opts });
  console.log('  ✓', path);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // Login page — capture as-is for the "first run" view
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await wait(1500);
  await shot(page, 'login.png');

  // Authenticate (best-effort; if login UI selectors miss, screenshots still capture public views)
  await login(page);

  // Globe (default route)
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await wait(6000);  // let the globe + textures finish loading
  await shot(page, 'globe.png');

  // Intel page
  await page.goto(`${BASE}/intel`, { waitUntil: 'networkidle' }).catch(() => {});
  await wait(3000);
  await shot(page, 'intel.png');

  // Dashboard (might be at /dashboard or /)
  for (const path of ['/dashboard', '/feed', '/']) {
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await wait(2500);
      await shot(page, 'dashboard.png');
      break;
    } catch {}
  }

  // Signals / markets
  await page.goto(`${BASE}/markets`, { waitUntil: 'networkidle' }).catch(() => {});
  await wait(2000);
  await shot(page, 'markets.png');

  await page.goto(`${BASE}/signals`, { waitUntil: 'networkidle' }).catch(() => {});
  await wait(2000);
  await shot(page, 'signals.png');

  await browser.close();
})();
