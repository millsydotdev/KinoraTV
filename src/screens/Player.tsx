import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { nextEpisode } from '../data/catalog'
import { episodeCode, episodeRef, resolve } from '../data/refs'
import { Icon, type IconName } from '../components/Icon'
import { useToast } from '../components/Toast'
import { Art, StateBlock } from '../components/ui'
import { clock, timecode, useNow } from '../lib/time'
import { useStreamPlayback, type PlaybackState } from '../lib/playback'
import { categoryLabel, unavailableReason } from '../state/playlists'
import { useStore, type Prefs } from '../state/store'
import './Player.css'

function Menu({ icon, label, children }: { icon: IconName; label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); box.current?.querySelector('button')?.focus() } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true) }
  }, [open])
  return (
    <div className="menu" ref={box}>
      <button type="button" className="icon-btn" aria-label={label} aria-expanded={open} aria-haspopup="true" data-tip={label} onClick={() => setOpen(!open)}>
        <Icon name={icon} />
      </button>
      {open && <div className="menu-pop" role="group" aria-label={label}>{children(() => setOpen(false))}</div>}
    </div>
  )
}

function MenuOption({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={selected} className="menu-item" onClick={onSelect}>
      <span className={`menu-dot${selected ? ' is-on' : ''}`} aria-hidden="true" />
      {children}
    </button>
  )
}

/** The status line for a playlist stream; messages never contain a stream address. */
function playbackText(s: PlaybackState): string {
  if (s.message) return s.message
  if (s.status === 'buffering') return 'Buffering…'
  if (s.status === 'paused') return 'Paused'
  return 'Loading stream…'
}

