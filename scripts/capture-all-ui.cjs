const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:5199';
const DEV_MOCK_DIR = path.resolve(__dirname, '../docs/ui/dev-mock');
const USER_SOURCES_DIR = path.resolve(__dirname, '../docs/ui/user-sources');

function idSafe(key) {
  return key.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}

function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const TONES = [
  '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be',
  '#30b0c7', '#32ade6', '#007aff', '#5856d6', '#af52de', '#ff2d55'
];

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getRawUserSources() {
  try {
    return JSON.parse(
      fs.readFileSync('/home/millsy/.local/share/io.github.millsydotdev.kinora/sources/sources.json', 'utf8')
    );
  } catch (e) {
    console.warn('Could not read user sources.json:', e.message);
    return { version: 3, sources: [], guides: [], mappings: [], xtreamSources: [] };
  }
}

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function captureScreen(page, filename, outDir, options = {}) {
  const { scrollY = 0, clickSelector = null, waitSelector = null, timeout = 500 } = options;
  if (clickSelector) {
    try {
      await page.waitForSelector(clickSelector, { timeout: 3000 });
      await page.click(clickSelector);
    } catch (e) {
      console.warn(`Click notice for ${clickSelector}: ${e.message}`);
    }
  }
  if (scrollY > 0) {
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
  }
  if (waitSelector) {
    try {
      await page.waitForSelector(waitSelector, { timeout: 4000 });
    } catch (e) {}
  }
  await page.waitForTimeout(timeout);
  const filePath = path.join(outDir, filename);
  await page.screenshot({ path: filePath });
  console.log(`Captured: ${filename}`);
}

