// scripts/verify-stage6-ui.cjs
// Comprehensive automated multi-resolution UI validation for Stage 6 Release Readiness.
// Tests and records visual presentation across desktop viewports and TV Mode.
// Strict compliance: Zero em-dashes and zero en-dashes.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const OUT_DIR = path.resolve(__dirname, '../docs/ui/stage6-verification');
const ARTIFACT_DIR = '/home/millsy/.gemini/antigravity/brain/d23cc8a0-38a0-4244-a695-7247f7ff0e2d/screenshots-stage6';
const PORT = 5199;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const VIEWPORTS = [
  { name: '720p', width: 1280, height: 720, tv: false },
  { name: '1080p', width: 1920, height: 1080, tv: false },
  { name: '1440p', width: 2560, height: 1440, tv: false },
  { name: '4k', width: 3840, height: 2160, tv: false },
  { name: 'compact', width: 1024, height: 768, tv: false },
  { name: 'tv-1080p', width: 1920, height: 1080, tv: true },
  { name: 'tv-4k', width: 3840, height: 2160, tv: true },
];

const SCREENS = [
  { name: 'home', path: '/' },
  { name: 'live-tv', path: '/live' },
  { name: 'movies', path: '/movies' },
  { name: 'series', path: '/series' },
  { name: 'search', path: '/search' },
  { name: 'recordings', path: '/recordings' },
  { name: 'sources', path: '/sources' },
  { name: 'settings', path: '/settings' },
];

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
      // Retry
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Server at ${url} not ready within ${timeoutMs}ms`);
}

async function run() {
  await ensureDir(OUT_DIR);
  await ensureDir(ARTIFACT_DIR);

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

    for (const vp of VIEWPORTS) {
      console.log(`Testing viewport: ${vp.name} (${vp.width}x${vp.height}, TV Mode: ${vp.tv})`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });

      await context.addInitScript((isTv) => {
        localStorage.setItem('kinora.setup.v1', JSON.stringify({ done: true }));
        localStorage.setItem('kinora.prefs.v2', JSON.stringify({
          tvMode: isTv,
          motion: 'reduced',
          theme: 'ember',
        }));
      }, vp.tv);

      const page = await context.newPage();

      for (const screen of SCREENS) {
        const url = `${BASE_URL}${screen.path}`;
        try {
          await page.goto(url, { waitUntil: 'networkidle' });
          await page.waitForTimeout(500);

          const fileName = `${screen.name}-${vp.name}.png`;
          const outPath = path.join(OUT_DIR, fileName);
          const artifactPath = path.join(ARTIFACT_DIR, fileName);

          await page.screenshot({ path: outPath });
          fs.copyFileSync(outPath, artifactPath);
          console.log(`  Saved ${fileName}`);
        } catch (err) {
          console.error(`  Error capturing ${screen.name} at ${vp.name}:`, err.message);
        }
      }

      // If TV mode, test remote navigation and capture focus state
      if (vp.tv && vp.name === 'tv-1080p') {
        try {
          await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
          await page.waitForTimeout(400);
          await page.keyboard.press('ArrowDown');
          await page.waitForTimeout(200);
          await page.keyboard.press('ArrowRight');
          await page.waitForTimeout(200);

          const focusFile = `tv-focus-state-1080p.png`;
          const focusOut = path.join(OUT_DIR, focusFile);
          await page.screenshot({ path: focusOut });
          fs.copyFileSync(focusOut, path.join(ARTIFACT_DIR, focusFile));
          console.log(`  Saved ${focusFile}`);
        } catch (e) {
          console.error('  Error testing TV focus:', e.message);
        }
      }

      await context.close();
    }

    // Capture Player screen (with HUD controls and telemetry)
    console.log('Testing Player view...');
    const playerContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    await playerContext.addInitScript(() => {
      localStorage.setItem('kinora.setup.v1', JSON.stringify({ done: true }));
      localStorage.setItem('kinora.prefs.v2', JSON.stringify({
        theme: 'ember',
      }));
    });
    const playerPage = await playerContext.newPage();
    try {
      await playerPage.goto(`${BASE_URL}/watch/channel%3Anorthlight-one`, { waitUntil: 'networkidle' });
      await playerPage.waitForTimeout(600);
      const playerOut = path.join(OUT_DIR, 'player-1080p-desktop.png');
      await playerPage.screenshot({ path: playerOut });
      fs.copyFileSync(playerOut, path.join(ARTIFACT_DIR, 'player-1080p-desktop.png'));
      console.log('  Saved player-1080p-desktop.png');
    } catch (e) {
      console.error('  Error capturing Player:', e.message);
    }
    await playerContext.close();

    await browser.close();
    console.log('Stage 6 UI validation capture complete.');
  } finally {
    preview.kill();
  }
}

run().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
