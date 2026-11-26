// scripts/measure-native-scroll-frames.mjs
// Measures real-world scroll frame times and FPS in native WebKitGTK with 10,000 channels.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const W = 'http://127.0.0.1:4444';
const DEV_URL = 'http://localhost:5199';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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

function generateSavedSources(count) {
  const groups = ['Entertainment', 'Sports', 'News', 'Movies', 'Documentary', 'Kids', 'Music'];
  const channels = [];
  for (let i = 0; i < count; i++) {
    channels.push({
      key: `synth-ch-${i}`,
      tvgId: `synth-tvg-${i}`,
      name: `Synthetic Channel ${i + 1}`,
      group: groups[i % groups.length],
      chno: i + 1,
    });
  }
  return {
    version: 3,
    sources: [
      {
        id: `pl-synth-${count}`,
        name: `Synthetic Scale ${count}`,
        origin: 'file',
        url: null,
        label: `synth-${count}.m3u`,
        addedAt: Date.now(),
        lastSuccess: Date.now(),
        skipped: 0,
        duplicates: 0,
        channels,
      },
    ],
    guides: [],
    mappings: [],
    xtreamSources: [],
  };
}

async function run() {
  const repoRoot = path.resolve(import.meta.dirname, '..');
  const binaryPath = path.resolve(repoRoot, 'src-tauri/target/debug/kinora');

  const smokeDir = '/tmp/kinora-native-scroll-test';
  if (fs.existsSync(smokeDir)) {
    fs.rmSync(smokeDir, { recursive: true, force: true });
  }
  const sourcesDir = `${smokeDir}/data/io.github.millsydotdev.kinora/sources`;
  fs.mkdirSync(sourcesDir, { recursive: true });
  fs.mkdirSync(`${smokeDir}/cache`, { recursive: true });
  fs.mkdirSync(`${smokeDir}/config`, { recursive: true });

  // Pre-seed with 10,000 channels
  fs.writeFileSync(`${sourcesDir}/sources.json`, JSON.stringify(generateSavedSources(10000), null, 2));

  console.log('Starting tauri-driver on port 4444...');
  const driver = spawn('tauri-driver', ['--port', '4444'], {
    env: {
      ...process.env,
      WAYLAND_DISPLAY: 'wayland-0',
      DISPLAY: ':0',
      XDG_DATA_HOME: `${smokeDir}/data`,
      XDG_CACHE_HOME: `${smokeDir}/cache`,
      XDG_CONFIG_HOME: `${smokeDir}/config`,
    },
    stdio: 'pipe',
  });

  await wait(2000);

  let session = null;
  try {
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
    const jsAsync = (script, ...args) => wd('POST', `${S}/execute/async`, { script, args });
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

    await wd('POST', `${S}/window/rect`, { width: 1440, height: 900 }).catch(() => {});
    await wait(2500);

    const nav = (p) => js(`history.pushState({}, '', arguments[0]); window.dispatchEvent(new PopStateEvent('popstate'))`, p);
    const go = async (p) => { await nav(p); await wait(1500); };

    await until(`location.href !== 'about:blank' && (document.querySelector('.sidebar') || document.querySelector('.setup'))`, 25000);

    // Bypass setup if present
    const isSetup = await js(`return Boolean(document.querySelector('.setup'))`);
    if (isSetup) {
      await js(`
        const btn = [...document.querySelectorAll('.setup-actions button')].find(b => b.textContent.includes('sample data') || b.textContent.includes('Look around'));
        if (btn) btn.click();
      `);
      await wait(1500);
    }

    // Ingest the 10,000 channels payload
    const sourcePayload = generateSavedSources(10000);
    await js(`
      if (window.__kinora_native?.saveSources) {
        window.__kinora_native.saveSources(arguments[0]);
      }
    `, sourcePayload);
    await wait(600);

    // Navigate to /live
    await go('/live');
    await until(`Boolean(document.querySelector('.guide-scroll'))`, 15000);
    await wait(1000);

    const totalChannels = await js(`return window.__kinora_store?.channels?.length ?? 0`);
    console.log(`Loaded ${totalChannels} channels in native WebKitGTK.`);

    console.log('Measuring vertical scroll frame budget over 2000ms...');
    const result = await jsAsync(`
      const done = arguments[arguments.length - 1];
      const el = document.querySelector('.guide-scroll');
      if (!el) {
        done({ error: 'no scroller found' });
        return;
      }
      const times = [];
      let last = performance.now();
      const t0 = last;
      const step = () => {
        const now = performance.now();
        times.push(now - last);
        last = now;
        el.scrollBy(0, 16);
        if (now - t0 < 2000) {
          requestAnimationFrame(step);
        } else {
          times.sort((a, b) => a - b);
          const median = Math.round(times[times.length >> 1] * 10) / 10;
          const p95 = Math.round(times[Math.floor(times.length * 0.95)] * 10) / 10;
          const max = Math.round(times[times.length - 1] * 10) / 10;
          const fps = Math.round(times.length / 2);
          done({ frames: times.length, median, p95, max, fps });
        }
      };
      requestAnimationFrame(step);
    `);

    console.log('Scroll frame measurement results:');
    console.log(JSON.stringify(result, null, 2));

  } finally {
    if (session) {
      await wd('DELETE', `/session/${session.sessionId}`).catch(() => {});
    }
    driver.kill('SIGTERM');
    if (fs.existsSync(smokeDir)) {
      fs.rmSync(smokeDir, { recursive: true, force: true });
    }
  }
}

run().catch((err) => {
  console.error('Error during scroll frame measurement:', err);
  process.exit(1);
});
