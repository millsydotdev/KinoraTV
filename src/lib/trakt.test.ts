// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  loadTraktConfig,
  saveTraktConfig,
  clearTraktTokens,
  requestDeviceCode,
  pollDeviceToken,
  scrobbleMedia,
  fetchWatchedMovies,
  fetchWatchedShows,
  performTraktSync,
  TRAKT_STORAGE_KEY,
} from './trakt'
import * as nativeModule from './native'

vi.mock('./native', () => ({
  fetchTrakt: vi.fn(),
  isTauri: vi.fn(() => false),
}))

describe('trakt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.removeItem(TRAKT_STORAGE_KEY)
  })

  it('loads default configuration when empty', () => {
    const config = loadTraktConfig()
    expect(config.enabled).toBe(false)
    expect(config.autoScrobble).toBe(true)
    expect(config.accessToken).toBe('')
  })

  it('saves configuration and clears tokens safely', () => {
    saveTraktConfig({
      enabled: true,
      accessToken: 'test-token-123',
      user: { username: 'testuser', name: 'Test User' },
    })

    let current = loadTraktConfig()
    expect(current.enabled).toBe(true)
    expect(current.accessToken).toBe('test-token-123')
    expect(current.user?.username).toBe('testuser')

    clearTraktTokens()
    current = loadTraktConfig()
    expect(current.enabled).toBe(true)
    expect(current.accessToken).toBe('')
    expect(current.user).toBeNull()
  })

  it('requests device authorization code', async () => {
    vi.mocked(nativeModule.fetchTrakt).mockResolvedValue(
      JSON.stringify({
        device_code: 'dev-123',
        user_code: 'ABCD-1234',
        verification_url: 'https://trakt.tv/activate',
        expires_in: 600,
        interval: 5,
      })
    )

    const code = await requestDeviceCode('test-client-id')
    expect(code.deviceCode).toBe('dev-123')
    expect(code.userCode).toBe('ABCD-1234')
    expect(code.verificationUrl).toBe('https://trakt.tv/activate')
  })

  it('polls device token endpoint with success and pending cases', async () => {
    // 1. Success
    vi.mocked(nativeModule.fetchTrakt).mockResolvedValueOnce(
      JSON.stringify({
        access_token: 'acc-token-456',
        refresh_token: 'ref-token-789',
        expires_in: 7776000,
      })
    )

    const resSuccess = await pollDeviceToken('dev-123', 'client-id')
    expect(resSuccess.status).toBe('success')
    if (resSuccess.status === 'success') {
      expect(resSuccess.accessToken).toBe('acc-token-456')
    }

    // 2. Pending (400)
    vi.mocked(nativeModule.fetchTrakt).mockRejectedValueOnce(new Error('HTTP 400 Bad Request'))
    const resPending = await pollDeviceToken('dev-123', 'client-id')
    expect(resPending.status).toBe('pending')

    // 3. Denied (409)
    vi.mocked(nativeModule.fetchTrakt).mockRejectedValueOnce(new Error('HTTP 409 Conflict'))
    const resDenied = await pollDeviceToken('dev-123', 'client-id')
    expect(resDenied.status).toBe('denied')
  })

  it('scrobbles media progress with bounded range', async () => {
    saveTraktConfig({
      enabled: true,
      autoScrobble: true,
      accessToken: 'valid-token',
    })

    vi.mocked(nativeModule.fetchTrakt).mockResolvedValue(JSON.stringify({ id: 100 }))

    const res = await scrobbleMedia('start', {
      movie: { title: 'Dune Part Two', year: 2024 },
      progress: 55.44,
    })

    expect(res).toBe(true)
    expect(nativeModule.fetchTrakt).toHaveBeenCalledWith(
      'https://api.trakt.tv/scrobble/start',
      'POST',
      expect.any(String),
      'valid-token',
      expect.stringContaining('"progress":55.4')
    )
  })

  it('fetches watched movies and television shows', async () => {
    vi.mocked(nativeModule.fetchTrakt)
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            plays: 2,
            last_watched_at: '2026-11-20T12:00:00Z',
            movie: { title: 'Oppenheimer', year: 2023, ids: { tmdb: 872585 } },
          },
        ])
      )
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            plays: 1,
            last_watched_at: '2026-11-21T18:00:00Z',
            show: { title: 'Severance', year: 2022 },
            seasons: [
              {
                number: 1,
                episodes: [{ number: 1, plays: 1, last_watched_at: '2026-11-21T18:00:00Z' }],
              },
            ],
          },
        ])
      )

    const movies = await fetchWatchedMovies('token', 'client')
    expect(movies.length).toBe(1)
    expect(movies[0]?.movie.title).toBe('Oppenheimer')

    const shows = await fetchWatchedShows('token', 'client')
    expect(shows.length).toBe(1)
    expect(shows[0]?.seasons[0]?.episodes.length).toBe(1)
  })

  it('performs full two-way synchronization and notifies import callback', async () => {
    saveTraktConfig({
      enabled: true,
      accessToken: 'valid-token',
    })

    vi.mocked(nativeModule.fetchTrakt)
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            plays: 1,
            last_watched_at: '2026-11-20T12:00:00Z',
            movie: { title: 'Inception', year: 2010, ids: { tmdb: 27205 } },
          },
        ])
      )
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            plays: 1,
            last_watched_at: '2026-11-21T18:00:00Z',
            show: { title: 'Slow Horses', year: 2022 },
            seasons: [
              {
                number: 1,
                episodes: [{ number: 1, plays: 1, last_watched_at: '2026-11-21T18:00:00Z' }],
              },
            ],
          },
        ])
      )

    const importedRefs: string[] = []
    const summary = await performTraktSync((ref) => {
      importedRefs.push(ref)
    })

    expect(summary.moviesImported).toBe(1)
    expect(summary.episodesImported).toBe(1)
    expect(importedRefs).toContain('movie:tmdb:27205')
    expect(importedRefs).toContain('episode:slow horses:s1e1')
  })
})
