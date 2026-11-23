// scripts/verify-stage2-ui.cjs
// Automated UI verification and screenshot capture for Stage 2 (Search & Layout Normalisation)
// Zero em-dash compliance.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const OUT_DIR = path.resolve(__dirname, '../docs/ui/stage2-verification');
const PORT = 5199;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // Retry after delay
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

async function run() {
  await ensureDir(OUT_DIR);
  console.log('Starting preview server on port', PORT);
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'pipe',
  });

  preview.stderr.on('data', (d) => console.error('[preview err]', d.toString()));

  try {
    await waitForServer(BASE_URL);
    console.log('Preview server ready at', BASE_URL);

    const browser = await chromium.launch({
      headless: true,
      executablePath: '/usr/bin/google-chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    await context.addInitScript(() => {
      localStorage.setItem('kinora.setup.v1', JSON.stringify({ done: true }));
    });
    const page = await context.newPage();

    // 1. Verify Header Search & Shortcuts at 1080p Desktop
    console.log('Testing Header Search & Shortcuts...');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    // Initial Home screenshot
    await page.screenshot({ path: path.join(OUT_DIR, 'home-1080p-desktop.png') });

    // Test Slash (/) shortcut focusing search input from unfocused state
    await page.keyboard.type('/');
    await page.waitForTimeout(400);
    const isFocused = await page.evaluate(() => document.activeElement?.id === 'header-search-input');
    console.log('Slash (/) focused header search input:', isFocused);

    // Type query "Harbour" into focused header search
    await page.keyboard.type('Harbour');
    await page.waitForSelector('#header-search-dropdown', { state: 'visible', timeout: 5000 });
    await page.screenshot({ path: path.join(OUT_DIR, 'header-search-suggestions-active.png') });

    // Press ArrowDown to select first suggestion
    await page.keyboard.press('ArrowDown');
    await page.waitForSelector('.header-search-item.is-selected', { timeout: 2000 });
    await page.screenshot({ path: path.join(OUT_DIR, 'header-search-item-selected.png') });

    // Press Escape to dismiss suggestions
    await page.keyboard.press('Escape');
    await page.waitForSelector('#header-search-dropdown', { state: 'detached', timeout: 2000 });

    // Test Command Palette via Grid Icon
    await page.click('.header-grid-btn');
    await page.waitForSelector('.ds-command-backdrop', { state: 'visible', timeout: 5000 });
    await page.screenshot({ path: path.join(OUT_DIR, 'command-palette-modal.png') });
    await page.click('.ds-command-backdrop', { position: { x: 20, y: 20 } });
    await page.waitForSelector('.ds-command-backdrop', { state: 'detached', timeout: 3000 });

    // 2. Multi-Resolution Layout Verification (Desktop Mode)
    const resolutions = [
      { name: '720p', width: 1280, height: 720 },
      { name: '1080p', width: 1920, height: 1080 },
      { name: '1440p', width: 2560, height: 1440 },
      { name: '4k', width: 3840, height: 2160 },
      { name: 'compact', width: 1024, height: 600 },
    ];

    const routes = [
      { path: '/', name: 'home' },
      { path: '/live', name: 'live-tv' },
      { path: '/movies', name: 'movies' },
      { path: '/series', name: 'series' },
      { path: '/search', name: 'search' },
      { path: '/settings', name: 'settings' },
    ];

    console.log('Capturing multi-resolution desktop screens...');
    for (const res of resolutions) {
      await page.setViewportSize({ width: res.width, height: res.height });
      for (const r of routes) {
        await page.goto(`${BASE_URL}${r.path}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(OUT_DIR, `${r.name}-${res.name}.png`) });
      }
    }

    // 3. TV Mode Layout Verification (10-foot scale)
    console.log('Capturing TV Mode screens at 1080p and 4K...');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-mode', 'tv');
      document.documentElement.setAttribute('data-layout', 'tv');
    });

    for (const res of [{ name: 'tv-1080p', width: 1920, height: 1080 }, { name: 'tv-4k', width: 3840, height: 2160 }]) {
      await page.setViewportSize({ width: res.width, height: res.height });
      for (const r of routes) {
        await page.goto(`${BASE_URL}${r.path}`, { waitUntil: 'networkidle' });
        await page.evaluate(() => {
          document.documentElement.setAttribute('data-mode', 'tv');
          document.documentElement.setAttribute('data-layout', 'tv');
        });
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(OUT_DIR, `${r.name}-${res.name}.png`) });
      }
    }

    await browser.close();
    console.log('Stage 2 UI verification completed successfully! Screenshots in:', OUT_DIR);
  } finally {
    preview.kill();
  }
}

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
