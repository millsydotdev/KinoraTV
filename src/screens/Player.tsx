import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { nextEpisode } from '../data/catalog'
import { channelRef, episodeCode, episodeRef, resolve } from '../data/refs'
import { Icon, type IconName } from '../components/Icon'
import { useToast } from '../components/Toast'
import { Art, ChannelMark, ProgrammeArt, StateBlock } from '../components/ui'
import { XtreamArt } from '../components/Tiles'
import { startOfDay } from '../data/channels'
import { clock, timecode, useNow } from '../lib/time'
import { playbackText, useStreamPlayback } from '../lib/playback'
import { categoryLabel, unavailableReason } from '../state/playlists'
import { useStore } from '../state/store'
import { isChannelKidSafe, isTitleKidSafe } from '../lib/kidsMode'
import type { StreamVariant } from '../data/types'
import { testStreamVariant, type StreamTestRecord } from '../lib/streamTesting'
import { CollapsibleSection } from '../components/CollapsibleSection'
import { TechnicalBadge } from '../components/TechnicalBadges'
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

function getBufferAhead(video: HTMLVideoElement | null): string {
  if (!video || !video.buffered.length) return '0.0s (Live edge)'
  try {
    const cur = video.currentTime
    for (let i = 0; i < video.buffered.length; i++) {
      const start = video.buffered.start(i)
      const end = video.buffered.end(i)
      if (cur >= start && cur <= end) {
        return `${(end - cur).toFixed(1)}s ahead`
      }
    }
  } catch {
    // Ignore
  }
  return '0.0s (Live edge)'
}

