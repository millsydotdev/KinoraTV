// Native end-to-end checks (Gate D8). One app launch per phase; see README.md.
// Usage (via run.sh): node smoke.mjs <binary> <phase> <dev|release>
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
const [, , app, phase, kind] = process.argv
const W = 'http://127.0.0.1:4444'
const STORE = `${process.env.XDG_DATA_HOME}/io.github.millsydotdev.kinora/sources`
const FX = `${process.env.KINORA_SMOKE_DIR ?? '/tmp/kinora-smoke'}/fx`
const results = []
const ok = (name, pass, detail = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'}  [${kind}:${phase}] ${name}${detail ? '  ' + String(detail).slice(0, 220) : ''}`) }
const note = (name, value) => console.log(`NOTE  [${kind}:${phase}] ${name}: ${value}`)
async function wd(method, path, body) {
  const r = await fetch(W + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json(); if (j.value && j.value.error) throw new Error(`${method} ${path}: ${j.value.error} ${j.value.message}`); return j.value
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const s = await wd('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'wry', 'tauri:options': { application: app } } } })
const S = `/session/${s.sessionId}`
const js = (script, ...args) => wd('POST', `${S}/execute/sync`, { script, args })
const jsAsync = (script, ...args) => wd('POST', `${S}/execute/async`, { script, args })
const nav = (p) => js(`history.pushState({}, '', arguments[0]); dispatchEvent(new PopStateEvent('popstate'))`, p)
const go = async (p) => { await nav(p); await wait(700) }
const until = async (cond, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await js(`try { return (${cond}) } catch { return null }`); if (v) return v; await wait(200) } return null }
const clickText = (sel, t) => js(`const el = [...document.querySelectorAll(arguments[0])].find(e => e.textContent.includes(arguments[1])); if (!el) return false; el.click(); return true`, sel, t)
const clickSel = (sel) => js(`const el = document.querySelector(arguments[0]); if (!el) return false; el.click(); return true`, sel)
const setValue = (sel, v) => js(`const i = document.querySelector(arguments[0]); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, arguments[1]); i.dispatchEvent(new Event('input', { bubbles: true })); return true`, sel, v)
const text = () => js('return document.body.innerText')
const pill = (name) => js(`return [...document.querySelectorAll('.source-row')].find(r => r.querySelector('strong')?.textContent.includes(arguments[0]))?.querySelector('.pill')?.textContent ?? ''`, name)
const rss = () => { try {
  const rows = execFileSync('ps', ['-eo', 'pid=,ppid=,comm=,rss=']).toString().trim().split('\n').map((l) => l.trim().split(/\s+/))
  const mine = new Set(rows.filter((r) => r[2] === 'kinora').map((r) => r[0]))
  return rows.filter((r) => mine.has(r[0]) || mine.has(r[1])).map(([, , c, k]) => `${c} ${Math.round(Number(k) / 1024)} MB`).join(', ')
} catch { return 'unavailable' } }
/** Runs `action` in the page and returns ms until `ready` is true (checked every frame), or -1 after 60 s. */
const timed = (action, ready) => jsAsync(`const done = arguments[arguments.length - 1]; const t0 = performance.now();
  (${action})(); const check = () => { let r = false; try { r = (${ready})() } catch {} if (r) done(Math.round(performance.now() - t0)); else if (performance.now() - t0 > 60000) done(-1); else requestAnimationFrame(check) }; requestAnimationFrame(check)`)
/** Scrolls an element for ~2 s and reports frame times. */
const scrollFrames = (sel, dx, dy) => jsAsync(`const done = arguments[arguments.length - 1]; const el = document.querySelector(arguments[0]); const times = []; let last = performance.now(); const t0 = last;
  const step = () => { const now = performance.now(); times.push(now - last); last = now; el.scrollBy(arguments[1], arguments[2]); if (now - t0 < 2000) requestAnimationFrame(step); else { times.sort((a, b) => a - b); done({ frames: times.length, median: Math.round(times[times.length >> 1]), p95: Math.round(times[Math.floor(times.length * 0.95)]), max: Math.round(times[times.length - 1]) }) } }; requestAnimationFrame(step)`, sel, dx, dy)
const fileInput = (name, content, b64 = false) => js(`const data = arguments[2] ? Uint8Array.from(atob(arguments[1]), c => c.charCodeAt(0)) : arguments[1];
  const dt = new DataTransfer(); dt.items.add(new File([data], arguments[0])); const i = document.querySelector('input[type=file]'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); return true`, name, content, b64)
const addUrl = async (url, name, opts = {}) => {
  await go('/sources') // a fresh Add Source page, never one left over from the previous step
  await go('/sources/add')
  if (opts.guide) { await clickText('button', 'XMLTV Guide'); await wait(200) }
  await setValue('input[type=url]', url)
  await clickText('button', 'Scan & Validate')
  const r = await until(`document.querySelector('.validate-status.is-ok')?.textContent || document.querySelector('.field-error')?.textContent`, opts.wait ?? 30000)
  if (r && /read/.test(r) && name) {
    await setValue('.add-form input.input', name)
    await clickText('button', 'Continue'); await wait(300)
    await clickText('.add-actions button', 'Add Source'); await wait(1000)
  }
  return r
}
const watch = async (name) => {
  await go('/live?view=channels')
  const href = await until(`[...document.querySelectorAll('a.channel-card')].find(a => a.textContent.includes(${JSON.stringify(name)}))?.getAttribute('href')`)
  const id = href && new URLSearchParams(href.split('?')[1]).get('channel')
  await go(`/watch/${encodeURIComponent('channel:' + id)}`)
  return id
}
const playing = (ms = 25000, past = 1.5) => until(`(() => { const v = document.querySelector('video.player-video'); return v && !v.paused && v.currentTime > ${past} ? v.currentTime.toFixed(2) : null })()`, ms)
const status = () => js(`return document.querySelector('.player-status')?.textContent ?? ''`)
const noSecrets = async () => {
  const html = await js('return document.documentElement.outerHTML')
  const found = ['PLAYLISTTOKEN', 'STREAMTOKEN', 'KEYTOKEN', 'ICONTOKEN', 'GUIDETOKEN', '127.0.0.1', 'test-streams.mux.dev'].filter((x) => html.includes(x))
  ok('no tokens or upstream addresses in the page', found.length === 0, found.join(','))
}
const S1 = 'http://127.0.0.1:18765'

try {
  await js(`window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI))`)
  await wd('POST', `${S}/window/rect`, { width: 1600, height: 960 }).catch(() => {})
  await wd('POST', `${S}/timeouts`, { script: 120000 }).catch(() => {})
  ok('app starts', !!(await until(`document.querySelector('.sidebar, .setup')`, 20000)))

  if (phase === 'fresh') {
    await go('/live?view=channels')
    ok('first run shows nothing fictional', !(await text()).includes('Northlight One'))
    await go('/settings/appearance'); await clickText('.theme-pick', 'Light'); await wait(300)
    ok('theme set to Light', (await js('return document.documentElement.dataset.theme')) === 'light')
    ok('credentials in an address are refused', /username and password/.test(await addUrl('https://alice:pw@playlists.example/list.m3u')))
    ok('a private address is refused', /local, private or reserved/.test(await addUrl('http://10.1.2.3/list.m3u')))
    ok('a malformed playlist is refused with a reason', /not|M3U|playlist/i.test(await addUrl(`${S1}/bad.m3u`) ?? ''), await js(`return document.querySelector('.field-error')?.textContent`))
    ok('a web page is refused with a reason', /web page|sign/i.test(await addUrl(`${S1}/login.html`) ?? ''), await js(`return document.querySelector('.field-error')?.textContent`))
    ok('a playlist address is read and added', /Playlist read: 6 channels/.test(await addUrl(`${S1}/channels.m3u?token=PLAYLISTTOKEN`, 'Fixture web') ?? ''))
    ok('adding the same address again is refused', /already one of your sources/.test(await addUrl(`${S1}/channels.m3u?token=PLAYLISTTOKEN`) ?? ''))
    await go('/sources/add')
    await fileInput('local.m3u', `#EXTM3U\n#EXTINF:-1 tvg-id="fx.local" group-title="Local",Local File Channel\n${S1}/hls/index.m3u8?token=STREAMTOKEN\n`)
    ok('a local M3U file is read', !!(await until(`document.querySelector('.validate-status.is-ok')`)))
    await setValue('.add-form input.input', 'Local file'); await clickText('button', 'Continue'); await wait(300)
    await clickText('.add-actions button', 'Add Source'); await wait(800)
    await go('/live?view=channels')
    const cards = await js(`return [...document.querySelectorAll('.channel-wordmark')].map(e => e.textContent)`)
    ok('Live TV shows only playlist channels (no demo mixed in)', cards.includes('Fixture HLS') && cards.includes('Local File Channel') && !cards.includes('Northlight One'), cards.join(', '))
    await go('/live')
    await js(`[...document.querySelectorAll('.guide-row')].find(r => r.textContent.includes('Fixture HLS')).querySelector('.fav-btn').click()`); await wait(300)
    ok('favourite set', (await js(`return [...document.querySelectorAll('.guide-row')].find(r => r.textContent.includes('Fixture HLS')).querySelector('.fav-btn').getAttribute('aria-pressed')`)) === 'true')
    await noSecrets()
  }

  if (phase === 'soak') {
    // A published live test stream (Unified Streaming's public demo). KINORA_SOAK_S sets how long.
    const secs = Number(process.env.KINORA_SOAK_S ?? 60)
    await go('/sources/add')
    await fileInput('soak.m3u', '#EXTM3U\n#EXTINF:-1 group-title="Test",Live test stream\nhttps://demo.unified-streaming.com/k8s/live/stable/live.isml/.m3u8\n')
    await until(`document.querySelector('.validate-status.is-ok')`)
    await setValue('.add-form input.input', 'Soak'); await clickText('button', 'Continue'); await wait(300)
    await clickText('.add-actions button', 'Add Source'); await wait(800)
    await watch('Live test stream')
    ok('the live test stream plays', !!(await playing(45000, 2)), await status())
    const v = 'document.querySelector("video.player-video")'
    const start = await js(`return ${v}.currentTime`); const began = Date.now()
    let worst = 0
    for (let at = 0; at < secs; at += 30) {
      await wait(30000)
      const t = await js(`return ${v}.currentTime`)
      const lag = (Date.now() - began) / 1000 - (t - start); worst = Math.max(worst, lag)
      note(`after ${at + 30} s`, `position ${t.toFixed(1)}, behind ${lag.toFixed(1)} s, ${rss()}, status "${await status()}"`)
    }
    ok(`still playing after ${secs} s, under 30 s behind`, worst < 30 && !(await js(`return ${v}.paused`)), `worst ${worst.toFixed(1)} s`)
  }

  if (phase === 'formats') {
    ok('formats playlist added', /Playlist read: 6 channels/.test(await addUrl(`${S1}/formats.m3u`, 'Formats') ?? ''))
    const v = 'document.querySelector("video.player-video")'
    await watch('Format fMP4')
    ok('fMP4/CMAF plays', !!(await playing(30000, 2)), await status())
    await watch('Format HEVC')
    const hevc = await playing(20000, 1)
    note('HEVC on this system', hevc ? 'plays' : `does not play: ${await status()}`)
    const support = await js(`return MediaSource.isTypeSupported('video/mp4; codecs="hvc1.1.6.L93.B0"')`)
    ok('HEVC result agrees with what the system reports, or says why', !!hevc === support || (await status()).length > 0, `reported ${support}`)
    await watch('Format Alternate')
    ok('separate audio and subtitle renditions play', !!(await playing(30000, 1)), await status())
    await clickSel('[aria-label="Audio"]'); await wait(300)
    const audio = await js(`return [...document.querySelectorAll('.menu-pop .menu-item')].map(e => e.textContent)`)
    ok('audio menu lists the stream\'s tracks', audio.includes('English') && audio.includes('Francais'), audio.join(','))
    await clickText('.menu-pop .menu-item', 'Francais'); await wait(1500)
    ok('switching audio keeps playing', !!(await playing(15000, 0)))
    await clickSel('[aria-label="Subtitles"]'); await wait(300)
    await clickText('.menu-pop .menu-item', 'English'); await wait(1500)
    ok('a subtitle track can be shown', (await js(`return [...${v}.textTracks].some(t => t.mode === 'showing')`)) === true)
    await watch('Format Live')
    ok('a sliding live window plays', !!(await playing(30000, 1)), await status())
    const t1 = await js(`return ${v}.currentTime`); await wait(25000); const t2 = await js(`return ${v}.currentTime`)
    ok('live keeps advancing across playlist reloads', t2 - t1 > 15, `${t1} -> ${t2}; status: ${await status()}`)
    await watch('Format Break')
    ok('a discontinuity (ad break) is crossed', !!(await until(`document.querySelector("video.player-video")?.currentTime > 14`, 40000)), await status())
    await watch('Format File')
    const refused = await until(`(() => { const t = document.querySelector('.player-status')?.textContent ?? ''; return /not HLS|file|format/i.test(t) ? t : null })()`, 15000)
    ok('a direct video file is refused with a reason', !!refused, refused ?? await status())
    // The docked player and the Watching label follow real media.
    await go('/live')
    ok('Live TV marks nothing as watching on arrival', !(await text()).includes('WATCHING') && !(await text()).includes('Now Playing'))
    await js(`[...document.querySelectorAll('.guide-channel-tune')].find(b => b.getAttribute('aria-label').includes('Format fMP4')).click()`)
    const docked = await until(`(() => { const v = document.querySelector('.live-player-video'); return v && !v.paused && v.currentTime > 1 })()`, 30000)
    ok('the docked player really plays', !!docked)
    ok('only then does it say Watching and Now Playing', (await text()).includes('Now Playing') && !!(await js(`return document.querySelector('.watching')`)))
    await clickSel('[aria-label="Close player"]'); await wait(800)
    ok('closing it clears Watching', !(await js(`return document.querySelector('.watching')`)) && !(await text()).includes('Now Playing'))
  }

  if (phase === 'playback') {
    await go('/live')
    await js(`[...document.querySelectorAll('.guide-channel-tune')].find(b => b.getAttribute('aria-label').includes('Fixture HLS')).click()`); await wait(500)
    ok('selecting a channel in Live TV docks the player', !!(await js(`return document.querySelector('.mini-player')`)))
    await watch('Fixture HLS')
    ok('HLS master playlist plays (variant chosen, TS segments)', !!(await playing()), await status())
    await clickSel('[aria-label="Pause"]'); await wait(800)
    ok('pause pauses the video', await js(`return document.querySelector('video.player-video').paused`))
    await clickSel('[aria-label="Play"]')
    ok('play resumes', !!(await playing(10000, 0)))
    await clickSel('[aria-label="Mute"]'); await wait(300)
    ok('mute mutes the video', await js(`return document.querySelector('video.player-video').muted`))
    await clickSel('[aria-label="Unmute"]'); await wait(200)
    await js(`const i = document.querySelector('input[aria-label="Volume"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '30'); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }))`); await wait(300)
    const vol = await js(`return document.querySelector('video.player-video').volume`)
    ok('volume control sets the video volume', Math.abs(vol - 0.3) < 0.02, vol)
    await clickSel('[aria-label="Full screen"]'); await wait(800)
    const fs1 = await js(`return !!document.fullscreenElement || document.querySelector('.player').classList.contains('is-fullscreen')`)
    note('full screen entered', fs1)
    if (fs1) { await js(`document.exitFullscreen?.()`); await wait(800) }
    ok('full screen leaves cleanly', !(await js(`return !!document.fullscreenElement`)))
    await watch('Fixture AES')
    ok('AES-128 encrypted HLS plays (key fetched through kstream)', !!(await playing()), await status())
    await watch('Fixture DRM')
    const drm = await until(`(() => { const t = document.querySelector('.player-status')?.textContent ?? ''; return /DRM|protected|cannot/i.test(t) ? t : null })()`, 20000)
    ok('DRM-protected HLS is refused with a reason', !!drm, drm ?? await status())
    await watch('Fixture MP4')
    const mp4 = await until(`(() => { const t = document.querySelector('.player-status')?.textContent ?? ''; return /not HLS|HLS only|cannot play/i.test(t) ? t : null })()`, 20000)
    ok('a non-HLS stream is refused with a reason', !!mp4, mp4 ?? await status())
    await watch('Fixture Missing')
    const miss = await until(`(() => { const t = document.querySelector('.player-status')?.textContent ?? ''; return /could not|failed|unavailable|error|HTTP|not found/i.test(t) ? t : null })()`, 40000)
    ok('missing segments end in an error state, not a hang', !!miss, miss ?? await status())
    const t0 = Date.now()
    await watch('Fixture Slow')
    const slow = await playing(30000, 0.5)
    ok('a slow (5 s) playlist still plays', !!slow, `${Math.round((Date.now() - t0) / 1000)} s`)
    await watch('Fixture HLS')
    ok('switching back plays again', !!(await playing()))
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await wait(800)
    ok('Escape leaves the player', !(await js(`return location.pathname`)).startsWith('/watch'), await js(`return location.pathname`))
    await go('/library')
    ok('watch history records the channel', (await text()).includes('Fixture HLS'))
    await noSecrets()
  }

  if (phase === 'guide') {
    ok('a guide address is read', /Guide read: 2 channels/.test(await addUrl(`${S1}/guide.xml.gz?token=GUIDETOKEN`, 'Fixture guide', { guide: true }) ?? ''))
    await go('/live')
    ok('guide programmes shown for a matched channel', /Fixture News 0/.test(await js(`return [...document.querySelectorAll('.guide-row')].find(r => r.textContent.includes('Fixture HLS'))?.querySelector('.prog.is-now')?.textContent ?? ''`)))
    await go('/sources'); await clickText('.source-main', 'Fixture guide'); await wait(500)
    await js(`[...document.querySelectorAll('.guide-missing li')].find(l => l.textContent.includes('Fixture AES')).querySelector('button').click()`)
    await until(`document.querySelectorAll('.match-picker li').length > 0`)
    await setValue('.match-picker input', 'other'); await wait(300)
    await clickText('.match-picker li button', 'Fixture Other'); await wait(500)
    ok('hand match saved', (await text()).includes('Matched by hand to fx.other'))
    await js(`document.querySelector('dialog[open] [aria-label="Close"]')?.click()`); await wait(300)
    for (const [file, re, label] of [['guide-over.xml.gz', /more than 150000 programmes/, 'a guide over the programme cap'], ['guide-bomb.xml.gz', /larger than 128 MB once uncompressed/, 'a gzip bomb']]) {
      const r = await addUrl(`${S1}/${file}`, null, { guide: true, wait: 60000 })
      ok(`${label} is refused`, re.test(r ?? ''), r)
    }
    await go('/sources/add'); await clickText('button', 'XMLTV Guide'); await wait(200)
    await fileInput('laughs.xml', fs.readFileSync(`${FX}/laughs.xml`, 'utf8'))
    ok('an entity-expansion guide is refused', /declares its own XML entities/.test(await until(`document.querySelector('.field-error')?.textContent`) ?? ''))

    // Large inputs: a 10,000-channel playlist and a 136,000-programme guide.
    let t = Date.now()
    ok('a 10,000-channel playlist is read', /Playlist read: 10000 channels/.test(await addUrl(`${S1}/big.m3u?token=PLAYLISTTOKEN`, 'Big playlist', { wait: 60000 }) ?? ''))
    note('10k playlist read + add (s)', ((Date.now() - t) / 1000).toFixed(1))
    t = Date.now()
    const big = await addUrl(`${S1}/guide-big.xml.gz`, 'Big guide', { guide: true, wait: 120000 })
    ok('a 136,000-programme guide is read', /Guide read: 1000 channels, 136000 programmes/.test(big ?? ''), big)
    note('big guide read + add (s)', ((Date.now() - t) / 1000).toFixed(1))
    note('memory after big inputs', rss())
  }

  if (phase === 'bigplaylist') {
    const t = Date.now()
    ok('a 10,000-channel playlist is read and added', /Playlist read: 10000 channels/.test(await addUrl(`${S1}/big.m3u?token=PLAYLISTTOKEN`, 'Big playlist', { wait: 60000 }) ?? ''))
    note('10k playlist read + add (s)', ((Date.now() - t) / 1000).toFixed(1))
    await go('/sources')
    ok('it is listed', /Parsed · 10000 channels/.test(await pill('Big playlist')), await pill('Big playlist'))
    note('memory', rss())
  }

  if (phase === 'associate') {
    await go('/sources'); await clickText('.source-main', 'Big guide'); await wait(500)
    // Only switch it on: a guide added after the playlist is already used for it.
    if ((await js(`return document.querySelector('[aria-label="Use Big guide for Big playlist"]')?.getAttribute('aria-checked')`)) !== 'true') {
      await clickSel('[aria-label="Use Big guide for Big playlist"]'); await wait(800)
    }
    ok('the big guide is used for the big playlist', (await js(`return document.querySelector('[aria-label="Use Big guide for Big playlist"]')?.getAttribute('aria-checked')`)) === 'true')
  }

  if (phase === 'release-perf') {
    let t = Date.now()
    await go('/sources'); await go('/sources/add')
    await fileInput('big.m3u', fs.readFileSync(`${FX}/big.m3u`, 'utf8'))
    ok('release: a 10,000-channel playlist file is read', /Playlist read: 10000 channels/.test(await until(`document.querySelector('.validate-status.is-ok')?.textContent`, 60000) ?? ''))
    await setValue('.add-form input.input', 'Big playlist'); await clickText('button', 'Continue'); await wait(300)
    await clickText('.add-actions button', 'Add Source'); await wait(1500)
    note('release: 10k playlist file read + add (s)', ((Date.now() - t) / 1000).toFixed(1))
    t = Date.now()
    await go('/sources'); await go('/sources/add'); await clickText('button', 'XMLTV Guide'); await wait(200)
    await fileInput('guide-big.xml.gz', fs.readFileSync(`${FX}/guide-big.xml.gz`).toString('base64'), true)
    ok('release: a 136,000-programme guide file is read', /Guide read: 1000 channels, 136000 programmes/.test(await until(`document.querySelector('.validate-status.is-ok')?.textContent`, 120000) ?? ''))
    await setValue('.add-form input.input', 'Big guide'); await clickText('button', 'Continue'); await wait(300)
    await clickText('.add-actions button', 'Add Source'); await wait(1500)
    note('release: big guide file read + add (s)', ((Date.now() - t) / 1000).toFixed(1))
  }

  if (phase === 'perf' || phase === 'release-perf') {
    await go('/sources')
    await until(`[...document.querySelectorAll('.source-row .pill')].every(p => !/Importing|Updating/.test(p.textContent))`, 120000)
    note('memory at rest (10k channels, big guide)', rss())
    await go('/')
    const guideMs = await timed(`() => { history.pushState({}, '', '/live'); dispatchEvent(new PopStateEvent('popstate')) }`, `() => document.querySelectorAll('.guide-row').length >= 100 && !!document.querySelector('.live-more')`)
    note('Live TV guide first page of rows (ms)', guideMs)
    const progMs = await timed(`() => {}`, `() => [...document.querySelectorAll('.guide-row')].filter(r => r.querySelector('.prog')).length >= 90`)
    note('then until the page shows programmes (ms)', progMs)
    note('guide DOM size', await js(`return document.querySelectorAll('.guide-row').length + ' rows, ' + document.querySelectorAll('.prog').length + ' programme cells, ' + document.getElementsByTagName('*').length + ' elements'`))
    note('vertical scroll frames (ms)', JSON.stringify(await scrollFrames('.guide-scroll', 0, 300)))
    note('horizontal scroll frames (ms)', JSON.stringify(await scrollFrames('.guide-scroll', 200, 0)))
    const dayMs = await timed(`() => document.querySelector('[aria-label="Next day"]').click()`, `() => document.querySelector('.date-select').value === '1' && [...document.querySelectorAll('.guide-row')].filter(r => r.querySelector('.prog')).length >= 90`)
    note('next day with programmes (ms)', dayMs)
    const tuneMs = await timed(`() => [...document.querySelectorAll('.guide-channel-tune')][60].click()`, `() => document.querySelector('.mini-player strong')?.textContent.includes('Big Channel')`)
    note('tune a channel from the page (ms)', tuneMs)
    const chMs = await timed(`() => { history.pushState({}, '', '/live?view=channels'); dispatchEvent(new PopStateEvent('popstate')) }`, `() => document.querySelectorAll('a.channel-card').length >= 120`)
    note('Channels view first page of cards (ms)', chMs)
    const searchMs = await timed(`() => { history.pushState({}, '', '/search?q=Big%20Channel%20999'); dispatchEvent(new PopStateEvent('popstate')) }`, `() => document.querySelector('mark')?.parentElement?.textContent.includes('Big Channel 999')`)
    note('search across 10k channels (ms)', searchMs)
    const moreMs = await timed(`() => { history.pushState({}, '', '/live'); dispatchEvent(new PopStateEvent('popstate')) }`, `() => !!document.querySelector('.live-more')`)
    const pageMs = await timed(`() => document.querySelector('.live-more').click()`, `() => document.querySelectorAll('.guide-row').length >= 200`)
    note('guide: show 100 more rows (ms)', `${pageMs} (after returning in ${moreMs})`)
    const stepMs = await timed(`() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }))`, `() => !!document.querySelector('.mini-player')`)
    note('channel down (ms)', stepMs)
    note('memory after browsing', rss())
    ok('large-input screens completed', [guideMs, chMs, searchMs].every((v) => v >= 0), `${guideMs}/${chMs}/${searchMs}`)
  }

  if (phase === 'discovery') {
    await go('/sources?tab=discovery')
    const bar = await until(`(() => { const t = document.querySelector('.catalogue-bar')?.textContent ?? ''; return /playlists · catalogue fetched/.test(t) ? t : null })()`, 40000)
    ok('the live catalogue loads', !!bar, bar)
    await setValue('.catalogue-search input', 'kingdom')
    ok('search works', (await until(`document.querySelector('.discovery .source-row strong')?.textContent === 'United Kingdom'`)) === true)
    await setValue('.catalogue-search input', ''); await clickText('.discovery button', 'Languages'); await wait(300)
    ok('rows are paged', (await js(`return document.querySelectorAll('.discovery .source-row').length`)) === 50)
    await clickText('.discovery button', 'Show 50 more'); await wait(300)
    ok('show more adds a page', (await js(`return document.querySelectorAll('.discovery .source-row').length`)) === 100)
    await clickText('.discovery button', 'Check for updates')
    ok('refresh completes', !!(await until(`!/Checking/.test(document.querySelector('.catalogue-bar')?.textContent ?? '') && /fetched just now/.test(document.querySelector('.catalogue-bar')?.textContent ?? '')`, 40000)))
    await setValue('.catalogue-search input', 'french'); await wait(300)
    await js(`[...document.querySelectorAll('.discovery .source-main')].find(b => b.querySelector('strong')?.textContent === 'French').click()`); await wait(400)
    await clickText('dialog[open] button', 'Read this playlist'); await wait(150)
    await clickText('dialog[open] button', 'Cancel'); await wait(300)
    ok('a read can be cancelled', (await js(`return document.querySelector('dialog[open]')?.innerText ?? ''`)).includes('Read this playlist'))
    await js(`document.querySelector('dialog[open] [aria-label="Close"]')?.click()`); await wait(300)
    await setValue('.catalogue-search input', 'english'); await wait(300)
    await js(`[...document.querySelectorAll('.discovery .source-main')].find(b => b.querySelector('strong')?.textContent === 'English').click()`); await wait(400)
    let t = Date.now()
    await clickText('dialog[open] button', 'Read this playlist')
    const read = await until(`(() => { const t = document.querySelector('dialog[open]')?.innerText ?? ''; return /Kinora read the playlist/.test(t) || document.querySelector('dialog[open] .field-error') ? t : null })()`, 90000)
    ok('a large real catalogue playlist is read through the UI', /Kinora read the playlist: \d+ channels/.test(read ?? ''), (read ?? '').split('\n').find((l) => /read the playlist|could not/i.test(l)))
    note('English playlist read (s)', ((Date.now() - t) / 1000).toFixed(1))
    t = Date.now()
    await clickText('dialog[open] button', 'Add to my sources')
    ok('it is added', !!(await until(`/Added as/.test(document.querySelector('dialog[open]')?.innerText ?? '')`, 30000)))
    note('add (s)', ((Date.now() - t) / 1000).toFixed(1))
    note('memory after the large import', rss())
  }

  if (phase === 'restart' || phase === 'offline') {
    await go('/sources')
    await until(`[...document.querySelectorAll('.source-row .pill')].length > 0 && [...document.querySelectorAll('.source-row .pill')].every(p => !/Importing|Updating/.test(p.textContent))`, 120000)
    const pills = await js(`return [...document.querySelectorAll('.source-row')].filter(r => !r.textContent.includes('Sample')).map(r => r.querySelector('strong').textContent + ' = ' + r.querySelector('.pill').textContent)`)
    note('sources after start', pills.join(' | '))
    ok('saved sources and guides restored', ['Fixture web', 'Local file', 'Fixture guide', 'Big playlist', 'Big guide'].every((n) => pills.some((p) => p.startsWith(n))))
    if (phase === 'offline') ok('offline: the catalogue playlist keeps its channels', pills.some((p) => /^iptv-org · English = Refresh failed · \d+ channels kept/.test(p)), pills.find((p) => p.includes('English')))
    else ok('the catalogue playlist refreshed at startup', pills.some((p) => /^iptv-org · English = Parsed/.test(p)), pills.find((p) => p.includes('English')))
    ok('the local file source asks for its file again', pills.some((p) => /^Local file = Saved/.test(p)))
    await go('/live?group=Favourites')
    ok('favourites survive', !!(await until(`[...document.querySelectorAll('.guide-row')].some(r => r.textContent.includes('Fixture HLS'))`)))
    ok('theme survives', (await js('return document.documentElement.dataset.theme')) === 'light')
    await go('/live')
    ok('guide listings survive', /Fixture News/.test(await until(`[...document.querySelectorAll('.guide-row')].find(r => r.textContent.includes('Fixture HLS'))?.querySelector('.prog.is-now')?.textContent`) ?? ''))
    ok('hand match survives', /Other Show/.test(await until(`[...document.querySelectorAll('.guide-row')].find(r => r.textContent.includes('Fixture AES'))?.querySelector('.prog.is-now')?.textContent`) ?? ''))
    await go('/library')
    ok('history survives', (await text()).includes('Fixture HLS'))
    if (phase === 'offline') {
      await go('/sources?tab=discovery')
      ok('offline: the cached catalogue is browsable', !!(await until(`document.querySelectorAll('.discovery .source-row').length > 0`)))
      await clickText('.discovery button', 'Check for updates')
      ok('offline: the refresh fails safely', /is shown\./.test(await until(`document.querySelector('.discovery .field-error')?.textContent`, 40000) ?? ''))
    }
    await watch('Fixture HLS')
    ok('the fixture channel plays after a restart', !!(await playing()))
    await noSecrets()
    note('memory', rss())
  }

  if (phase === 'offline-all') {
    await go('/sources')
    await until(`[...document.querySelectorAll('.source-row .pill')].length > 0 && [...document.querySelectorAll('.source-row .pill')].every(p => !/Importing|Updating/.test(p.textContent))`, 120000)
    const pills = await js(`return [...document.querySelectorAll('.source-row')].filter(r => !r.textContent.includes('Sample')).map(r => r.querySelector('strong').textContent + ' = ' + r.querySelector('.pill').textContent)`)
    note('sources with nothing reachable', pills.join(' | '))
    ok('every playlist keeps its channels', ['Fixture web = Refresh failed · 6 channels kept', 'Big playlist = Refresh failed · 10000 channels kept'].every((p) => pills.includes(p)) && pills.some((p) => /^iptv-org · English = Refresh failed · \d+ channels kept$/.test(p)))
    ok('every guide keeps its programmes', ['Fixture guide = Refresh failed · 88 programmes kept', 'Big guide = Refresh failed · 136000 programmes kept'].every((p) => pills.includes(p)))
    await go('/live')
    ok('cached listings still shown', /Fixture News/.test(await until(`[...document.querySelectorAll('.guide-row')].find(r => r.textContent.includes('Fixture HLS'))?.querySelector('.prog.is-now')?.textContent`) ?? ''))
    await watch('Fixture HLS')
    const st = await until(`document.querySelector('.player-status')?.textContent`, 20000)
    ok('playback says why it cannot play, without hanging', !!st && !(await js(`return document.querySelector('video.player-video')?.currentTime > 0`)), st)
  }

  if (phase === 'fullscreen') {
    await watch('Fixture HLS')
    await playing()
    const realClick = async (css) => { const el = await wd('POST', `${S}/element`, { using: 'css selector', value: css }); await wd('POST', `${S}/element/${Object.values(el)[0]}/click`, {}) }
    await realClick('[aria-label="Full screen"]'); await wait(1200)
    const inFs = await js(`return !!document.fullscreenElement`)
    const toast = await js(`return document.querySelector('.toast, [role="status"]')?.textContent ?? ''`)
    note('full screen after a real click', `${inFs}; ${toast.slice(0, 80)}`)
    ok('full screen engages from a real click', inFs)
    if (inFs) {
      ok('the player shows its full-screen state', await js(`return document.querySelector('.player').classList.contains('is-fullscreen')`))
      await realClick('[aria-label="Exit full screen"]'); await wait(1000)
      ok('and leaves it', !(await js(`return !!document.fullscreenElement`)))
    }
  }

  if (phase === 'removeguide') {
    const cache = () => fs.readdirSync(STORE).filter((f) => f.startsWith('guide-'))
    const before = cache()
    await go('/sources')
    await until(`[...document.querySelectorAll('.source-row .pill')].length > 0 && [...document.querySelectorAll('.source-row .pill')].every(p => !/Importing|Updating/.test(p.textContent))`, 120000)
    await clickText('.source-main', 'Big guide'); await wait(400)
    await clickText('dialog[open] button', 'Remove'); await wait(300); await clickText('dialog[open] button', 'Remove source'); await wait(1500)
    const after = cache()
    ok('removing a guide deletes its programme cache', after.length === before.length - 1, `${before.length} -> ${after.length}`)
    const saved = JSON.parse(fs.readFileSync(`${STORE}/sources.json`, 'utf8'))
    ok('and its definition', !saved.guides.some((g) => g.name === 'Big guide'))
    await go('/live')
    ok('its channels now say there is no guide', /No guide for this playlist/.test(await until(`[...document.querySelectorAll('.guide-row')].find(r => r.textContent.includes('Big Channel 0'))?.textContent`) ?? ''))
  }

  if (phase === 'removal') {
    // Run after removeguide (which covers guide and cache removal): removes the fixture playlist.
    await go('/sources')
    await until(`[...document.querySelectorAll('.source-row .pill')].every(p => !/Importing|Updating/.test(p.textContent))`, 120000)
    await clickText('.source-main', 'Fixture web'); await wait(400)
    await clickText('dialog[open] button', 'Remove'); await wait(300); await clickText('dialog[open] button', 'Remove source'); await wait(1000)
    const saved = JSON.parse(fs.readFileSync(`${STORE}/sources.json`, 'utf8'))
    ok('removing a playlist drops its hand matches and guide links', saved.mappings.length === 0 && saved.guides.every((g) => g.playlists.every((p) => saved.sources.some((s) => s.id === p))), JSON.stringify(saved.mappings))
    await go('/library')
    ok('its channels leave favourites and history', !(await text()).includes('Fixture HLS'))
  }

  if (phase === 'dst') {
    await go('/live')
    note('time zone', await js(`return Intl.DateTimeFormat().resolvedOptions().timeZone`))
    const days = await js(`return [...document.querySelectorAll('.date-select')[0].options].map(o => o.value + '=' + o.textContent)`)
    // Defaults: the US change on 1 Nov 2026 (25 hours). KINORA_DST_DAY / KINORA_DST_TICKS test another day.
    const dayText = process.env.KINORA_DST_DAY ?? ' 1 Nov'
    const wantTicks = Number(process.env.KINORA_DST_TICKS ?? 50)
    const nov1 = days.find((d) => d.includes(dayText))
    ok(`the guide can show the clock-change day (${dayText.trim()})`, !!nov1, days.join(' | '))
    if (nov1) {
      await js(`const s = document.querySelector('.date-select'); s.value = arguments[0]; s.dispatchEvent(new Event('change', { bubbles: true }))`, nov1.split('=')[0]); await wait(600)
      const ticks = await js(`return document.querySelectorAll('.guide-ticks .tick').length`)
      const labels = await js(`return [...document.querySelectorAll('.guide-ticks .tick')].slice(2, 6).map(t => t.textContent).join(' ')`)
      ok(`the clock-change day is ${wantTicks / 2} hours (${wantTicks} half-hour ticks)`, ticks === wantTicks, `${ticks} ticks; ${labels}`)
      await js(`const s = document.querySelector('.date-select'); s.value = '0'; s.dispatchEvent(new Event('change', { bubbles: true }))`); await wait(400)
      ok('an ordinary day is 24 hours', (await js(`return document.querySelectorAll('.guide-ticks .tick').length`)) === 48)
    }
  }

  if (phase === 'migration' || phase === 'future' || phase === 'corrupt') {
    await go('/sources')
    await wait(1500)
    const t = await text()
    if (phase === 'migration') {
      ok('a D5 (schema 1) file loads', t.includes('Old lineup'))
      ok('it is not rewritten just by loading', !fs.existsSync(`${STORE}/sources.v1.json`))
      ok('a guide can be added to it', /Guide read/.test(await addUrl(`${S1}/guide.xml.gz`, 'Migrated guide', { guide: true }) ?? ''))
      const saved = JSON.parse(fs.readFileSync(`${STORE}/sources.json`, 'utf8'))
      ok('the first save writes schema 2 and keeps the schema 1 file', saved.version === 2 && fs.existsSync(`${STORE}/sources.v1.json`) && JSON.parse(fs.readFileSync(`${STORE}/sources.v1.json`, 'utf8')).version === 1)
    }
    if (phase === 'future') {
      ok('a newer file is reported and left alone', /written by a newer version of Kinora/.test(t))
      await addUrl(`${S1}/channels.m3u?token=PLAYLISTTOKEN`, 'Should not save'); await wait(800)
      ok('nothing is written over it', fs.readFileSync(`${STORE}/sources.json`, 'utf8').includes('"version":3'))
    }
    if (phase === 'corrupt') {
      ok('a damaged file is reported', /set aside, not deleted/.test(t))
      ok('the damaged copy is kept', fs.readdirSync(STORE).some((f) => f.startsWith('sources.json.corrupt-')))
    }
  }

  if (phase === 'release') {
    await go('/live?view=channels')
    ok('release: first run shows nothing fictional', !(await text()).includes('Northlight One'))
    ok('release: loopback is refused (no fixture bypass in release)', /local, private or reserved/.test(await addUrl(`${S1}/channels.m3u`) ?? ''))
    await go('/sources/add')
    await fileInput('test-streams.m3u', '#EXTM3U\n#EXTINF:-1 tvg-id="FX.HLS" group-title="Test streams",Big Buck Bunny 480p\nhttps://test-streams.mux.dev/x36xhzz/url_6/193039199_mp4_h264_aac_hq_7.m3u8\n#EXTINF:-1 tvg-id="mux.bbb" group-title="Test streams",Big Buck Bunny adaptive\nhttps://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8\n')
    ok('release: a local M3U file is read', !!(await until(`document.querySelector('.validate-status.is-ok')`)))
    await setValue('.add-form input.input', 'Test streams'); await clickText('button', 'Continue'); await wait(300)
    await clickText('.add-actions button', 'Add Source'); await wait(800)
    await watch('Big Buck Bunny 480p')
    const p = await playing(45000, 3)
    ok('release: a public HLS test stream plays through kstream', !!p, p ?? await status())
    await clickSel('[aria-label="Pause"]'); await wait(800)
    ok('release: pause works', await js(`return document.querySelector('video.player-video')?.paused === true`))
    await go('/sources/add'); await clickText('button', 'XMLTV Guide'); await wait(200)
    await fileInput('guide.xml.gz', fs.readFileSync(`${FX}/guide.xml.gz`).toString('base64'), true)
    ok('release: a gzip guide file is read', /Guide read: 2 channels/.test(await until(`document.querySelector('.validate-status.is-ok')?.textContent`) ?? ''))
    await setValue('.add-form input.input', 'Guide file'); await clickText('button', 'Continue'); await wait(300)
    await clickText('.add-actions button', 'Add Source'); await wait(800)
    await go('/live')
    ok('release: guide listings match the channel', /Fixture News/.test(await until(`[...document.querySelectorAll('.guide-row')].find(r => r.textContent.includes('Big Buck Bunny 480p'))?.querySelector('.prog.is-now')?.textContent`) ?? ''))
    await go('/sources?tab=discovery')
    ok('release: the live catalogue loads', !!(await until(`/playlists · catalogue fetched/.test(document.querySelector('.catalogue-bar')?.textContent ?? '')`, 40000)))
    await noSecrets()
    note('release memory', rss())
  }

  if (phase === 'release-restart') {
    await go('/sources')
    await until(`[...document.querySelectorAll('.source-row .pill')].length > 0 && [...document.querySelectorAll('.source-row .pill')].every(p => !/Importing|Updating/.test(p.textContent))`, 60000)
    const t = await text()
    ok('release: sources and guide restored', t.includes('Test streams') && t.includes('Guide file'))
    ok('release: the file source asks for its file again', /Saved · 2 channels/.test(await pill('Test streams')))
    await go('/live')
    ok('release: cached guide listings shown after restart', /Fixture News/.test(await until(`[...document.querySelectorAll('.guide-row')].find(r => r.textContent.includes('Big Buck Bunny 480p'))?.querySelector('.prog.is-now')?.textContent`) ?? ''))
    await go('/sources?tab=discovery')
    ok('release: the catalogue opens from its cache', !!(await until(`document.querySelectorAll('.discovery .source-row').length > 0`)))
  }

  if (phase === 'recovery') {
    // A failing stream recovers with Retry once its server has the segments again.
    await watch('Fixture Missing')
    ok('a stream with missing segments shows Retry', !!(await until(`[...document.querySelectorAll('.player-status button')].some(b => b.textContent.includes('Retry'))`, 40000)))
    for (const f of ['seg00.ts', 'seg01.ts']) fs.copyFileSync(`${FX}/hls/${f}`, `${FX}/missing/${f}`)
    try {
      await clickText('.player-status button', 'Retry')
      ok('Retry recovers once the segments exist', !!(await playing(30000, 0.5)), await status())
    } finally {
      for (const f of ['seg00.ts', 'seg01.ts']) fs.rmSync(`${FX}/missing/${f}`, { force: true })
    }
    // Switching away from a slow stream stops its requests.
    const LOG = `${process.env.KINORA_SMOKE_DIR ?? '/tmp/kinora-smoke'}/fixture.log`
    await watch('Fixture Slow'); await wait(1500)
    const switched = Date.now() / 1000
    await watch('Fixture HLS')
    ok('the next channel plays', !!(await playing()))
    await wait(12000)
    const late = fs.readFileSync(LOG, 'utf8').split('\n').filter((l) => l.includes('/slow/') && Number(l.split(' ')[0]) > switched + 1)
    ok('no slow-stream requests after switching away', late.length === 0, late.join(' ; '))
  }

  if (phase === 'guide-edge') {
    // Fixtures are today's, and guides drop programmes that ended over 12 hours ago: the morning ones must still be kept.
    if (new Date().getHours() >= 20) { note('skipped', 'run guide-edge between 00:00 and 20:00 local time (use libfaketime if needed)'); throw new Error('guide-edge is clock-bound') }
    ok('fixture playlist added', /Playlist read: 6 channels/.test(await addUrl(`${S1}/channels.m3u?token=PLAYLISTTOKEN`, 'Fixture web') ?? ''))
    ok('edge-case guide added', /Guide read: 1 channels, 5 programmes/.test(await addUrl(`${S1}/guide-edge.xml`, 'Edge guide', { guide: true }) ?? ''))
    await go('/live')
    const progs = async () => js(`return [...([...document.querySelectorAll('.guide-row')].find(r => r.textContent.includes('Fixture HLS'))?.querySelectorAll('.prog') ?? [])].map(p => ({ t: p.querySelector('.prog-title')?.textContent, a: p.getAttribute('aria-label'), l: parseFloat(p.style.left), w: parseFloat(p.style.width) }))`)
    await until(`[...document.querySelectorAll('.guide-row')].find(r => r.textContent.includes('Fixture HLS'))?.querySelectorAll('.prog').length >= 5`)
    const today = await progs()
    note('today', today.map((p) => p.a).join(' | '))
    const get = (t) => today.find((p) => p.t?.includes(t))
    ok('+0100 time shown in local time', /10:00 to 11:00/.test(get('Edge Offset Plus')?.a ?? ''))
    ok('-0500 time shown in local time', /11:00 to 12:00/.test(get('Edge Offset Minus')?.a ?? ''))
    const minus = get('Edge Offset Minus'), after = get('Edge After Gap')
    ok('a two-hour gap stays empty', !!minus && !!after && after.l - (minus.l + minus.w) > 100, minus && after ? `${minus.l + minus.w} -> ${after.l}` : '')
    ok('a programme crossing midnight shows its real times', /23:00 to 01:00/.test(get('Edge Late Film')?.a ?? ''))
    await clickSel('[aria-label="Next day"]'); await wait(800)
    const next = await progs()
    const late = next.find((p) => p.t?.includes('Edge Late Film'))
    ok('next day starts with the rest of it, cut at midnight', !!late && late.l === 0, JSON.stringify(late))
  }

  if (phase === 'guide-errors') {
    for (const [file, re, label] of [
      ['guide-truncated.xml', /not well-formed XML|ends before its closing <\/tv> tag/, 'a truncated (malformed) guide'],
      ['guide-huge.xml?token=GUIDETOKEN', /larger than the 64 MB limit/, 'a download over 64 MB'],
      ['guide-bomb.xml.gz?token=GUIDETOKEN', /larger than 128 MB once uncompressed/, 'a gzip bomb'],
      ['guide-over.xml.gz?token=GUIDETOKEN', /more than 150000 programmes/, 'a guide over the programme cap'],
    ]) {
      const r = await addUrl(`${S1}/${file}`, null, { guide: true, wait: 90000 })
      ok(`${label} is refused`, re.test(r ?? ''), r)
      ok(`its message names no token or path`, !/GUIDETOKEN|guide-|\.xml/.test(r ?? ''), r)
    }
    await go('/sources'); await go('/sources/add'); await clickText('button', 'XMLTV Guide'); await wait(200)
    await fileInput('laughs.xml', fs.readFileSync(`${FX}/laughs.xml`, 'utf8'))
    ok('an entity-expansion guide is refused', /declares its own XML entities/.test(await until(`document.querySelector('.field-error')?.textContent`) ?? ''))
  }

  if (phase === 'realguide') {
    const t = Date.now()
    const r = await addUrl('https://raw.githubusercontent.com/dp247/Freeview-EPG/master/epg.xml', 'Freeview EPG', { guide: true, wait: 120000 })
    ok('a real-world XMLTV guide (Freeview-EPG, 21 MB) is read through the guarded fetch', /Guide read: \d+ channels, \d+ programmes/.test(r ?? ''), r)
    note('real guide read + add (s)', ((Date.now() - t) / 1000).toFixed(1))
    note('memory', rss())
    const caches = fs.readdirSync(STORE).filter((f) => f.startsWith('guide-')).map((f) => fs.readFileSync(`${STORE}/${f}`, 'utf8'))
    ok('its cache keeps no logo or other addresses', caches.length > 0 && caches.every((c) => !/tv-logos|https?:\/\//.test(c)))
    await go('/sources'); await clickText('.source-main', 'Freeview EPG'); await wait(500)
    note('detail', (await js(`return document.querySelector('dialog[open]')?.innerText ?? ''`)).split('\n').filter((l) => /Listings|Guide|Skipped|programme|channel/i.test(l)).slice(0, 8).join(' | '))
  }

  if (phase === 'discovery-more' || phase === 'discovery-stale-offline') {
    // Age the cached catalogue before Discovery opens (it is only read when Discovery opens).
    const file = `${STORE}/catalogue.json`
    const c = JSON.parse(fs.readFileSync(file, 'utf8'))
    c.catalogue.fetchedAt = Date.now() - 3 * 86400000
    fs.writeFileSync(file, JSON.stringify(c))
    await go('/sources?tab=discovery')
    const first = await until(`(() => { const t = document.querySelector('.catalogue-bar')?.textContent ?? ''; return document.querySelectorAll('.discovery .source-row').length > 0 && t ? t : null })()`, 20000)
    ok('a 3-day-old copy opens with a usable list', !!first, first)
    if (phase === 'discovery-more') {
      ok('and is updated because it is out of date', !!(await until(`/fetched just now/.test(document.querySelector('.catalogue-bar')?.textContent ?? '')`, 40000)))
      ok('the update replaced the cached copy', Date.now() - JSON.parse(fs.readFileSync(file, 'utf8')).catalogue.fetchedAt < 120000)
      await clickText('.discovery button', 'Languages'); await setValue('.catalogue-search input', 'english')
      await until(`document.querySelector('.discovery .source-row strong')?.textContent === 'English'`)
      ok('an imported entry is marked Added in the list', (await js(`return document.querySelector('.discovery .source-row')?.textContent ?? ''`)).includes('Added'))
      await js(`document.querySelector('.discovery .source-main').click()`); await wait(400)
      const d = await js(`return document.querySelector('dialog[open]')?.innerText ?? ''`)
      ok('and offers no second import', /Added as iptv-org · English/.test(d) && !/Read this playlist/.test(d))
    } else {
      const err = await until(`document.querySelector('.discovery .field-error')?.textContent`, 40000)
      ok('offline: the update fails with a reason and the old copy stays', /is shown\./.test(err ?? ''), err)
      ok('offline: it says the copy may be out of date', /may be out of date/.test(await js(`return document.querySelector('.catalogue-bar')?.textContent ?? ''`)))
      await clickText('.discovery button', 'Check for updates')
      ok('offline: retry fails safely again', /is shown\./.test(await until(`document.querySelector('.discovery .field-error')?.textContent`, 40000) ?? ''))
      ok('offline: the list is still usable', (await js(`return document.querySelectorAll('.discovery .source-row').length`)) > 0)
    }
  }

  if (phase === 'perms') {
    const mode = (p) => (fs.statSync(p).mode & 0o777).toString(8)
    ok('the saved-sources folder is 0700', mode(STORE) === '700', mode(STORE))
    const files = fs.readdirSync(STORE).map((f) => `${f}=${mode(`${STORE}/${f}`)}`)
    ok('every file in it is 0600', files.every((f) => f.endsWith('=600')), files.join(', '))
  }

  if (phase === 'release-player') {
    // A file source has no stream addresses after a restart: choose the file again, as a user would.
    await go('/sources'); await clickText('.source-main', 'Test streams'); await wait(400)
    await fileInput('test-streams.m3u', '#EXTM3U\n#EXTINF:-1 tvg-id="FX.HLS" group-title="Test streams",Big Buck Bunny 480p\nhttps://test-streams.mux.dev/x36xhzz/url_6/193039199_mp4_h264_aac_hq_7.m3u8\n#EXTINF:-1 tvg-id="mux.bbb" group-title="Test streams",Big Buck Bunny adaptive\nhttps://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8\n')
    ok('release: choosing the file again re-reads it', /Parsed · 2 channels/.test(await until(`(() => { const t = document.querySelector('dialog[open] .pill')?.textContent ?? ''; return /Parsed/.test(t) ? t : null })()`, 20000) ?? ''))
    await js(`document.querySelector('dialog[open] [aria-label="Close"]')?.click()`); await wait(300)
    await watch('Big Buck Bunny 480p')
    ok('release: the stream plays', !!(await playing(45000, 2)))
    await clickSel('[aria-label="Mute"]'); await wait(300)
    ok('release: mute', await js(`return document.querySelector('video.player-video').muted`))
    await clickSel('[aria-label="Unmute"]'); await wait(200)
    await js(`const i = document.querySelector('input[aria-label="Volume"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '30'); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }))`); await wait(300)
    ok('release: volume', Math.abs((await js(`return document.querySelector('video.player-video').volume`)) - 0.3) < 0.02)
    const realClick = async (css) => { const el = await wd('POST', `${S}/element`, { using: 'css selector', value: css }); await wd('POST', `${S}/element/${Object.values(el)[0]}/click`, {}) }
    await realClick('[aria-label="Full screen"]'); await wait(1200)
    ok('release: full screen from a real click', await js(`return !!document.fullscreenElement`))
    await realClick('[aria-label="Exit full screen"]'); await wait(1000)
    ok('release: leaves full screen', !(await js(`return !!document.fullscreenElement`)))
    await clickSel('[aria-label="Pause"]'); await wait(800)
    ok('release: pause', await js(`return document.querySelector('video.player-video').paused`))
    await clickSel('[aria-label="Play"]')
    ok('release: resume', !!(await playing(15000, 0)))
    await watch('Big Buck Bunny adaptive')
    ok('release: switching to an adaptive (master) stream plays', !!(await playing(45000, 2)))
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await wait(800)
    ok('release: Escape leaves the player', !(await js(`return location.pathname`)).startsWith('/watch'))
    await go('/library')
    ok('release: history records it', (await text()).includes('Big Buck Bunny'))
    await noSecrets()
  }

  if (phase === 'release-offline') {
    await go('/sources')
    await until(`[...document.querySelectorAll('.source-row .pill')].length > 0 && [...document.querySelectorAll('.source-row .pill')].every(p => !/Importing|Updating/.test(p.textContent))`, 60000)
    const t = await text()
    ok('release offline: sources and guide restored', t.includes('Test streams') && t.includes('Guide file'))
    await go('/live')
    ok('release offline: cached listings shown', /Fixture News/.test(await until(`[...document.querySelectorAll('.guide-row')].find(r => r.textContent.includes('Big Buck Bunny 480p'))?.querySelector('.prog.is-now')?.textContent`) ?? ''))
    await go('/sources?tab=discovery')
    ok('release offline: cached catalogue browsable', !!(await until(`document.querySelectorAll('.discovery .source-row').length > 0`)))
    await watch('Big Buck Bunny 480p')
    const st = await until(`document.querySelector('.player-status')?.textContent`, 20000)
    ok('release offline: a restored file channel says why it cannot play', /Choose the file again/.test(st ?? ''), st)
  }

  if (phase === 'release-removal') {
    const cache = () => fs.readdirSync(STORE).filter((f) => f.startsWith('guide-'))
    const before = cache().length
    await go('/sources')
    await until(`[...document.querySelectorAll('.source-row .pill')].every(p => !/Importing|Updating/.test(p.textContent))`, 60000)
    await clickText('.source-main', 'Guide file'); await wait(400)
    await clickText('dialog[open] button', 'Remove'); await wait(300); await clickText('dialog[open] button', 'Remove source'); await wait(1200)
    ok('release: removing a guide deletes its cache', cache().length === before - 1, `${before} -> ${cache().length}`)
    await clickText('.source-main', 'Test streams'); await wait(400)
    await clickText('dialog[open] button', 'Remove'); await wait(300); await clickText('dialog[open] button', 'Remove source'); await wait(1200)
    const saved = JSON.parse(fs.readFileSync(`${STORE}/sources.json`, 'utf8'))
    ok('release: removing the playlist leaves nothing behind', saved.sources.length === 0 && saved.guides.length === 0 && saved.mappings.length === 0, JSON.stringify(saved).slice(0, 120))
    await go('/live?view=channels')
    ok('release: no fictional channels return', !(await text()).includes('Northlight One'))
    await go('/library')
    ok('release: its history entries are gone', !(await text()).includes('Big Buck Bunny'))
  }

  if (phase === 'external-link') {
    // The desktop app cannot open outside addresses (no opener plugin): the provider credit must be text.
    await go('/sources?tab=discovery')
    await until(`document.querySelectorAll('.discovery .source-row').length > 0`, 40000)
    ok('the provider credit is plain text, not a dead link', (await js(`return document.querySelector('.discovery .demo-note a') === null && document.querySelector('.discovery .demo-note').textContent.includes('github.com/iptv-org/iptv')`)) === true)
    ok('the app window stays in Kinora', !/github\.com/.test(await wd('GET', `${S}/url`)))
  }

  const csp = await js('return window.__csp'); ok('no CSP violations', csp.length === 0, csp.join(','))
} catch (e) { ok('script completed', false, String(e)) } finally { await wd('DELETE', S).catch(() => {}) }
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`)
