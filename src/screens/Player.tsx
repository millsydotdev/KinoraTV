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
import { playbackText } from '../lib/playback'
import { useUniversalPlayback } from '../state/playbackContext'
import { categoryLabel, unavailableReason } from '../state/playlists'
import { useStore } from '../state/store'
import { isChannelKidSafe, isTitleKidSafe } from '../lib/kidsMode'
import type { StreamVariant } from '../data/types'
import { testStreamVariant, type StreamTestRecord } from '../lib/streamTesting'
import { CollapsibleSection } from '../components/CollapsibleSection'
import { TechnicalBadge } from '../components/TechnicalBadges'
import { ZappingOverlay } from '../components/ZappingOverlay'
import { QuickChannelDrawer } from '../components/QuickChannelDrawer'
import { StreamTelemetry } from '../components/StreamTelemetry'
import { NumericZapHUD } from '../components/NumericZapHUD'
import { BingeCountdownOverlay } from '../components/BingeCountdownOverlay'
import { loadBingeSettings } from '../lib/bingeMode'
import { cleanChannelTitle } from '../lib/cleanTitle'
import { getPreviousChannelId, recordChannelTune } from '../lib/channelRecall'
import { AudioEnhancer, type EqPreset } from '../lib/audioEnhancer'
import {
  parseSubtitleText,
  cuesToVttBlobUrl,
  generateSubtitleCss,
  DEFAULT_SUBTITLE_STYLES,
  type SubtitleStyleSettings,
} from '../lib/subtitles'
import { InactivityGuard } from '../lib/inactivityGuard'
import { InactivityPromptOverlay } from '../components/InactivityPromptOverlay'
import { SyncPlayModal } from '../components/SyncPlayModal'
import { chapterMarkers, chapterAt, type ChapterInfo } from '../lib/chapters'
import { ChapterTicks } from '../components/ChapterTicks'
import {
  parseStoryboardVtt,
  getStoryboardThumbnailAt,
  getSpriteStyle,
  type StoryboardCue,
} from '../lib/trickplay'
import {
  updateMediaSessionMetadata,
  updateMediaSessionPlaybackState,
  updateMediaSessionPositionState,
  registerMediaSessionHandlers,
} from '../lib/mediaSession'
import {
  captureVideoFrame,
  copyFrameToClipboard,
  downloadFrame,
  generateScreenshotFilename,
} from '../lib/screenshot'
import {
  extractSkipIntervals,
  evaluateSkip,
} from '../lib/skipEngine'
import {
  DEFAULT_PICTURE_SETTINGS,
  DEFAULT_AB_LOOP,
  type AspectRatioMode,
} from '../lib/videoGeometry'
import {
  computeFrameStep,
  PlayerGestureManager,
  type GestureState,
} from '../lib/gestures'
import { PlayerNowNextBar } from '../components/PlayerNowNextBar'
import { LiveMosaicGrid } from '../components/LiveMosaicGrid'
import { SubtitleSearchModal } from '../components/SubtitleSearchModal'
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
  const [pip, setPip] = useState(false)
  const [inAppPip] = useState(false)
  const [rippleFeedback, setRippleFeedback] = useState<{ side: 'left' | 'right'; text: string } | null>(null)
  const rippleTimer = useRef<number>(0)
  const [scrubHover, setScrubHover] = useState<{ time: number; percent: number } | null>(null)
  const previewArt = (item?.kind === 'movie' || item?.kind === 'episode') ? item.art : null
  const [shutterFlash, setShutterFlash] = useState(false)

  // Drawer states
  const [activeDrawer, setActiveDrawer] = useState<'none' | 'servers' | 'diagnostics' | 'epg' | 'channels'>('none')
  const [controlsVisible, setControlsVisible] = useState(true)
  const hideTimerRef = useRef<number>(0)

  // Player capabilities expansion: sleep timer, diagnostics HUD, delay persistence flag, up next
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null)
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState<number | null>(null)
  const [sleepTimerMode, setSleepTimerMode] = useState<'minutes' | 'programme' | null>(null)
  const recallHistoryRef = useRef<string[]>([])
  const [statsHudOpen, setStatsHudOpen] = useState(false)
  const [rememberOffsets, setRememberOffsets] = useState(false)
  const [upNextDismissed, setUpNextDismissed] = useState(false)
  const [inactivityPromptOpen, setInactivityPromptOpen] = useState(false)
  const [inactivityCountdown, setInactivityCountdown] = useState(60)
  const inactivityGuardRef = useRef<InactivityGuard | null>(null)
  const profileId = store.activeProfile?.id ?? 'default'
  const [bingeSettings] = useState(() => loadBingeSettings(profileId))
  const [zappingVisible, setZappingVisible] = useState(false)
  const [nowNextBarOpen, setNowNextBarOpen] = useState(false)
  const [mosaicOpen, setMosaicOpen] = useState(false)
  const [subtitleSearchOpen, setSubtitleSearchOpen] = useState(false)
  const [syncPlayOpen, setSyncPlayOpen] = useState(false)
  const [transientNotice, setTransientNotice] = useState<string | null>(null)
  const transientNoticeTimerRef = useRef<number | null>(null)
  const gestureManagerRef = useRef<PlayerGestureManager>(new PlayerGestureManager())
  const [gestureOsd, setGestureOsd] = useState<GestureState | null>(null)
  const gestureOsdTimerRef = useRef<number | null>(null)

  // Stream variant testing in player
  const [testingVariantId, setTestingVariantId] = useState<string | null>(null)
  const [variantTestResults, setVariantTestResults] = useState<Record<string, StreamTestRecord>>({})

  // Audio processing: dialogue clarity boost, night mode dynamic compression and volume boost
  const [dialogueBoost, setDialogueBoost] = useState(false)
  const [nightMode, setNightMode] = useState(false)
  const [volumeBoost, setVolumeBoost] = useState(1.0)
  const [autoLoudness, setAutoLoudness] = useState(false)
  const [eqPreset, setEqPreset] = useState<EqPreset>('flat')
  const audioEnhancerRef = useRef<AudioEnhancer | null>(null)

  // Subtitle synchronization, styling and external loader
  const [subStyles, setSubStyles] = useState<SubtitleStyleSettings>(DEFAULT_SUBTITLE_STYLES)
  const [externalSubTitle, setExternalSubTitle] = useState<string | null>(null)
  const externalSubTrackRef = useRef<HTMLTrackElement | null>(null)
  const subFileInputRef = useRef<HTMLInputElement | null>(null)

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


  // Stop background audio playback when video player mounts
  useEffect(() => {
    if (store.mediaLibrary?.isAudioPlaying) {
      store.mediaLibrary.stopAudio()
    }
  }, [store.mediaLibrary])

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
  const metadataDurationSec = demoMovie
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
  const programme = (item && item.kind === 'channel') ? store.programmeAt(item.item, now) : undefined

  useEffect(() => {
    if (channelItem) {
      setZappingVisible(true)
    }
  }, [channelItem?.id])

  const fromPlaylist = channelItem !== null && channelItem.sourceId !== null
  const itemStreamUrl = item && 'streamUrl' in item ? item.streamUrl : null
  const hasRealStream = fromPlaylist || Boolean(itemStreamUrl)

  const playbackCtx = useUniversalPlayback()
  const {
    activeStream,
    playbackState,
    tracks,
    muted: contextMuted,
    volume: contextVolume,
    ready: playbackReady,
    currentTime: contextCurrentTime,
    duration: contextDuration,
    playbackSpeed,
    audioDelayMs,
    subDelaySecs,
    timeshiftOffsetSecs,
    isTimeshiftDelayed,
    aspectRatio,
    pictureSettings,
    abLoop,
    selectedServerId: contextSelectedServerId,
    attemptedServers,
    fallbackNotice,
    retryAttempt,
    retryTimerRemaining,
    videoRef,
    playStream,
    togglePlay: contextTogglePlay,
    toggleMute: contextToggleMute,
    setVolume: contextSetVolume,
    setAudioTrack,
    setSubtitleTrack,
    setLevel,
    seek: contextSeek,
    seekTimeshift,
    jumpToLiveEdge,
    setPlaybackSpeed,
    setAudioDelayMs,
    setSubDelaySecs,
    setAspectRatio,
    setPictureSettings,
    setAbLoop,
    selectServer,
    setPipMode,
    retry: contextRetry,
    cancelRetry,
    dismissFallbackNotice,
  } = playbackCtx

  const durationSec = hasRealStream && !channelItem && contextDuration > 0
    ? Math.floor(contextDuration)
    : metadataDurationSec

  // Media chapters and seekbar markers
  const mediaChapters = useMemo(() => {
    if (!item) return []
    const inner = (item as unknown as { item?: { chapters?: ChapterInfo[] } }).item
    if (inner && Array.isArray(inner.chapters)) {
      return inner.chapters
    }
    return []
  }, [item])

  const computedChapterMarkers = useMemo(() => {
    return chapterMarkers(mediaChapters, durationSec)
  }, [mediaChapters, durationSec])

  const hoverChapter = useMemo(() => {
    if (!scrubHover || mediaChapters.length === 0) return null
    return chapterAt(scrubHover.time, mediaChapters)
  }, [scrubHover, mediaChapters])

  const storyboardCues = useMemo<StoryboardCue[]>(() => {
    if (!item) return []
    const rawItem = item as unknown as Record<string, unknown>
    if (Array.isArray(rawItem.storyboardCues)) {
      return rawItem.storyboardCues as StoryboardCue[]
    }
    if (typeof rawItem.storyboardVtt === 'string') {
      return parseStoryboardVtt(rawItem.storyboardVtt)
    }
    return []
  }, [item])

  const hoverStoryboardCue = useMemo(() => {
    if (!scrubHover || storyboardCues.length === 0) return null
    return getStoryboardThumbnailAt(storyboardCues, scrubHover.time)
  }, [scrubHover, storyboardCues])

  const skipIntervals = useMemo(() => {
    return extractSkipIntervals(mediaChapters, item?.kind === 'episode', durationSec)
  }, [mediaChapters, item?.kind, durationSec])

  const playback = {
    state: playbackState,
    ready: playbackReady,
    tracks,
    muted: contextMuted,
    volume: contextVolume,
    togglePlay: contextTogglePlay,
    toggleMute: contextToggleMute,
    setVolume: contextSetVolume,
    setAudioTrack,
    setSubtitleTrack,
    setLevel,
    retry: contextRetry,
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
    }
  }, [item?.ref, channelItem, streamOptions, store])

  const activeContextServerId = activeStream?.ref === item?.ref ? contextSelectedServerId : null
  const streamOptionId = activeContextServerId ?? (streamSelection.ref === item?.ref ? streamSelection.id : (preferredServer?.id ?? streamOptions[0]?.id ?? ''))
  const streamOption = streamOptions.find((option) => option.id === streamOptionId) ?? streamOptions[0]
  const realStreamUrl = fromPlaylist ? (streamOption?.streamUrl ?? null) : itemStreamUrl

  const saved = library.progress[ref]
  const savedPos = saved?.pos ?? 0
  const pos = hasRealStream && !channelItem && contextCurrentTime > 0
    ? Math.floor(contextCurrentTime)
    : savedPos

  const activeSkip = useMemo(() => {
    return evaluateSkip(pos, skipIntervals, false)
  }, [pos, skipIntervals])

  useEffect(() => {
    if (!item || !hasRealStream) return
    setPipMode('fullscreen')

    if (hasRealStream && realStreamUrl) {
      if (
        activeStream &&
        activeStream.ref === item.ref &&
        activeStream.streamUrl === realStreamUrl
      ) {
        return
      }

      playStream({
        ref: item.ref,
        streamUrl: realStreamUrl,
        title: item.title,
        subtitle: channelItem ? (programme?.title ?? undefined) : ('series' in item && item.series ? ('title' in item.series ? item.series.title : item.series.name) : undefined),
        channel: channelItem ?? undefined,
        isLive: channelItem !== null,
        duration: metadataDurationSec,
        position: savedPos,
        sourceId: channelItem?.sourceId ?? undefined,
        streamOptions,
        selectedServerId: streamOption?.id,
      })
    }

    return () => {
      setPipMode('docked')
    }
  }, [item?.ref, realStreamUrl, hasRealStream])

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
  }, [offsetTargetId, setAudioDelayMs, setSubDelaySecs])

  const saveOffsets = useCallback((audioMs: number, subSecs: number, remember: boolean) => {
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
  }, [offsetTargetId, setAudioDelayMs, setSubDelaySecs])

  const [subNudgeNotice, setSubNudgeNotice] = useState<string | null>(null)
  const subNudgeTimerRef = useRef<number | null>(null)
  const parsedCuesRef = useRef<ReturnType<typeof parseSubtitleText>>([])

  const nudgeSubtitleSync = useCallback((deltaSec: number) => {
    const current = subDelaySecs
    const updated = Math.round((current + deltaSec) * 1000) / 1000
    const clamped = Math.max(-10, Math.min(10, updated))
    saveOffsets(audioDelayMs, clamped, true)

    if (externalSubTrackRef.current && parsedCuesRef.current.length > 0) {
      externalSubTrackRef.current.src = cuesToVttBlobUrl(parsedCuesRef.current, clamped)
    }

    const ms = Math.round(clamped * 1000)
    const sign = ms > 0 ? `+${ms}ms` : ms < 0 ? `${ms}ms` : '0ms (Synced)'
    setSubNudgeNotice(`Subtitles: ${sign}`)

    if (subNudgeTimerRef.current !== null) {
      window.clearTimeout(subNudgeTimerRef.current)
    }
    subNudgeTimerRef.current = window.setTimeout(() => {
      setSubNudgeNotice(null)
      subNudgeTimerRef.current = null
    }, 1800)
  }, [subDelaySecs, audioDelayMs, saveOffsets])

  const showTransientNotice = useCallback((msg: string) => {
    setTransientNotice(msg)
    if (transientNoticeTimerRef.current !== null) {
      window.clearTimeout(transientNoticeTimerRef.current)
    }
    transientNoticeTimerRef.current = window.setTimeout(() => {
      setTransientNotice(null)
      transientNoticeTimerRef.current = null
    }, 1800)
  }, [])

  const cycleAspectRatio = useCallback(() => {
    const ASPECT_MODES: AspectRatioMode[] = ['auto', '16:9', '4:3', 'fill', 'smart-stretch', '21:9']
    const ASPECT_LABELS: Record<AspectRatioMode, string> = {
      auto: 'Auto',
      '16:9': '16:9 Widescreen',
      '4:3': '4:3 Standard',
      fill: 'Fill / Zoom',
      'smart-stretch': 'Smart Stretch',
      '21:9': '21:9 Ultrawide',
    }
    const nextIndex = (ASPECT_MODES.indexOf(aspectRatio) + 1) % ASPECT_MODES.length
    const nextMode = ASPECT_MODES[nextIndex] || 'auto'
    setAspectRatio(nextMode)
    showTransientNotice(`Aspect Ratio: ${ASPECT_LABELS[nextMode]}`)
  }, [aspectRatio, setAspectRatio, showTransientNotice])

  const toggleAudioEnhancement = useCallback(() => {
    const nextActive = !dialogueBoost
    setDialogueBoost(nextActive)
    setNightMode(nextActive)
    showTransientNotice(nextActive ? 'Audio: Dialogue Boost & Night Mode ON' : 'Audio: Standard Stereo')
  }, [dialogueBoost, setDialogueBoost, setNightMode, showTransientNotice])

  const unavailable = fromPlaylist && channelItem && streamOption?.streamUrl === null
    ? unavailableReason(store.playlists.find((s) => s.id === streamOption.sourceId)) ?? 'This channel cannot play yet.'
    : null

  const seek = (to: number) => {
    if (!durationSec) return
    const target = Math.min(durationSec - 1, Math.max(0, to))
    store.setProgress(ref, target, durationSec)
    contextSeek(target)
  }

  // Channel recall history recording
  useEffect(() => {
    if (channelItem?.id) {
      recallHistoryRef.current = recordChannelTune(channelItem.id, recallHistoryRef.current)
    }
  }, [channelItem?.id])

  const recallPreviousChannel = useCallback(() => {
    const prevId = getPreviousChannelId(recallHistoryRef.current, channelItem?.id)
    if (prevId) {
      const prevCh = store.findChannel(prevId)
      if (prevCh) {
        toast(`Recalled: ${prevCh.cleanName || cleanChannelTitle(prevCh.name)}`)
        setZappingVisible(true)
        navigate(`/watch/${encodeURIComponent(channelRef(prevCh.id))}`)
      }
    } else {
      toast('No previous channel in memory')
    }
  }, [channelItem?.id, store, navigate, toast])

  useEffect(() => {
    const onRecallEvent = () => recallPreviousChannel()
    window.addEventListener('kinora:recall-channel', onRecallEvent)
    return () => {
      window.removeEventListener('kinora:recall-channel', onRecallEvent)
    }
  }, [recallPreviousChannel])

  const takeScreenshot = async () => {
    const video = videoRef.current
    if (!video) return
    try {
      setShutterFlash(true)
      window.setTimeout(() => setShutterFlash(false), 200)

      const result = await captureVideoFrame(video)
      const itemTitle = channelItem?.name || (item && 'title' in item ? (item as any).title : 'Stream')
      const filename = generateScreenshotFilename(itemTitle, pos)

      const copied = await copyFrameToClipboard(result.blob)
      if (copied) {
        toast(`Frame copied to clipboard (${result.width}x${result.height})`)
      } else {
        downloadFrame(result.blob, filename)
        toast(`Snapshot saved: ${filename}`)
      }
    } catch {
      toast('Could not capture frame from video')
    }
  }

  // Sleep timer countdown with smooth audio fade
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
        if (prev <= 30 && audioEnhancerRef.current) {
          const fadeMultiplier = Math.max(0.05, prev / 30)
          audioEnhancerRef.current.apply({
            dialogueBoost,
            nightMode,
            volumeBoost: volumeBoost * fadeMultiplier,
            audioDelayMs,
            autoLoudness,
            eqPreset,
          })
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [sleepTimerRemaining, playback, toast, dialogueBoost, nightMode, volumeBoost, audioDelayMs, autoLoudness, eqPreset])

  // Inactivity guard for TV and leanback sessions: 3 hours threshold, 60s countdown prompt
  useEffect(() => {
    const guard = new InactivityGuard({
      inactivityThresholdMs: 3 * 60 * 60 * 1000,
      promptGracePeriodMs: 60 * 1000,
      onPrompt: () => {
        setInactivityPromptOpen(true)
      },
      onTimeout: () => {
        setInactivityPromptOpen(false)
        if (playback.ready && playback.state.status === 'playing') {
          playback.togglePlay()
        }
        toast('Playback paused due to inactivity')
      },
    })
    inactivityGuardRef.current = guard

    const unsubscribe = guard.subscribe((state, countdownSecs) => {
      setInactivityPromptOpen(state === 'prompting')
      setInactivityCountdown(countdownSecs)
    })

    guard.start()

    const onUserAction = () => {
      guard.recordActivity()
    }

    window.addEventListener('keydown', onUserAction)
    window.addEventListener('mousemove', onUserAction)
    window.addEventListener('pointerdown', onUserAction)

    return () => {
      window.removeEventListener('keydown', onUserAction)
      window.removeEventListener('mousemove', onUserAction)
      window.removeEventListener('pointerdown', onUserAction)
      guard.stop()
      unsubscribe()
      inactivityGuardRef.current = null
    }
  }, [hasRealStream, playback, toast])

  // Web Audio pipeline for dialogue clarity boost, night mode compression and volume amplification
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (!audioEnhancerRef.current) {
      audioEnhancerRef.current = new AudioEnhancer()
    }
    const enhancer = audioEnhancerRef.current
    enhancer.attach(video)
    enhancer.apply({
      dialogueBoost,
      nightMode,
      volumeBoost,
      audioDelayMs,
      autoLoudness,
      eqPreset,
    })
  }, [videoRef, dialogueBoost, nightMode, volumeBoost, audioDelayMs, autoLoudness, eqPreset])

  useEffect(() => {
    return () => {
      audioEnhancerRef.current?.detach()
      audioEnhancerRef.current = null
    }
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void (document.documentElement?.requestFullscreen?.() ?? shell.current?.requestFullscreen?.())?.catch(() => toast('Full screen is not available in this browser window'))
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
      setPipMode('docked')
      leave()
      toast('Minimised to floating dock')
    }
  }

  const handleLoadSubtitleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !videoRef.current) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (!text) return
      const cues = parseSubtitleText(text)
      if (cues.length === 0) {
        toast('No subtitle cues found in file')
        return
      }
      parsedCuesRef.current = cues
      if (externalSubTrackRef.current) {
        externalSubTrackRef.current.remove()
        externalSubTrackRef.current = null
      }
      const blobUrl = cuesToVttBlobUrl(cues, subDelaySecs)
      const track = document.createElement('track')
      track.kind = 'subtitles'
      track.label = file.name.replace(/\.[^/.]+$/, '')
      track.srclang = 'en'
      track.src = blobUrl
      track.default = true
      videoRef.current?.appendChild(track)
      externalSubTrackRef.current = track
      setExternalSubTitle(track.label)
      store.setPref('subtitles', true)
      toast(`Loaded subtitles: ${track.label}`)
    }
    reader.readAsText(file)
  }

  const handleApplyExternalSubtitle = (blobUrl: string, trackLabel: string) => {
    if (externalSubTrackRef.current) {
      externalSubTrackRef.current.remove()
      externalSubTrackRef.current = null
    }
    const track = document.createElement('track')
    track.kind = 'subtitles'
    track.label = trackLabel
    track.srclang = 'en'
    track.src = blobUrl
    track.default = true
    videoRef.current?.appendChild(track)
    externalSubTrackRef.current = track
    setExternalSubTitle(trackLabel)
    store.setPref('subtitles', true)
    toast(`Applied subtitles: ${trackLabel}`)
  }

  // Channel stepping
  const channelList = store.channels
  const currentChannelIndex = channelItem ? channelList.findIndex((c) => c.id === channelItem.id || c.memberIds?.includes(channelItem.id)) : -1

  const stepChannel = useCallback((delta: number) => {
    if (currentChannelIndex < 0 || channelList.length === 0) return
    const nextIndex = (currentChannelIndex + delta + channelList.length) % channelList.length
    const nextChan = channelList[nextIndex]
    if (nextChan) {
      setZappingVisible(true)
      navigate(`/watch/${encodeURIComponent(channelRef(nextChan.id))}`)
    }
  }, [currentChannelIndex, channelList, navigate])

  // OS Media Session Synchronization (MPRIS / SMTC / macOS Now Playing)
  useEffect(() => {
    if (!item) {
      updateMediaSessionMetadata(null)
      return
    }
    const title = channelItem
      ? (programme?.title || channelItem.name)
      : (item && 'title' in item ? (item as any).title : 'Live Stream')
    const artist = channelItem
      ? channelItem.name
      : (item && 'series' in item && item.series && 'title' in item.series ? (item.series as any).title : 'Kinora')
    const album = channelItem ? 'Live TV' : (item && 'series' in item ? 'Series' : 'Cinema')
    const art = previewArt || ''

    updateMediaSessionMetadata({
      title,
      artist,
      album,
      artwork: art ? [{ src: art }] : [],
    })
  }, [item, channelItem, programme, previewArt])

  useEffect(() => {
    const isPlaying = hasRealStream
      ? playback.state.status === 'playing'
      : !contextMuted
    updateMediaSessionPlaybackState(isPlaying ? 'playing' : 'paused')
  }, [hasRealStream, playback.state.status, contextMuted])

  useEffect(() => {
    if (durationSec > 0) {
      updateMediaSessionPositionState(pos, durationSec, playbackSpeed)
    }
  }, [pos, durationSec, playbackSpeed])

  useEffect(() => {
    const unbind = registerMediaSessionHandlers({
      onPlay: () => {
        if (playback.ready) playback.togglePlay()
      },
      onPause: () => {
        if (playback.ready) playback.togglePlay()
      },
      onSeekForward: (delta) => {
        seek(pos + delta)
      },
      onSeekBackward: (delta) => {
        seek(pos - delta)
      },
      onSeekTo: (time) => {
        seek(time)
      },
      onPreviousTrack: () => {
        if (channelItem) stepChannel(-1)
      },
      onNextTrack: () => {
        if (channelItem) stepChannel(1)
      },
      onStop: () => {
        leave()
      },
    })
    return unbind
  }, [playback, seek, pos, channelItem, stepChannel, leave])

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

      if (e.key === 'Escape') {
        if (nowNextBarOpen) {
          e.preventDefault()
          setNowNextBarOpen(false)
          return
        }
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
      if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        void takeScreenshot()
        return
      }
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault()
        cycleAspectRatio()
        return
      }
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        toggleAudioEnhancement()
        return
      }
      if (e.key === '.' || e.key === '>') {
        e.preventDefault()
        const step = computeFrameStep(pos, durationSec, 1)
        seek(step.newTime)
        if (videoRef.current) {
          try { videoRef.current.currentTime = step.newTime } catch {}
        }
        showTransientNotice(`Step: +1 Frame (${step.newTime.toFixed(2)}s)`)
        return
      }
      if (e.key === ',' || e.key === '<') {
        e.preventDefault()
        const step = computeFrameStep(pos, durationSec, -1)
        seek(step.newTime)
        if (videoRef.current) {
          try { videoRef.current.currentTime = step.newTime } catch {}
        }
        showTransientNotice(`Step: -1 Frame (${step.newTime.toFixed(2)}s)`)
        return
      }
      if (e.key === 's' || e.key === 'S') setActiveDrawer((d) => (d === 'servers' ? 'none' : 'servers'))
      if (e.key === 'i' || e.key === 'I') {
        if (e.shiftKey) {
          e.preventDefault()
          setStatsHudOpen((prev) => !prev)
          return
        }
        if (channelItem) {
          e.preventDefault()
          setNowNextBarOpen((prev) => !prev)
        }
        setActiveDrawer((d) => (d === 'diagnostics' ? 'none' : 'diagnostics'))
        return
      }
      if (e.key === 'd' || e.key === 'D') {
        if (e.shiftKey) {
          e.preventDefault()
          setStatsHudOpen((prev) => !prev)
          return
        }
        setActiveDrawer((d) => (d === 'diagnostics' ? 'none' : 'diagnostics'))
        return
      }
      if (e.key === 'g' || e.key === 'G' || e.key === 'e' || e.key === 'E') {
        if (nowNextBarOpen) {
          setNowNextBarOpen(false)
          setActiveDrawer('epg')
        } else {
          setActiveDrawer((d) => (d === 'epg' ? 'none' : 'epg'))
        }
      }

      if (channelItem) {
        if (e.shiftKey && (e.key === ']' || e.key === '}')) {
          e.preventDefault()
          nudgeSubtitleSync(0.25)
          return
        }
        if (e.shiftKey && (e.key === '[' || e.key === '{')) {
          e.preventDefault()
          nudgeSubtitleSync(-0.25)
          return
        }
        if (e.key === 'PageUp' || e.key === ']') { e.preventDefault(); stepChannel(1) }
        if (e.key === 'PageDown' || e.key === '[') { e.preventDefault(); stepChannel(-1) }
        if (e.key === 'v' || e.key === 'V') {
          e.preventDefault()
          setMosaicOpen((o) => !o)
          return
        }
        if (e.key === 'z' || e.key === 'Z' || e.key === 'l' || e.key === 'L' || e.key === 'h' || e.key === 'H' || (e.key === 'C' && e.shiftKey)) {
          e.preventDefault()
          setActiveDrawer((d) => (d === 'channels' ? 'none' : 'channels'))
        }
      } else {
        if (e.key === ']' || (e.shiftKey && e.key === '}')) {
          e.preventDefault()
          nudgeSubtitleSync(0.25)
          return
        }
        if (e.key === '[' || (e.shiftKey && e.key === '{')) {
          e.preventDefault()
          nudgeSubtitleSync(-0.25)
          return
        }
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
      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault()
        recallPreviousChannel()
      }
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

  const nextProg = item.kind === 'channel' ? store.nextProgramme(item.item, now) : undefined
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
    selectServer(variant.id)
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
    if (activeDrawer !== 'none') {
      setActiveDrawer('none')
      return
    }
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

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button, input, select, textarea, .player-drawer, .player-now-next-bar, .player-header, .player-bottom-bar, .player-osd-transient-hud')) {
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const curVol = hasRealStream ? playback.volume : (volume / 100)
    const curBright = pictureSettings?.brightness ?? 1.0
    gestureManagerRef.current.onPointerDown(
      { clientX: e.clientX, clientY: e.clientY },
      rect,
      curVol,
      curBright,
      pos
    )
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const state = gestureManagerRef.current.onPointerMove(
      { clientX: e.clientX, clientY: e.clientY },
      rect
    )
    if (!state) return

    setGestureOsd(state)
    if (gestureOsdTimerRef.current !== null) {
      window.clearTimeout(gestureOsdTimerRef.current)
      gestureOsdTimerRef.current = null
    }

    if (state.type === 'volume') {
      if (hasRealStream) {
        playback.setVolume(state.value)
      } else {
        setVolume(Math.round(state.value * 100))
      }
    } else if (state.type === 'brightness') {
      setPictureSettings({
        ...pictureSettings,
        brightness: state.value,
      })
    }
  }

  const handlePointerUp = () => {
    const { wasGesture } = gestureManagerRef.current.onPointerUp()
    if (wasGesture) {
      if (gestureOsd && gestureOsd.type === 'seek') {
        const target = gestureOsd.value
        seek(target)
        if (videoRef.current) {
          try { videoRef.current.currentTime = target } catch {}
        }
      }
      if (gestureOsdTimerRef.current !== null) {
        window.clearTimeout(gestureOsdTimerRef.current)
      }
      gestureOsdTimerRef.current = window.setTimeout(() => {
        setGestureOsd(null)
        gestureOsdTimerRef.current = null
      }, 700)
    }
  }

  return (
    <div
      className={`player force-dark${fullscreen ? ' is-fullscreen' : ''}${inAppPip ? ' is-in-app-pip' : ''}${!controlsVisible && activeDrawer === 'none' ? ' controls-hidden' : ''}`}
      ref={shell}
      style={{ background: hasRealStream ? 'transparent' : '#000' }}
      onMouseMove={showControls}
      onClick={handleVideoCanvasClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Background artwork when video has not yet rendered or playing demo */}
      {(!hasRealStream || playback.state.status !== 'playing') && (
        item.kind === 'channel' ? (
          (programme?.art || programme?.icon) ? (
            <ProgrammeArt programme={programme} focus={item.focus} eager className="player-art" />
          ) : (
            <div className="player-art player-channel-ambient" style={{ background: `radial-gradient(ellipse at 50% 35%, ${item.item.mark.tone}33 0%, rgba(10,12,18,0.95) 75%)` }} />
          )
        ) : 'artworkKey' in item && item.artworkKey ? (
          <XtreamArt artworkKey={item.artworkKey} alt={item.title} eager className="player-art" />
        ) : (
          <Art src={item.art} focus={item.focus} eager className="player-art" />
        )
      )}

      {/* Primary Video Element shade */}
      {hasRealStream && <div className="player-video-shade" aria-hidden="true" />}

      {/* Double-Click Fast Forward / Rewind Ripple (Audit #51) */}
      {rippleFeedback && (
        <div className={`player-seek-ripple is-${rippleFeedback.side}`} aria-hidden="true">
          <Icon name={rippleFeedback.side === 'left' ? 'left' : 'right'} size={24} />
          <span>{rippleFeedback.text}</span>
        </div>
      )}

      {/* Subtitle Nudge Sync HUD */}
      {subNudgeNotice && (
        <div className="player-nudge-hud" role="status" aria-live="polite">
          <span>{subNudgeNotice}</span>
        </div>
      )}

      {/* Direct Numeric Keypad Tuning HUD */}
      <NumericZapHUD
        channels={store.channels}
        onTune={(ch) => {
          setZappingVisible(true)
          navigate(`/watch/${encodeURIComponent(channelRef(ch.id))}`)
        }}
      />

      {/* Fallback Notice Banner */}
      {fallbackNotice && (
        <div className="player-fallback-banner" role="alert">
          <Icon name="warning" size={16} />
          <span>{fallbackNotice}</span>
          <button type="button" className="text-link" onClick={dismissFallbackNotice}>Dismiss</button>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="player-top">
        <div className="player-heading">
          <div className="player-heading-title">
            {item.kind === 'channel' && <ChannelMark channel={item.item} size={36} />}
            <h1>{channelItem ? `${channelItem.number} ${channelItem.cleanName || cleanChannelTitle(channelItem.name)}` : heading}</h1>
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
                      onClick={() => playback.retry()}
                    >
                      Retry
                    </button>
                    {retryTimerRemaining !== null && (
                      <button
                        type="button"
                        className="text-link"
                        style={{ marginLeft: 6 }}
                        onClick={cancelRetry}
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
        {channelItem && (
          <button
            type="button"
            className={`icon-btn ${nowNextBarOpen ? 'is-active' : ''}`}
            onClick={() => setNowNextBarOpen(!nowNextBarOpen)}
            aria-label="Toggle Now and Next guide bar"
            data-tip="Now & Next (I)"
          >
            <Icon name="info" />
          </button>
        )}
        <button type="button" className="icon-btn" onClick={leave} aria-label="Close player"><Icon name="close" /></button>
      </div>

      {prefs.subtitles && !hasRealStream && <p className={`player-sub sub-line sub-${prefs.subtitleSize} sub-${prefs.subtitleStyle}`}>[Subtitles: {prefs.subtitleLanguage}]</p>}

      <input
        type="file"
        ref={subFileInputRef}
        onChange={handleLoadSubtitleFile}
        accept=".srt,.vtt"
        style={{ display: 'none' }}
        aria-hidden="true"
      />
      <style>{generateSubtitleCss(subStyles)}</style>

      {/* Dynamic Chapter & Heuristic Skip Action (Intro, Recap, Credits) */}
      {activeSkip.active && activeSkip.interval && (
        <button
          type="button"
          className="player-skip-intro-btn"
          onClick={() => {
            if (activeSkip.interval) {
              const target = activeSkip.interval.endSec
              seek(target)
              if (videoRef.current) {
                try { videoRef.current.currentTime = target } catch {}
              }
              toast(`Skipped ${activeSkip.interval.label}`)
            }
          }}
          aria-label={`Skip ${activeSkip.interval.label} sequence`}
          data-tip={`Skip ${activeSkip.interval.label}`}
        >
          <Icon name="skip" size={16} />
          <span>Skip {activeSkip.interval.label} ({activeSkip.remainingSecs}s)</span>
        </button>
      )}

      {/* Video Frame Capture Shutter Flash */}
      {shutterFlash && <div className="player-shutter-flash" aria-hidden="true" />}

      {/* Up Next Episode Card / Automated Binge Countdown */}
      {next && item.kind === 'episode' && item.series && 'id' in item.series && !upNextDismissed && durationSec > 0 && (
        <BingeCountdownOverlay
          open={durationSec - pos <= (bingeSettings.promptThresholdSeconds || 35)}
          nextTitle={next.title}
          nextEpisodeCode={episodeCode(next)}
          initialSeconds={bingeSettings.countdownSeconds}
          onPlayNext={() => {
            if (item.series && 'id' in item.series) {
              navigate(`/watch/${encodeURIComponent(episodeRef(item.series.id, next.id))}`, { replace: true })
            }
          }}
          onCancel={() => setUpNextDismissed(true)}
        />
      )}

      {/* Real-Time Stream Telemetry HUD */}
      {statsHudOpen && (
        <StreamTelemetry
          videoElement={videoRef.current}
          hasRealStream={hasRealStream}
          playbackStatus={hasRealStream ? playback.state.status : 'simulated'}
          playbackSpeed={playbackSpeed}
          audioDelayMs={audioDelayMs}
          subDelaySecs={subDelaySecs}
          watchdogState={hasRealStream && playback.state.status === 'buffering' ? 'buffering' : 'healthy'}
          onClose={() => setStatsHudOpen(false)}
        />
      )}

      {/* Inactivity Prompt Overlay: Are you still watching? */}
      <InactivityPromptOverlay
        open={inactivityPromptOpen}
        countdownSecs={inactivityCountdown}
        onConfirmStillWatching={() => {
          inactivityGuardRef.current?.confirmStillWatching()
        }}
        onStopPlayback={() => {
          inactivityGuardRef.current?.stop()
          setInactivityPromptOpen(false)
          if (playback.ready && playback.state.status === 'playing') {
            playback.togglePlay()
          }
        }}
      />

      {/* Subtitle Sync Nudge HUD Banner */}
      {subNudgeNotice && (
        <div className="player-nudge-hud" role="status" aria-live="polite">
          <Icon name="subtitles" size={16} />
          <span>{subNudgeNotice}</span>
        </div>
      )}

      {/* Bottom Controls Bar */}
      <div className="player-bottom">
        {durationSec > 0 && (
          <div
            className="scrub"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
              setScrubHover({ time: Math.round(pct * durationSec), percent: pct * 100 })
            }}
            onMouseLeave={() => setScrubHover(null)}
          >
            {scrubHover && (
              <div className="scrub-hover-preview" style={{ left: `${scrubHover.percent}%` }}>
                {hoverStoryboardCue ? (
                  <div className="scrub-hover-thumb scrub-hover-sprite" style={getSpriteStyle(hoverStoryboardCue)} />
                ) : previewArt ? (
                  <div className="scrub-hover-thumb">
                    <img src={previewArt} alt="" />
                  </div>
                ) : null}
                <span className="scrub-hover-tip tnum">
                  {hoverChapter?.title ? `${hoverChapter.title} · ` : ''}{timecode(scrubHover.time)}
                </span>
              </div>
            )}
            <div className="scrub-track-wrapper" style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
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
              <ChapterTicks markers={computedChapterMarkers} activePercent={(pos / durationSec) * 100} />
            </div>
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
                <input type="range" className="range volume" min={0} max={100} value={playback.muted ? 0 : Math.round(playback.volume * 100)} onChange={(e) => playback.setVolume(Number(e.target.value) / 100)} onInput={(e) => playback.setVolume(Number((e.target as HTMLInputElement).value) / 100)} aria-label="Volume" style={{ ['--fill' as string]: `${playback.muted ? 0 : Math.round(playback.volume * 100)}%` }} />
              </>
            )}
            {!hasRealStream && (
              <>
                <button type="button" className="icon-btn" onClick={() => setMuted(!muted)} aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute'} data-tip={muted ? 'Unmute' : 'Mute'}><Icon name={muted ? 'mute' : 'volume'} /></button>
                <input type="range" className="range volume" min={0} max={100} value={muted ? 0 : volume} onChange={(e) => { setVolume(Number(e.target.value)); setMuted(Number(e.target.value) === 0) }} onInput={(e) => { const v = Number((e.target as HTMLInputElement).value); setVolume(v); setMuted(v === 0) }} aria-label="Volume" style={{ ['--fill' as string]: `${muted ? 0 : volume}%` }} />
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

            {/* Quick Channels Trigger */}
            {channelItem && (
              <button
                type="button"
                className={`icon-btn ${activeDrawer === 'channels' ? 'is-active' : ''}`}
                onClick={() => setActiveDrawer((d) => (d === 'channels' ? 'none' : 'channels'))}
                aria-label="Quick Channels (Z)"
                data-tip="Channels (Z)"
              >
                <Icon name="tv" />
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

            {hasRealStream && (playback.tracks.subtitles.length > 0 || externalSubTitle !== null) && (
              <Menu icon="subtitles" label="Subtitles">
                {(close) => (
                  <>
                    <p className="menu-label">Subtitles</p>
                    <MenuOption selected={playback.tracks.subtitleId < 0 && !externalSubTitle} onSelect={() => { playback.setSubtitleTrack(-1); setExternalSubTitle(null); store.setPref('subtitles', false); close() }}>Off</MenuOption>
                    {playback.tracks.subtitles.map((t) => (
                      <MenuOption key={t.id} selected={playback.tracks.subtitleId === t.id && !externalSubTitle} onSelect={() => { playback.setSubtitleTrack(t.id); setExternalSubTitle(null); store.setPref('subtitles', true); close() }}>{t.label}</MenuOption>
                    ))}
                    {externalSubTitle && (
                      <MenuOption selected={true} onSelect={() => { store.setPref('subtitles', true); close() }}>{externalSubTitle} (External)</MenuOption>
                    )}

                    <div className="menu-divider" />
                    <MenuOption
                      selected={false}
                      onSelect={() => {
                        setSubtitleSearchOpen(true)
                        close()
                      }}
                    >
                      Find Subtitles (OpenSubtitles)...
                    </MenuOption>
                    <MenuOption
                      selected={false}
                      onSelect={() => {
                        subFileInputRef.current?.click()
                        close()
                      }}
                    >
                      Load Local Subtitles (.srt, .vtt)...
                    </MenuOption>

                    <div className="menu-divider" />
                    <p className="menu-label">Subtitle Timing Sync</p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px 8px', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => nudgeSubtitleSync(-0.25)}
                        title="Nudge earlier by 250ms (or press [)"
                      >
                        -250ms
                      </button>
                      <span className="tnum" style={{ fontWeight: 600, fontSize: '0.8125rem', minWidth: '48px', textAlign: 'center' }}>
                        {subDelaySecs === 0 ? '0.0s' : `${subDelaySecs > 0 ? `+${subDelaySecs.toFixed(2)}` : subDelaySecs.toFixed(2)}s`}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => nudgeSubtitleSync(0.25)}
                        title="Nudge later by 250ms (or press ])"
                      >
                        +250ms
                      </button>
                    </div>
                    {[-1.0, -0.5, 0.0, 0.5, 1.0, 2.0].map((sec) => (
                      <MenuOption
                        key={sec}
                        selected={subDelaySecs === sec}
                        onSelect={() => {
                          setSubDelaySecs(sec)
                          toast(`Subtitle sync: ${sec > 0 ? `+${sec}s` : `${sec}s`}`)
                          close()
                        }}
                      >
                        {sec === 0 ? '0.0s (In Sync)' : `${sec > 0 ? `+${sec}s` : `${sec}s`}`}
                      </MenuOption>
                    ))}

                    <div className="menu-divider" />
                    <p className="menu-label">Subtitle Size</p>
                    {[100, 125, 150].map((pct) => (
                      <MenuOption
                        key={pct}
                        selected={subStyles.fontSizePercent === pct}
                        onSelect={() => {
                          setSubStyles((s) => ({ ...s, fontSizePercent: pct }))
                          toast(`Subtitle size: ${pct}%`)
                          close()
                        }}
                      >
                        {pct === 100 ? 'Normal (100%)' : pct === 125 ? 'Large (125%)' : 'Extra Large (150%)'}
                      </MenuOption>
                    ))}
                  </>
                )}
              </Menu>
            )}

            {hasRealStream && playback.tracks.levels.length > 1 && (
              <Menu icon="cog" label="Quality">
                {(close) => {
                  const currentLevel = playback.tracks.levels.find((l) => l.id === playback.tracks.levelId)
                  return (
                    <>
                      <p className="menu-label">Video Quality</p>
                      <MenuOption
                        selected={playback.tracks.levelId === -1}
                        onSelect={() => {
                          playback.setLevel(-1)
                          toast('Quality set to Auto')
                          close()
                        }}
                      >
                        Auto {currentLevel?.height ? `(${currentLevel.height}p)` : ''}
                      </MenuOption>
                      {playback.tracks.levels.map((lvl) => {
                        const bitrateMbps = lvl.bitrate ? ` (${(lvl.bitrate / 1_000_000).toFixed(1)} Mbps)` : ''
                        const label = lvl.name || `${lvl.height}p`
                        return (
                          <MenuOption
                            key={lvl.id}
                            selected={playback.tracks.levelId === lvl.id}
                            onSelect={() => {
                              playback.setLevel(lvl.id)
                              toast(`Quality set to ${lvl.height}p`)
                              close()
                            }}
                          >
                            {label}{bitrateMbps}
                          </MenuOption>
                        )
                      })}
                    </>
                  )
                }}
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

            {hasRealStream && playback.ready && (
              <Menu icon="volume" label="Sound">
                {(close) => (
                  <>
                    <p className="menu-label">Audio Enhancement</p>
                    <MenuOption
                      selected={dialogueBoost}
                      onSelect={() => {
                        const next = !dialogueBoost
                        setDialogueBoost(next)
                        toast(next ? 'Dialogue Clarity Boost enabled' : 'Dialogue Clarity Boost disabled')
                        close()
                      }}
                    >
                      Dialogue Boost {dialogueBoost ? '(Active)' : '(Off)'}
                    </MenuOption>
                    <MenuOption
                      selected={nightMode}
                      onSelect={() => {
                        const next = !nightMode
                        setNightMode(next)
                        toast(next ? 'Night Mode compression enabled' : 'Night Mode compression disabled')
                        close()
                      }}
                    >
                      Night Mode {nightMode ? '(Active)' : '(Off)'}
                    </MenuOption>
                    <MenuOption
                      selected={autoLoudness}
                      onSelect={() => {
                        const next = !autoLoudness
                        setAutoLoudness(next)
                        toast(next ? 'Auto-Loudness Normalization enabled' : 'Auto-Loudness disabled')
                        close()
                      }}
                    >
                      Auto-Loudness (EBU R128) {autoLoudness ? '(Active)' : '(Off)'}
                    </MenuOption>

                    <div className="menu-divider" />
                    <p className="menu-label">Audio Lip-Sync Delay</p>
                    {[0, 50, 100, 150, 250, 400].map((ms) => (
                      <MenuOption
                        key={ms}
                        selected={audioDelayMs === ms}
                        onSelect={() => {
                          setAudioDelayMs(ms)
                          toast(ms === 0 ? 'Audio delay off' : `Audio delay set to ${ms} ms`)
                          close()
                        }}
                      >
                        {ms === 0 ? '0 ms (In Sync)' : `${ms} ms delay`}
                      </MenuOption>
                    ))}

                    <div className="menu-divider" />
                    <p className="menu-label">Sound Equalizer</p>
                    <MenuOption
                      selected={eqPreset === 'flat'}
                      onSelect={() => {
                        setEqPreset('flat')
                        toast('Equalizer: Flat')
                        close()
                      }}
                    >
                      Flat (Default)
                    </MenuOption>
                    <MenuOption
                      selected={eqPreset === 'vocal'}
                      onSelect={() => {
                        setEqPreset('vocal')
                        toast('Equalizer: Vocal Clarity')
                        close()
                      }}
                    >
                      Vocal Clarity
                    </MenuOption>
                    <MenuOption
                      selected={eqPreset === 'bass_boost'}
                      onSelect={() => {
                        setEqPreset('bass_boost')
                        toast('Equalizer: Bass Boost')
                        close()
                      }}
                    >
                      Bass Boost
                    </MenuOption>
                    <MenuOption
                      selected={eqPreset === 'treble'}
                      onSelect={() => {
                        setEqPreset('treble')
                        toast('Equalizer: Treble Boost')
                        close()
                      }}
                    >
                      Treble Boost
                    </MenuOption>

                    <div className="menu-divider" />
                    <p className="menu-label">Volume Boost</p>
                    <MenuOption
                      selected={volumeBoost === 1.0}
                      onSelect={() => {
                        setVolumeBoost(1.0)
                        toast('Volume Boost: 100% (Normal)')
                        close()
                      }}
                    >
                      100% (Normal)
                    </MenuOption>
                    <MenuOption
                      selected={volumeBoost === 1.5}
                      onSelect={() => {
                        setVolumeBoost(1.5)
                        toast('Volume Boost: 150%')
                        close()
                      }}
                    >
                      150% (+3.5 dB)
                    </MenuOption>
                    <MenuOption
                      selected={volumeBoost === 2.0}
                      onSelect={() => {
                        setVolumeBoost(2.0)
                        toast('Volume Boost: 200%')
                        close()
                      }}
                    >
                      200% (+6 dB)
                    </MenuOption>
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

            <button
              type="button"
              className="icon-btn"
              onClick={() => setSyncPlayOpen(true)}
              aria-label="SyncPlay Co-Watching"
              data-tip="SyncPlay Co-Watching"
            >
              <Icon name="cast" />
            </button>

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

            {/* Playback Options: Speed, Aspect, Sleep Timer, Stats & Diagnostics */}
            <Menu icon="settings" label="Playback options">
              {(close) => (
                <>
                  <p className="menu-label">Playback Speed</p>
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

                  <div className="menu-divider" />
                  <p className="menu-label">Aspect Ratio</p>
                  <MenuOption selected={aspectRatio === 'auto'} onSelect={() => { setAspectRatio('auto'); close() }}>Auto</MenuOption>
                  <MenuOption selected={aspectRatio === '16:9'} onSelect={() => { setAspectRatio('16:9'); close() }}>16:9 Widescreen</MenuOption>
                  <MenuOption selected={aspectRatio === '4:3'} onSelect={() => { setAspectRatio('4:3'); close() }}>4:3 Standard</MenuOption>
                  <MenuOption selected={aspectRatio === 'fill'} onSelect={() => { setAspectRatio('fill'); close() }}>Fill / Zoom</MenuOption>
                  <MenuOption selected={aspectRatio === 'smart-stretch'} onSelect={() => { setAspectRatio('smart-stretch'); close() }}>Smart Stretch (Non-linear)</MenuOption>
                  <MenuOption selected={aspectRatio === '21:9'} onSelect={() => { setAspectRatio('21:9'); close() }}>21:9 Ultrawide</MenuOption>

                  <div className="menu-divider" />
                  <p className="menu-label">Picture Calibration</p>
                  <MenuOption
                    selected={pictureSettings.brightness === 1.0 && pictureSettings.contrast === 1.0 && pictureSettings.saturation === 1.0}
                    onSelect={() => {
                      setPictureSettings(DEFAULT_PICTURE_SETTINGS)
                      toast('Picture settings reset to standard')
                      close()
                    }}
                  >
                    Standard (Default)
                  </MenuOption>
                  <MenuOption
                    selected={pictureSettings.brightness === 1.15 && pictureSettings.contrast === 1.1}
                    onSelect={() => {
                      setPictureSettings({ brightness: 1.15, contrast: 1.1, saturation: 1.15 })
                      toast('Picture mode: Cinema Bright')
                      close()
                    }}
                  >
                    Cinema Bright
                  </MenuOption>
                  <MenuOption
                    selected={pictureSettings.contrast === 1.25 && pictureSettings.saturation === 1.25}
                    onSelect={() => {
                      setPictureSettings({ brightness: 1.0, contrast: 1.25, saturation: 1.25 })
                      toast('Picture mode: Vivid / Sports')
                      close()
                    }}
                  >
                    Vivid / Sports
                  </MenuOption>
                  <MenuOption
                    selected={pictureSettings.saturation === 0}
                    onSelect={() => {
                      setPictureSettings({ brightness: 1.05, contrast: 1.15, saturation: 0 })
                      toast('Picture mode: Monochrome / B&W')
                      close()
                    }}
                  >
                    Classic Monochrome
                  </MenuOption>

                  <div className="menu-divider" />
                  <p className="menu-label">A-B Loop</p>
                  <MenuOption
                    selected={false}
                    onSelect={() => {
                      const pos = contextCurrentTime
                      setAbLoop({ ...abLoop, a: pos })
                      toast(`A-B Loop: Point A set at ${timecode(pos)}`)
                      close()
                    }}
                  >
                    {abLoop.a !== null ? `Point A: ${timecode(abLoop.a)} (Update)` : 'Set Point A'}
                  </MenuOption>
                  <MenuOption
                    selected={false}
                    onSelect={() => {
                      const pos = contextCurrentTime
                      setAbLoop({ ...abLoop, b: pos })
                      toast(`A-B Loop: Point B set at ${timecode(pos)}`)
                      close()
                    }}
                  >
                    {abLoop.b !== null ? `Point B: ${timecode(abLoop.b)} (Update)` : 'Set Point B'}
                  </MenuOption>
                  {(abLoop.a !== null || abLoop.b !== null) && (
                    <MenuOption
                      selected={false}
                      onSelect={() => {
                        setAbLoop(DEFAULT_AB_LOOP)
                        toast('A-B Loop cleared')
                        close()
                      }}
                    >
                      Clear A-B Loop
                    </MenuOption>
                  )}

                  <div className="menu-divider" />
                  <p className="menu-label">External Subtitles</p>
                  <MenuOption
                    selected={false}
                    onSelect={() => {
                      subFileInputRef.current?.click()
                      close()
                    }}
                  >
                    Load Subtitles (.srt, .vtt)...
                  </MenuOption>

                  <div className="menu-divider" />
                  <p className="menu-label">Sleep Timer</p>
                  <MenuOption
                    selected={!sleepTimerMinutes}
                    onSelect={() => {
                      setSleepTimerMinutes(null)
                      setSleepTimerRemaining(null)
                      setSleepTimerMode(null)
                      toast('Sleep timer turned off')
                      close()
                    }}
                  >
                    Off
                  </MenuOption>
                  {programme && programme.stop && (
                    <MenuOption
                      selected={sleepTimerMode === 'programme'}
                      onSelect={() => {
                        const remainingSecs = Math.max(15, Math.floor((new Date(programme.stop).getTime() - Date.now()) / 1000))
                        setSleepTimerMinutes(Math.ceil(remainingSecs / 60))
                        setSleepTimerRemaining(remainingSecs)
                        setSleepTimerMode('programme')
                        toast(`Sleep timer: Stopping after "${programme.title}"`)
                        close()
                      }}
                    >
                      End of show ({programme.title})
                    </MenuOption>
                  )}
                  {[15, 30, 45, 60].map((m) => (
                    <MenuOption
                      key={m}
                      selected={sleepTimerMode === 'minutes' && sleepTimerMinutes === m}
                      onSelect={() => {
                        setSleepTimerMinutes(m)
                        setSleepTimerRemaining(m * 60)
                        setSleepTimerMode('minutes')
                        toast(`Sleep timer set for ${m} minutes`)
                        close()
                      }}
                    >
                      {m} minutes
                    </MenuOption>
                  ))}

                  <div className="menu-divider" />
                  <p className="menu-label">Diagnostics & HUD</p>
                  <MenuOption
                    selected={statsHudOpen}
                    onSelect={() => {
                      setStatsHudOpen(!statsHudOpen)
                      close()
                    }}
                  >
                    Stats for Nerds (Shift+D)
                  </MenuOption>
                  <MenuOption
                    selected={activeDrawer === 'diagnostics'}
                    onSelect={() => {
                      setActiveDrawer((d) => (d === 'diagnostics' ? 'none' : 'diagnostics'))
                      close()
                    }}
                  >
                    Technical Diagnostics (I/D)
                  </MenuOption>

                  <div className="menu-divider" />
                  <p className="menu-label">Subtitles & Captions</p>
                  <MenuOption
                    selected={false}
                    onSelect={() => {
                      setSubtitleSearchOpen(true)
                      close()
                    }}
                  >
                    Find Subtitles (OpenSubtitles)...
                  </MenuOption>
                  <MenuOption
                    selected={false}
                    onSelect={() => {
                      subFileInputRef.current?.click()
                      close()
                    }}
                  >
                    Load Local Subtitles (.srt, .vtt)...
                  </MenuOption>
                </>
              )}
            </Menu>

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

            {hasRealStream && (
              <button
                type="button"
                className="icon-btn"
                onClick={cycleAspectRatio}
                aria-label="Cycle aspect ratio (A)"
                data-tip="Aspect (A)"
              >
                <Icon name="aspect" />
              </button>
            )}

            {hasRealStream && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => void takeScreenshot()}
                aria-label="Capture video frame (Alt+S)"
                data-tip="Snapshot (Alt+S)"
              >
                <Icon name="camera" />
              </button>
            )}

            {channelItem && (
              <button
                type="button"
                className={`icon-btn ${mosaicOpen ? 'is-active' : ''}`}
                onClick={() => setMosaicOpen((o) => !o)}
                aria-pressed={mosaicOpen}
                aria-label={mosaicOpen ? 'Close multi-screen mosaic' : 'Open multi-screen mosaic (V)'}
                data-tip="Multi-Screen (V)"
              >
                <Icon name="grid" />
              </button>
            )}

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
                >
                  <button
                    type="button"
                    className="server-card-header-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSelectServer(variant)
                    }}
                    aria-label={`Select ${variant.name || `Server ${index + 1}`}${isPlaying ? ', playing' : ''}`}
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
                  </button>

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
            <h3><Icon name="guide" size={20} />{channelItem.cleanName || cleanChannelTitle(channelItem.name)} Schedule</h3>
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

      {/* Drawer 4: Quick Channel Selector Drawer */}
      {activeDrawer === 'channels' && (
        <QuickChannelDrawer
          channels={store.channels}
          currentChannelId={channelItem?.id}
          favouriteIds={store.library.favourites.flatMap((fRef) => {
            const resolved = resolve(fRef, now, store.findChannel, store.programmeAt, store.demoTitles)
            return resolved && resolved.kind === 'channel' && 'id' in resolved.item ? [(resolved.item as { id: string }).id] : []
          })}
          onTune={(c) => {
            setActiveDrawer('none')
            setZappingVisible(true)
            navigate(`/watch/${encodeURIComponent(channelRef(c.id))}`)
          }}
          onToggleFavourite={(id) => store.toggleFavourite(channelRef(id))}
          onClose={() => setActiveDrawer('none')}
          getProgramme={(id) => {
            const ch = store.findChannel(id)
            return ch ? (store.programmeAt(ch, now) ?? null) : null
          }}
          getNextProgramme={(id) => {
            const ch = store.findChannel(id)
            return ch ? (store.nextProgramme(ch, now) ?? null) : null
          }}
        />
      )}

      {/* Floating Zapping HUD Overlay */}
      {channelItem && (
        <ZappingOverlay
          channel={channelItem}
          nowProgramme={programme}
          nextProgramme={nextProg}
          visible={zappingVisible}
          onClose={() => setZappingVisible(false)}
          onNextChannel={() => stepChannel(1)}
          onPrevChannel={() => stepChannel(-1)}
        />
      )}

      {/* Transient HUD Notice Banner */}
      {transientNotice && (
        <div className="player-osd-transient-hud" role="status" aria-live="polite">
          <span>{transientNotice}</span>
        </div>
      )}

      {/* Edge & Drag Gesture OSD HUD */}
      {gestureOsd && (
        <div className="player-gesture-hud" role="status" aria-live="polite">
          <div className="player-gesture-icon-wrap">
            <Icon
              name={gestureOsd.type === 'brightness' ? 'sun' : gestureOsd.type === 'volume' ? 'volume' : 'skip'}
              size={24}
            />
          </div>
          {gestureOsd.type !== 'seek' && (
            <div className="player-gesture-meter-track">
              <div
                className="player-gesture-meter-fill"
                style={{ width: `${Math.max(0, Math.min(100, gestureOsd.percent))}%` }}
              />
            </div>
          )}
          <span className="player-gesture-label">
            {gestureOsd.type === 'brightness' && `Brightness: ${gestureOsd.text}`}
            {gestureOsd.type === 'volume' && `Volume: ${gestureOsd.text}`}
            {gestureOsd.type === 'seek' && `Scrub: ${gestureOsd.text}`}
          </span>
        </div>
      )}

      {/* Interactive Now & Next Live EPG Mini-Bar */}
      {nowNextBarOpen && channelItem && (
        <PlayerNowNextBar
          currentChannel={channelItem}
          allChannels={channelList}
          currentProgramme={programme}
          nextProgramme={nextProg}
          now={now}
          timeFormat={prefs.timeFormat}
          onTuneChannel={(targetChan) => {
            setNowNextBarOpen(false)
            setZappingVisible(true)
            navigate(`/watch/${encodeURIComponent(channelRef(targetChan.id))}`)
          }}
          onClose={() => setNowNextBarOpen(false)}
          onOpenGuide={() => {
            setNowNextBarOpen(false)
            setActiveDrawer('epg')
          }}
        />
      )}

      {/* Multi-Screen Mosaic Grid Overlay */}
      {mosaicOpen && channelItem && (
        <LiveMosaicGrid
          open={mosaicOpen}
          onClose={() => setMosaicOpen(false)}
          channels={channelList}
          initialChannel={channelItem}
          onTuneFullChannel={(targetChan) => {
            setMosaicOpen(false)
            setZappingVisible(true)
            navigate(`/watch/${encodeURIComponent(channelRef(targetChan.id))}`)
          }}
        />
      )}

      {/* OpenSubtitles Search and Downloader Modal */}
      {subtitleSearchOpen && (
        <SubtitleSearchModal
          open={subtitleSearchOpen}
          onClose={() => setSubtitleSearchOpen(false)}
          mediaTitle={item?.kind === 'episode' ? (item.series && 'title' in item.series ? item.series.title : item.title) : item?.title || ''}
          season={item?.kind === 'episode' && item.item && 'season' in item.item ? (item.item as { season: number }).season : undefined}
          episode={item?.kind === 'episode' && item.item && 'episode' in item.item ? (item.item as { episode: number }).episode : undefined}
          onApplySubtitle={handleApplyExternalSubtitle}
        />
      )}

      {/* SyncPlay Co-Watching Group Modal */}
      {syncPlayOpen && (
        <SyncPlayModal
          open={syncPlayOpen}
          onClose={() => setSyncPlayOpen(false)}
          mediaRef={item?.ref || activeStream?.ref || ''}
          mediaTitle={item?.title || activeStream?.title || ''}
          currentPositionSec={pos}
          isPlaying={playback.state.status === 'playing'}
          onSeek={(targetSec) => seek(targetSec)}
        />
      )}
    </div>
  )
}