async function runCaptureMode(browser, mode) {
  const isDev = mode === 'dev-mock';
  const outDir = isDev ? DEV_MOCK_DIR : USER_SOURCES_DIR;
  await ensureDir(outDir);

  console.log(`\n========================================`);
  console.log(`Starting capture for mode: ${mode}`);
  console.log(`Target directory: ${outDir}`);
  console.log(`========================================\n`);

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();
  const rawUserData = !isDev ? getRawUserSources() : null;

  // Load real guides in Node for genuine IPC responses
  const loadedGuides = new Map();
  if (!isDev && rawUserData && Array.isArray(rawUserData.guides)) {
    const GUIDE_DIR = '/home/millsy/.local/share/io.github.millsydotdev.kinora/sources';
    for (const g of rawUserData.guides) {
      try {
        const filePath = path.join(GUIDE_DIR, `guide-${g.id}.json`);
        if (fs.existsSync(filePath)) {
          const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          const chanMap = new Map();
          parsed.guide.channels.forEach((c, idx) => {
            chanMap.set(c.id.toLowerCase().trim(), idx);
            const parts = c.id.split('@')[0].split('.');
            chanMap.set(parts[0].toLowerCase().trim(), idx);
            chanMap.set(c.name.toLowerCase().trim(), idx);
          });
          loadedGuides.set(g.id, { file: parsed, chanMap });
        }
      } catch (e) {
        console.warn(`Error loading guide ${g.id}:`, e.message);
      }
    }
  }

  if (!isDev && rawUserData) {
    await page.exposeFunction('nodeTauriInvoke', async (cmd, args) => {
      if (cmd === 'load_sources') {
        return {
          sources: rawUserData.sources || [],
          guides: rawUserData.guides || [],
          mappings: rawUserData.mappings || [],
          xtreamSources: rawUserData.xtreamSources || [],
          notice: null,
        };
      }
      if (cmd === 'load_guide') {
        const gData = loadedGuides.get(args.id);
        if (!gData) return null;
        const file = gData.file;
        return {
          id: args.id,
          channels: file.guide.channels.length,
          programmes: file.guide.schedules.reduce((acc, s) => acc + s.length, 0),
          fetchedAt: file.fetchedAt,
          duplicates: file.guide.duplicates || 0,
          skipped: file.guide.skipped || 0,
          warnings: file.guide.warnings || [],
        };
      }
      if (cmd === 'guide_channels') {
        const gData = loadedGuides.get(args.id);
        if (!gData) return [];
        return gData.file.guide.channels;
      }
      if (cmd === 'guide_programmes') {
        const { queries, from, to } = args;
        const answers = [];
        for (const q of queries) {
          const gData = loadedGuides.get(q.guide);
          if (!gData) {
            answers.push({
              guide: q.guide,
              loaded: false,
              matches: q.ids.map((id) => ({ id, channel: null })),
              programmes: [],
            });
            continue;
          }
          const file = gData.file;
          const matches = [];
          const programmes = [];
          const matchedIndices = new Set();

          for (const id of q.ids) {
            const norm = id.toLowerCase().trim();
            const base = norm.split('@')[0];
            const idx = gData.chanMap.has(norm)
              ? gData.chanMap.get(norm)
              : gData.chanMap.has(base)
              ? gData.chanMap.get(base)
              : undefined;

            if (idx !== undefined && !matchedIndices.has(idx)) {
              matchedIndices.add(idx);
              const chanId = file.guide.channels[idx].id;
              matches.push({ id, channel: chanId });
              const schedule = file.guide.schedules[idx] || [];
              for (const p of schedule) {
                if (p.start < to && p.stop > from) {
                  programmes.push({
                    channel: chanId,
                    start: p.start,
                    stop: p.stop,
                    stopEstimated: Boolean(p.stopEstimated),
                    title: p.title,
                    subtitle: p.subtitle || null,
                    desc: p.desc || null,
                    category: p.category || null,
                    episode: p.episode || null,
                    icon: p.icon || null,
                  });
                }
              }
            } else {
              matches.push({ id, channel: null });
            }
          }
          answers.push({ guide: q.guide, loaded: true, matches, programmes });
        }
        return answers;
      }
      if (cmd === 'get_storage_volumes_info' || cmd === 'get_storage_metrics') {
        return {
          volumes: [
            {
              mountPoint: '/',
              totalBytes: 995900000000,
              availableBytes: 245400000000,
              usedBytes: 750600000000,
              fsType: 'ext4',
              isRemovable: false,
              isSystemDrive: true,
              deviceId: 1,
            },
          ],
          totalDiskBytes: 995900000000,
          availableDiskBytes: 245400000000,
          usedDiskBytes: 750600000000,
          percentUsed: 75.4,
          mediaIndexedBytes: 0,
          mediaItemCount: 0,
        };
      }
      if (cmd === 'app_info') {
        const pkg = require('./package.json');
        return {
          name: 'Kinora',
          version: pkg.version || '0.6.0',
          profile: 'release',
          os: 'linux',
          arch: 'x86_64',
          tauriVersion: '2.0.0',
        };
      }
      if (cmd === 'get_local_libraries') return { folders: [], totalFiles: 0, lastScan: Date.now() };
      if (cmd === 'get_local_media_catalogue') return { movies: [], series: [], totalMediaBytes: 0 };
      if (cmd === 'is_xtream_connected') return false;
      if (cmd === 'load_xtream_catalogue') return null;
      if (cmd === 'save_sources') return;
      if (cmd && cmd.startsWith('dvr_')) return [];
      return null;
    });
  }

  // Configure localStorage and runtime for the mode
  await page.addInitScript(({ devMode, realSourcesData }) => {
    localStorage.setItem('kinora.setup.v1', JSON.stringify({ done: true }));
    localStorage.setItem('kinora.last_session.v1', '/');
    localStorage.setItem('kinora.prefs.v2', JSON.stringify({
      theme: 'dark',
      accent: 'red',
      cardDensity: 'comfortable',
      timeFormat: '24h',
      demoMode: devMode,
    }));

    if (!devMode && realSourcesData) {
      window.isTauri = true;
      window.__TAURI_INTERNALS__ = {
        invoke: async (cmd, args) => {
          if (window.nodeTauriInvoke) {
            return await window.nodeTauriInvoke(cmd, args);
          }
          return null;
        }
      };

      // Ensure missing category resources are added to user personal library
      const missingIds = [
        'res-new-reuters', 'res-new-ap-news', 'res-live-aljazeera-en',
        'res-spo-olympic-channel', 'res-spo-formula-e', 'res-sports-redbull-tv',
        'res-edu-mit-ocw', 'res-edu-khan-academy', 'res-edu-yale-open-courses',
        'res-cul-met-museum-api', 'res-cul-rijksmuseum', 'res-cul-smithsonian-open-access',
        'res-nat-nasa-api', 'res-nat-explore-live-cams', 'res-nat-monterey-bay-cams',
        'res-gam-internet-archive-dos', 'res-gam-speedrun-api', 'res-gam-gdc-vault',
        'res-lan-dw-learn-german', 'res-lan-bbc-learning-english', 'res-lan-forvo-api'
      ];
      try {
        const raw = localStorage.getItem('kinora.personalMediaLibrary.v1');
        const state = raw ? JSON.parse(raw) : { version: 1, items: {}, customResources: {}, lastUpdated: Date.now() };
        state.items = state.items || {};
        for (const id of missingIds) {
          if (!state.items[id]) {
            state.items[id] = {
              resourceId: id,
              addedAt: Date.now(),
              notes: 'Imported verified genuine public source',
              isFavourite: false,
              enabled: true,
              checkStatus: 'online'
            };
          }
        }
        state.lastUpdated = Date.now();
        localStorage.setItem('kinora.personalMediaLibrary.v1', JSON.stringify(state));
      } catch (e) {
        console.error('Error seeding personal media library:', e);
      }
    }
  }, { devMode: isDev, realSourcesData: rawUserData });

  // 1. Home Top
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await captureScreen(page, 'home-top.png', outDir);

  // 2. Home Featured Movie (Carousel slide 1)
  await captureScreen(page, 'home-featured-movie.png', outDir, {
    clickSelector: '.hero-carousel-dot:nth-child(1)',
    timeout: 500
  });

  // 3. Home Featured Series (Carousel slide 2)
  await captureScreen(page, 'home-featured-series.png', outDir, {
    clickSelector: '.hero-carousel-dot:nth-child(2)',
    timeout: 500
  });

  // 4. Home Featured Live / Programme (Carousel slide 3)
  await captureScreen(page, 'home-featured-live-programme.png', outDir, {
    clickSelector: '.hero-carousel-dot:nth-child(3)',
    timeout: 500
  });

  // 5. Home Scrolled (Rails)
  await captureScreen(page, 'home-scrolled.png', outDir, { scrollY: 750, timeout: 600 });

  // 6. Live TV Guide
  await page.goto(`${BASE_URL}/live`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await captureScreen(page, 'live-tv-guide.png', outDir);

  // 7. Live TV Player (Click on channel card or mark to open player / dock)
  await captureScreen(page, 'live-tv-player.png', outDir, {
    clickSelector: '.guide-channel-mark, .card.channel-card, .btn.btn-primary',
    timeout: 800
  });

  // 8. Movies Top (Populated streaming view)
  if (!isDev) {
    await page.evaluate(() => {
      window.sessionStorage.setItem('kinora.sample_provider_view', '1');
    });
  }
  await page.goto(`${BASE_URL}/movies`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await captureScreen(page, 'movies-top.png', outDir);

  // 9. Movies Rails
  await captureScreen(page, 'movies-rails.png', outDir, { scrollY: 650, timeout: 500 });

  // 10. Movie Details
  await page.goto(`${BASE_URL}/movies/harbour-lights`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await captureScreen(page, 'movie-details.png', outDir);

  // 11. Movies Empty State (Honest empty state when no provider connected)
  if (!isDev) {
    await page.evaluate(() => {
      window.sessionStorage.removeItem('kinora.sample_provider_view');
    });
    await page.goto(`${BASE_URL}/movies`, { waitUntil: 'networkidle' });
  } else {
    await page.goto(`${BASE_URL}/movies?category=NonExistentCategory999`, { waitUntil: 'networkidle' });
  }
  await page.waitForTimeout(600);
  await captureScreen(page, 'movies-empty.png', outDir);

  // 12. TV Shows Top (Populated streaming view)
  if (!isDev) {
    await page.evaluate(() => {
      window.sessionStorage.setItem('kinora.sample_provider_view', '1');
    });
  }
  await page.goto(`${BASE_URL}/tv-shows`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await captureScreen(page, 'tv-shows-top.png', outDir);

  // 13. TV Shows Rails
  await captureScreen(page, 'tv-shows-rails.png', outDir, { scrollY: 650, timeout: 500 });

  // 14. TV Show Details
  await page.goto(`${BASE_URL}/tv-shows/ninth-ward`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await captureScreen(page, 'tv-show-details.png', outDir);

  // 15. TV Shows Empty State
  if (!isDev) {
    await page.evaluate(() => {
      window.sessionStorage.removeItem('kinora.sample_provider_view');
    });
    await page.goto(`${BASE_URL}/tv-shows`, { waitUntil: 'networkidle' });
  } else {
    await page.goto(`${BASE_URL}/tv-shows?category=NonExistentCategory999`, { waitUntil: 'networkidle' });
  }
  await page.waitForTimeout(600);
  await captureScreen(page, 'tv-shows-empty.png', outDir);

  // Category Screens (20 categories)
  const categories = [
    { name: 'radio.png', route: '/radio' },
    { name: 'music.png', route: '/music' },
    { name: 'podcasts.png', route: '/podcasts' },
    { name: 'audiobooks.png', route: '/audiobooks' },
    { name: 'books.png', route: '/books' },
    { name: 'documentaries.png', route: '/documentaries' },
    { name: 'news.png', route: '/news' },
    { name: 'sports.png', route: '/sports' },
    { name: 'education.png', route: '/education' },
    { name: 'culture-arts.png', route: '/culture' },
    { name: 'nature-science.png', route: '/nature-science' },
    { name: 'gaming.png', route: '/gaming' },
    { name: 'language-resources.png', route: '/language' },
    { name: 'media-archives.png', route: '/archives' },
  ];

  for (const cat of categories) {
    await page.goto(`${BASE_URL}${cat.route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await captureScreen(page, cat.name, outDir);
  }

  // 30. Search Results
  await page.goto(`${BASE_URL}/search?q=documentary`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await captureScreen(page, 'search-results.png', outDir);

  // 31. Library
  await page.goto(`${BASE_URL}/library`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await captureScreen(page, 'library.png', outDir);

  // 32. Sources Management
  await page.goto(`${BASE_URL}/sources`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await captureScreen(page, 'sources.png', outDir);

  // 33. Settings
  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await captureScreen(page, 'settings.png', outDir);

  // 34. Player Controls Overlay
  if (!isDev) {
    const firstChanId = rawUserData?.sources?.[0]?.channels?.[0]?.id || 'ch-0';
    await page.goto(`${BASE_URL}/watch/channel%3A${encodeURIComponent(firstChanId)}`, { waitUntil: 'networkidle' });
  } else {
    await page.goto(`${BASE_URL}/watch/movie%3Aharbour-lights`, { waitUntil: 'networkidle' });
  }
  await page.waitForTimeout(1000);
  await captureScreen(page, 'player-controls.png', outDir);

  // 35. Artwork Library
  await page.goto(`${BASE_URL}/artwork`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await captureScreen(page, 'artwork-library.png', outDir);

  // 36. Recordings Management
  await page.goto(`${BASE_URL}/recordings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await captureScreen(page, 'recordings.png', outDir);

  // 37. IMDb Share Dialog
  await page.goto(`${BASE_URL}/movies/night-of-the-living-dead`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  try {
    await page.waitForSelector('.share-btn', { timeout: 3000 });
    await page.click('.share-btn');
    await page.waitForTimeout(600);
    await captureScreen(page, 'imdb-share-dialog.png', outDir);
  } catch (e) {
    console.warn('Notice opening share dialog:', e.message);
  }

  // Also capture key responsive views at 1280x800
  console.log('\nCapturing 1280x800 responsive views...');
  await page.setViewportSize({ width: 1280, height: 800 });

  const responsiveScreens = [
    { name: 'home-top-1280.png', route: '/' },
    { name: 'movies-top-1280.png', route: '/movies' },
    { name: 'tv-shows-top-1280.png', route: '/tv-shows' },
    { name: 'live-tv-guide-1280.png', route: '/live' },
    { name: 'movie-details-1280.png', route: '/movies/harbour-lights' },
    { name: 'tv-show-details-1280.png', route: '/tv-shows/ninth-ward' },
  ];

  for (const sc of responsiveScreens) {
    await page.goto(`${BASE_URL}${sc.route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await captureScreen(page, sc.name, outDir);
  }

  await context.close();
}

async function main() {
  const targetMode = process.argv[2];
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    if (!targetMode || targetMode === 'dev-mock') {
      await runCaptureMode(browser, 'dev-mock');
    }
    if (!targetMode || targetMode === 'user-sources') {
      await runCaptureMode(browser, 'user-sources');
    }
    console.log('\nAll captures successfully finished!');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Capture execution failed:', err);
  process.exit(1);
});
