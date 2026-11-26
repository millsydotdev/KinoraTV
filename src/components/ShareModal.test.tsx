import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShareModal, getCanonicalOrigin, buildKinoraDeepLink, type ShareItem } from './ShareModal'
import { ToastProvider } from './Toast'

describe('ShareModal Deep Links and Origin Verification', () => {
  const originalWindow = globalThis.window

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('SHARE-ORIGIN-01: strips localhost dev ports (5199, 5173, 3000) and yields canonical https://kinora.tv', () => {
    try {
      (globalThis as any).window = {
        location: {
          hostname: 'localhost',
          protocol: 'http:',
          port: '5199',
          origin: 'http://localhost:5199',
          pathname: '/watch/movie:solaris',
          search: '',
        },
      }

      const origin = getCanonicalOrigin()
      expect(origin).toBe('https://kinora.tv')

      const links = buildKinoraDeepLink('/watch/movie:solaris')
      expect(links.webUrl).toBe('https://kinora.tv/watch/movie:solaris')
      expect(links.appSchemeUrl).toBe('kinora://watch/movie:solaris')
    } finally {
      if (originalWindow) {
        globalThis.window = originalWindow
      } else {
        delete (globalThis as any).window
      }
    }
  })

  it('SHARE-ORIGIN-02: formats custom app scheme links cleanly without duplicate slashes', () => {
    const linksLeadingSlash = buildKinoraDeepLink('/movies/blade-runner')
    expect(linksLeadingSlash.appSchemeUrl).toBe('kinora://movies/blade-runner')

    const linksNoLeadingSlash = buildKinoraDeepLink('series/severance/s1/e1')
    expect(linksNoLeadingSlash.appSchemeUrl).toBe('kinora://series/severance/s1/e1')
    expect(linksNoLeadingSlash.webUrl).toBe('https://kinora.tv/series/severance/s1/e1')
  })

  it('SHARE-MODAL-01: renders modal with deep link inputs, format pills and IMDb details', () => {
    const item: ShareItem = {
      title: 'Inception',
      kind: 'movie',
      year: 2010,
      certificate: '12A',
      genres: ['Action', 'Sci-Fi'],
      imdbId: 'tt1375666',
      tmdbId: 27205,
      deepLinkPath: '/movies/inception',
    }

    const html = renderToStaticMarkup(
      <ToastProvider>
        <ShareModal open={true} onClose={() => {}} item={item} />
      </ToastProvider>,
    )

    expect(html).toContain('Inception')
    expect(html).toContain('tt1375666')
    expect(html).toContain('TMDB')
    expect(html).toContain('https://kinora.tv/movies/inception')
    expect(html).toContain('Web (https)')
    expect(html).toContain('App (kinora://)')
    expect(html).toContain('Kinora Deep Link')
  })

  it('SHARE-MODAL-02: handles missing IMDb identifier honestly with fallback message', () => {
    const item: ShareItem = {
      title: 'Fictional Indie Film',
      kind: 'movie',
      year: 2026,
      deepLinkPath: '/movies/fictional-indie',
    }

    const html = renderToStaticMarkup(
      <ToastProvider>
        <ShareModal open={true} onClose={() => {}} item={item} />
      </ToastProvider>,
    )

    expect(html).toContain('Fictional Indie Film')
    expect(html).toContain('No verified IMDb identifier associated with this item.')
    expect(html).toContain('https://kinora.tv/movies/fictional-indie')
  })
})
