// scripts/capture-home-redesign.cjs
// Automated screenshot capture for Kinora 0.6.0 Home Screen Redesign.
// Zero em-dash compliance.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '../docs/ui/home-review');
const PORT = 5199;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function captureScreen(page, filename, options = {}) {
  const filePath = path.join(OUT_DIR, filename);
  await page.screenshot({ path: filePath, ...options });
  const stats = fs.statSync(filePath);
  console.log(`Saved ${filename} (${stats.size} bytes)`);
}

async function run() {
  await ensureDir(OUT_DIR);

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
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
    await pageDesktop1080.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await pageDesktop1080.waitForTimeout(1000);
    await captureScreen(pageDesktop1080, 'home-desktop-1080p.png');

    // 2. Desktop 1440x900
    console.log('Capturing Desktop 1440x900...');
    const ctxDesktop1440x900 = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await ctxDesktop1440x900.addInitScript(() => {
      localStorage.setItem('kinora.setup.v1', JSON.stringify({ done: true }));
      localStorage.setItem('kinora.prefs.v2', JSON.stringify({ viewMode: 'desktop', demoMode: true }));
    });
    const pageDesktop1440x900 = await ctxDesktop1440x900.newPage();
    await pageDesktop1440x900.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await pageDesktop1440x900.waitForTimeout(1000);
    await captureScreen(pageDesktop1440x900, 'home-desktop-1440x900.png');

    // 3. Desktop 2560x1440
    console.log('Capturing Desktop 2560x1440...');
    const ctxDesktop1440p = await browser.newContext({
      viewport: { width: 2560, height: 1440 },
    });
    await ctxDesktop1440p.addInitScript(() => {
      localStorage.setItem('kinora.setup.v1', JSON.stringify({ done: true }));
      localStorage.setItem('kinora.prefs.v2', JSON.stringify({ viewMode: 'desktop', demoMode: true }));
    });
    const pageDesktop1440p = await ctxDesktop1440p.newPage();
    await pageDesktop1440p.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await pageDesktop1440p.waitForTimeout(1000);
    await captureScreen(pageDesktop1440p, 'home-desktop-1440p.png');

    // 4. TV Mode 1920x1080
    console.log('Capturing TV Mode 1920x1080...');
    const ctxTv1080 = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    await ctxTv1080.addInitScript(() => {
      localStorage.setItem('kinora.setup.v1', JSON.stringify({ done: true }));
      localStorage.setItem('kinora.prefs.v2', JSON.stringify({ viewMode: 'tv', demoMode: true }));
    });
    const pageTv1080 = await ctxTv1080.newPage();
    await pageTv1080.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await pageTv1080.waitForTimeout(1000);
    await captureScreen(pageTv1080, 'home-tv-1080p.png');

    // 5. TV Mode 3840x2160 (4K)
    console.log('Capturing TV Mode 3840x2160...');
    const ctxTv4k = await browser.newContext({
      viewport: { width: 3840, height: 2160 },
    });
    await ctxTv4k.addInitScript(() => {
      localStorage.setItem('kinora.setup.v1', JSON.stringify({ done: true }));
      localStorage.setItem('kinora.prefs.v2', JSON.stringify({ viewMode: 'tv', demoMode: true }));
    });
    const pageTv4k = await ctxTv4k.newPage();
    await pageTv4k.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await pageTv4k.waitForTimeout(1000);
    await captureScreen(pageTv4k, 'home-tv-4k.png');

    // 6. Full-Page Desktop (1920px width)
    console.log('Capturing Full-Page Desktop...');
    const ctxFullDesktop = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    await ctxFullDesktop.addInitScript(() => {
      localStorage.setItem('kinora.setup.v1', JSON.stringify({ done: true }));
      localStorage.setItem('kinora.prefs.v2', JSON.stringify({ viewMode: 'desktop', demoMode: true }));
    });
    const pageFullDesktop = await ctxFullDesktop.newPage();
    await pageFullDesktop.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await pageFullDesktop.waitForTimeout(1000);
    // Smooth scroll down to trigger any lazy image observers, then scroll back to top
    await pageFullDesktop.evaluate(async () => {
      const scrollStep = 800;
      for (let y = 0; y < document.body.scrollHeight; y += scrollStep) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 100));
      }
      window.scrollTo(0, 0);
    });
    await pageFullDesktop.waitForTimeout(600);
    await captureScreen(pageFullDesktop, 'home-full-page-desktop.png', { fullPage: true });

    // 7. Full-Page TV Mode (1920px width)
    console.log('Capturing Full-Page TV Mode...');
    const ctxFullTv = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    await ctxFullTv.addInitScript(() => {
      localStorage.setItem('kinora.setup.v1', JSON.stringify({ done: true }));
      localStorage.setItem('kinora.prefs.v2', JSON.stringify({ viewMode: 'tv', demoMode: true }));
    });
    const pageFullTv = await ctxFullTv.newPage();
    await pageFullTv.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await pageFullTv.waitForTimeout(1000);
    await pageFullTv.evaluate(async () => {
      const scrollStep = 800;
      for (let y = 0; y < document.body.scrollHeight; y += scrollStep) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 100));
      }
      window.scrollTo(0, 0);
    });
    await pageFullTv.waitForTimeout(600);
    await captureScreen(pageFullTv, 'home-full-page-tv.png', { fullPage: true });

    console.log('All 7 required screenshots successfully captured!');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Capture script error:', err);
  process.exit(1);
});
