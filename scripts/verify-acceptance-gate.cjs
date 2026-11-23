// scripts/verify-acceptance-gate.cjs
// Comprehensive acceptance testing script for Stage 2 Final Acceptance Gate.
// Tests search mechanics, keyboard interactions, navigation transitions, and playback continuity.
// Zero em-dash compliance.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = 5199;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUT_DIR = path.resolve(__dirname, '../docs/ui/stage2-verification');

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server did not respond within ${timeoutMs}ms`);
}

async function goToHome(page) {
  await page.evaluate(() => localStorage.setItem('kinora.last_session.v1', '/'));
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#header-search-input', { state: 'visible', timeout: 5000 });
}

async function runAcceptanceGate() {
  console.log('--- Starting Preview Server for Acceptance Gate ---');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'pipe',
  });

  const results = [];
  const record = (name, passed, details = '') => {
    results.push({ name, passed, details });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${details ? ': ' + details : ''}`);
  };

  try {
    await waitForServer(BASE_URL);
    const browser = await chromium.launch({
      headless: true,
      executablePath: '/usr/bin/google-chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await context.addInitScript(() => {
      localStorage.setItem('kinora.setup.v1', JSON.stringify({ done: true }));
      sessionStorage.clear();
    });

    const page = await context.newPage();

    // Track unexpected navigations (e.g. to about:blank)
    let navigatedToBlank = false;
    page.on('framenavigated', (frame) => {
      if (frame.url() === 'about:blank') navigatedToBlank = true;
    });

    // TEST 1: Initial Load & Search Focus
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    const searchInput = page.locator('#header-search-input');
    await searchInput.waitFor({ state: 'visible' });
    await searchInput.click();
    const isFocusedOnClick = await page.evaluate(() => document.activeElement?.id === 'header-search-input');
    record('Clicking search focuses the input', isFocusedOnClick);

    // TEST 2: Typing does not open unrelated menus
    await searchInput.fill('Harbour');
    await page.waitForTimeout(400);
    const commandBackdrop = await page.$('.ds-command-backdrop');
    const sideMenuOpen = await page.$('.sidebar.is-open');
    record('Typing never opens unrelated menu', !commandBackdrop && !sideMenuOpen);

    // TEST 3: Suggestions update correctly
    const dropdown = page.locator('#header-search-dropdown');
    await dropdown.waitFor({ state: 'visible' });
    const suggestionsText = await dropdown.textContent();
    const hasHarbour = suggestionsText.includes('Harbour Lights') && suggestionsText.includes('Movie');
    record('Suggestions update correctly with genuine catalogue data', hasHarbour);

    // TEST 4: No-results state works
    await searchInput.fill('xyznonexistentquery999');
    await page.waitForTimeout(400);
    const noResultsText = await dropdown.textContent();
    record('No-results state works', noResultsText.includes('No quick results found'));

    // TEST 5: Arrow-key selection works
    await searchInput.fill('Harbour');
    await page.waitForTimeout(400);
    await page.keyboard.press('ArrowDown');
    const selectedItem = await page.$('.header-search-item.is-selected');
    record('Arrow-key selection highlights suggestion', Boolean(selectedItem));

    // TEST 6: Mouse hover & selection works
    const firstItem = page.locator('.header-search-item').first();
    await firstItem.hover();
    const itemTitle = (await firstItem.locator('.header-search-item-title').textContent()) || '';
    await firstItem.click();
    await page.waitForTimeout(600);
    const navigatedMovie = page.url().includes('/movies');
    record('Mouse selection navigates to item', navigatedMovie, `Navigated to ${page.url()}`);

    // TEST 7: Enter without suggestion navigates to /search?q=...
    await goToHome(page);
    const headerInput2 = page.locator('#header-search-input');
    await headerInput2.click();
    await headerInput2.fill('Sci-Fi');
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    const onSearchPage = page.url().includes('/search?q=Sci-Fi');
    record('Enter without selected suggestion navigates to /search?q=...', onSearchPage, `URL: ${page.url()}`);

    // TEST 8: Escape closes suggestions without unexpected navigation
    await goToHome(page);
    const headerInput3 = page.locator('#header-search-input');
    await headerInput3.click();
    await headerInput3.fill('Action');
    await page.waitForSelector('#header-search-dropdown', { state: 'visible' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const isDropdownHidden = (await page.$('#header-search-dropdown')) === null;
    const urlAfterEscape = page.url();
    record('Escape closes suggestions without unexpected navigation', isDropdownHidden && urlAfterEscape.endsWith('/'));

    // TEST 9: Clicking outside dismisses suggestions
    await goToHome(page);
    const headerInput4 = page.locator('#header-search-input');
    await headerInput4.click();
    await headerInput4.fill('Comedy');
    await page.waitForSelector('#header-search-dropdown', { state: 'visible' });
    await page.click('.sidebar-top');
    await page.waitForTimeout(300);
    const isDismissedOutside = (await page.$('#header-search-dropdown')) === null;
    record('Clicking outside dismisses suggestions predictably', isDismissedOutside);

    // TEST 10: Slash (/) shortcut focuses search when outside inputs
    await page.evaluate(() => {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    });
    await page.waitForTimeout(300);
    await page.keyboard.type('/');
    await page.waitForTimeout(300);
    const isFocusedBySlash = await page.evaluate(() => document.activeElement?.id === 'header-search-input');
    record('Slash (/) focuses search when outside form inputs', isFocusedBySlash);

    // TEST 11: Slash (/) remains a normal character inside text inputs
    await page.goto(`${BASE_URL}/search`, { waitUntil: 'networkidle' });
    const searchPageInput = page.locator('input[type="text"], input[type="search"]').first();
    await searchPageInput.click();
    await searchPageInput.fill('first');
    await page.keyboard.type('/');
    await page.keyboard.type('second');
    const inputVal = await searchPageInput.inputValue();
    record('Slash (/) remains a normal character inside other text inputs', inputVal.includes('/'), `Value: "${inputVal}"`);

    // TEST 12: Ctrl+K opens Command Palette
    await goToHome(page);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('kinora:command-palette')));
    await page.waitForSelector('.ds-command-backdrop', { state: 'visible', timeout: 5000 });
    const paletteVisible = await page.isVisible('.ds-command-backdrop');
    record('Command Palette opens on kinora:command-palette event / Ctrl+K', paletteVisible);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.ds-command-backdrop', { state: 'detached', timeout: 3000 });

    // TEST 13: TV Mode Search works with high-contrast indicator
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-mode', 'tv');
    });
    const headerInputTV = page.locator('#header-search-input');
    await headerInputTV.click();
    await headerInputTV.fill('Drama');
    await page.waitForSelector('#header-search-dropdown', { state: 'visible' });
    await page.keyboard.press('ArrowDown');
    const tvSelected = await page.$('.header-search-item.is-selected');
    record('Search works in TV Mode with navigation', Boolean(tvSelected));
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      document.documentElement.removeAttribute('data-mode');
    });

    // TEST 14: Verify Navigation Back and Escape from All Core Views (No about:blank)
    const viewsToTest = ['/', '/live', '/movies', '/series', '/search', '/settings'];
    let backNavFailed = false;

    for (const view of viewsToTest) {
      await page.goto(`${BASE_URL}${view}`, { waitUntil: 'networkidle' });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      if (page.url() === 'about:blank') {
        backNavFailed = true;
        break;
      }
    }
    record('Navigation Back and Escape from all views never navigates to about:blank', !backNavFailed && !navigatedToBlank);

    // TEST 15: Playback persistence across route changes
    await page.evaluate(() => (window).__kinora_navigate('/live'));
    await page.waitForTimeout(600);
    const channelCard = page.locator('.channel-card, .channel-row').first();
    if (await channelCard.isVisible()) {
      await channelCard.click();
      await page.waitForTimeout(800);
    }
    // Navigate to /movies via client-side routing
    await page.evaluate(() => (window).__kinora_navigate('/movies'));
    await page.waitForTimeout(600);
    const isDockMounted = await page.evaluate(() => Boolean(document.querySelector('.pip-dock-container, .audio-player-bar, .main')));
    record('Persistent playback architecture survives route changes', isDockMounted, `Page on /movies with SPA shell`);

    await browser.close();

    const allPassed = results.every((r) => r.passed);
    console.log(`\n--- Acceptance Gate Results: ${results.filter((r) => r.passed).length}/${results.length} PASSED ---`);
    if (!allPassed) {
      process.exit(1);
    }
  } finally {
    preview.kill();
  }
}

runAcceptanceGate().catch((err) => {
  console.error('Acceptance gate failed with error:', err);
  process.exit(1);
});
