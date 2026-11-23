// scripts/verify-real-sources.mjs
// Native real-source verification and screenshot capture for Kinora 0.6.0.
// Drives the actual native Tauri application on the user's real environment.
// Strictly adheres to zero em-dash typography standard.

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const W = 'http://127.0.0.1:4444';
const DEV_URL = 'http://localhost:5199';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const repoRoot = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.resolve(repoRoot, 'docs/ui/real-source-verification/corrected');
const binaryPath = path.resolve(repoRoot, 'src-tauri/target/debug/kinora');

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function wd(method, endpoint, body) {
  const res = await fetch(W + endpoint, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (data.value && data.value.error) {
    throw new Error(`${method} ${endpoint}: ${data.value.error} ${data.value.message}`);
  }
  return data.value;
}

async function isDevServerUp() {
  try {
    const res = await fetch(DEV_URL, { signal: AbortSignal.timeout(1000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function run() {
  await ensureDir(OUT_DIR);

  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Binary not found at ${binaryPath}`);
  }

  // Ensure dev server is running on port 5199 for dev binary
  let viteProcess = null;
  const devUp = await isDevServerUp();
  if (!devUp) {
    console.log('Starting Vite dev server on port 5199...');
    viteProcess = spawn('npm', ['run', 'dev'], {
      cwd: repoRoot,
      stdio: 'pipe',
      detached: false,
    });
    const startDeadline = Date.now() + 20000;
    let up = false;
    while (Date.now() < startDeadline) {
      await wait(500);
      if (await isDevServerUp()) {
        up = true;
        break;
      }
    }
    if (!up) throw new Error('Vite dev server failed to start within 20s');
    console.log('Vite dev server is ready at', DEV_URL);
  } else {
    console.log('Vite dev server is already running at', DEV_URL);
  }

  console.log('Starting tauri-driver on port 4444 with real user environment...');
  const userEnv = {
    ...process.env,
    DISPLAY: process.env.DISPLAY || ':0',
    WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || 'wayland-0',
    HOME: '/home/millsy',
    XDG_DATA_HOME: '/home/millsy/.local/share',
    XDG_CONFIG_HOME: '/home/millsy/.config',
    XDG_CACHE_HOME: '/home/millsy/.cache',
  };

  const driver = spawn('/home/millsy/.cargo/bin/tauri-driver', ['--port', '4444'], {
    env: userEnv,
    stdio: 'pipe',
  });

  await wait(2500);

  let session = null;
  const auditLog = [];

  try {
    console.log('Connecting to session with application:', binaryPath);
    session = await wd('POST', '/session', {
      capabilities: {
        alwaysMatch: {
          browserName: 'wry',
          'tauri:options': { application: binaryPath },
        },
      },
    });

    const S = `/session/${session.sessionId}`;
    const js = (script, ...args) => wd('POST', `${S}/execute/sync`, { script, args });

    const until = async (cond, ms = 25000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        try {
          const v = await js(`try { return (${cond}) } catch (e) { return null }`);
          if (v) return v;
        } catch {}
        await wait(250);
      }
      return null;
    };

    const nav = async (p) => {
      const target = JSON.stringify(p);
      const res = await js(`
        const to = ${target};
        try {
          if (window.__kinora_navigate) {
            window.__kinora_navigate(to);
            return { ok: true, via: '__kinora_navigate', href: location.href };
          }
          history.pushState({}, '', to);
          window.dispatchEvent(new PopStateEvent('popstate'));
          return { ok: true, via: 'pushState', href: location.href };
        } catch (e) {
          return { ok: false, err: String(e) };
        }
      `);
      console.log('nav to', p, 'result:', res);
      await wait(2000);
      const after = await js(`return { href: location.href, path: location.pathname, hasSearchPage: Boolean(document.querySelector('.page.search')) }`);
      console.log('after nav to', p, 'state:', after);
    };

    const setWindowRect = async (width, height) => {
      await wd('POST', `${S}/window/rect`, { width, height }).catch(() => {});
      await js(`try { window.resizeTo(arguments[0], arguments[1]); } catch(e){}`, width, height);
      await wait(600);
    };

    const enableTvMode = async () => {
      await js(`
        try {
          if (window.__kinora_store) {
            window.__kinora_store.setPrefs(p => ({
              ...p,
              viewMode: 'tv',
              layoutMode: 'tv',
              remoteMode: true,
            }));
          } else {
            const p = JSON.parse(localStorage.getItem('kinora.prefs.v2') || '{}');
            p.viewMode = 'tv';
            p.layoutMode = 'tv';
            p.remoteMode = true;
            localStorage.setItem('kinora.prefs.v2', JSON.stringify(p));
          }
          document.documentElement.dataset.mode = 'tv';
          document.documentElement.dataset.layout = 'tv';
          document.body.classList.add('tv-mode');
          window.dispatchEvent(new CustomEvent('kinora:prefs-changed'));
        } catch(e) {}
      `);
      await wait(2000);
    };

    const disableTvMode = async () => {
      await js(`
        try {
          if (window.__kinora_store) {
            window.__kinora_store.setPrefs(p => ({
              ...p,
              viewMode: 'desktop',
              layoutMode: 'standard',
              remoteMode: false,
            }));
          } else {
            const p = JSON.parse(localStorage.getItem('kinora.prefs.v2') || '{}');
            p.viewMode = 'desktop';
            p.layoutMode = 'standard';
            p.remoteMode = false;
            localStorage.setItem('kinora.prefs.v2', JSON.stringify(p));
          }
          document.documentElement.dataset.mode = 'desktop';
          document.documentElement.dataset.layout = 'standard';
          document.body.classList.remove('tv-mode');
          window.dispatchEvent(new CustomEvent('kinora:prefs-changed'));
        } catch(e) {}
      `);
      await wait(1500);
    };

    const waitForImages = async (timeoutMs = 12000) => {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        const pending = await js(`
          const imgs = Array.from(document.querySelectorAll('img'));
          return imgs.filter(i => !i.complete).length;
        `);
        if (pending === 0) break;
        await wait(300);
      }
    };

    const auditImages = async (label) => {
      const stats = await js(`
        const imgs = Array.from(document.querySelectorAll('img'));
        const loaded = imgs.filter(i => i.complete && i.naturalWidth > 0).length;
        const broken = imgs.filter(i => i.complete && i.naturalWidth === 0).map(i => i.src);
        const pending = imgs.filter(i => !i.complete).length;
        return { total: imgs.length, loaded, broken, pending };
      `);
      console.log(`[${label}] images: ${stats.loaded}/${stats.total} loaded, ${stats.broken.length} broken, ${stats.pending} pending`);
      if (stats.broken.length > 0) {
        console.log(`  broken URLs:`, stats.broken.slice(0, 5));
      }
      auditLog.push({ label, stats });
      return stats;
    };

    const captureShot = async (filename, label) => {
      // Allow images and network to settle
      await wait(1000);
      const stats = await auditImages(label);
      const b64 = await wd('GET', `${S}/screenshot`);
      const outPath = path.join(OUT_DIR, filename);
      fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
      const size = fs.statSync(outPath).size;
      console.log(`Saved ${filename} (${size} bytes)`);
      return { filename, size, stats };
    };

    // Set default desktop resolution: 1920x1080
    await setWindowRect(1920, 1080);
    await wait(2000);

    // Verify native environment
    const isTauri = await js(`return Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__)`);
    console.log('Native Tauri execution verified:', isTauri);

    // If setup screen is shown, click skip to enter main app
    const isSetup = await js(`return Boolean(document.querySelector('.setup'))`);
    if (isSetup) {
      console.log('Skipping setup screen to load real sources...');
      await js(`
        const skip = document.querySelector('.setup-head button');
        if (skip) skip.click();
      `);
      await wait(2000);
    }

    // Wait for sources to load into store
    console.log('Waiting for sources and channels to settle...');
    await until(`Boolean(document.querySelector('.sidebar'))`, 20000);
    await wait(3000);

    const sourceStats = await js(`
      return {
        href: location.href,
        pathname: location.pathname,
        hasStore: Boolean(window.__kinoraStore),
        localStorageKeys: Object.keys(localStorage).filter(k => k.startsWith('kinora.')),
      };
    `);
    console.log('Active environment info:', sourceStats);

    // Trigger metadata enrichment to populate TMDB and TVmaze artwork
    console.log('Triggering background artwork enrichment on real catalogue...');
    await js(`
      try {
        if (window.__kinoraArtworkEngine) {
          window.__kinoraArtworkEngine.runEnrichment();
        }
      } catch(e) {}
    `);
    await wait(4000);

    // 1. Home Desktop 1080p
    console.log('Capturing [01-home-real-desktop-1080p.png]...');
    await nav('/');
    await until(`Boolean(document.querySelector('.home-smarttv-wrapper, .home-hero-cinematic'))`, 15000);
    await wait(2000);
    await captureShot('01-home-real-desktop-1080p.png', 'Home Desktop 1080p');

    // 2. Home Continue Watching / Rails Scrolled
    console.log('Capturing [02-home-continue-watching-1080p.png]...');
    await js(`window.scrollTo({ top: 650, behavior: 'instant' });`);
    await wait(1200);
    await captureShot('02-home-continue-watching-1080p.png', 'Home Continue Watching / Rails');

    // Reset scroll
    await js(`window.scrollTo({ top: 0, behavior: 'instant' });`);

    // 3. Movies Browse Screen
    console.log('Capturing [03-movies-browse-real-1080p.png]...');
    await nav('/movies');
    await until(`Boolean(document.querySelector('.streaming-hero, .card-poster, .browse-grid, .movies-screen'))`, 15000);
    await wait(2000);
    await captureShot('03-movies-browse-real-1080p.png', 'Movies Browse 1080p');

    // 4. Series Browse Screen
    console.log('Capturing [04-series-browse-real-1080p.png]...');
    await nav('/series');
    await until(`Boolean(document.querySelector('.streaming-hero, .card-poster, .browse-grid, .series-screen'))`, 15000);
    await wait(2000);
    await captureShot('04-series-browse-real-1080p.png', 'Series Browse 1080p');

    // 5. Real Movie Detail Screen (Night of the Living Dead)
    console.log('Capturing [05-movie-detail-real-1080p.png]...');
    await nav('/movies/night-of-the-living-dead');
    await until(`Boolean(document.querySelector('.detail-hero-backdrop, .movie-detail-hero, h1'))`, 15000);
    // Wait until rich metadata has populated and poster image is fully rendered and loaded
    await until(`Boolean(document.querySelector('.detail-hero-poster-wrap img') && document.querySelector('.detail-hero-poster-wrap img').complete && document.querySelector('.detail-hero-poster-wrap img').naturalWidth > 0)`, 25000);
    await wait(1500);
    await captureShot('05-movie-detail-real-1080p.png', 'Movie Detail 1080p');

    // 6. Real Series Detail Screen (The Beverly Hillbillies)
    console.log('Capturing [06-series-detail-real-1080p.png]...');
    await nav('/series/beverly-hillbillies');
    await until(`Boolean(document.querySelector('.detail, .detail-hero, h1'))`, 15000);
    await waitForImages(8000);
    await wait(2000);
    await captureShot('06-series-detail-real-1080p.png', 'Series Detail 1080p');

    // 7. Real Seasons and Episode Stills
    console.log('Capturing [07-series-seasons-episodes-real-1080p.png]...');
    await js(`
      const el = document.querySelector('.episodes');
      if (el) {
        const y = el.getBoundingClientRect().top + window.pageYOffset - 72;
        window.scrollTo({ top: y, behavior: 'instant' });
      } else {
        window.scrollTo({ top: 680, behavior: 'instant' });
      }
    `);
    await until(`Boolean(document.querySelector('.episode-still img, .season-poster-thumb img') && (document.querySelector('.episode-still img') || document.querySelector('.season-poster-thumb img')).complete && (document.querySelector('.episode-still img') || document.querySelector('.season-poster-thumb img')).naturalWidth > 0)`, 20000);
    await wait(1500);
    await captureShot('07-series-seasons-episodes-real-1080p.png', 'Series Seasons and Episodes 1080p');

    // 8. Search Results
    console.log('Capturing [08-search-results-real-1080p.png]...');
    await nav('/search?q=living');
    await until(`Boolean(document.querySelector('.search-input, .results-films, .card.result'))`, 15000);
    await js(`
      const input = document.querySelector('.search-input');
      if (input) {
        input.value = 'living';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.blur();
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }
      document.body.click();
    `);
    await until(`!document.querySelector('.search-autocomplete-dropdown')`, 5000);
    await waitForImages(8000);
    await wait(2000);
    await captureShot('08-search-results-real-1080p.png', 'Search Results 1080p');

    // 9. Library Screen
    console.log('Capturing [09-library-real-1080p.png]...');
    await nav('/library');
    await until(`Boolean(document.querySelector('.library-screen, .library-content, h1'))`, 15000);
    await wait(2000);
    await captureShot('09-library-real-1080p.png', 'Library 1080p');

    // 10. Live TV Guide with real channels & EPG
    console.log('Capturing [10-livetv-guide-real-1080p.png]...');
    await nav('/live');
    await until(`Boolean(document.querySelector('.live-schedule, .live-row, .guide-channel-row, .tvguide-compact-bar, .tabs'))`, 15000);
    await wait(3000);
    await captureShot('10-livetv-guide-real-1080p.png', 'Live TV Guide 1080p');

    // 11. Live TV Channel Presentation with Logos
    console.log('Capturing [11-livetv-channel-presentation-real-1080p.png]...');
    await nav('/live?view=channels');
    await until(`Boolean(document.querySelector('.channel-card, .card, .grid'))`, 15000);
    await wait(2500);
    await captureShot('11-livetv-channel-presentation-real-1080p.png', 'Live TV Channel Presentation 1080p');

    // 12. Settings Metadata Providers Section
    console.log('Capturing [12-settings-metadata-providers-real-1080p.png]...');
    await nav('/settings/metadata');
    await until(`Boolean(document.querySelector('.set-group, .settings-page'))`, 15000);
    await wait(2000);
    await captureShot('12-settings-metadata-providers-real-1080p.png', 'Settings Metadata Providers 1080p');

    // 13. TV Mode Home (1920x1080)
    console.log('Capturing [13-home-tv-mode-real-1080p.png]...');
    await enableTvMode();
    await nav('/');
    await until(`Boolean(document.querySelector('.home-smarttv-wrapper, .home-hero-cinematic'))`, 15000);
    await wait(2000);
    await captureShot('13-home-tv-mode-real-1080p.png', 'TV Mode Home 1080p');

    // 14. TV Mode Movies (1920x1080)
    console.log('Capturing [14-movies-tv-mode-real-1080p.png]...');
    await nav('/movies');
    await until(`Boolean(document.querySelector('.streaming-hero, .card-poster, .browse-grid, .movies-screen'))`, 15000);
    await wait(2000);
    await captureShot('14-movies-tv-mode-real-1080p.png', 'TV Mode Movies 1080p');
    await disableTvMode();

    // 15. Desktop 1440x900 Home
    console.log('Capturing [15-home-desktop-1440x900.png]...');
    await setWindowRect(1440, 900);
    await nav('/');
    await until(`Boolean(document.querySelector('.home-smarttv-wrapper, .home-hero-cinematic'))`, 15000);
    await wait(2000);
    await captureShot('15-home-desktop-1440x900.png', 'Home Desktop 1440x900');

    // 16. TV Mode 4K (3840x2160)
    console.log('Capturing [16-home-tv-mode-4k.png]...');
    await setWindowRect(3840, 2160);
    await enableTvMode();
    await nav('/');
    await until(`Boolean(document.querySelector('.home-smarttv-wrapper, .home-hero-cinematic'))`, 15000);
    await wait(2500);
    await captureShot('16-home-tv-mode-4k.png', 'Home TV Mode 4K');
    await disableTvMode();
    await setWindowRect(1920, 1080);

    // 17. Home Scrolled Middle (Deep rails)
    console.log('Capturing [17-home-scrolled-middle-1080p.png]...');
    await nav('/');
    await until(`Boolean(document.querySelector('.home-smarttv-wrapper, .home-hero-cinematic'))`, 15000);
    await js(`window.scrollTo({ top: 1200, behavior: 'instant' });`);
    await waitForImages(8000);
    await wait(2000);
    await captureShot('17-home-scrolled-middle-1080p.png', 'Home Scrolled Middle 1080p');

    // 18. Home Scrolled Bottom (Cultural vault & curated archives)
    console.log('Capturing [18-home-scrolled-bottom-1080p.png]...');
    await js(`window.scrollTo({ top: 2400, behavior: 'instant' });`);
    await waitForImages(8000);
    await wait(2000);
    await captureShot('18-home-scrolled-bottom-1080p.png', 'Home Scrolled Bottom 1080p');
    await js(`window.scrollTo({ top: 0, behavior: 'instant' });`);

    // 19. Local Media Tab in Library
    console.log('Capturing [19-library-local-media-1080p.png]...');
    await nav('/library?tab=local');
    await until(`Boolean(document.querySelector('.local-media-tab, .library, h1'))`, 15000);
    await wait(2000);
    await captureShot('19-library-local-media-1080p.png', 'Library Local Media 1080p');

    // 20. Internet Radio Screen
    console.log('Capturing [20-audio-radio-browse-1080p.png]...');
    await nav('/radio');
    await until(`Boolean(document.querySelector('.radio-hero, .category-page, .media-category-screen, h1'))`, 15000);
    await wait(2000);
    await captureShot('20-audio-radio-browse-1080p.png', 'Radio Browse 1080p');

    // 21. Podcasts Screen
    console.log('Capturing [21-podcasts-browse-1080p.png]...');
    await nav('/podcasts');
    await until(`Boolean(document.querySelector('.category-page, .media-category-screen, h1'))`, 15000);
    await wait(2000);
    await captureShot('21-podcasts-browse-1080p.png', 'Podcasts Browse 1080p');

    console.log('\n=== REAL-SOURCE VERIFICATION SUMMARY ===');
    console.log(`Captured ${auditLog.length} screenshots using real sources and media.`);
    const totalBroken = auditLog.reduce((acc, a) => acc + a.stats.broken.length, 0);
    console.log(`Total broken images across all views: ${totalBroken}`);
    if (totalBroken > 0) {
      console.warn('WARNING: Broken images detected in audit.');
    } else {
      console.log('CONFIRMED: Zero broken images across all real views.');
    }

    await wd('DELETE', S);
  } finally {
    driver.kill();
    if (viteProcess) viteProcess.kill();
  }
}

run().catch((err) => {
  console.error('Real source verification failed:', err);
  process.exit(1);
});
