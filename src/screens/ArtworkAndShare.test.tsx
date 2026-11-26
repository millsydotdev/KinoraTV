import { describe, it, expect, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  saveCustomArtwork,
  getCustomArtwork,
  restoreAutomaticArtwork,
  listCustomArtworks,
  clearCustomArtworksForTesting,
} from '../state/customArtwork'
import { ShareModal } from '../components/ShareModal'
import { ToastProvider } from '../components/Toast'
import { TrailerPlayerModal } from '../components/TrailerPlayerModal'
import { XtreamArt, EpisodeCard } from '../components/Tiles'
import { MemoryRouter } from 'react-router-dom'
import { StoreProvider } from '../state/store'

describe('Personal Artwork Library and Share Dialog', () => {
  beforeEach(() => {
    clearCustomArtworksForTesting()
  })

  it('ART-01: saves, retrieves and lists user-assigned custom artwork', () => {
    const saved = saveCustomArtwork({
      contentId: 'channel:bbc-one',
      title: 'BBC One HD',
      artworkType: 'channel-logo',
      aspectRatio: '1:1',
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      fileName: 'bbc-one-custom.png',
      fileSize: 1024,
      width: 512,
      height: 512,
      mimeType: 'image/png',
    })

    expect(saved.id).toBeDefined()
    expect(saved.title).toBe('BBC One HD')

    const retrieved = getCustomArtwork('channel:bbc-one')
    expect(retrieved).toBeDefined()
    expect(retrieved?.title).toBe('BBC One HD')
    expect(retrieved?.artworkType).toBe('channel-logo')

    // Also retrieves by normalized ID without prefix
    const norm = getCustomArtwork('bbc-one')
    expect(norm).toBeDefined()
    expect(norm?.title).toBe('BBC One HD')

    const list = listCustomArtworks()
    expect(list.length).toBe(1)
    expect(list[0]?.contentId).toBe('channel:bbc-one')
  })

  it('ART-02: replaces existing custom artwork safely when updated', () => {
    saveCustomArtwork({
      contentId: 'movie:dune-part-two',
      title: 'Dune: Part Two',
      artworkType: 'movie-poster',
      aspectRatio: '2:3',
      dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      fileName: 'poster-v1.jpg',
      fileSize: 2048,
      width: 1000,
      height: 1500,
      mimeType: 'image/jpeg',
    })

    const updated = saveCustomArtwork({
      contentId: 'movie:dune-part-two',
      title: 'Dune: Part Two (IMAX)',
      artworkType: 'movie-poster',
      aspectRatio: '2:3',
      dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg_REPLACED==',
      fileName: 'poster-v2.jpg',
      fileSize: 4096,
      width: 2000,
      height: 3000,
      mimeType: 'image/jpeg',
    })

    expect(updated.title).toBe('Dune: Part Two (IMAX)')
    expect(updated.fileSize).toBe(4096)

    const list = listCustomArtworks()
    expect(list.length).toBe(1)
    expect(list[0]?.title).toBe('Dune: Part Two (IMAX)')
  })

  it('ART-03: restores automatic artwork by removing custom assignment', () => {
    saveCustomArtwork({
      contentId: 'channel:itv1',
      title: 'ITV1',
      artworkType: 'channel-logo',
      aspectRatio: '1:1',
      dataUrl: 'data:image/png;base64,abc==',
      fileName: 'itv1.png',
      fileSize: 512,
      width: 256,
      height: 256,
      mimeType: 'image/png',
    })

    expect(getCustomArtwork('channel:itv1')).toBeDefined()

    const restored = restoreAutomaticArtwork('channel:itv1')
    expect(restored).toBe(true)
    expect(getCustomArtwork('channel:itv1')).toBeUndefined()
    expect(listCustomArtworks().length).toBe(0)
  })

  it('SHARE-01: renders verified IMDb ID and official page link when available', () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <ShareModal
          open={true}
          onClose={() => {}}
          item={{
            title: 'Night of the Living Dead',
            kind: 'movie',
            year: 1968,
            certificate: '15',
            genres: ['Horror', 'Mystery'],
            imdbId: 'tt0063350',
            deepLinkPath: '/movies/night-of-the-living-dead',
          }}
        />
      </ToastProvider>,
    )

    expect(html).toContain('Night of the Living Dead')
    expect(html).toContain('tt0063350')
    expect(html).toContain('https://www.imdb.com/title/tt0063350/')
    expect(html).toContain('Verified')
    expect(html).toContain('Copy IMDb Link')
    expect(html).toContain('Kinora Deep Link')
  })

  it('SHARE-02: displays graceful honest message when no verified IMDb ID exists', () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <ShareModal
          open={true}
          onClose={() => {}}
          item={{
            title: 'Harbour Lights',
            kind: 'movie',
            year: 2024,
            certificate: '18',
            deepLinkPath: '/movies/harbour-lights',
          }}
        />
      </ToastProvider>,
    )

    expect(html).toContain('Harbour Lights')
    expect(html).toContain('No verified IMDb identifier associated with this item.')
    expect(html).not.toContain('https://www.imdb.com/title/')
    expect(html).toContain('Kinora Deep Link')
  })

  it('SHARE-03: formats canonical public https://kinora.tv link even on dev server localhost', () => {
    const originalWindow = globalThis.window
    try {
      (globalThis as any).window = {
        location: {
          hostname: 'localhost',
          protocol: 'http:',
          origin: 'http://localhost:5199',
          pathname: '/movies/interstellar',
          search: '',
        },
      }

      const html = renderToStaticMarkup(
        <ToastProvider>
          <ShareModal
            open={true}
            onClose={() => {}}
            item={{
              title: 'Interstellar',
              kind: 'movie',
              year: 2014,
              deepLinkPath: '/movies/interstellar',
            }}
          />
        </ToastProvider>,
      )

      expect(html).toContain('https://kinora.tv/movies/interstellar')
      expect(html).not.toContain('localhost:5199')
    } finally {
      if (originalWindow) {
        globalThis.window = originalWindow
      } else {
        delete (globalThis as any).window
      }
    }
  })

  it('TRAILER-01: renders direct video player with transport controls for direct stream URLs', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <TrailerPlayerModal
          open={true}
          onClose={() => {}}
          title="Harbour Lights"
          trailerUrl="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4"
          posterUrl="/art/harbour-lights.jpg"
          playFullUrl="/watch/movie:harbour-lights"
        />
      </MemoryRouter>,
    )

    expect(html).toContain('Official Trailer: Harbour Lights')
    expect(html).toContain('trailer-html5-video')
    expect(html).toContain('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4')
    expect(html).toContain('trailer-transport-bar')
    expect(html).toContain('trailer-scrub-slider')
    expect(html).toContain('trailer-volume-slider')
  })

  it('TRAILER-02: formats YouTube watch URL into privacy-enhanced embed iframe', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <TrailerPlayerModal
          open={true}
          onClose={() => {}}
          title="Night of the Living Dead"
          trailerUrl="https://www.youtube.com/watch?v=5gUKZco3hKA"
          playFullUrl="/watch/movie:night-of-the-living-dead"
        />
      </MemoryRouter>,
    )

    expect(html).toContain('trailer-iframe-player')
    expect(html).toContain('https://www.youtube-nocookie.com/embed/5gUKZco3hKA?autoplay=1&amp;rel=0&amp;modestbranding=1')
  })

  it('TRAILER-03: displays honest fallback stage with Watch Full Feature when trailer unavailable', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <TrailerPlayerModal
          open={true}
          onClose={() => {}}
          title="Silent Tide"
          trailerUrl=""
          playFullUrl="/watch/movie:silent-tide"
        />
      </MemoryRouter>,
    )

    expect(html).toContain('Trailer Preview Unavailable')
    expect(html).toContain('An official promotional video trailer is not available in the metadata catalogue for Silent Tide.')
    expect(html).toContain('Watch Full Feature')
    expect(html).toContain('/watch/movie:silent-tide')
  })

  it('SERIES-ART-01: renders XtreamArt with series fallback icon and fallback title', () => {
    const html = renderToStaticMarkup(
      <XtreamArt
        artworkKey={null}
        alt="The Ninth Ward"
        fallbackTitle="The Ninth Ward"
        fallbackYear={2023}
        fallbackIcon="series"
      />,
    )

    expect(html).toContain('xtream-art-fallback')
    expect(html).toContain('The Ninth Ward')
    expect(html).toContain('2023')
  })

  it('SERIES-ART-02: renders EpisodeCard with series fallback tag when episode still is absent', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ToastProvider>
          <StoreProvider>
            <EpisodeCard
              to="/watch/episode:beverly-hillbillies/s1e1"
              seriesId="beverly-hillbillies"
              seriesTitle="The Beverly Hillbillies"
              episodeId="s1e1"
              episodeTitle="The Clampetts Strike Oil"
              seasonNumber={1}
              episodeNumber={1}
              seriesBackdropUrl="/art/kingsmoor.jpg"
            />
          </StoreProvider>
        </ToastProvider>
      </MemoryRouter>,
    )

    expect(html).toContain('S01 E01')
    expect(html).toContain('The Clampetts Strike Oil')
    expect(html).toContain('Still unavailable')
  })
})
