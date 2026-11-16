const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '../docs/ui/screenshots');
const ARTIFACT_DIR = '/home/millsy/.gemini/antigravity/brain/1c521f47-1460-4a82-a96e-baff8b40854c/screenshots';

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

async function run() {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  // Helper to save screenshot to both locations
  async function saveScreenshot(filename) {
    const p1 = path.join(OUT_DIR, filename);
    const p2 = path.join(ARTIFACT_DIR, filename);
    await page.screenshot({ path: p1, fullPage: false });
    fs.copyFileSync(p1, p2);
    console.log(`Saved screenshot: ${filename}`);
  }

  // 1. Setup local storage for demo mode
  await page.goto('http://localhost:5199/');
  await page.evaluate(() => {
    localStorage.setItem('kinora.setup.v1', JSON.stringify({ done: true }));
    localStorage.setItem('kinora.prefs.v2', JSON.stringify({
      theme: 'charcoal',
      accent: 'red',
      showDescriptions: true,
      largeClock: false,
      dimmedInactiveHours: true,
      clockFormat: '24',
      volume: 1,
      muted: false,
      demoMode: true,
      autoRefreshInterval: 0,
      channelNumberSort: false,
      audioOutputDevice: null,
      customStreamUrl: null,
      channelFilterPreset: 'all'
    }));
  });

  // 2. Movies top of page
  console.log('Capturing Movies top...');
  await page.goto('http://localhost:5199/movies', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await saveScreenshot('movies-top.png');

  // 3. Movies rails
  console.log('Capturing Movies rails...');
  await page.evaluate(() => window.scrollTo({ top: 580, behavior: 'instant' }));
  await page.waitForTimeout(500);
  await saveScreenshot('movies-rails.png');

  // 4. Movie Details
  console.log('Capturing Movie Details...');
  await page.goto('http://localhost:5199/movies/the-outpost', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await saveScreenshot('movie-details.png');

  // 5. Movies empty state (no on-demand provider)
  console.log('Capturing Movies empty state...');
  await page.evaluate(() => {
    const prefs = JSON.parse(localStorage.getItem('kinora.prefs.v2') || '{}');
    prefs.demoMode = false;
    localStorage.setItem('kinora.prefs.v2', JSON.stringify(prefs));
  });
  await page.goto('http://localhost:5199/movies', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await saveScreenshot('movies-empty.png');

  // 6. Reset demoMode to true for TV Shows
  await page.evaluate(() => {
    const prefs = JSON.parse(localStorage.getItem('kinora.prefs.v2') || '{}');
    prefs.demoMode = true;
    localStorage.setItem('kinora.prefs.v2', JSON.stringify(prefs));
  });

  // 7. TV Shows top of page
  console.log('Capturing TV Shows top...');
  await page.goto('http://localhost:5199/tv-shows', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await saveScreenshot('tv-shows-top.png');

  // 8. TV Shows rails
  console.log('Capturing TV Shows rails...');
  await page.evaluate(() => window.scrollTo({ top: 580, behavior: 'instant' }));
  await page.waitForTimeout(500);
  await saveScreenshot('tv-shows-rails.png');

  // 9. TV Show details
  console.log('Capturing TV Show Details...');
  await page.goto('http://localhost:5199/series/ninth-ward', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await saveScreenshot('tv-show-details.png');

  // 10. TV Shows empty state (no on-demand provider)
  console.log('Capturing TV Shows empty state...');
  await page.evaluate(() => {
    const prefs = JSON.parse(localStorage.getItem('kinora.prefs.v2') || '{}');
    prefs.demoMode = false;
    localStorage.setItem('kinora.prefs.v2', JSON.stringify(prefs));
  });
  await page.goto('http://localhost:5199/tv-shows', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await saveScreenshot('tv-shows-empty.png');

  await browser.close();
  console.log('All screenshots captured successfully!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