export function Player() {
  const { ref = '' } = useParams()
  const navigate = useNavigate()
  const store = useStore()
  const toast = useToast()
  const now = useNow()
  const { prefs, library } = store
  const item = resolve(ref, now, store.findChannel, store.programmeAt, store.demoTitles, store.findXtreamMovie, store.findXtreamSeries, store.findXtreamEpisode)
  const shell = useRef<HTMLDivElement>(null)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(80)
  const [fullscreen, setFullscreen] = useState(false)
  const [aspectRatio, setAspectRatio] = useState<'auto' | '16:9' | '4:3' | 'fill'>('auto')
  const [pip, setPip] = useState(false)
  const [inAppPip, setInAppPip] = useState(false)
  const [rippleFeedback, setRippleFeedback] = useState<{ side: 'left' | 'right'; text: string } | null>(null)
  const rippleTimer = useRef<number>(0)

  // Drawer states
  const [activeDrawer, setActiveDrawer] = useState<'none' | 'servers' | 'diagnostics' | 'epg'>('none')
  const [controlsVisible, setControlsVisible] = useState(true)
  const hideTimerRef = useRef<number>(0)

  // Player capabilities expansion: speed, sleep timer, diagnostics HUD, delay calibration, up next
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0)
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null)
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState<number | null>(null)
  const [statsHudOpen, setStatsHudOpen] = useState(false)
  const [audioDelayMs, setAudioDelayMs] = useState(0)
  const [subDelaySecs, setSubDelaySecs] = useState(0)
  const [rememberOffsets, setRememberOffsets] = useState(false)
  const [upNextDismissed, setUpNextDismissed] = useState(false)

  // Stream auto-retry on dropout
  const [retryAttempt, setRetryAttempt] = useState(0)
  const [retryTimerRemaining, setRetryTimerRemaining] = useState<number | null>(null)
  const retryIntervalRef = useRef<number>(0)

  // Channel number keypad input
  const [channelInput, setChannelInput] = useState('')
  const channelInputTimer = useRef<number>(0)

  // Fallback state
  const [attemptedServers, setAttemptedServers] = useState<Set<string>>(new Set())
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null)

  // Stream variant testing in player
  const [testingVariantId, setTestingVariantId] = useState<string | null>(null)
  const [variantTestResults, setVariantTestResults] = useState<Record<string, StreamTestRecord>>({})

  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    if (activeDrawer === 'none') {
      hideTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false)
      }, 3500)
    }
  }, [activeDrawer])

  useEffect(() => {
    showControls()
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    }
  }, [showControls])

  const leave = () => (window.history.length > 1 ? navigate(-1) : navigate(item?.href ?? '/'))

  const isRestricted = store.isKidsMode && item && (
    item.kind === 'channel'
      ? !isChannelKidSafe(item.item)
      : item.kind === 'movie' && 'certificate' in item.item
        ? !isTitleKidSafe(item.item)
        : item.kind === 'episode' && 'series' in item && item.series && 'certificate' in item.series
          ? !isTitleKidSafe(item.series)
          : false
  )

  if (isRestricted) {
    return (
      <div className="player-restricted-barrier" style={{ display: 'grid', placeItems: 'center', height: '100vh', background: 'var(--bg, #0b0d10)', color: '#fff', padding: '24px' }}>
        <div style={{ maxWidth: '440px', textAlign: 'center', background: 'var(--card-bg, #1a1e24)', border: '1px solid var(--line)', borderRadius: '16px', padding: '32px' }}>
          <div style={{ display: 'grid', placeItems: 'center', marginBottom: '16px', color: 'var(--accent, #e50914)' }}>
            <Icon name="lock" size={48} />
          </div>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>Restricted in Kids Mode</h2>
          <p style={{ color: 'var(--text-2)', fontSize: '0.95rem', marginBottom: '24px' }}>
            <strong>{item?.title ?? 'This content'}</strong> is rated 12A/15/18 or contains mature themes that are blocked under this profile.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button type="button" className="btn btn-secondary" onClick={leave}>
              Back to Safety
            </button>
            <Link to="/settings/profiles" className="btn btn-primary">
              Switch Profile
            </Link>
          </div>
        </div>
      </div>
    )
  }

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

  const demoMovie = item?.kind === 'movie' && 'runtime' in item.item ? item.item : null
  const recItem = item?.kind === 'recording' ? store.recordings.find((r) => r.id === item.item.id) : undefined
  const durationSec = demoMovie
    ? demoMovie.runtime * 60
    : item?.kind === 'episode'
      ? ('runtime' in item.item ? item.item.runtime * 60 : (item.item.runtimeSeconds ?? 0))
      : item?.kind === 'recording'
        ? (recItem?.durationSecs ?? item.item.durationSecs ?? 0)
        : item?.kind === 'catchup'
          ? (item.item.durationMins * 60)
          : 0

  // Imported channels and provider streams play for real (HLS through Rust, see lib/playback.ts)
  const channelItem = item?.kind === 'channel' ? item.item : null
  const fromPlaylist = channelItem !== null && channelItem.sourceId !== null
  const itemStreamUrl = item && 'streamUrl' in item ? item.streamUrl : null
  const hasRealStream = fromPlaylist || Boolean(itemStreamUrl)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Timeshift & Live Recording state
  const [timeshiftOffsetSecs, setTimeshiftOffsetSecs] = useState(0)
  const isTimeshiftDelayed = timeshiftOffsetSecs > 0
  const maxTimeshiftSecs = (store.dvrConfig?.timeshiftBufferMins ?? 60) * 60

  const seekTimeshift = (deltaSecs: number) => {
    setTimeshiftOffsetSecs((prev) => Math.max(0, Math.min(maxTimeshiftSecs, prev - deltaSecs)))
    if (videoRef.current) {
      try {
        const bufferedStart = videoRef.current.buffered.length > 0 ? videoRef.current.buffered.start(0) : 0
        const minTime = bufferedStart + 0.5
        const target = Math.max(minTime, videoRef.current.currentTime + deltaSecs)
        videoRef.current.currentTime = target
      } catch {
        // Ignore if video not seekable yet
      }
    }
  }

  const jumpToLiveEdge = () => {
    setTimeshiftOffsetSecs(0)
    if (videoRef.current && videoRef.current.buffered.length > 0) {
      try {
        const end = videoRef.current.buffered.end(videoRef.current.buffered.length - 1)
        videoRef.current.currentTime = Math.max(0, end - 0.5)
      } catch {
        // Ignore
      }
    }
  }

  const activeChannelRecording = channelItem
    ? store.recordings.find((r) => r.channelId === channelItem.id && r.status === 'recording')
    : undefined

  const streamOptions: StreamVariant[] = useMemo(() => {
    if (!channelItem) return []
    if (channelItem.streamOptions && channelItem.streamOptions.length > 0) {
      return channelItem.streamOptions
    }
    if (channelItem.sourceId) {
      const srcName = store.playlists.find((s) => s.id === channelItem.sourceId)?.name ?? 'Source'
      return [{
        id: channelItem.id,
        channelId: channelItem.id,
        sourceId: channelItem.sourceId,
        sourceName: srcName,
        name: `Server 1 - ${srcName} - ${channelItem.hd ? 'HD' : 'SD'}`,
        streamUrl: channelItem.streamUrl,
        availability: channelItem.streamUrl ? 'untested' : 'unavailable',
        quality: channelItem.hd ? 'HD' : 'SD',
      }]
    }
    return []
  }, [channelItem, store.playlists])

  const preferredServer = channelItem ? store.getPreferredServer(channelItem) : undefined
  const [streamSelection, setStreamSelection] = useState(() => ({
    ref: item?.ref ?? '',
    id: preferredServer?.id ?? streamOptions[0]?.id ?? '',
  }))

  useEffect(() => {
    if (item?.ref) {
      const preferred = channelItem ? store.getPreferredServer(channelItem) : undefined
      setStreamSelection({
        ref: item.ref,
        id: preferred?.id ?? streamOptions[0]?.id ?? '',
      })
      setAttemptedServers(new Set())
      setFallbackNotice(null)
    }
  }, [item?.ref, channelItem, streamOptions, store])

  const streamOptionId = streamSelection.ref === item?.ref ? streamSelection.id : (preferredServer?.id ?? streamOptions[0]?.id ?? '')
  const streamOption = streamOptions.find((option) => option.id === streamOptionId) ?? streamOptions[0]
  const realStreamUrl = fromPlaylist ? (streamOption?.streamUrl ?? null) : itemStreamUrl

  const playback = useStreamPlayback(hasRealStream ? (realStreamUrl ?? null) : null, videoRef, prefs)

  // Automatic fallback on stream playback failure
  useEffect(() => {
    if (!fromPlaylist || !channelItem || streamOptions.length <= 1) return
    if (playback.state.status === 'error' || playback.state.status === 'unsupported') {
      if (store.autoFallbackEnabled && streamOption) {
        setAttemptedServers((prev) => {
          const nextSet = new Set(prev)
          nextSet.add(streamOption.id)
          const nextCandidate = streamOptions.find((opt) => !nextSet.has(opt.id) && opt.streamUrl)
          if (nextCandidate && item) {
            setFallbackNotice(`Server "${streamOption.name ?? 'current'}" failed. Trying "${nextCandidate.name}"...`)
            setStreamSelection({ ref: item.ref, id: nextCandidate.id })
          } else if (nextSet.size >= streamOptions.length) {
            setFallbackNotice('All available servers for this channel have been attempted.')
          }
          return nextSet
        })
      }
    }
  }, [playback.state.status, fromPlaylist, channelItem, streamOptions, streamOption, item?.ref, store.autoFallbackEnabled])

  // Automated exponential backoff auto-retry for stream errors (Audit #46)
  useEffect(() => {
    if (playback.state.status === 'playing') {
      setRetryAttempt(0)
      setRetryTimerRemaining(null)
      if (retryIntervalRef.current) clearInterval(retryIntervalRef.current)
      return
    }

    if (playback.state.status === 'error' && playback.state.canRetry && retryAttempt < 5) {
      const backoffSecs = Math.min(16, Math.pow(2, retryAttempt))
      setRetryTimerRemaining(backoffSecs)
      if (retryIntervalRef.current) clearInterval(retryIntervalRef.current)

      retryIntervalRef.current = window.setInterval(() => {
        setRetryTimerRemaining((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(retryIntervalRef.current)
            setRetryAttempt((a) => a + 1)
            playback.retry()
            return null
          }
          return prev - 1
        })
      }, 1000)
    }

    return () => {
      if (retryIntervalRef.current) clearInterval(retryIntervalRef.current)
    }
  }, [playback.state.status, playback.state.canRetry, retryAttempt, playback.retry])

  // Instant auto-reconnect upon network restoration (Audit #87)
  useEffect(() => {
    const handleOnline = () => {
      if (playback.state.status === 'error' && playback.state.canRetry) {
        if (retryIntervalRef.current) clearInterval(retryIntervalRef.current)
        setRetryTimerRemaining(null)
        setRetryAttempt(0)
        playback.retry()
      }
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('kinora:network-online', handleOnline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('kinora:network-online', handleOnline)
    }
  }, [playback.state.status, playback.state.canRetry, playback.retry])

  // Persistent audio delay and subtitle offset (Audit #47)
  const offsetTargetId = channelItem?.id ?? streamOption?.id ?? ref
  useEffect(() => {
    try {
      const raw = localStorage.getItem('kinora.stream_offsets.v1')
      if (raw) {
        const stored = JSON.parse(raw) as Record<string, { audioDelayMs?: number; subDelaySecs?: number }>
        const found = stored[offsetTargetId]
        if (found) {
          setAudioDelayMs(found.audioDelayMs ?? 0)
          setSubDelaySecs(found.subDelaySecs ?? 0)
          setRememberOffsets(true)
          return
        }
      }
    } catch {}
    setAudioDelayMs(0)
    setSubDelaySecs(0)
    setRememberOffsets(false)
  }, [offsetTargetId])

  const saveOffsets = (audioMs: number, subSecs: number, remember: boolean) => {
    setAudioDelayMs(audioMs)
    setSubDelaySecs(subSecs)
    setRememberOffsets(remember)
    try {
      const raw = localStorage.getItem('kinora.stream_offsets.v1')
      const stored = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
      if (remember) {
        stored[offsetTargetId] = { audioDelayMs: audioMs, subDelaySecs: subSecs }
      } else {
        delete stored[offsetTargetId]
      }
      localStorage.setItem('kinora.stream_offsets.v1', JSON.stringify(stored))
    } catch {}
  }

  const unavailable = fromPlaylist && channelItem && streamOption?.streamUrl === null
    ? unavailableReason(store.playlists.find((s) => s.id === streamOption.sourceId)) ?? 'This channel cannot play yet.'
    : null

  const saved = library.progress[ref]
  const pos = saved?.pos ?? 0
  const seek = (to: number) => {
    if (!durationSec) return
    store.setProgress(ref, Math.min(durationSec - 1, Math.max(0, to)), durationSec)
  }

  // Playback rate sync
  useEffect(() => {
    if (videoRef.current) {
      try {
        videoRef.current.playbackRate = playbackSpeed
      } catch {}
    }
  }, [playbackSpeed, hasRealStream, playback.state.status])

  // Sleep timer countdown
  useEffect(() => {
    if (sleepTimerRemaining === null || sleepTimerRemaining <= 0) return
    const interval = window.setInterval(() => {
      setSleepTimerRemaining((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval)
          if (playback.ready && playback.state.status === 'playing') {
            playback.togglePlay()
          }
          toast('Sleep timer: Playback stopped')
          return null
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [sleepTimerRemaining, playback, toast])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void shell.current?.requestFullscreen().catch(() => toast('Full screen is not available in this browser window'))
  }

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const onEnter = () => setPip(true)
    const onLeave = () => setPip(false)
    el.addEventListener('enterpictureinpicture', onEnter)
    el.addEventListener('leavepictureinpicture', onLeave)
    return () => {
      el.removeEventListener('enterpictureinpicture', onEnter)
      el.removeEventListener('leavepictureinpicture', onLeave)
    }
  }, [hasRealStream])

  const togglePip = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else if (videoRef.current && 'requestPictureInPicture' in videoRef.current) {
        await videoRef.current.requestPictureInPicture()
      } else {
        throw new Error('Native Picture-in-Picture unavailable')
      }
    } catch {
      setInAppPip((prev) => !prev)
      toast('Picture-in-Picture fallback: using in-app floating player')
    }
  }

  // Channel stepping
  const channelList = store.channels
  const currentChannelIndex = channelItem ? channelList.findIndex((c) => c.id === channelItem.id || c.memberIds?.includes(channelItem.id)) : -1

  const stepChannel = useCallback((delta: number) => {
    if (currentChannelIndex < 0 || channelList.length === 0) return
    const nextIndex = (currentChannelIndex + delta + channelList.length) % channelList.length
    const nextChan = channelList[nextIndex]
    if (nextChan) {
      navigate(`/watch/${encodeURIComponent(channelRef(nextChan.id))}`)
    }
  }, [currentChannelIndex, channelList, navigate])

  const handleDigit = useCallback((digit: string) => {
    const nextDigits = channelInput + digit
    setChannelInput(nextDigits)
    showControls()
    if (channelInputTimer.current) window.clearTimeout(channelInputTimer.current)
    channelInputTimer.current = window.setTimeout(() => {
      const num = parseInt(nextDigits, 10)
      setChannelInput('')
      const target = store.channels.find((c) => c.number === num)
      if (target) {
        navigate(`/watch/${encodeURIComponent(channelRef(target.id))}`)
      } else {
        toast(`Channel ${num} not found.`)
      }
    }, 2000)
  }, [channelInput, store.channels, navigate, toast, showControls])

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      showControls()
      const t = e.target as HTMLElement
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName) || t.isContentEditable) {
        if (e.key === 'Escape') {
          // Allow Escape to close drawers/overlays
        } else {
          return
        }
      }

      if (e.key >= '0' && e.key <= '9' && !e.ctrlKey && !e.metaKey && !e.altKey && channelItem) {
        handleDigit(e.key)
        return
      }

      if (e.key === 'Escape') {
        if (activeDrawer !== 'none') {
          setActiveDrawer('none')
          return
        }
        if (document.fullscreenElement) {
          void document.exitFullscreen()
          return
        }
        leave()
        return
      }

      if (e.key === 'f' || e.key === 'F') toggleFullscreen()
      if (e.key === 's' || e.key === 'S') setActiveDrawer((d) => (d === 'servers' ? 'none' : 'servers'))
      if (e.key === 'd' || e.key === 'D' || e.key === 'i' || e.key === 'I') {
        if (e.shiftKey) {
          e.preventDefault()
          setStatsHudOpen((prev) => !prev)
          return
        }
        setActiveDrawer((d) => (d === 'diagnostics' ? 'none' : 'diagnostics'))
      }
      if (e.key === 'g' || e.key === 'G' || e.key === 'e' || e.key === 'E') setActiveDrawer((d) => (d === 'epg' ? 'none' : 'epg'))

      if (channelItem) {
        if (e.key === 'PageUp' || e.key === ']') { e.preventDefault(); stepChannel(1) }
        if (e.key === 'PageDown' || e.key === '[') { e.preventDefault(); stepChannel(-1) }
      }

      if (hasRealStream) {
        if ((e.key === 'm' || e.key === 'M') && playback.ready) playback.toggleMute()
        if (e.key === ' ' && playback.ready && t.tagName !== 'BUTTON') { e.preventDefault(); playback.togglePlay() }
        if ((e.key === 'c' || e.key === 'C') && playback.tracks.subtitles.length > 0) playback.setSubtitleTrack(playback.tracks.subtitleId >= 0 ? -1 : playback.tracks.subtitles[0]?.id ?? -1)
        if (e.key === 'ArrowUp' && playback.ready) { e.preventDefault(); playback.setVolume(Math.min(1, playback.volume + 0.05)) }
        if (e.key === 'ArrowDown' && playback.ready) { e.preventDefault(); playback.setVolume(Math.max(0, playback.volume - 0.05)) }
        return
      }

      if (e.key === 'm' || e.key === 'M') setMuted((m) => !m)
      if (e.key === 'c' || e.key === 'C') store.setPref('subtitles', !prefs.subtitles)
      if (e.key === 'ArrowLeft' && durationSec) { e.preventDefault(); seek(pos - 10) }
      if (e.key === 'ArrowRight' && durationSec) { e.preventDefault(); seek(pos + 10) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setVolume((v) => Math.min(100, v + 5)) }
      if (e.key === 'ArrowDown') { e.preventDefault(); setVolume((v) => Math.max(0, v - 5)) }
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
  const audioTracks: string[] = demoMovie ? demoMovie.audio : ['English stereo', 'English Audio Description']
  const subtitleTracks: string[] = demoMovie ? demoMovie.subtitles : ['English', 'English (SDH)']
  const next = item.kind === 'episode' && item.series && 'seasons' in item.series ? nextEpisode(item.series, item.item as any) : undefined
  const watched = library.watched.includes(item.ref)
  const heading = item.kind === 'episode' ? (item.series && 'title' in item.series ? item.series.title : item.title)
    : item.kind === 'recording' && recItem ? recItem.title
      : item.title
  const sub = item.kind === 'episode' ? `${episodeCode(item.item)} · ${item.item.title}`
    : item.kind === 'channel' ? (programme ? `${programme.title} · until ${clock(programme.stop, prefs.timeFormat)}` : categoryLabel(item.item))
      : item.kind === 'recording' && recItem ? `${recItem.channelName} · DVR Recording`
        : item.kind === 'catchup' ? `Catch-up TV · ${item.item.durationMins}m`
          : item.kind === 'movie' ? `(${item.item.year})` : item.meta

  const handleSelectServer = (variant: StreamVariant) => {
    setStreamSelection({ ref: item.ref, id: variant.id })
    store.setPreferredServer(channelItem?.id ?? '', variant.id)
    toast(`Switched to ${variant.name || variant.sourceName}`)
  }

  const handleTestVariant = async (variant: StreamVariant) => {
    setTestingVariantId(variant.id)
    try {
      const res = await testStreamVariant(variant)
      setVariantTestResults((prev) => ({ ...prev, [variant.id]: res }))
    } finally {
      setTestingVariantId(null)
    }
  }

  // Active schedule for quick EPG
  const todaySchedule = useMemo(() => {
    if (!channelItem) return []
    return store.schedule(channelItem, startOfDay(now))
  }, [channelItem, store, now])

  const handleVideoCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    showControls()
    if (e.detail === 2) {
      const rect = e.currentTarget.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      if (clickX < rect.width * 0.4) {
        if (hasRealStream) {
          seekTimeshift(-10)
        } else if (durationSec) {
          seek(pos - 10)
        }
        setRippleFeedback({ side: 'left', text: '-10s' })
        if (rippleTimer.current) window.clearTimeout(rippleTimer.current)
        rippleTimer.current = window.setTimeout(() => setRippleFeedback(null), 800)
      } else if (clickX > rect.width * 0.6) {
        if (hasRealStream) {
          seekTimeshift(10)
        } else if (durationSec) {
          seek(pos + 10)
        }
        setRippleFeedback({ side: 'right', text: '+10s' })
        if (rippleTimer.current) window.clearTimeout(rippleTimer.current)
        rippleTimer.current = window.setTimeout(() => setRippleFeedback(null), 800)
      }
    }
  }

  return (
    <div
      className={`player force-dark${fullscreen ? ' is-fullscreen' : ''}${inAppPip ? ' is-in-app-pip' : ''}${!controlsVisible && activeDrawer === 'none' ? ' controls-hidden' : ''}`}
      ref={shell}
      onMouseMove={showControls}
      onClick={handleVideoCanvasClick}
    >
      {/* Background artwork when video has not yet rendered */}
      {item.kind === 'channel' ? (
        (programme?.art || programme?.icon) ? (
          <ProgrammeArt programme={programme} focus={item.focus} eager className="player-art" />
        ) : (
          <div className="player-art player-channel-ambient" style={{ background: `radial-gradient(ellipse at 50% 35%, ${item.item.mark.tone}33 0%, rgba(10,12,18,0.95) 75%)` }} />
        )
      ) : 'artworkKey' in item && item.artworkKey ? (
        <XtreamArt artworkKey={item.artworkKey} alt={item.title} eager className="player-art" />
      ) : (
        <Art src={item.art} focus={item.focus} eager className="player-art" />
      )}

      {/* Primary Video Element */}
      {hasRealStream && (
        <video
          ref={videoRef}
          className={`player-video cue-${prefs.subtitleSize} cue-${prefs.subtitleStyle}`}
          playsInline
          aria-label={`${item.title} video`}
          style={{
            objectFit: aspectRatio === 'fill' ? 'cover' : 'contain',
            aspectRatio: aspectRatio === '16:9' ? '16 / 9' : aspectRatio === '4:3' ? '4 / 3' : undefined,
          }}
        />
      )}
      {hasRealStream && <div className="player-video-shade" aria-hidden="true" />}

      {/* Double-Click Fast Forward / Rewind Ripple (Audit #51) */}
      {rippleFeedback && (
        <div className={`player-seek-ripple is-${rippleFeedback.side}`} aria-hidden="true">
          <Icon name={rippleFeedback.side === 'left' ? 'left' : 'right'} size={24} />
          <span>{rippleFeedback.text}</span>
        </div>
      )}

      {/* Channel Number Keypad Indicator (Audit #48) */}
      {channelInput && (
        <div className="player-channel-entry player-channel-osd-badge" role="status" aria-live="polite">
          <Icon name="tv" size={24} />
          <span className="player-channel-osd-text">Tune: <strong>{channelInput}</strong>…</span>
        </div>
      )}

      {/* Fallback Notice Banner */}
      {fallbackNotice && (
        <div className="player-fallback-banner" role="alert">
          <Icon name="warning" size={16} />
          <span>{fallbackNotice}</span>
          <button type="button" className="text-link" onClick={() => setFallbackNotice(null)}>Dismiss</button>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="player-top">
        <div className="player-heading">
          <div className="player-heading-title">
            {item.kind === 'channel' && <ChannelMark channel={item.item} size={36} />}
            <h1>{channelItem ? `${channelItem.number} ${channelItem.name}` : heading}</h1>
          </div>
          <p className="muted" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {item.kind === 'channel' && (
              isTimeshiftDelayed ? (
                <>
                  <span className="live-dot" style={{ background: '#f59e0b' }} data-testid="timeshift-delay-badge">
                    -{timecode(timeshiftOffsetSecs)}
                  </span>
                  <button
                    type="button"
                    className="btn ghost sm"
                    style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                    onClick={jumpToLiveEdge}
                    data-testid="jump-to-live-btn"
                  >
                    Jump to Live
                  </button>
                </>
              ) : (
                (!hasRealStream || playback.state.status === 'playing') && <span className="live-dot" data-testid="live-edge-badge">Live</span>
              )
            )}
            <span>{sub}</span>
          </p>
          {hasRealStream ? (
            playback.state.status !== 'playing' && (
              <p className="player-status" role="status">
                <Icon name="sources" size={14} />
                {unavailable ?? playbackText(playback.state)}
                {retryTimerRemaining !== null && (
                  <span className="player-reconnect-ticker">
                    {' '}(Reconnecting in {retryTimerRemaining}s, attempt {retryAttempt + 1} of 5)
                  </span>
                )}
                {playback.state.canRetry && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => {
                        if (retryIntervalRef.current) clearInterval(retryIntervalRef.current)
                        setRetryTimerRemaining(null)
                        playback.retry()
                      }}
                    >
                      Retry
                    </button>
                    {retryTimerRemaining !== null && (
                      <button
                        type="button"
                        className="text-link"
                        style={{ marginLeft: 6 }}
                        onClick={() => {
                          if (retryIntervalRef.current) clearInterval(retryIntervalRef.current)
                          setRetryTimerRemaining(null)
                          setRetryAttempt(5)
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </>
                )}
              </p>
            )
          ) : (
            <p className="player-status" role="status">
              <Icon name="sources" size={14} />
              {`No stream connected: sample ${item.kind === 'channel' ? 'channel' : 'title'}.`}
              {' '}<Link to="/sources" className="text-link">Manage sources</Link>
            </p>
          )}
        </div>
        <button type="button" className="icon-btn" onClick={leave} aria-label="Close player"><Icon name="close" /></button>
      </div>

      {prefs.subtitles && !hasRealStream && <p className={`player-sub sub-line sub-${prefs.subtitleSize} sub-${prefs.subtitleStyle}`}>[Subtitles: {prefs.subtitleLanguage}]</p>}

      {/* Floating Interactive Skip Intro Button */}
      {item.kind === 'episode' && pos >= 10 && pos <= 95 && (
        <button
          type="button"
          className="player-skip-intro-btn"
          onClick={() => {
            seek(pos + 85)
            if (videoRef.current) {
              try { videoRef.current.currentTime += 85 } catch {}
            }
            toast('Skipped intro (+85s)')
          }}
          aria-label="Skip Intro sequence"
          data-tip="Skip Intro (+85s)"
        >
          <Icon name="skip" size={16} />
          <span>Skip Intro (+85s)</span>
        </button>
      )}

      {/* Up Next Episode Card */}
      {next && item.kind === 'episode' && item.series && 'id' in item.series && !upNextDismissed && durationSec > 0 && (durationSec - pos <= 35) && (
        <div className="player-up-next-card" role="region" aria-label="Up next episode">
          <div className="up-next-header">
            <span className="up-next-badge">UP NEXT</span>
            <span className="up-next-countdown faint tnum">{Math.max(1, durationSec - pos)}s</span>
          </div>
          <p className="up-next-title">{episodeCode(next)}: {next.title}</p>
          <div className="up-next-actions">
            <Link
              to={`/watch/${encodeURIComponent(episodeRef(item.series.id, next.id))}`}
              replace
              className="btn btn-primary btn-small"
            >
              <Icon name="play" size={14} />
              <span>Play Now</span>
            </Link>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => setUpNextDismissed(true)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Real-Time Stats for Nerds HUD */}
      {statsHudOpen && (
        <div className="player-stats-hud" role="region" aria-label="Stream Statistics">
          <div className="stats-hud-header">
            <strong>STATS FOR NERDS</strong>
            <button type="button" className="icon-btn" style={{ padding: 2 }} onClick={() => setStatsHudOpen(false)} aria-label="Close stats HUD">
              <Icon name="close" size={12} />
            </button>
          </div>
          <div className="stats-hud-body">
            <div><span className="faint">Resolution:</span> <strong>{videoRef.current?.videoWidth ? `${videoRef.current.videoWidth} × ${videoRef.current.videoHeight}` : 'Detecting...'}</strong></div>
            <div><span className="faint">Buffer ahead:</span> <strong>{getBufferAhead(videoRef.current)}</strong></div>
            <div><span className="faint">Speed:</span> <strong>{playbackSpeed}x</strong></div>
            <div><span className="faint">Status:</span> <strong>{hasRealStream ? playback.state.status : 'Simulated'}</strong></div>
            <div><span className="faint">Protocol:</span> <strong>{hasRealStream ? 'HLS (kstream://)' : 'Sample'}</strong></div>
            <div><span className="faint">Audio offset:</span> <strong>{audioDelayMs} ms</strong></div>
            <div><span className="faint">Subtitle offset:</span> <strong>{subDelaySecs.toFixed(1)} s</strong></div>
          </div>
        </div>
      )}

      {/* Bottom Controls Bar */}
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
            {hasRealStream ? (
              <button
                type="button"
                className="icon-btn play-btn"
                disabled={!playback.ready}
                onClick={playback.togglePlay}
                aria-label={!playback.ready ? 'Play, unavailable until the stream loads' : playback.state.status === 'paused' ? 'Play' : 'Pause'}
                data-tip={!playback.ready ? 'Loading' : playback.state.status === 'paused' ? 'Play' : 'Pause'}
              >
                <Icon name={playback.ready && playback.state.status !== 'paused' ? 'pause' : 'play'} />
              </button>
            ) : (
              <button type="button" className="icon-btn play-btn" disabled aria-label="Play, unavailable: no stream connected" data-tip="No stream connected"><Icon name="play" /></button>
            )}

            {channelItem && (
              <>
                <button type="button" className="icon-btn" onClick={() => stepChannel(-1)} aria-label="Previous channel" data-tip="Previous Channel ([)">
                  <Icon name="up" />
                </button>
                <button type="button" className="icon-btn" onClick={() => stepChannel(1)} aria-label="Next channel" data-tip="Next Channel (])">
                  <Icon name="down" />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => seekTimeshift(-15)}
                  aria-label="Rewind live TV 15 seconds"
                  data-tip="Rewind 15s"
                  data-testid="timeshift-rewind-btn"
                >
                  <Icon name="left" />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={!isTimeshiftDelayed}
                  onClick={() => seekTimeshift(15)}
                  aria-label="Fast-forward live TV 15 seconds"
                  data-tip="Forward 15s"
                  data-testid="timeshift-forward-btn"
                >
                  <Icon name="right" />
                </button>
                <button
                  type="button"
                  className={`icon-btn ${activeChannelRecording ? 'is-active' : ''}`}
                  style={activeChannelRecording ? { color: '#ef4444' } : undefined}
                  onClick={async () => {
                    if (activeChannelRecording) {
                      await store.stopRecording(activeChannelRecording.id)
                      toast(`Stopped recording "${activeChannelRecording.title}"`)
                    } else {
                      const title = programme?.title ?? `${channelItem.name} Live Broadcast`
                      await store.startRecording(channelItem.id, channelItem.name, title, {
                        channelLogo: channelItem.logoUrl,
                        programmeId: programme?.id,
                        description: programme?.desc,
                      })
                      toast(`Started recording "${title}"`)
                    }
                  }}
                  aria-label={activeChannelRecording ? 'Stop recording' : 'Record live TV'}
                  data-tip={activeChannelRecording ? 'Stop Recording' : 'Record Live TV'}
                  data-testid="player-record-btn"
                >
                  <Icon name="record" />
                </button>
              </>
            )}

            {durationSec > 0 && (
              <>
                <button type="button" className="icon-btn" onClick={() => seek(pos - 10)} aria-label="Back 10 seconds" data-tip="Back 10 s"><Icon name="left" /></button>
                <button type="button" className="icon-btn" onClick={() => seek(pos + 10)} aria-label="Forward 10 seconds" data-tip="Forward 10 s"><Icon name="right" /></button>
              </>
            )}

            {hasRealStream && playback.ready && (
              <>
                <button type="button" className="icon-btn" onClick={playback.toggleMute} aria-pressed={playback.muted} aria-label={playback.muted ? 'Unmute' : 'Mute'} data-tip={playback.muted ? 'Unmute' : 'Mute'}>
                  <Icon name={playback.muted ? 'mute' : 'volume'} />
                </button>
                <input type="range" className="range volume" min={0} max={100} value={playback.muted ? 0 : Math.round(playback.volume * 100)} onChange={(e) => playback.setVolume(Number(e.target.value) / 100)} aria-label="Volume" style={{ ['--fill' as string]: `${playback.muted ? 0 : Math.round(playback.volume * 100)}%` }} />
              </>
            )}
            {!hasRealStream && (
              <>
                <button type="button" className="icon-btn" onClick={() => setMuted(!muted)} aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute'} data-tip={muted ? 'Unmute' : 'Mute'}><Icon name={muted ? 'mute' : 'volume'} /></button>
                <input type="range" className="range volume" min={0} max={100} value={muted ? 0 : volume} onChange={(e) => { setVolume(Number(e.target.value)); setMuted(Number(e.target.value) === 0) }} aria-label="Volume" style={{ ['--fill' as string]: `${muted ? 0 : volume}%` }} />
              </>
            )}
          </div>

          <div className="control-group">
            {/* Server Selector Trigger */}
            {fromPlaylist && streamOptions.length > 0 && (
              <button
                type="button"
                className={`icon-btn ${activeDrawer === 'servers' ? 'is-active' : ''}`}
                onClick={() => setActiveDrawer((d) => (d === 'servers' ? 'none' : 'servers'))}
                aria-label={`Server selector: ${streamOptions.length} available`}
                data-tip={`Servers (${streamOptions.length}) (S)`}
              >
                <Icon name="sources" />
              </button>
            )}

            {/* Quick EPG Trigger */}
            {channelItem && (
              <button
                type="button"
                className={`icon-btn ${activeDrawer === 'epg' ? 'is-active' : ''}`}
                onClick={() => setActiveDrawer((d) => (d === 'epg' ? 'none' : 'epg'))}
                aria-label="Quick TV Guide"
                data-tip="Channel Guide (G)"
              >
                <Icon name="guide" />
              </button>
            )}

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

            {next && item.kind === 'episode' && item.series && 'id' in item.series && (
              <Link to={`/watch/${encodeURIComponent(episodeRef(item.series.id, next.id))}`} replace className="icon-btn" aria-label={`Next episode, ${episodeCode(next)}`} data-tip={`Next: ${episodeCode(next)}`}>
                <Icon name="skip" />
              </Link>
            )}

            {hasRealStream && playback.tracks.subtitles.length > 0 && (
              <Menu icon="subtitles" label="Subtitles">
                {(close) => (
                  <>
                    <p className="menu-label">Subtitles</p>
                    <MenuOption selected={playback.tracks.subtitleId < 0} onSelect={() => { playback.setSubtitleTrack(-1); store.setPref('subtitles', false); close() }}>Off</MenuOption>
                    {playback.tracks.subtitles.map((t) => (
                      <MenuOption key={t.id} selected={playback.tracks.subtitleId === t.id} onSelect={() => { playback.setSubtitleTrack(t.id); store.setPref('subtitles', true); close() }}>{t.label}</MenuOption>
                    ))}
                  </>
                )}
              </Menu>
            )}

            {hasRealStream && playback.tracks.audio.length > 1 && (
              <Menu icon="audio" label="Audio">
                {(close) => (
                  <>
                    <p className="menu-label">Audio track</p>
                    {playback.tracks.audio.map((t) => (
                      <MenuOption key={t.id} selected={playback.tracks.audioId === t.id} onSelect={() => { playback.setAudioTrack(t.id); close() }}>{t.label}</MenuOption>
                    ))}
                  </>
                )}
              </Menu>
            )}

            {hasRealStream && playback.tracks.levels.length > 1 && (
              <Menu icon="cog" label="Quality">
                {(close) => (
                  <>
                    <p className="menu-label">Quality</p>
                    <MenuOption selected={playback.tracks.levelId < 0} onSelect={() => { playback.setLevel(-1); close() }}>Auto</MenuOption>
                    {playback.tracks.levels.map((l) => (
                      <MenuOption key={l.id} selected={playback.tracks.levelId === l.id} onSelect={() => { playback.setLevel(l.id); close() }}>{l.height ? `${l.height}p` : `Level ${l.id + 1}`}</MenuOption>
                    ))}
                  </>
                )}
              </Menu>
            )}

            {!hasRealStream && (
              <>
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
              </>
            )}

            <Menu icon="aspect" label="Aspect ratio">
              {(close) => (
                <>
                  <p className="menu-label">Aspect ratio</p>
                  <MenuOption selected={aspectRatio === 'auto'} onSelect={() => { setAspectRatio('auto'); close() }}>Auto</MenuOption>
                  <MenuOption selected={aspectRatio === '16:9'} onSelect={() => { setAspectRatio('16:9'); close() }}>16:9 Widescreen</MenuOption>
                  <MenuOption selected={aspectRatio === '4:3'} onSelect={() => { setAspectRatio('4:3'); close() }}>4:3 Standard</MenuOption>
                  <MenuOption selected={aspectRatio === 'fill'} onSelect={() => { setAspectRatio('fill'); close() }}>Fill / Zoom</MenuOption>
                </>
              )}
            </Menu>

            {/* Playback Speed Control */}
            <Menu icon="history" label={`Playback speed: ${playbackSpeed}x`}>
              {(close) => (
                <>
                  <p className="menu-label">Playback speed</p>
                  {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((s) => (
                    <MenuOption
                      key={s}
                      selected={playbackSpeed === s}
                      onSelect={() => {
                        setPlaybackSpeed(s)
                        if (videoRef.current) {
                          try { videoRef.current.playbackRate = s } catch {}
                        }
                        toast(`Playback speed set to ${s}x`)
                        close()
                      }}
                    >
                      {s === 1.0 ? '1.0x (Normal)' : `${s}x`}
                    </MenuOption>
                  ))}
                </>
              )}
            </Menu>

            {/* Sleep Timer */}
            <Menu icon="clock" label={sleepTimerRemaining ? `Sleep in ${Math.ceil(sleepTimerRemaining / 60)}m` : 'Sleep timer'}>
              {(close) => (
                <>
                  <p className="menu-label">Sleep timer</p>
                  <MenuOption
                    selected={!sleepTimerMinutes}
                    onSelect={() => {
                      setSleepTimerMinutes(null)
                      setSleepTimerRemaining(null)
                      toast('Sleep timer turned off')
                      close()
                    }}
                  >
                    Off
                  </MenuOption>
                  {[15, 30, 45, 60].map((m) => (
                    <MenuOption
                      key={m}
                      selected={sleepTimerMinutes === m}
                      onSelect={() => {
                        setSleepTimerMinutes(m)
                        setSleepTimerRemaining(m * 60)
                        toast(`Sleep timer set for ${m} minutes`)
                        close()
                      }}
                    >
                      {m} minutes
                    </MenuOption>
                  ))}
                </>
              )}
            </Menu>

            {/* Stats for Nerds HUD Toggle */}
            <button
              type="button"
              className={`icon-btn ${statsHudOpen ? 'is-active' : ''}`}
              onClick={() => setStatsHudOpen(!statsHudOpen)}
              aria-pressed={statsHudOpen}
              aria-label="Toggle Stats for Nerds HUD overlay (Shift+D)"
              data-tip="Stats HUD (Shift+D)"
            >
              <Icon name="radar" />
            </button>

            {hasRealStream && (
              <button
                type="button"
                className={`icon-btn ${pip ? 'is-active' : ''}`}
                onClick={() => void togglePip()}
                aria-pressed={pip}
                aria-label={pip ? 'Exit picture-in-picture' : 'Picture-in-picture'}
                data-tip="Picture-in-picture"
              >
                <Icon name="pip" />
              </button>
            )}

            {/* Information & Diagnostics Trigger */}
            <button
              type="button"
              className={`icon-btn ${activeDrawer === 'diagnostics' ? 'is-active' : ''}`}
              onClick={() => setActiveDrawer((d) => (d === 'diagnostics' ? 'none' : 'diagnostics'))}
              aria-label="Playback diagnostics and technical info"
              data-tip="Technical Info (I/D)"
            >
              <Icon name="activity" />
            </button>

            <button type="button" className="icon-btn" onClick={toggleFullscreen} aria-pressed={fullscreen} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} data-tip="Full screen (F)">
              <Icon name="fullscreen" />
            </button>
          </div>
        </div>
      </div>

      {/* Drawer 1: Server Selector Drawer */}
      {activeDrawer === 'servers' && (
        <aside className="player-drawer" role="region" aria-label="Stream Server Selector">
          <div className="player-drawer-header">
            <h3><Icon name="sources" size={20} />Stream Servers ({streamOptions.length})</h3>
            <button type="button" className="icon-btn" onClick={() => setActiveDrawer('none')} aria-label="Close server selector">
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="player-drawer-body">
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', margin: '0 0 6px 0' }}>
              Select an alternative stream provider or broadcast feed for <strong>{channelItem?.name}</strong>.
            </p>

            {streamOptions.map((variant, index) => {
              const isSelected = variant.id === streamOption?.id
              const isPreferred = preferredServer?.id === variant.id
              const cachedTest = variantTestResults[variant.id]
              const isTesting = testingVariantId === variant.id
              const isPlaying = isSelected && playback.state.status === 'playing'
              const wasAttempted = attemptedServers.has(variant.id)

              return (
                <div
                  key={variant.id}
                  className={`server-card ${isSelected ? 'is-active' : ''}`}
                  onClick={() => handleSelectServer(variant)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectServer(variant) } }}
                >
                  <div className="server-card-head">
                    <span className="server-title">{variant.name || `Server ${index + 1}`}</span>
                    <span className={`server-badge ${isPlaying ? 'playing' : isTesting ? 'testing' : wasAttempted ? 'error' : (cachedTest?.status ?? variant.availability)}`}>
                      {isPlaying ? 'Playing' : isTesting ? 'Testing...' : wasAttempted ? 'Failed' : (cachedTest?.status ?? variant.availability)}
                    </span>
                  </div>

                  <div className="server-meta">
                    {variant.sourceName && <span>Provider: {variant.sourceName}</span>}
                    {variant.country && <span>Location: {variant.country}{variant.region ? ` (${variant.region})` : ''}</span>}
                    {variant.quality && <span>Quality: {variant.quality}</span>}
                    {cachedTest && <span>Ping: {cachedTest.roundTripMs} ms</span>}
                  </div>

                  {cachedTest?.message && (
                    <div style={{ fontSize: '0.75rem', color: cachedTest.status === 'available' ? '#2ecc71' : 'var(--warn)' }}>
                      {cachedTest.message}
                    </div>
                  )}

                  <div className="server-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className={`server-preferred-btn ${isPreferred ? 'is-preferred' : ''}`}
                      onClick={() => {
                        if (isPreferred) {
                          store.resetPreferredServer(channelItem?.id ?? '')
                          toast('Reset to default server order.')
                        } else {
                          store.setPreferredServer(channelItem?.id ?? '', variant.id)
                          toast(`Saved ${variant.name || 'Server'} as preferred default.`)
                        }
                      }}
                      title={isPreferred ? 'Reset default' : 'Set as preferred server for this channel'}
                    >
                      <Icon name="star" size={14} />
                      {isPreferred ? 'Preferred Default' : 'Set Preferred'}
                    </button>

                    <button
                      type="button"
                      className="server-test-btn"
                      disabled={isTesting}
                      onClick={() => void handleTestVariant(variant)}
                    >
                      {isTesting ? 'Testing...' : 'Test Connection'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </aside>
      )}

      {/* Drawer 2: Technical Diagnostics and Stream Information */}
      {activeDrawer === 'diagnostics' && (
        <aside className="player-drawer" role="region" aria-label="Playback Diagnostics and Technical Info">
          <div className="player-drawer-header">
            <h3><Icon name="activity" size={20} />Stream Information</h3>
            <button type="button" className="icon-btn" onClick={() => setActiveDrawer('none')} aria-label="Close diagnostics">
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="player-drawer-body">
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              <TechnicalBadge format="4K" />
              <TechnicalBadge format="HDR" />
              <TechnicalBadge format="Dolby Atmos" />
              <TechnicalBadge format="HEVC" />
            </div>

            <CollapsibleSection
              id="diag-metrics"
              title="Detected Playback Metrics"
              defaultOpen={true}
              persistKey="kinora.player.diag.metrics"
            >
              <dl className="diag-grid">
                <dt>Status</dt>
                <dd>{hasRealStream ? playback.state.status : 'Simulated / Demo'}</dd>
                <dt>Resolution</dt>
                <dd>{videoRef.current?.videoWidth ? `${videoRef.current.videoWidth} × ${videoRef.current.videoHeight} (Detected)` : 'Detecting...'}</dd>
                <dt>Buffer Health</dt>
                <dd>{getBufferAhead(videoRef.current)}</dd>
                <dt>Protocol</dt>
                <dd>{hasRealStream ? 'Guarded HLS (kstream://)' : 'Internal Reference'}</dd>
                <dt>Audio Tracks</dt>
                <dd>{playback.tracks.audio.length > 0 ? `${playback.tracks.audio.length} available` : 'Default stereo'}</dd>
                <dt>Subtitles</dt>
                <dd>{playback.tracks.subtitles.length > 0 ? `${playback.tracks.subtitles.length} available` : 'None detected'}</dd>
                <dt>Volume</dt>
                <dd>{hasRealStream ? `${Math.round(playback.volume * 100)}%` : `${volume}%`}</dd>
              </dl>
            </CollapsibleSection>

            <div style={{ marginTop: 12 }}>
              <CollapsibleSection
                id="diag-sync"
                title="Audio & Subtitle Calibration"
                defaultOpen={true}
                persistKey="kinora.player.diag.sync"
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.8125rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="faint">Audio Delay Offset:</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                        onClick={() => {
                          const next = Math.max(-500, audioDelayMs - 50)
                          saveOffsets(next, subDelaySecs, rememberOffsets)
                          toast(`Audio delay: ${next} ms`)
                        }}
                      >
                        -50ms
                      </button>
                      <strong className="tnum" style={{ minWidth: 60, textAlign: 'center' }}>{audioDelayMs} ms</strong>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                        onClick={() => {
                          const next = Math.min(500, audioDelayMs + 50)
                          saveOffsets(next, subDelaySecs, rememberOffsets)
                          toast(`Audio delay: ${next} ms`)
                        }}
                      >
                        +50ms
                      </button>
                      {audioDelayMs !== 0 && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-small"
                          style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                          onClick={() => { saveOffsets(0, subDelaySecs, rememberOffsets); toast('Audio delay reset') }}
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="faint">Subtitle Offset:</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                        onClick={() => {
                          const next = Math.max(-5, Number((subDelaySecs - 0.5).toFixed(1)))
                          saveOffsets(audioDelayMs, next, rememberOffsets)
                          toast(`Subtitle offset: ${next} s`)
                        }}
                      >
                        -0.5s
                      </button>
                      <strong className="tnum" style={{ minWidth: 60, textAlign: 'center' }}>{subDelaySecs.toFixed(1)} s</strong>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                        onClick={() => {
                          const next = Math.min(5, Number((subDelaySecs + 0.5).toFixed(1)))
                          saveOffsets(audioDelayMs, next, rememberOffsets)
                          toast(`Subtitle offset: ${next} s`)
                        }}
                      >
                        +0.5s
                      </button>
                      {subDelaySecs !== 0 && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-small"
                          style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                          onClick={() => { saveOffsets(audioDelayMs, 0, rememberOffsets); toast('Subtitle offset reset') }}
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      id="remember-stream-offsets"
                      checked={rememberOffsets}
                      onChange={(e) => saveOffsets(audioDelayMs, subDelaySecs, e.target.checked)}
                    />
                    <label htmlFor="remember-stream-offsets" style={{ fontSize: '0.8125rem', cursor: 'pointer' }}>
                      Remember calibration for this {channelItem ? 'channel' : 'source'}
                    </label>
                  </div>
                </div>
              </CollapsibleSection>
            </div>

            <div style={{ marginTop: 12 }}>
              <CollapsibleSection
                id="diag-metadata"
                title="Source & Provider Metadata"
                defaultOpen={true}
                persistKey="kinora.player.diag.metadata"
              >
                <dl className="diag-grid">
                  <dt>Server</dt>
                  <dd>{streamOption?.name ?? 'Primary Server'}</dd>
                  <dt>Provider</dt>
                  <dd>{fromPlaylist ? (streamOption?.sourceName ?? 'Default Playlist') : itemStreamUrl ? 'Xtream Provider' : 'Demonstration'}</dd>
                  <dt>Location</dt>
                  <dd>{streamOption?.country ? `${streamOption.country}${streamOption.region ? ` (${streamOption.region})` : ''}` : 'International / Unspecified'}</dd>
                  <dt>Advertised</dt>
                  <dd>{streamOption?.quality ?? (channelItem?.hd ? 'HD' : 'Standard')}</dd>
                  <dt>Format</dt>
                  <dd>HLS Master Stream</dd>
                  <dt>Alternative</dt>
                  <dd>{streamOptions.length} available servers</dd>
                </dl>
              </CollapsibleSection>
            </div>
          </div>
        </aside>
      )}

      {/* Drawer 3: Quick EPG Guide Drawer */}
      {activeDrawer === 'epg' && channelItem && (
        <aside className="player-drawer" role="region" aria-label="Channel Broadcast Schedule">
          <div className="player-drawer-header">
            <h3><Icon name="guide" size={20} />{channelItem.name} Schedule</h3>
            <button type="button" className="icon-btn" onClick={() => setActiveDrawer('none')} aria-label="Close guide">
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="player-drawer-body">
            {todaySchedule.length === 0 ? (
              <p style={{ color: 'var(--text-3)', fontSize: '0.875rem' }}>No programme listings available for today on this channel.</p>
            ) : (
              todaySchedule.map((prog) => {
                const isCurrent = prog.start <= now && now < prog.stop
                return (
                  <div key={prog.id} className={`quick-epg-programme ${isCurrent ? 'is-current' : ''}`}>
                    <span className="quick-epg-time">
                      {clock(prog.start, prefs.timeFormat)} - {clock(prog.stop, prefs.timeFormat)}
                      {isCurrent && <span className="live-dot" style={{ marginLeft: '8px' }}>On Now</span>}
                    </span>
                    <strong className="quick-epg-title">{prog.title}</strong>
                    {prog.desc && <span className="quick-epg-desc">{prog.desc}</span>}
                  </div>
                )
              })
            )}
          </div>
        </aside>
      )}
    </div>
  )
}
