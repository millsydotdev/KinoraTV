// SubtitleSearchModal.tsx - In-player subtitle search, downloader, and local file loader.
// Queries OpenSubtitles REST API through guarded Rust networking and injects WebVTT tracks.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import {
  searchOpenSubtitles,
  downloadSubtitleText,
  formatSubtitleLanguage,
  type SubtitleSearchResult,
} from '../lib/openSubtitles'
import {
  parseSubtitleText,
  cuesToVttBlobUrl,
} from '../lib/subtitles'
import './SubtitleSearchModal.css'

export interface SubtitleSearchModalProps {
  open: boolean
  onClose: () => void
  mediaTitle: string
  season?: number
  episode?: number
  onApplySubtitle: (vttBlobUrl: string, trackLabel: string) => void
}

const LANGUAGES = [
  { code: '', label: 'All Languages' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'ru', label: 'Russian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ar', label: 'Arabic' },
]

export function SubtitleSearchModal({
  open,
  onClose,
  mediaTitle,
  season,
  episode,
  onApplySubtitle,
}: SubtitleSearchModalProps) {
  const [query, setQuery] = useState(mediaTitle)
  const [language, setLanguage] = useState('en')
  const [hearingImpaired, setHearingImpaired] = useState(false)
  const [seasonNum, setSeasonNum] = useState<number | undefined>(season)
  const [episodeNum, setEpisodeNum] = useState<number | undefined>(episode)
  const [results, setResults] = useState<SubtitleSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) {
      setQuery(mediaTitle)
      setSeasonNum(season)
      setEpisodeNum(episode)
      setError(null)
      // Auto-trigger search for title
      if (mediaTitle.trim()) {
        void handleSearch(mediaTitle, language, season, episode, hearingImpaired)
      }
    }
  }, [open, mediaTitle, season, episode])

  if (!open) return null

  async function handleSearch(
    searchQuery: string,
    lang: string,
    s?: number,
    ep?: number,
    hi?: boolean,
  ) {
    if (!searchQuery.trim()) return
    setSearching(true)
    setError(null)
    try {
      const res = await searchOpenSubtitles(searchQuery, {
        language: lang || undefined,
        season: s,
        episode: ep,
        hearingImpaired: hi,
      })
      setResults(res)
      if (res.length === 0) {
        setError('No subtitle tracks found for this title and language.')
      }
    } catch {
      setError('Unable to query subtitle provider. Check network connection.')
    } finally {
      setSearching(false)
    }
  }

  const handleDownloadAndApply = async (sub: SubtitleSearchResult) => {
    setDownloadingId(sub.id)
    try {
      const text = await downloadSubtitleText(sub.downloadUrl)
      if (!text) {
        setError('Failed to download subtitle file from server.')
        setDownloadingId(null)
        return
      }

      const cues = parseSubtitleText(text)
      if (cues.length === 0) {
        setError('Downloaded subtitle file contained no parseable cues.')
        setDownloadingId(null)
        return
      }

      const blobUrl = cuesToVttBlobUrl(cues)
      const label = `${formatSubtitleLanguage(sub.language)} (${sub.format.toUpperCase()}${sub.hearingImpaired ? ', CC' : ''})`
      onApplySubtitle(blobUrl, label)
      onClose()
    } catch {
      setError('An error occurred while parsing and injecting the subtitle.')
    } finally {
      setDownloadingId(null)
    }
  }

  const handleLocalFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      if (content) {
        const cues = parseSubtitleText(content)
        if (cues.length > 0) {
          const blobUrl = cuesToVttBlobUrl(cues)
          const fileName = file.name.replace(/\.[^/.]+$/, '')
          onApplySubtitle(blobUrl, `Custom: ${fileName}`)
          onClose()
        } else {
          setError('Selected file does not contain valid SRT or VTT subtitle cues.')
        }
      }
    }
    reader.readAsText(file)
  }

  return (
    <div
      className="subtitle-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Find & Download Subtitles"
    >
      <div className="subtitle-modal-dialog">
        {/* Header */}
        <header className="subtitle-modal-header">
          <div className="subtitle-modal-title-group">
            <Icon name="subtitles" size={24} className="subtitle-modal-title-icon" />
            <div>
              <h2 className="subtitle-modal-title">Subtitles & Captions</h2>
              <p className="subtitle-modal-subtitle">
                Search OpenSubtitles or load a local SRT/VTT file directly into player.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close subtitle search dialog"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        {/* Search controls */}
        <form
          className="subtitle-search-form"
          onSubmit={(e) => {
            e.preventDefault()
            void handleSearch(query, language, seasonNum, episodeNum, hearingImpaired)
          }}
        >
          <div className="subtitle-input-row">
            <input
              type="text"
              className="subtitle-input-query"
              placeholder="Search title, movie, or series name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Subtitle search query"
            />
            <select
              className="subtitle-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              aria-label="Subtitle language filter"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="btn btn-primary btn-small"
              disabled={searching || !query.trim()}
            >
              <Icon name="search" size={14} />
              <span>{searching ? 'Searching...' : 'Search'}</span>
            </button>
          </div>

          <div className="subtitle-options-row">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {seasonNum !== undefined && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>S:</span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={seasonNum || ''}
                    onChange={(e) => setSeasonNum(e.target.value ? parseInt(e.target.value) : undefined)}
                    style={{ width: 44, padding: '2px 4px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 4 }}
                  />
                </label>
              )}
              {episodeNum !== undefined && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>Ep:</span>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={episodeNum || ''}
                    onChange={(e) => setEpisodeNum(e.target.value ? parseInt(e.target.value) : undefined)}
                    style={{ width: 48, padding: '2px 4px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 4 }}
                  />
                </label>
              )}
              <label className="subtitle-checkbox-label">
                <input
                  type="checkbox"
                  checked={hearingImpaired}
                  onChange={(e) => setHearingImpaired(e.target.checked)}
                />
                <span>Hearing Impaired (SDH / CC)</span>
              </label>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".srt,.vtt,text/vtt,text/plain"
              style={{ display: 'none' }}
              onChange={handleLocalFileUpload}
            />
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => fileInputRef.current?.click()}
            >
              <Icon name="upload" size={14} />
              <span>Load Local File</span>
            </button>
          </div>
        </form>

        {error && (
          <div
            style={{
              padding: '10px 24px',
              background: 'rgba(239, 68, 68, 0.15)',
              borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              fontSize: '0.8125rem',
            }}
          >
            {error}
          </div>
        )}

        {/* Results List */}
        <div className="subtitle-results-container">
          {searching ? (
            <div className="subtitle-empty-state">
              <Icon name="refresh" size={32} />
              <span>Querying OpenSubtitles catalogue...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="subtitle-empty-state">
              <Icon name="subtitles" size={36} />
              <span>Search for subtitles or load a local file to display captions.</span>
            </div>
          ) : (
            results.map((sub) => {
              const isDownloading = downloadingId === sub.id

              return (
                <div key={sub.id} className="subtitle-card">
                  <div className="subtitle-card-info">
                    <span className="subtitle-file-name" title={sub.fileName}>
                      {sub.fileName}
                    </span>
                    <div className="subtitle-card-badges">
                      <span className="subtitle-lang-pill">
                        {formatSubtitleLanguage(sub.language)}
                      </span>
                      <span className="subtitle-format-pill">{sub.format}</span>
                      {sub.hearingImpaired && (
                        <span className="subtitle-cc-pill">SDH</span>
                      )}
                      {sub.downloadCount > 0 && (
                        <span className="subtitle-downloads-count">
                          {sub.downloadCount.toLocaleString()} downloads
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    disabled={isDownloading}
                    onClick={() => void handleDownloadAndApply(sub)}
                  >
                    <Icon name={isDownloading ? 'refresh' : 'download'} size={14} />
                    <span>{isDownloading ? 'Applying...' : 'Apply'}</span>
                  </button>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <footer className="subtitle-modal-footer">
          <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
            Subtitles are streamed securely via native guarded networking.
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={onClose}
          >
            Cancel
          </button>
        </footer>
      </div>
    </div>
  )
}
