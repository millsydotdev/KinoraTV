import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CHANNEL_GROUPS, DAY, GUIDE_DAYS, MIN, nextProgramme, programmeAt, scheduleFor, startOfDay } from '../data/channels'
import { channelRef } from '../data/refs'
import type { Channel, Programme } from '../data/types'
import { Dialog } from '../components/Dialog'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'
import { PageHeader } from '../components/PageHeader'
import { ChannelCard } from '../components/Tiles'
import { Art, ChannelMark, ProgressBar, StateBlock } from '../components/ui'
import { clock, dayLabel, useNow } from '../lib/time'
import { categoryLabel, channelGroups, filterChannels, inCategory } from '../state/playlists'
import { useStore } from '../state/store'
import './LiveTV.css'

// Guide row height per density setting (px), mirrored by --guide-row in global.css.
const ROW_H = { compact: 52, comfortable: 64, spacious: 76 } as const

function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setMatch(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return match
}

export function LiveTV() {
  const now = useNow(15_000)
  const store = useStore()
  const { prefs, library, channels, findChannel, channelMode } = store
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const compactCol = useMedia('(max-width: 640px)')

  const playing = findChannel(params.get('channel') ?? '') ?? channels[0]
  const categories = channelMode === 'playlists' ? channelGroups(channels) : CHANNEL_GROUPS.filter((g) => channels.some((c) => inCategory(c, g)))
  const groups = ['All', 'Favourites', ...categories]
  const requestedGroup = params.get('group')
  const group = requestedGroup && groups.includes(requestedGroup) ? requestedGroup : 'All'
  const view = params.get('view') === 'channels' ? 'channels' : 'guide'
  const [dayOffset, setDayOffset] = useState(0)
  const [selected, setSelected] = useState<Programme | null>(null)
  const [playerOpen, setPlayerOpen] = useState(false)
  const [focusId, setFocusId] = useState<string | null>(null)

  const favIds = library.favourites.filter((r) => r.startsWith('channel:')).map((r) => r.slice(8))
  const visible = filterChannels(channels, group, favIds)

  const dayStart = startOfDay(now) + dayOffset * DAY
  const rows = visible.map((c) => ({ channel: c, programmes: scheduleFor(c, dayStart) }))

  // Geometry: the visible window shows `guideZoom` hours across whatever width the guide has.
  const scroller = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1200)
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => e && setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [view])
  const colW = compactCol ? 64 : 248
  const ppm = Math.max(3, (width - colW) / (prefs.guideZoom * 60))
  const x = (t: number) => ((t - dayStart) / MIN) * ppm

  const scrollToTime = (t: number, smooth = true) =>
    scroller.current?.scrollTo({ left: Math.max(0, x(t) - 30 * ppm), behavior: smooth ? 'smooth' : 'auto' })

  // Position once per day/zoom: at now (or start of day) for today, early evening for later days.
  const positioned = useRef('')
  const positionKey = `${view}:${visible.length}:${dayStart}:${Math.round(ppm)}`
  useEffect(() => {
    if (positioned.current === positionKey) return
    positioned.current = positionKey
    if (dayOffset === 0) scrollToTime(prefs.guideStart === 'now' ? now : dayStart + 30 * MIN, false)
    else scrollToTime(dayStart + 18.5 * 60 * MIN, false)
  })

  const current = playing ? programmeAt(playing, now) : undefined

  const tune = (c: Channel, announce = true) => {
    const next = new URLSearchParams(params)
    next.set('channel', c.id)
    setParams(next, { replace: true })
    setSelected(null)
    setPlayerOpen(true)
    store.recordView(channelRef(c.id))
    if (announce) toast(`Switched to ${c.number} ${c.name}`)
  }
  const step = (dir: number) => {
    const list = visible.length ? visible : channels
    const i = list.findIndex((c) => c.id === playing?.id)
    const c = list[(i + dir + list.length) % list.length]
    if (c) tune(c)
  }
  const setGroup = (g: string) => {
    const next = new URLSearchParams(params)
    if (g === 'All') next.delete('group')
    else next.set('group', g)
    setParams(next, { replace: true })
  }

  // Channel up/down from anywhere on the page.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName) || document.querySelector('dialog[open]')) return
      if (e.key === 'PageUp') { e.preventDefault(); step(-1) }
      if (e.key === 'PageDown') { e.preventDefault(); step(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const select = (p: Programme) => {
    setSelected(p)
    setFocusId(p.id)
  }

  // Roving focus across the grid: arrows move between programmes, like a remote.
  const effectiveFocus = focusId && rows.some((r) => r.programmes.some((p) => p.id === focusId))
    ? focusId
    : (rows.find((r) => r.channel.id === playing?.id) ?? rows[0])?.programmes.find((p) => p.start <= Math.max(now, dayStart) && Math.max(now, dayStart) < p.stop)?.id ?? rows[0]?.programmes[0]?.id ?? null
  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) || !effectiveFocus) return
    const r = rows.findIndex((row) => row.programmes.some((p) => p.id === effectiveFocus))
    const row = rows[r]
    if (!row) return
    const i = row.programmes.findIndex((p) => p.id === effectiveFocus)
    const cur = row.programmes[i] as Programme
    let target: Programme | undefined
    if (e.key === 'ArrowLeft') target = row.programmes[i - 1]
    if (e.key === 'ArrowRight') target = row.programmes[i + 1]
    if (e.key === 'Home') target = row.programmes[0]
    if (e.key === 'End') target = row.programmes[row.programmes.length - 1]
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const other = rows[r + (e.key === 'ArrowUp' ? -1 : 1)]
      const anchor = Math.max(cur.start, dayStart) + 60_000
      target = other?.programmes.find((p) => p.start <= anchor && anchor < p.stop)
    }
    if (target) {
      e.preventDefault()
      setFocusId(target.id)
    }
  }
  useEffect(() => {
    if (!focusId) return
    const el = scroller.current?.querySelector<HTMLElement>(`[data-pid="${CSS.escape(focusId)}"]`)
    if (el && scroller.current?.contains(document.activeElement)) {
      el.focus({ preventScroll: true })
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [focusId])

  const ticks = Array.from({ length: 48 }, (_, i) => dayStart + i * 30 * MIN)
  const innerW = colW + x(dayStart + DAY)
  const showNow = dayOffset === 0

  const panel = selected && (
    <ProgrammePanel
      programme={selected}
      channel={findChannel(selected.channelId)}
      now={now}
      isPlayingChannel={selected.channelId === playing?.id}
      isSelection
      onTune={(c) => { tune(c); setSelected(null) }}
      onClear={() => setSelected(null)}
      onSelect={select}
    />
  )

  const setView = (v: 'guide' | 'channels') => {
    const next = new URLSearchParams(params)
    if (v === 'guide') next.delete('view')
    else next.set('view', v)
    setParams(next, { replace: true })
  }

  const tabs = (
    <div className="tabs" role="tablist" aria-label="Live TV views">
      <button type="button" role="tab" className="tab" aria-selected={view === 'guide'} onClick={() => setView('guide')}>TV Guide</button>
      <button type="button" role="tab" className="tab" aria-selected={view === 'channels'} onClick={() => setView('channels')}>Channels</button>
    </div>
  )

  // Date picker sits in the header as plain text with a chevron, as in the mockup.
  const guideActions = view === 'guide' && (
    <div className="guide-actions">
      <button type="button" className="icon-btn" onClick={() => setDayOffset((d) => Math.max(0, d - 1))} disabled={dayOffset === 0} aria-label="Previous day"><Icon name="left" size={16} /></button>
      <select className="date-select" value={dayOffset} onChange={(e) => setDayOffset(Number(e.target.value))} aria-label="Guide day">
        {Array.from({ length: GUIDE_DAYS }, (_, i) => (
          <option key={i} value={i}>{new Date(startOfDay(now) + i * DAY).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</option>
        ))}
      </select>
      <button type="button" className="icon-btn" onClick={() => setDayOffset((d) => Math.min(GUIDE_DAYS - 1, d + 1))} disabled={dayOffset === GUIDE_DAYS - 1} aria-label="Next day"><Icon name="right" size={16} /></button>
      <button type="button" className="now-btn" onClick={() => { setDayOffset(0); if (dayOffset === 0) scrollToTime(now) }}><span className="live-dot" aria-hidden="true" />Now</button>
      <select className="date-select" value={prefs.guideZoom} onChange={(e) => store.setPref('guideZoom', Number(e.target.value) as 2 | 3 | 4)} aria-label="Hours visible">
        <option value={2}>2 hours</option>
        <option value={3}>3 hours</option>
        <option value={4}>4 hours</option>
      </select>
    </div>
  )

  const noPlaylistChannels = (
    <StateBlock icon="sources" title="No channels to show yet" action={<Link to="/sources" className="btn btn-ghost">Open Sources</Link>}>
      {store.playlists.some((s) => s.status === 'importing')
        ? 'A playlist is still being imported.'
        : 'None of your imported playlists has produced any channels. Open Sources to see why, refresh a source or add another.'}
    </StateBlock>
  )

  const emptyFavourites = (
    <StateBlock icon="heart" title="No favourite channels yet" action={<button type="button" className="btn btn-ghost" onClick={() => setGroup('All')}>Show all channels</button>}>
      Use the heart next to a channel name to keep it here. Favourites are saved on this device.
    </StateBlock>
  )

  return (
    <>
      <PageHeader title="Live TV" tabs={tabs} search={false} actions={guideActions} />
      <div className="page live">
        {view === 'channels' ? (
          <>
            <div className="chips live-chips" role="group" aria-label="Channel category">
              {groups.map((g) => (
                <button key={g} type="button" className="chip" aria-pressed={group === g} onClick={() => setGroup(g)}>
                  {g === 'Favourites' && <Icon name="heart" size={14} />}
                  {g}
                </button>
              ))}
            </div>
            {channels.length === 0 ? noPlaylistChannels : visible.length === 0 ? emptyFavourites : (
              <div className="grid-cards">
                {visible.map((c) => (
                  <ChannelCard key={c.id} channel={c} now={programmeAt(c, now)} next={nextProgramme(c, now)} to={`/live?channel=${c.id}`} format={prefs.timeFormat} selected={c.id === playing?.id} at={now} />
                ))}
              </div>
            )}
          </>
        ) : (
          <section className="guide" aria-label="TV guide">
            <div className="guide-scroll" ref={scroller} style={{ ['--col-w' as string]: `${colW}px`, ['--row-h' as string]: `${ROW_H[prefs.density]}px` }}>
              <div className="guide-inner" style={{ width: visible.length ? innerW : undefined }} role="grid" aria-label={`Programme guide, ${dayLabel(dayStart, now)}`} aria-rowcount={rows.length + 1} onKeyDown={onGridKey}>
                <div className="guide-head" role="row">
                  <div className="guide-corner" role="columnheader">
                    <select className="corner-select" value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Channel category">
                      {groups.map((g) => <option key={g} value={g}>{g === 'All' ? 'Channels' : g}</option>)}
                    </select>
                  </div>
                  <div className="guide-ticks" role="presentation">
                    {ticks.map((t) => (
                      <span key={t} className={`tick tnum${showNow && t <= now && now < t + 30 * MIN ? ' is-current' : ''}`} style={{ left: x(t) }}>{clock(t, prefs.timeFormat)}</span>
                    ))}
                  </div>
                </div>
                {visible.length === 0 && <div className="guide-empty">{channels.length === 0 ? noPlaylistChannels : emptyFavourites}</div>}
                {rows.map(({ channel: c, programmes }) => {
                  const fav = favIds.includes(c.id)
                  const isPlaying = c.id === playing?.id
                  return (
                    <div key={c.id} className={`guide-row${isPlaying ? ' is-playing' : ''}`} role="row">
                      <div className="guide-channel" role="rowheader">
                        <button type="button" className="guide-channel-tune" onClick={() => tune(c)} aria-label={`Watch ${c.number} ${c.name}${isPlaying ? ', now watching' : ''}`} aria-current={isPlaying ? 'true' : undefined}>
                          <ChannelMark channel={c} size={compactCol ? 32 : 34} />
                          {!compactCol && (
                            <span className="guide-channel-name">
                              <strong>{c.name}</strong>
                              {isPlaying && <span className="watching"><Icon name="play" size={9} />Watching</span>}
                            </span>
                          )}
                          {!compactCol && <span className="guide-channel-no tnum">{c.number}</span>}
                        </button>
                        {!compactCol && (
                          <button type="button" className={`icon-btn fav-btn${fav ? ' is-fav' : ''}`} aria-pressed={fav} aria-label={fav ? `Remove ${c.name} from favourites` : `Add ${c.name} to favourites`} onClick={() => store.toggleFavourite(channelRef(c.id))}>
                            <Icon name="heart" size={14} />
                          </button>
                        )}
                      </div>
                      <div className="guide-track">
                        {programmes.length === 0 && <span className="guide-noinfo faint">No guide information</span>}
                        {programmes.map((p) => {
                          const onNow = p.start <= now && now < p.stop
                          const past = p.stop <= now
                          const w = x(p.stop) - x(p.start)
                          return (
                            <button
                              key={p.id}
                              type="button"
                              role="gridcell"
                              data-pid={p.id}
                              tabIndex={p.id === effectiveFocus ? 0 : -1}
                              aria-selected={selected?.id === p.id}
                              className={`prog${onNow ? ' is-now' : ''}${onNow && isPlaying ? ' is-playing' : ''}${past ? ' is-past' : ''}${selected?.id === p.id ? ' is-selected' : ''}`}
                              style={{ left: x(p.start), width: Math.max(0, w - 4) }}
                              onClick={() => select(p)}
                              onFocus={() => setFocusId(p.id)}
                              aria-label={`${p.title}, ${c.name}, ${clock(p.start, prefs.timeFormat)} to ${clock(p.stop, prefs.timeFormat)}${onNow ? ', on now' : ''}`}
                            >
                              <span className="prog-label">
                                <span className="prog-title">{onNow && isPlaying && <Icon name="play" size={10} className="prog-playing" />}{p.title}</span>
                                {w > 90 && <span className="prog-time tnum">{clock(p.start, prefs.timeFormat)} - {clock(p.stop, prefs.timeFormat)}</span>}
                              </span>
                              {library.reminders.includes(p.id) && <Icon name="bell" size={13} className="prog-bell" />}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                {showNow && visible.length > 0 && <div className="now-line" style={{ left: colW + x(now) }} aria-hidden="true" />}
              </div>
            </div>
            <p className="guide-hint faint">
              {channelMode === 'playlists'
                ? 'Channels come from your imported playlists. There is no programme guide for them yet, and their streams have not been playback-tested. Page Up and Page Down change channel.'
                : 'Arrow keys move through the guide, Enter opens a programme, Page Up and Page Down change channel. Channels and schedule are demonstration data.'}
            </p>
          </section>
        )}

        {playing && playerOpen && (
          <aside className="mini-player" aria-label="Player">
            <LivePlayer channel={playing} programme={current} now={now} onStep={step} onClose={() => setPlayerOpen(false)} />
          </aside>
        )}

        {playing && current && (
          <button type="button" className="now-playing" aria-expanded={playerOpen} onClick={() => setPlayerOpen(!playerOpen)}>
            <span className="np-dot" aria-hidden="true" />
            Now Playing: {playing.name} - {current.title}
          </button>
        )}

        <Dialog open={!!selected} onClose={() => setSelected(null)} title="Programme" variant="sheet">
          {panel}
        </Dialog>
      </div>
    </>
  )
}

function LivePlayer({ channel, programme, now, onStep, onClose }: { channel: Channel; programme?: Programme; now: number; onStep: (dir: number) => void; onClose: () => void }) {
  const { prefs } = useStore()
  return (
    <div className="live-player force-dark">
      <Art key={programme?.art} src={programme?.art ?? ''} alt="" eager />
      <div className="live-player-shade" />
      <div className="live-player-bug">
        <ChannelMark channel={channel} size={30} />
        <span>
          <strong>{channel.number} {channel.name}</strong>
          <span className="faint">{categoryLabel(channel)}{channel.hd ? ' · HD' : ''}</span>
        </span>
      </div>
      <div className="live-player-status" role="status">
        <Icon name="sources" size={18} />
        {channel.sourceId
          ? <span>Not playable yet · stream not playback-tested</span>
          : <span>No stream connected. <Link to="/sources" className="text-link">Add a source</Link></span>}
      </div>
      <div className="live-player-bar">
        {programme && (
          <div className="live-player-now">
            <span className="live-dot">Live</span>
            <span className="tnum faint">{clock(programme.start, prefs.timeFormat)} - {clock(programme.stop, prefs.timeFormat)}</span>
            <ProgressBar value={(now - programme.start) / (programme.stop - programme.start)} label="Programme progress" />
          </div>
        )}
        <div className="live-player-controls">
          <button type="button" className="icon-btn" onClick={() => onStep(-1)} aria-label="Previous channel"><Icon name="up" /></button>
          <button type="button" className="icon-btn" onClick={() => onStep(1)} aria-label="Next channel"><Icon name="down" /></button>
          <Link to={`/watch/${encodeURIComponent(channelRef(channel.id))}`} className="icon-btn" aria-label="Open full-screen player"><Icon name="fullscreen" /></Link>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close player"><Icon name="close" /></button>
        </div>
      </div>
    </div>
  )
}

function ProgrammePanel({ programme: p, channel, now, isPlayingChannel, isSelection, onTune, onClear, onSelect }: {
  programme: Programme; channel?: Channel; now: number; isPlayingChannel: boolean; isSelection: boolean
  onTune: (c: Channel) => void; onClear: () => void; onSelect: (p: Programme) => void
}) {
  const store = useStore()
  const toast = useToast()
  const { prefs } = store
  const onNow = p.start <= now && now < p.stop
  const ended = p.stop <= now
  const reminded = store.library.reminders.includes(p.id)
  const mins = Math.round((p.stop - p.start) / MIN)
  return (
    <div className="panel-inner">
      <div className="panel-head">
        <span className="label">{isSelection ? 'Selected programme' : 'Now watching'}</span>
        {isSelection && <button type="button" className="text-link" onClick={onClear}>Back to now watching</button>}
      </div>
      {prefs.guideArt && isSelection && <Art src={p.art} className="panel-art" />}
      {channel && (
        <p className="panel-channel">
          <ChannelMark channel={channel} size={28} />
          <span>{channel.number} {channel.name}</span>
        </p>
      )}
      <h2 className="panel-title">{p.title}</h2>
      <div className="meta">
        <span className="tnum">{dayLabel(p.start, now)}, {clock(p.start, prefs.timeFormat)} to {clock(p.stop, prefs.timeFormat)}</span>
        <span>{mins} min</span>
        <span>{p.category}</span>
        {p.episode && <span>{p.episode}</span>}
      </div>
      {onNow && <ProgressBar value={(now - p.start) / (p.stop - p.start)} label="Programme progress" />}
      <p className="muted panel-desc">{p.desc}</p>
      <div className="panel-actions">
        {onNow && channel && !isPlayingChannel && (
          <button type="button" className="btn btn-primary" onClick={() => onTune(channel)}><Icon name="play" size={18} />Watch {channel.name}</button>
        )}
        {onNow && isPlayingChannel && channel && (
          <Link to={`/watch/${encodeURIComponent(channelRef(channel.id))}`} className="btn btn-primary"><Icon name="play" size={16} />Open player</Link>
        )}
        {!onNow && !ended && (
          <button
            type="button"
            className="btn btn-ghost"
            aria-pressed={reminded}
            onClick={() => {
              store.toggleReminder(p.id)
              toast(reminded ? 'Reminder removed' : `Reminder saved for ${p.title}. Alerts arrive with the playback service.`)
            }}
          >
            <Icon name={reminded ? 'check' : 'bell'} size={18} />
            {reminded ? 'Reminder set' : 'Remind me'}
          </button>
        )}
        {ended && <span className="faint">Ended. Catch-up needs a source that offers it.</span>}
      </div>
      {!isSelection && channel && (
        <div className="later">
          <h3 className="label">Later on {channel.name}</h3>
          <ul>
            {[...scheduleFor(channel, now), ...scheduleFor(channel, now + DAY)].filter((x) => x.start >= p.stop).slice(0, 4).map((x) => (
              <li key={x.id}>
                <button type="button" onClick={() => onSelect(x)}>
                  <span className="tnum faint">{clock(x.start, prefs.timeFormat)}</span>
                  <span>{x.title}</span>
                  {store.library.reminders.includes(x.id) && <Icon name="bell" size={14} />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