export function Player() {
  const { ref = '' } = useParams()
  const navigate = useNavigate()
  const store = useStore()
  const toast = useToast()
  const now = useNow()
  const { prefs, library } = store
  const item = resolve(ref, now, store.findChannel, store.programmeAt, store.demoTitles)
  const shell = useRef<HTMLDivElement>(null)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(80)
  const [fullscreen, setFullscreen] = useState(false)

  const leave = () => (window.history.length > 1 ? navigate(-1) : navigate(item?.href ?? '/'))

  const viewed = item?.ref
  const record = store.recordView
  useEffect(() => {
    if (viewed) record(viewed)
  }, [viewed, record])

  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])

  const durationSec = item?.kind === 'movie' ? item.item.runtime * 60 : item?.kind === 'episode' ? item.item.runtime * 60 : 0
  // Imported channels play for real (HLS through Rust, see lib/playback.ts). There are no subtitle,
  // audio-track or quality controls for them, and nothing is shown as playing until media plays.
  const fromPlaylist = item?.kind === 'channel' && item.item.sourceId !== null
  const videoRef = useRef<HTMLVideoElement>(null)
  const playback = useStreamPlayback(fromPlaylist && item?.kind === 'channel' ? item.item.streamUrl : null, videoRef)
  // A restored channel has no stream address until its source refreshes (or its file is chosen again).
  const unavailable = fromPlaylist && item?.kind === 'channel' && item.item.streamUrl === null
    ? unavailableReason(store.playlists.find((s) => s.id === item.item.sourceId)) ?? 'This channel cannot play yet.'
    : null
  const saved = library.progress[ref]
  const pos = saved?.pos ?? 0
  const seek = (to: number) => {
    if (!durationSec) return
    store.setProgress(ref, Math.min(durationSec - 1, Math.max(0, to)), durationSec)
  }
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void shell.current?.requestFullscreen().catch(() => toast('Full screen is not available in this browser window'))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' && e.key !== 'Escape') return
      if (e.key === 'Escape' && !document.fullscreenElement) leave()
      if (e.key === 'f' || e.key === 'F') toggleFullscreen()
      if (fromPlaylist) {
        if ((e.key === 'm' || e.key === 'M') && playback.ready) playback.toggleMute()
        return
      }
      if (e.key === 'm' || e.key === 'M') setMuted((m) => !m)
      if (e.key === 'c' || e.key === 'C') store.setPref('subtitles', !prefs.subtitles)
      if (e.key === 'ArrowLeft' && durationSec) { e.preventDefault(); seek(pos - 10) }
      if (e.key === 'ArrowRight' && durationSec) { e.preventDefault(); seek(pos + 10) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!item) {
    return (
      <div className="page">
        <StateBlock icon="warning" title="Nothing to play here" action={<Link to="/" className="btn btn-primary">Back to Home</Link>}>
          This link does not point to anything in the current catalogue. If it was a playlist channel, its source may have been removed.
        </StateBlock>
      </div>
    )
  }

  const programme = item.kind === 'channel' ? store.programmeAt(item.item, now) : undefined
  const audioTracks = item.kind === 'movie' ? item.item.audio : ['English stereo', 'English Audio Description']
  const subtitleTracks = item.kind === 'movie' ? item.item.subtitles : ['English', 'English (SDH)']
  const next = item.kind === 'episode' ? nextEpisode(item.series, item.item) : undefined
  const watched = library.watched.includes(item.ref)
  const heading = item.kind === 'episode' ? item.series.title : item.title
  const sub = item.kind === 'episode' ? `${episodeCode(item.item)} · ${item.item.title}`
    : item.kind === 'channel' ? (programme ? `${programme.title} · until ${clock(programme.stop, prefs.timeFormat)}` : categoryLabel(item.item))
      : item.kind === 'movie' ? `(${item.item.year})` : item.meta

  return (
    <div className={`player force-dark${fullscreen ? ' is-fullscreen' : ''}`} ref={shell}>
      <Art src={item.kind === 'channel' ? programme?.art ?? '' : item.art} focus={item.focus} eager className="player-art" />
      {fromPlaylist && <video ref={videoRef} className="player-video" playsInline aria-label={`${item.title} video`} />}
      {fromPlaylist && <div className="player-video-shade" aria-hidden="true" />}
      <div className="player-top">
        <div className="player-heading">
          <h1>{heading}</h1>
          <p className="muted">{item.kind === 'channel' && (!fromPlaylist || playback.state.status === 'playing') && <span className="live-dot">Live</span>}{sub}</p>
          {fromPlaylist ? (
            playback.state.status !== 'playing' && (
              <p className="player-status" role="status">
                <Icon name="sources" size={14} />
                {unavailable ?? playbackText(playback.state)}
                {playback.state.canRetry && <>{' '}<button type="button" className="text-link" onClick={playback.retry}>Retry</button></>}
              </p>
            )
          ) : (
            <p className="player-status" role="status">
              <Icon name="sources" size={14} />
              {`No stream connected: demonstration ${item.kind === 'channel' ? 'channel' : 'title'}.`}
              {' '}<Link to="/sources" className="text-link">Manage sources</Link>
            </p>
          )}
        </div>
        <button type="button" className="icon-btn" onClick={leave} aria-label="Close player"><Icon name="close" /></button>
      </div>


      {prefs.subtitles && !fromPlaylist && <p className={`player-sub sub-line sub-${prefs.subtitleSize} sub-${prefs.subtitleStyle}`}>[Subtitles: {prefs.subtitleLanguage}]</p>}

      <div className="player-bottom">
        {durationSec > 0 && (
          <div className="scrub">
            <input
              type="range"
              className="range"
              min={0}
              max={durationSec}
              step={10}
              value={pos}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Resume point"
              aria-valuetext={`${timecode(pos)} of ${timecode(durationSec)}`}
              style={{ ['--fill' as string]: `${(pos / durationSec) * 100}%` }}
            />
            <span className="tnum">{timecode(pos)} / {timecode(durationSec)}</span>
          </div>
        )}
        <div className="player-controls">
          <div className="control-group">
            {fromPlaylist ? (
              <button type="button" className="icon-btn play-btn" disabled={!playback.ready} onClick={playback.togglePlay}
                aria-label={!playback.ready ? 'Play, unavailable until the stream loads' : playback.state.status === 'paused' ? 'Play' : 'Pause'}
                data-tip={!playback.ready ? 'Loading' : playback.state.status === 'paused' ? 'Play' : 'Pause'}>
                <Icon name={playback.ready && playback.state.status !== 'paused' ? 'pause' : 'play'} />
              </button>
            ) : (
              <button type="button" className="icon-btn play-btn" disabled aria-label="Play, unavailable: no stream connected" data-tip="No stream connected"><Icon name="play" /></button>
            )}
            {durationSec > 0 && (
              <>
                <button type="button" className="icon-btn" onClick={() => seek(pos - 10)} aria-label="Back 10 seconds" data-tip="Back 10 s"><Icon name="left" /></button>
                <button type="button" className="icon-btn" onClick={() => seek(pos + 10)} aria-label="Forward 10 seconds" data-tip="Forward 10 s"><Icon name="right" /></button>
              </>
            )}
            {fromPlaylist && playback.ready && (
              <>
                <button type="button" className="icon-btn" onClick={playback.toggleMute} aria-pressed={playback.muted} aria-label={playback.muted ? 'Unmute' : 'Mute'} data-tip={playback.muted ? 'Unmute' : 'Mute'}><Icon name={playback.muted ? 'mute' : 'volume'} /></button>
                <input type="range" className="range volume" min={0} max={100} value={playback.muted ? 0 : Math.round(playback.volume * 100)} onChange={(e) => playback.setVolume(Number(e.target.value) / 100)} aria-label="Volume" style={{ ['--fill' as string]: `${playback.muted ? 0 : Math.round(playback.volume * 100)}%` }} />
              </>
            )}
            {!fromPlaylist && (
              <>
                <button type="button" className="icon-btn" onClick={() => setMuted(!muted)} aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute'} data-tip={muted ? 'Unmute' : 'Mute'}><Icon name={muted ? 'mute' : 'volume'} /></button>
                <input type="range" className="range volume" min={0} max={100} value={muted ? 0 : volume} onChange={(e) => { setVolume(Number(e.target.value)); setMuted(Number(e.target.value) === 0) }} aria-label="Volume" style={{ ['--fill' as string]: `${muted ? 0 : volume}%` }} />
              </>
            )}
          </div>
          <div className="control-group">
            {item.kind !== 'channel' && (
              <button
                type="button"
                className="icon-btn"
                aria-pressed={watched}
                aria-label={watched ? 'Mark as not watched' : 'Mark as watched'}
                data-tip={watched ? 'Watched' : 'Mark watched'}
                onClick={() => { store.setWatched([item.ref], !watched); toast(watched ? 'Marked as not watched' : 'Marked as watched') }}
              >
                <Icon name="check" />
              </button>
            )}
            {next && item.kind === 'episode' && (
              <Link to={`/watch/${encodeURIComponent(episodeRef(item.series.id, next.id))}`} replace className="icon-btn" aria-label={`Next episode, ${episodeCode(next)}`} data-tip={`Next: ${episodeCode(next)}`}>
                <Icon name="skip" />
              </Link>
            )}
            {!fromPlaylist && <>
            <Menu icon="subtitles" label="Subtitles">
              {(close) => (
                <>
                  <p className="menu-label">Subtitles</p>
                  <MenuOption selected={!prefs.subtitles} onSelect={() => { store.setPref('subtitles', false); close() }}>Off</MenuOption>
                  {subtitleTracks.map((l) => (
                    <MenuOption key={l} selected={prefs.subtitles && prefs.subtitleLanguage === l} onSelect={() => { store.setPref('subtitles', true); store.setPref('subtitleLanguage', l); close() }}>{l}</MenuOption>
                  ))}
                </>
              )}
            </Menu>
            <Menu icon="audio" label="Audio">
              {(close) => (
                <>
                  <p className="menu-label">Audio track</p>
                  {audioTracks.map((t) => (
                    <MenuOption key={t} selected={t.startsWith(prefs.audioLanguage)} onSelect={() => { store.setPref('audioLanguage', t.split(' ')[0] ?? t); close() }}>{t}</MenuOption>
                  ))}
                </>
              )}
            </Menu>
            <Menu icon="cog" label="Quality">
              {(close) => (
                <>
                  <p className="menu-label">Quality</p>
                  {(['auto', '2160p', '1080p', '720p', '480p'] as Prefs['quality'][]).map((q) => (
                    <MenuOption key={q} selected={prefs.quality === q} onSelect={() => { store.setPref('quality', q); close() }}>{q === 'auto' ? 'Auto' : q}</MenuOption>
                  ))}
                </>
              )}
            </Menu>
            </>}
            <button type="button" className="icon-btn" onClick={toggleFullscreen} aria-pressed={fullscreen} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} data-tip="Full screen"><Icon name="fullscreen" /></button>
          </div>
        </div>
      </div>
    </div>
  )
}
