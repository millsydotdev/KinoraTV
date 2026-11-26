// scripts/capture-gate-d9.cjs
// Visual screenshot capture for Gate D9: Production EPG DOM Virtualisation.
// Captures 4 resolutions: Desktop 1080p, Desktop 1440x900, TV 1080p, and TV 4K.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = 5199;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUT_DIR = path.resolve(__dirname, '../docs/ui/gate-d9');

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server did not respond within ${timeoutMs}ms at ${url}`);
}

async function captureScreen(page, filename, options = {}) {
  const filePath = path.join(OUT_DIR, filename);
  await page.screenshot({ path: filePath, ...options });
  const stats = fs.statSync(filePath);
  console.log(`Saved ${filename} (${stats.size} bytes)`);
}

async function run() {
  await ensureDir(OUT_DIR);

  console.log('--- Starting Preview Server for Gate D9 Captures ---');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'pipe',
  });

  preview.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) console.error(`[preview-err] ${msg}`);
  });

  let browser = null;

  try {
    await waitForServer(BASE_URL);
    console.log('Preview server ready at', BASE_URL);

    browser = await chromium.launch({
      headless: true,
      executablePath: '/usr/bin/google-chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    // 1. Desktop 1920x1080
    console.log('Capturing Desktop 1920x1080...');
    const ctxDesktop1080 = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    await ctxDesktop1080.addInitScript(() => {
      localStorage.setItem('kinora.setup.v1', JSON.stringify({ done: true }));
      localStorage.setItem('kinora.prefs.v2', JSON.stringify({ viewMode: 'desktop', demoMode: true }));
    });
    const pageDesktop1080 = await ctxDesktop1080.newPage();
    await pageDesktop1080.goto(`${BASE_URL}/live`, { waitUntil: 'networkidle' });
    await pageDesktop1080.waitForSelector('.guide-scroll', { state: 'visible', timeout: 10000 });
    await pageDesktop1080.waitForSelector('.guide-row', { state: 'visible', timeout: 10000 });
    await pageDesktop1080.waitForTimeout(1000);
    await captureScreen(pageDesktop1080, 'live-guide-desktop-1080p.png');
    await ctxDesktop1080.close();

    // 2. Desktop 1440x900
    console.log('Capturing Desktop 1440x900...');
    const ctxDesktop900 = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await ctxDesktop900.addInitScript(() => {
      localStorage.setItem('kinora.setup.v1', JSON.stringify({ done: true }));
      localStorage.setItem('kinora.prefs.v2', JSON.stringify({ viewMode: 'desktop', demoMode: true }));
    });
    const pageDesktop900 = await ctxDesktop900.newPage();
    await pageDesktop900.goto(`${BASE_URL}/live`, { waitUntil: 'networkidle' });
    await pageDesktop900.waitForSelector('.guide-scroll', { state: 'visible', timeout: 10000 });
    await pageDesktop900.waitForSelector('.guide-row', { state: 'visible', timeout: 10000 });
    await pageDesktop900.waitForTimeout(1000);
    await captureScreen(pageDesktop900, 'live-guide-desktop-1440x900.png');
    await ctxDesktop900.close();

    // 3. TV 1920x1080
    console.log('Capturing TV 1920x1080 (TV viewMode)...');
    const ctxTv1080 = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    await ctxTv1080.addInitScript(() => {
      localStorage.setItem('kinora.setup.v1', JSON.stringify({ done: true }));
      localStorage.setItem('kinora.prefs.v2', JSON.stringify({ viewMode: 'tv', layoutMode: 'tv', demoMode: true }));
    });
    const pageTv1080 = await ctxTv1080.newPage();
    await pageTv1080.goto(`${BASE_URL}/live`, { waitUntil: 'networkidle' });
    await pageTv1080.waitForSelector('.guide-scroll', { state: 'visible', timeout: 10000 });
    await pageTv1080.waitForSelector('.guide-row', { state: 'visible', timeout: 10000 });
    await pageTv1080.waitForTimeout(1000);
    await captureScreen(pageTv1080, 'live-guide-tv-1080p.png');
    await ctxTv1080.close();

    // 4. TV 3840x2160 (4K)
    console.log('Capturing TV 3840x2160 4K (TV viewMode)...');
    const ctxTv4k = await browser.newContext({
      viewport: { width: 3840, height: 2160 },
    });
    await ctxTv4k.addInitScript(() => {
      localStorage.setItem('kinora.setup.v1', JSON.stringify({ done: true }));
      localStorage.setItem('kinora.prefs.v2', JSON.stringify({ viewMode: 'tv', layoutMode: 'tv', demoMode: true }));
    });
    const pageTv4k = await ctxTv4k.newPage();
    await pageTv4k.goto(`${BASE_URL}/live`, { waitUntil: 'networkidle' });
    await pageTv4k.waitForSelector('.guide-scroll', { state: 'visible', timeout: 10000 });
    await pageTv4k.waitForSelector('.guide-row', { state: 'visible', timeout: 10000 });
    await pageTv4k.waitForTimeout(1000);
    await captureScreen(pageTv4k, 'live-guide-tv-4k.png');
    await ctxTv4k.close();

    console.log('--- All 4 Gate D9 Screenshots Captured Successfully ---');
  } finally {
    if (browser) await browser.close();
    preview.kill('SIGTERM');
  }
}

run().catch((err) => {
  console.error('Fatal error during capture:', err);
  process.exit(1);
});
