import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { Icon } from '../components/Icon'
import { getTechnicalBadges, StreamingCard, StreamingEmptyState, StreamingProviderPrompt } from '../components/StreamingComponents'
import { movies } from '../data/catalog'
import { StoreProvider } from '../state/store'
import { MovieDetail } from './MovieDetail'
import { Movies } from './Movies'
import { SeriesBrowse } from './SeriesBrowse'

const render = (node: ReactNode) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <StoreProvider>
        <ToastProvider>{node}</ToastProvider>
      </StoreProvider>
    </MemoryRouter>
  )

describe('Streaming UI Correction Regression Suite', () => {
  describe('Technical Format Badge Integrity', () => {
    it('detects 4K and UHD correctly', () => {
      expect(getTechnicalBadges({ title: 'Interstellar 4K Ultra HD' })).toContain('4K')
      expect(getTechnicalBadges({ title: 'Planet Earth UHD 2160p' })).toContain('4K')
    })

    it('detects HDR and Dolby Vision correctly', () => {
      expect(getTechnicalBadges({ title: 'Dune Part Two 4K HDR' })).toEqual(
        expect.arrayContaining(['4K', 'HDR'])
      )
      expect(getTechnicalBadges({ title: 'Blade Runner 2049 DV' })).toContain('HDR')
    })

    it('detects Dolby Atmos and 5.1 surround from audio specifications', () => {
      expect(getTechnicalBadges({ audio: ['English (Dolby Atmos)'] })).toContain('Dolby Atmos')
      expect(getTechnicalBadges({ audio: ['English (5.1 Surround)'] })).toContain('5.1')
    })

    it('returns empty array when metadata contains no format indicators (no fake badges)', () => {
      expect(getTechnicalBadges({ title: 'Silent Archive Title', audio: ['Mono'] })).toEqual([])
      expect(getTechnicalBadges({})).toEqual([])
    })
  })

  describe('Zero Emoji Guarantee in Movies and TV Shows', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u

    it('Movies main screen contains zero emoji characters in rendered markup', () => {
      const html = render(<Movies />)
      expect(emojiRegex.test(html)).toBe(false)
      expect(html).not.toContain('🔥')
      expect(html).not.toContain('📅')
      expect(html).not.toContain('⭐')
      expect(html).not.toContain('⏱️')
      expect(html).not.toContain('🔖')
    })

    it('TV Shows main screen contains zero emoji characters in rendered markup', () => {
      const html = render(<SeriesBrowse />)
      expect(emojiRegex.test(html)).toBe(false)
      expect(html).not.toContain('🔥')
      expect(html).not.toContain('📅')
      expect(html).not.toContain('⭐')
      expect(html).not.toContain('🔄')
      expect(html).not.toContain('⏱️')
      expect(html).not.toContain('🔖')
    })
  })

  describe('Pure Vector SVG Icon System', () => {
    it('renders genuine SVG paths for interface icons', () => {
      const flame = renderToStaticMarkup(<Icon name="flame" size={20} />)
      expect(flame).toContain('<svg')
      expect(flame).toContain('viewBox="0 0 24 24"')
      expect(flame).toContain('<path')

      const star = renderToStaticMarkup(<Icon name="star" size={16} fill="#fbbf24" />)
      expect(star).toContain('<svg')
      expect(star).toContain('fill="#fbbf24"')

      const calendar = renderToStaticMarkup(<Icon name="calendar" size={18} />)
      expect(calendar).toContain('<svg')
      expect(calendar).toContain('<path')

      const refresh = renderToStaticMarkup(<Icon name="refresh" size={18} />)
      expect(refresh).toContain('<svg')
    })
  })

  describe('StreamingProviderPrompt Component', () => {
    it('renders provider connection prompt with non-intrusive copy and quick actions', () => {
      const html = render(<StreamingProviderPrompt kind="movies" />)
      expect(html).toContain('Connect an On-Demand Provider')
      expect(html).toContain('Add an Xtream compatible provider in Sources')
      expect(html).toContain('Add Provider')
      expect(html).toContain('Sources')
    })
  })

  describe('Movie Details Page Repair', () => {
    it('renders clean specifications and synopsis without duplicate ratings or placeholder text', () => {
      const firstMovie = movies[0]!
      const html = renderToStaticMarkup(
        <MemoryRouter initialEntries={[`/movies/${firstMovie.id}`]}>
          <StoreProvider initialDemo={true}>
            <ToastProvider>
              <Routes>
                <Route path="/movies/:id" element={<MovieDetail />} />
              </Routes>
            </ToastProvider>
          </StoreProvider>
        </MemoryRouter>
      )
      expect(html).toContain('Story &amp; Synopsis')
      expect(html).toContain('Technical Specifications')
      expect(html).not.toContain('Fictional demonstration title')
      expect(html).toContain('title-actions-primary')
      expect(html).toContain('title-actions-feedback')
      expect(html).toContain('title-actions-library')
    })
  })

  describe('Streaming UI Polishing & Icon Standards', () => {
    it('StreamingRail uses muted icon color by default and var(--accent) for Trending', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <StoreProvider initialDemo={true}>
            <ToastProvider>
              <Movies />
            </ToastProvider>
          </StoreProvider>
        </MemoryRouter>
      )
      expect(html).toContain('Trending Movies')
      expect(html).toContain('color:var(--accent)')
      // Verify no rainbow icon colors
      expect(html).not.toContain('color:#fbbf24')
      expect(html).not.toContain('color:#60a5fa')
    })

    it('StreamingCard fallback artwork contains no duplicate title text', () => {
      const cardHtml = renderToStaticMarkup(
        <MemoryRouter>
          <StoreProvider initialDemo={true}>
            <ToastProvider>
              <StreamingCard
                to="/movies/test"
                title="Clean Title"
                sub="2024 · Test"
              />
            </ToastProvider>
          </StoreProvider>
        </MemoryRouter>
      )
      expect(cardHtml).toContain('Clean Title')
      expect(cardHtml).not.toContain('streaming-card-fallback-title')
    })

    it('StreamingEmptyState renders tailored heading when sources are disabled', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <StreamingEmptyState kind="movies" disabledSources onAddProvider={() => {}} onOpenSources={() => {}} />
        </MemoryRouter>
      )
      expect(html).toContain('Movie Provider Disabled')
      expect(html).toContain('Your connected on-demand provider is currently disabled in Sources')
    })

    it('StreamingEmptyState renders tailored heading when connected catalogue is empty', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <StreamingEmptyState kind="movies" emptyCatalogue onAddProvider={() => {}} onOpenSources={() => {}} />
        </MemoryRouter>
      )
      expect(html).toContain('No Movies in Connected Catalogue')
      expect(html).toContain('no movies were found in its on-demand library')
    })
  })
})
