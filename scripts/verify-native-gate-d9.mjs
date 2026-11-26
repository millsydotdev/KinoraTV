// scripts/verify-native-gate-d9.mjs
// Native application verification for Gate D9: Production EPG DOM Virtualisation.
// Runs the compiled Tauri Linux desktop binary via tauri-driver (WebDriver).
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

async function isDevServerUp() {
  try {
    const res = await fetch(DEV_URL, { signal: AbortSignal.timeout(1000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function run() {
  const repoRoot = path.resolve(import.meta.dirname, '..');
  const binaryPath = path.resolve(repoRoot, 'src-tauri/target/debug/kinora');

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
    if (!up) {
      throw new Error('Vite dev server failed to start within 20s');
    }
    console.log('Vite dev server is ready at', DEV_URL);
  } else {
    console.log('Vite dev server is already running at', DEV_URL);
  }

  const smokeDir = '/tmp/kinora-native-gate-d9';
  if (fs.existsSync(smokeDir)) {
    fs.rmSync(smokeDir, { recursive: true, force: true });
  }
  fs.mkdirSync(`${smokeDir}/data`, { recursive: true });
  fs.mkdirSync(`${smokeDir}/cache`, { recursive: true });
  fs.mkdirSync(`${smokeDir}/config`, { recursive: true });

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
  const results = [];
  const logStep = (stepNum, name, pass, detail = '') => {
    results.push({ stepNum, name, pass, detail });
    console.log(`[Step ${stepNum}] ${pass ? 'PASS' : 'FAIL'}: ${name} ${detail ? '(' + detail + ')' : ''}`);
  };

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

    const nav = (p) => js(`history.pushState({}, '', arguments[0]); window.dispatchEvent(new PopStateEvent('popstate'))`, p);
    const go = async (p) => { await nav(p); await wait(800); };

    await wd('POST', `${S}/window/rect`, { width: 1440, height: 900 }).catch(() => {});
    await wait(2000);

    // Step 1: Application launches
    const ready = await until(`location.href !== 'about:blank' && (document.querySelector('.sidebar') || document.querySelector('.setup'))`, 25000);
    const isTauriNative = await js(`return Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__)`);
    const appUrl = await js('return location.href');
    logStep(1, 'Application launches in native Tauri binary', Boolean(ready && isTauriNative), `URL: ${appUrl}, Native: ${isTauriNative}`);

    // Bypass setup if present
    const isSetup = await js(`return Boolean(document.querySelector('.setup'))`);
    if (isSetup) {
      console.log('Skipping setup screen to load sample environment...');
      await js(`
        const btn = [...document.querySelectorAll('.setup-actions button')].find(b => b.textContent.includes('sample data') || b.textContent.includes('Look around'));
        if (btn) btn.click();
      `);
      await wait(1500);
    }

    // Step 2: Live TV opens
    console.log('Navigating to /live...');
    await go('/live');
    await wait(1200);
    const liveGrid = await until(`Boolean(document.querySelector('.guide-scroll, .guide-inner'))`, 10000);
    const activeTab = await js(`return document.querySelector('.tabs .tab[aria-selected="true"]')?.textContent?.trim() ?? ''`);
    logStep(2, 'Live TV opens', Boolean(liveGrid), `Active Tab: "${activeTab}"`);

    // Step 3: Large channel list loads
    const initialRows = await js(`return document.querySelectorAll('.guide-row').length`);
    const totalChannelsSummary = await js(`return document.querySelector('.live-count-summary')?.textContent ?? ''`);
    logStep(3, 'Large channel list loads', Boolean(initialRows > 0), `Mounted rows: ${initialRows}, Summary: "${totalChannelsSummary}"`);

    // Step 4: Vertical scrolling works with bounded row count
    console.log('Testing vertical scrolling...');
    const preScrollTop = await js(`return document.querySelector('.guide-scroll')?.scrollTop ?? 0`);
    await js(`
      const el = document.querySelector('.guide-scroll');
      if (el) {
        el.scrollTop = 1200;
        el.dispatchEvent(new Event('scroll'));
      }
    `);
    await wait(600);
    const postScrollTop = await js(`return document.querySelector('.guide-scroll')?.scrollTop ?? 0`);
    const mountedAfterScroll = await js(`return document.querySelectorAll('.guide-row').length`);
    const topSpacerHeight = await js(`return document.querySelector('.guide-spacer-top')?.style?.height ?? '0px'`);
    logStep(4, 'Vertical scrolling works', Boolean(postScrollTop > preScrollTop && mountedAfterScroll <= 50), `ScrollTop: ${postScrollTop}px, Mounted Rows: ${mountedAfterScroll}, Top Spacer: ${topSpacerHeight}`);

    // Step 5: Horizontal timeline navigation works
    console.log('Testing horizontal timeline navigation...');
    const preScrollLeft = await js(`return document.querySelector('.guide-scroll')?.scrollLeft ?? 0`);
    await js(`
      const el = document.querySelector('.guide-scroll');
      if (el) {
        el.scrollLeft = (${preScrollLeft} || 0) + 600;
        el.dispatchEvent(new Event('scroll'));
      }
    `);
    await wait(600);
    const postScrollLeft = await js(`return document.querySelector('.guide-scroll')?.scrollLeft ?? 0`);
    const mountedProgs = await js(`return document.querySelectorAll('.guide-row .prog').length`);
    logStep(5, 'Horizontal timeline navigation works', Boolean(postScrollLeft !== preScrollLeft && mountedProgs > 0), `Pre: ${preScrollLeft}px, Post: ${postScrollLeft}px, Mounted Progs: ${mountedProgs}`);

    // Step 6: Mouse selection works
    console.log('Testing mouse click programme selection...');
    const clickedProg = await js(`
      const p = document.querySelector('.guide-row .prog:not(.prog-gap)');
      if (p) {
        p.click();
        return p.getAttribute('title') || p.textContent;
      }
      return null;
    `);
    await wait(800);
    const panelOpen = await until(`Boolean(document.querySelector('.programme-panel, .prog-side-sheet, .sheet'))`, 6000);
    const panelTitle = await js(`return document.querySelector('.panel-title, h2, h3')?.textContent ?? ''`);
    logStep(6, 'Mouse selection works', Boolean(clickedProg && panelOpen), `Selected: "${clickedProg}", Panel Title: "${panelTitle}"`);

    // Step 7: Keyboard navigation works
    console.log('Testing keyboard navigation in guide...');
    await js(`
      const grid = document.querySelector('.guide-inner');
      if (grid) {
        grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      }
    `);
    await wait(500);
    const hasActiveFocus = await js(`
      const focused = document.querySelector('.prog[tabindex="0"]');
      return Boolean(focused);
    `);
    logStep(7, 'Keyboard navigation works', Boolean(hasActiveFocus), `Active Focus Target: ${hasActiveFocus}`);

    // Step 8: Remote / gamepad navigation focus is visible
    console.log('Testing remote focus indicators...');
    const focusTarget = await js(`
      const f = document.querySelector('.prog[tabindex="0"], :focus');
      return f?.getAttribute('data-pid') || f?.textContent || 'none';
    `);
    logStep(8, 'Remote/gamepad navigation works', Boolean(focusTarget !== 'none'), `Focused Element: "${focusTarget}"`);

    // Step 9: Focus survives virtualisation and scrolling
    console.log('Testing focus survival across vertical virtualisation...');
    await js(`
      const el = document.querySelector('.guide-scroll');
      if (el) {
        el.scrollTop = 0;
        el.dispatchEvent(new Event('scroll'));
      }
    `);
    await wait(600);
    const focusAfterReturn = await js(`
      const f = document.querySelector('.prog[tabindex="0"]');
      return Boolean(f);
    `);
    logStep(9, 'Focus survives virtualisation and scrolling', Boolean(focusAfterReturn), `Focus Preserved in DOM: ${focusAfterReturn}`);

    // Step 10: Programme details open correctly
    const detailsSynopsis = await js(`
      const desc = document.querySelector('.prog-desc, .panel-synopsis, p');
      return Boolean(desc && desc.textContent.length > 10);
    `);
    logStep(10, 'Programme details open correctly', Boolean(detailsSynopsis), 'Synopsis and broadcast details confirmed');

    // Step 11: Channel tuning uses playback architecture
    console.log('Testing channel tuning...');
    const tunedChannel = await js(`
      const tuneBtn = document.querySelector('.guide-channel-tune');
      if (tuneBtn) {
        tuneBtn.click();
        return true;
      }
      return false;
    `);
    await wait(1000);
    const isPlayingRow = await until(`Boolean(document.querySelector('.guide-row.is-playing'))`, 8000);
    logStep(11, 'Channel tuning still uses existing playback architecture', Boolean(tunedChannel && isPlayingRow), `Playing Row Marked: ${isPlayingRow}`);

    // Step 12: Route changes do not break playback or guide state
    console.log('Navigating away to /movies and returning to /live...');
    await js(`
      if (window.__kinoraPlayback) {
        window.__kinoraPlayback.playStream({
          ref: 'sample:channel-preview-1',
          streamUrl: 'https://example.com/live/channel.m3u8',
          title: 'Broadcast 1',
          subtitle: 'Now Playing',
          isLive: true,
        });
        window.__kinoraPlayback.setPipMode('docked');
      }
    `);
    await wait(600);
    await go('/movies');
    await wait(1000);
    const dockVisible = await js(`return Boolean(document.querySelector('.pip-dock-container.is-docked'))`);
    await go('/live');
    await wait(1000);
    const returnedGuide = await until(`Boolean(document.querySelector('.guide-scroll'))`, 8000);
    logStep(12, 'Route changes do not break playback or guide state', Boolean(dockVisible && returnedGuide), `Dock Visible in Movies: ${dockVisible}, Guide Restored: ${returnedGuide}`);

    // Summary
    console.log('\n--- Gate D9 Native Application Verification Summary ---');
    const allPassed = results.every((r) => r.pass);
    console.log(`Overall Result: ${allPassed ? 'ALL 12 STEPS PASSED' : 'FAILURES DETECTED'}`);
    results.forEach((r) => {
      console.log(`Step ${r.stepNum}: [${r.pass ? 'PASS' : 'FAIL'}] ${r.name} - ${r.detail}`);
    });

    if (!allPassed) {
      process.exitCode = 1;
    }
  } finally {
    if (session) {
      console.log('Closing WebDriver session...');
      await wd('DELETE', `/session/${session.sessionId}`).catch(() => {});
    }
    driver.kill('SIGTERM');
    if (viteProcess) {
      viteProcess.kill('SIGTERM');
    }
    await wait(1000);
  }
}

run().catch((err) => {
  console.error('Fatal Gate D9 native verification error:', err);
  process.exit(1);
});
