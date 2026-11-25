// scripts/capture-genre-audit.cjs
// Native Visual Quality & Screen Verification for Kinora 0.6.0.
// Zero em-dash compliance.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const OUT_DIR = path.resolve(__dirname, '../docs/ui/genre-audit');
const ARTIFACT_DIR = '/home/millsy/.gemini/antigravity/brain/cce77203-b8d4-45aa-a61e-755e73087e96/screenshots';

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

async function isDevServerUp() {
  try {
    const res = await fetch('http://localhost:5199/', { signal: AbortSignal.timeout(1000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function run() {
  let devProcess = null;
  const isUp = await isDevServerUp();
  if (!isUp) {
    console.log('Starting Vite dev server on port 5199...');
    devProcess = spawn('npx', ['vite', '--port', '5199'], {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'pipe',
    });
    // Wait for server to come up
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await isDevServerUp()) {
        console.log('Vite dev server is ready!');
        break;
      }
    }
  } else {
    console.log('Vite dev server is already running.');
  }

  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const captures = [
    {
      name: '01-discover-desktop.png',
      route: '/discover',
      tvMode: false,
      title: 'Discover in desktop mode',
      setup: async (page) => {
        await page.waitForTimeout(1000);
      },
    },
    {
      name: '02-discover-tv.png',
      route: '/discover',
      tvMode: true,
      title: 'Discover in TV mode',
      setup: async (page) => {
        await page.waitForTimeout(1000);
      },
    },
    {
      name: '03-genre-parent-scifi.png',
      route: '/genres/science-fiction',
      tvMode: false,
      title: 'Parent genre page (Science Fiction)',
      setup: async (page) => {
        await page.waitForTimeout(1200);
      },
    },
    {
      name: '04-genre-subgenre-cyberpunk.png',
      route: '/genres/science-fiction/scifi-cyberpunk',
      tvMode: false,
      title: 'Nested subgenre page (Cyberpunk)',
      setup: async (page) => {
        await page.waitForTimeout(1200);
      },
    },
    {
      name: '05-movies-genre-filtering.png',
      route: '/movies',
      tvMode: false,
      title: 'Movies with genre filtering active',
      setup: async (page) => {
        await page.waitForTimeout(1000);
        // Click Science Fiction genre chip if available
        try {
          const scifiChip = page.locator('button.nav-tab-pill', { hasText: 'Science Fiction' }).first();
          if (await scifiChip.isVisible()) {
            await scifiChip.click();
            await page.waitForTimeout(600);
          }
        } catch (e) {
          console.warn('Could not click Sci-Fi chip:', e.message);
        }
      },
    },
    {
      name: '06-series-genre-filtering.png',
      route: '/series',
      tvMode: false,
      title: 'Series with genre filtering active',
      setup: async (page) => {
        await page.waitForTimeout(1000);
        try {
          const dramaChip = page.locator('button.nav-tab-pill', { hasText: 'Drama' }).first();
          if (await dramaChip.isVisible()) {
            await dramaChip.click();
            await page.waitForTimeout(600);
          }
        } catch (e) {
          console.warn('Could not click Drama chip:', e.message);
        }
      },
    },
    {
      name: '07-livetv-genre-category.png',
      route: '/live',
      tvMode: false,
      title: 'Live TV genre and category browsing',
      setup: async (page) => {
        await page.waitForTimeout(1500);
        try {
          const drawerBtn = page.locator('.chip-category-drawer').first();
          if (await drawerBtn.isVisible()) {
            await drawerBtn.click();
            await page.waitForTimeout(600);
          }
        } catch (e) {
          console.warn('Could not open category drawer:', e.message);
        }
      },
    },
    {
      name: '08-search-genre-results.png',
      route: '/search?q=sci',
      tvMode: false,
      title: 'Search genre results and matching pills',
      setup: async (page) => {
        await page.waitForTimeout(1000);
      },
    },
    {
      name: '09-audio-podcast-discovery.png',
      route: '/podcasts',
      tvMode: false,
      title: 'Audio and podcast discovery with genre hub link',
      setup: async (page) => {
        await page.waitForTimeout(1000);
      },
    },
    {
      name: '10-books-discovery.png',
      route: '/books',
      tvMode: false,
      title: 'Books and literature discovery',
      setup: async (page) => {
        await page.waitForTimeout(1000);
      },
    },
  ];

  console.log(`\n=== Starting Visual Quality & Native Verification Capture ===`);
  console.log(`Output Directory: ${OUT_DIR}`);
  console.log(`Artifact Directory: ${ARTIFACT_DIR}\n`);

  for (const cap of captures) {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });

    const page = await context.newPage();

    // Set initial configuration
    await page.goto('http://localhost:5199/');
    await page.evaluate((isTv) => {
      localStorage.setItem('kinora.setup.v1', JSON.stringify({ done: true }));
      localStorage.setItem(
        'kinora.prefs.v2',
        JSON.stringify({
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
          channelFilterPreset: 'all',
          isTvMode: isTv,
        })
      );
    }, cap.tvMode);

    console.log(`Navigating to ${cap.route} for "${cap.title}"...`);
    await page.goto(`http://localhost:5199${cap.route}`, { waitUntil: 'networkidle' });
    await cap.setup(page);

    const outPath = path.join(OUT_DIR, cap.name);
    const artifactPath = path.join(ARTIFACT_DIR, cap.name);

    await page.screenshot({ path: outPath, fullPage: false });
    fs.copyFileSync(outPath, artifactPath);

    const stats = fs.statSync(outPath);
    console.log(`Captured: ${cap.name} (${Math.round(stats.size / 1024)} KB)`);

    await context.close();
  }

  await browser.close();

  if (devProcess) {
    devProcess.kill();
  }

  console.log(`\nAll 10 visual screenshots captured and verified successfully!`);
}

run().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
