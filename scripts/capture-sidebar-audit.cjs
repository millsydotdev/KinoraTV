// scripts/capture-sidebar-audit.cjs
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '../docs/ui/sidebar-audit');
fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5199/');
  await page.waitForTimeout(600);

  // If on setup page, click Look around with sample data
  const sampleBtn = page.locator('button, a', { hasText: 'Look around with sample data' }).first();
  if (await sampleBtn.isVisible()) {
    await sampleBtn.click();
    await page.waitForTimeout(800);
  }

  // Full page on home / sample
  await page.screenshot({ path: path.join(OUT_DIR, 'home-full-window.png') });

  // Navigate to Discover
  await page.goto('http://localhost:5199/discover');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, 'discover-full-window.png') });

  // Capture sidebar element specifically
  const sidebar = page.locator('aside.sidebar');
  if (await sidebar.isVisible()) {
    await sidebar.screenshot({ path: path.join(OUT_DIR, 'sidebar-restored-home.png') });
  }

  await browser.close();
  console.log('Full window screenshots captured successfully.');
})();
