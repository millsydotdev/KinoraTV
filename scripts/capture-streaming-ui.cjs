const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '../docs/ui/screenshots');
const ARTIFACT_DIR = '/home/millsy/.gemini/antigravity/brain/1c521f47-1460-4a82-a96e-baff8b40854c/screenshots';

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

async function captureViewport(browser, width, height, suffix = '') {
  console.log(`\n=== Capturing UI suite at ${width}x${height}${suffix ? ` (${suffix})` : ''} ===`);

  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  async function saveScreenshot(basename) {
    const filename = suffix ? basename.replace('.png', `-${suffix}.png`) : basename;
    const p1 = path.join(OUT_DIR, filename);
    const p2 = path.join(ARTIFACT_DIR, filename);
    await page.screenshot({ path: p1, fullPage: false });
    fs.copyFileSync(p1, p2);
    console.log(`Saved screenshot: ${filename}`);
  }

  // 1. Setup local storage with demoMode = true (Public discovery catalogue active, no Xtream provider)
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

  // 1. Movies browse, top
  console.log('Capturing Movies browse, top...');
  await page.goto('http://localhost:5199/movies', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await saveScreenshot('movies-top.png');

  // 2. Movies browse, content rails
  console.log('Capturing Movies browse, content rails...');
  await page.evaluate(() => window.scrollTo({ top: 560, behavior: 'instant' }));
  await page.waitForTimeout(600);
  await saveScreenshot('movies-rails.png');

  // 3. Movie details
  console.log('Capturing Movie details...');
  await page.goto('http://localhost:5199/movies/the-outpost', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await saveScreenshot('movie-details.png');

  // 4. Movies with no provider and public discovery content (showing the prompt banner and discovery catalogue)
  console.log('Capturing Movies with no provider and public discovery content...');
  await page.goto('http://localhost:5199/movies', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.scrollTo({ top: 380, behavior: 'instant' }));
  await page.waitForTimeout(600);
  await saveScreenshot('movies-no-provider-discovery.png');

  // 5. Movies with a genuinely empty catalogue (demoMode = false, no providers)
  console.log('Capturing Movies with a genuinely empty catalogue...');
  await page.evaluate(() => {
    const prefs = JSON.parse(localStorage.getItem('kinora.prefs.v2') || '{}');
    prefs.demoMode = false;
    localStorage.setItem('kinora.prefs.v2', JSON.stringify(prefs));
  });
  await page.goto('http://localhost:5199/movies', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await saveScreenshot('movies-empty.png');

  // Reset demoMode to true for TV Shows
  await page.evaluate(() => {
    const prefs = JSON.parse(localStorage.getItem('kinora.prefs.v2') || '{}');
    prefs.demoMode = true;
    localStorage.setItem('kinora.prefs.v2', JSON.stringify(prefs));
  });

  // 6. TV Shows browse, top
  console.log('Capturing TV Shows browse, top...');
  await page.goto('http://localhost:5199/tv-shows', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await saveScreenshot('tv-shows-top.png');

  // 7. TV Shows browse, content rails
  console.log('Capturing TV Shows browse, content rails...');
  await page.evaluate(() => window.scrollTo({ top: 560, behavior: 'instant' }));
  await page.waitForTimeout(600);
  await saveScreenshot('tv-shows-rails.png');

  // 8. TV show details
  console.log('Capturing TV show details...');
  await page.goto('http://localhost:5199/series/ninth-ward', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await saveScreenshot('tv-show-details.png');

  // 9. TV Shows with no provider and public discovery content (showing the prompt banner and discovery catalogue)
  console.log('Capturing TV Shows with no provider and public discovery content...');
  await page.goto('http://localhost:5199/tv-shows', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.scrollTo({ top: 380, behavior: 'instant' }));
  await page.waitForTimeout(600);
  await saveScreenshot('tv-shows-no-provider-discovery.png');

  // 10. TV Shows with a genuinely empty catalogue (demoMode = false, no providers)
  console.log('Capturing TV Shows with a genuinely empty catalogue...');
  await page.evaluate(() => {
    const prefs = JSON.parse(localStorage.getItem('kinora.prefs.v2') || '{}');
    prefs.demoMode = false;
    localStorage.setItem('kinora.prefs.v2', JSON.stringify(prefs));
  });
  await page.goto('http://localhost:5199/tv-shows', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await saveScreenshot('tv-shows-empty.png');

  await context.close();
}

async function run() {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // Viewport 1: 1920x1080 (Primary standard full-HD desktop)
  await captureViewport(browser, 1920, 1080, '');

  // Viewport 2: 1280x800 (Compact desktop / laptop)
  await captureViewport(browser, 1280, 800, '1280');

  await browser.close();
  console.log('\nAll 10 required visual states captured at both 1920x1080 and 1280x800 successfully!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
