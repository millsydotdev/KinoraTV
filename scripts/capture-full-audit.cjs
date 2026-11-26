// scripts/capture-full-audit.cjs
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const OUT_DIR = path.resolve(__dirname, '../docs/ui/genre-audit');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function isServerUp() {
  try {
    const res = await fetch('http://localhost:5199/discover');
    return res.ok;
  } catch {
    return false;
  }
}

(async () => {
  let vite = null;
  if (!(await isServerUp())) {
    vite = spawn('npx', ['vite', '--port', '5199'], {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'pipe',
    });
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 400));
      if (await isServerUp()) break;
    }
  }

  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://localhost:5199/discover');
  await page.waitForTimeout(1200);

  // Full page screenshot of all categories
  await page.screenshot({ path: path.join(OUT_DIR, 'discover-all-fullpage.png'), fullPage: true });

  // Each format filter
  const filters = ['Movies', 'TV Series', 'Live TV', 'Audio & Podcasts', 'Books'];
  for (const f of filters) {
    const btn = page.locator('button.streaming-nav-pill', { hasText: f }).first();
    if (await btn.isVisible()) {
      await btn.click();
      await page.waitForTimeout(700);
      const slug = f.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await page.screenshot({ path: path.join(OUT_DIR, `filter-${slug}-fullpage.png`), fullPage: true });
    }
  }

  await browser.close();
  if (vite) {
    vite.kill();
  }
  console.log('Successfully captured fullpage screenshots!');
})();
