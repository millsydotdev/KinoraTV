// scripts/capture-sidebar-color-audit.cjs
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '../docs/ui/sidebar-color-audit');
fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  // 1. Live TV view
  await page.goto('http://localhost:5199/live');
  await page.waitForTimeout(800);
  const sidebar = page.locator('aside.sidebar');
  if (await sidebar.isVisible()) {
    await sidebar.screenshot({ path: path.join(OUT_DIR, 'sidebar-livetv.png') });
  }

  // 2. Discover view
  await page.goto('http://localhost:5199/discover');
  await page.waitForTimeout(800);
  if (await sidebar.isVisible()) {
    await sidebar.screenshot({ path: path.join(OUT_DIR, 'sidebar-discover.png') });
  }

  // 3. Full window screenshot
  await page.screenshot({ path: path.join(OUT_DIR, 'discover-window.png') });

  await browser.close();
  console.log('Sidebar color audit screenshots captured.');
})();
