// scripts/capture-artwork-verification.cjs
// Visual verification capture script for Kinora Artwork, Metadata and Provider Integration.
// Captures Home, Movies, Series, Detail pages, Seasons/Episodes, Search, Library, Live TV,
// and Settings across 1920x1080 desktop, 1440x900 desktop, 1920x1080 TV, and 3840x2160 TV.
// Strictly adheres to zero em-dash typography standard.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = 5199;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUT_DIR = path.resolve(__dirname, '../docs/ui/artwork-verification');

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
      // waiting for preview server
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Preview server did not respond within ${timeoutMs}ms`);
}

async function waitForImages(page, timeoutMs = 6000) {
  await page.evaluate(async (maxWait) => {
    const imgs = Array.from(document.querySelectorAll('img'));
    await Promise.race([
      Promise.all(
        imgs.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((res) => {
            img.addEventListener('load', res, { once: true });
            img.addEventListener('error', res, { once: true });
          });
        }),
      ),
      new Promise((res) => setTimeout(res, maxWait)),
    ]);
  }, timeoutMs);
}

async function auditImages(page, label) {
  const stats = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    const loaded = imgs.filter((i) => i.complete && i.naturalWidth > 0).length;
    const broken = imgs
      .filter((i) => i.complete && i.naturalWidth === 0)
      .map((i) => i.getAttribute('src'));
    const pending = imgs.filter((i) => !i.complete).length;
    return { total: imgs.length, loaded, broken, pending };
  });
  console.log(`[${label}] images: ${stats.loaded}/${stats.total} loaded, ${stats.broken.length} broken, ${stats.pending} pending`);
  if (stats.broken.length > 0) {
    console.log(`  broken URLs:`, stats.broken.slice(0, 5));
  }
  return stats;
}

async function capture(page, filename, label) {
  await waitForImages(page);
  await page.waitForTimeout(400);
  const stats = await auditImages(page, label);
  const filePath = path.join(OUT_DIR, filename);
  await page.screenshot({ path: filePath });
  const size = fs.statSync(filePath).size;
  console.log(`Saved ${filename} (${size} bytes)`);
  return stats;
}

let envTmdbKey = process.env.VITE_TMDB_API_KEY || process.env.TMDB_API_KEY || '';
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      if (line.startsWith('VITE_TMDB_API_KEY=')) {
        envTmdbKey = line.split('=', 2)[1].trim();
      }
    }
  }
} catch {}

async function makeContext(browser, viewport, prefs) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(({ p, tmdbKey }) => {
    localStorage.setItem('kinora.setup.v1', JSON.stringify({ done: true }));
    localStorage.setItem('kinora.prefs.v2', JSON.stringify(p));
    // Enable TMDB and TVmaze providers for live metadata enrichment
    localStorage.setItem(
      'kinora.metadataConfig.v1',
      JSON.stringify({
        tmdbEnabled: Boolean(tmdbKey),
        tmdbApiKey: tmdbKey || '',
        tvmazeEnabled: true,
        tvdbEnabled: false,
        tvdbApiKey: '',
        tvdbPin: '',
        autoEnrichEpg: false,
        preferHighResPosters: true,
        language: 'en-US',
        artworkSourcePreference: 'local-first',
      }),
    );
  }, { p: prefs, tmdbKey: envTmdbKey });
  return ctx;
}

async function run() {
  await ensureDir(OUT_DIR);

  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'pipe',
  });

  let browser = null;
  const summary = [];

  try {
    await waitForServer(BASE_URL);
    console.log('Preview server ready at', BASE_URL);

    browser = await chromium.launch({
      headless: true,
      executablePath: '/usr/bin/google-chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    // --- DESKTOP 1920x1080 ---
    const ctx1080 = await makeContext(
      browser,
      { width: 1920, height: 1080 },
      { viewMode: 'desktop', demoMode: true },
    );
    const page = await ctx1080.newPage();

    // 1. Home with cinematic movie hero
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.home-hero-cinematic', { timeout: 10000 });
    summary.push({ name: '01-home-movie-hero-desktop-1080p.png', ...(await capture(page, '01-home-movie-hero-desktop-1080p.png', 'Home Movie Hero 1080p')) });

    // 2. Home with TV series hero slide + scrolled to TV rails
    const nextSlideBtn = await page.$('.home-hero-nav-arrow.next');
    if (nextSlideBtn) {
      await nextSlideBtn.click();
      await page.waitForTimeout(500);
    }
    summary.push({ name: '02-home-series-slide-desktop-1080p.png', ...(await capture(page, '02-home-series-slide-desktop-1080p.png', 'Home Series Slide 1080p')) });

    // 3. Movies browsing screen
    await page.goto(`${BASE_URL}/movies`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.streaming-hero', { timeout: 10000 });
    summary.push({ name: '03-movies-browse-desktop-1080p.png', ...(await capture(page, '03-movies-browse-desktop-1080p.png', 'Movies Browse 1080p')) });

    // 4. TV Series browsing screen
    await page.goto(`${BASE_URL}/series`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.streaming-hero', { timeout: 10000 });
    summary.push({ name: '04-series-browse-desktop-1080p.png', ...(await capture(page, '04-series-browse-desktop-1080p.png', 'Series Browse 1080p')) });

    // 5. Movie detail page (backdrop + portrait poster)
    await page.goto(`${BASE_URL}/movies/harbour-lights`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.detail-hero', { timeout: 10000 });
    summary.push({ name: '05-movie-detail-desktop-1080p.png', ...(await capture(page, '05-movie-detail-desktop-1080p.png', 'Movie Detail 1080p')) });

    // 6. TV Series detail page with live TVmaze enrichment (Bonanza 1959 has real TVmaze poster, backdrop, and episodes)
    await page.goto(`${BASE_URL}/series/bonanza-1959`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.detail-hero', { timeout: 10000 });
    // Give live TVmaze enrichment a moment to hydrate cast, seasons, and episode stills
    await page.waitForTimeout(2200);
    summary.push({ name: '06-series-detail-tvmaze-desktop-1080p.png', ...(await capture(page, '06-series-detail-tvmaze-desktop-1080p.png', 'Series Detail TVmaze 1080p')) });

    // 7. Season and episode selection (The Beverly Hillbillies with 2 seasons + TVmaze episode stills)
    await page.goto(`${BASE_URL}/series/beverly-hillbillies`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.episodes', { timeout: 10000 });
    await page.waitForTimeout(2200);
    await page.evaluate(() => {
      document.querySelector('.episodes')?.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    summary.push({ name: '07-series-seasons-episodes-desktop-1080p.png', ...(await capture(page, '07-series-seasons-episodes-desktop-1080p.png', 'Seasons & Episodes 1080p')) });

    // 8. Search results
    await page.goto(`${BASE_URL}/search?q=The`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    summary.push({ name: '08-search-results-desktop-1080p.png', ...(await capture(page, '08-search-results-desktop-1080p.png', 'Search Results 1080p')) });

    // 9. Library
    await page.goto(`${BASE_URL}/library`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    summary.push({ name: '09-library-desktop-1080p.png', ...(await capture(page, '09-library-desktop-1080p.png', 'Library 1080p')) });

    // 10. Live TV guide with channel logos
    await page.goto(`${BASE_URL}/live`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.guide-row', { timeout: 10000 });
    summary.push({ name: '10-livetv-guide-desktop-1080p.png', ...(await capture(page, '10-livetv-guide-desktop-1080p.png', 'Live TV Guide 1080p')) });

    // 11. Settings -> Metadata & Art
    await page.goto(`${BASE_URL}/settings/metadata`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    summary.push({ name: '11-settings-metadata-desktop-1080p.png', ...(await capture(page, '11-settings-metadata-desktop-1080p.png', 'Settings Metadata 1080p')) });

    await ctx1080.close();

    // --- DESKTOP 1440x900 ---
    const ctx1440 = await makeContext(
      browser,
      { width: 1440, height: 900 },
      { viewMode: 'desktop', demoMode: true },
    );
    const page1440 = await ctx1440.newPage();
    await page1440.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await page1440.waitForSelector('.home-hero-cinematic', { timeout: 10000 });
    summary.push({ name: '12-home-desktop-1440x900.png', ...(await capture(page1440, '12-home-desktop-1440x900.png', 'Home Desktop 1440x900')) });
    await ctx1440.close();

    // --- TV MODE 1920x1080 ---
    const ctxTv1080 = await makeContext(
      browser,
      { width: 1920, height: 1080 },
      { viewMode: 'tv', demoMode: true },
    );
    const pageTv1080 = await ctxTv1080.newPage();
    await pageTv1080.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await pageTv1080.waitForSelector('.home-hero-cinematic', { timeout: 10000 });
    summary.push({ name: '13-home-tv-1080p.png', ...(await capture(pageTv1080, '13-home-tv-1080p.png', 'Home TV 1080p')) });
    await ctxTv1080.close();

    // --- TV MODE 3840x2160 (4K) ---
    const ctxTv4k = await makeContext(
      browser,
      { width: 3840, height: 2160 },
      { viewMode: 'tv', demoMode: true },
    );
    const pageTv4k = await ctxTv4k.newPage();
    await pageTv4k.goto(`${BASE_URL}/movies`, { waitUntil: 'networkidle' });
    await pageTv4k.waitForSelector('.streaming-hero', { timeout: 10000 });
    summary.push({ name: '14-movies-tv-4k.png', ...(await capture(pageTv4k, '14-movies-tv-4k.png', 'Movies TV 4K')) });
    await ctxTv4k.close();

    const totalBroken = summary.reduce((acc, s) => acc + s.broken.length, 0);
    console.log('\n=== ARTWORK VERIFICATION SUMMARY ===');
    console.log(`Captured ${summary.length} screenshots. Total broken images across all views: ${totalBroken}`);
  } finally {
    if (browser) await browser.close();
    preview.kill('SIGTERM');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
