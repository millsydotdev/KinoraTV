import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProgrammeArt, ProgrammeAmbientCard } from './ui'
import type { Channel, Programme } from '../data/types'
import { GENRE_ARTWORK, DEFAULT_GENRE_ARTWORK } from '../data/genre-art'

describe('ProgrammeArt component', () => {
  const baseProgramme: Programme = {
    id: 'test-prog-1',
    channelId: 'ch-1',
    start: 1000,
    stop: 2000,
    title: 'Match of the Day',
    desc: 'Premier League highlights',
    category: 'Sport',
    episode: null,
    art: GENRE_ARTWORK.sport,
  }

  const dummyChannel: Channel = {
    id: 'ch-1',
    number: 1,
    name: 'BBC One',
    group: 'General',
    categories: ['General'],
    mark: { tone: '#b00', text: 'BBC' },
    streamUrl: 'https://example.com/stream.m3u8',
    logoUrl: null,
    hd: true,
    sourceId: 'pl-1',
    tvgId: 'bbcone.uk',
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders explicit demo artwork when programme.art is defined (demo mode)', () => {
    const html = renderToStaticMarkup(<ProgrammeArt programme={baseProgramme} />)
    expect(html).toContain(GENRE_ARTWORK.sport)
    expect(html).toContain('alt="Match of the Day"')
  })

  it('renders honest ProgrammeAmbientCard and NEVER scenic fallback when real programme has no art', () => {
    const realProgWithoutArt: Programme = {
      ...baseProgramme,
      title: 'BBC News at Ten',
      category: 'News',
      art: undefined,
      icon: null,
    }
    const html = renderToStaticMarkup(<ProgrammeArt programme={realProgWithoutArt} channel={dummyChannel} />)
    expect(html).toContain('programme-ambient-card')
    expect(html).toContain('BBC News at Ten')
    expect(html).toContain('BBC One')
    // Crucial check: must NEVER contain harbour-lights or any /art/ demo photo
    expect(html).not.toContain(DEFAULT_GENRE_ARTWORK)
    expect(html).not.toContain('/art/')
  })

  it('renders honest ProgrammeAmbientCard when programme has unknown category and no art', () => {
    const unknownProg: Programme = {
      ...baseProgramme,
      title: 'Local Assembly Debate',
      category: 'UnmappedGenre',
      art: undefined,
      icon: null,
    }
    const html = renderToStaticMarkup(<ProgrammeArt programme={unknownProg} />)
    expect(html).toContain('programme-ambient-card')
    expect(html).toContain('Local Assembly Debate')
    expect(html).not.toContain(DEFAULT_GENRE_ARTWORK)
    expect(html).not.toContain('/art/')
  })

  it('direct art prop overrides fallback', () => {
    const html = renderToStaticMarkup(<ProgrammeArt programme={baseProgramme} art={GENRE_ARTWORK.news} />)
    expect(html).toContain(GENRE_ARTWORK.news)
    expect(html).not.toContain(GENRE_ARTWORK.sport)
  })

  it('ProgrammeAmbientCard displays title, channel badge, and category honestly', () => {
    const prog: Programme = {
      id: 'test-prog-2',
      channelId: 'ch-1',
      start: 1700000000000,
      stop: 1700003600000,
      title: 'Horizon: Deep Space',
      desc: 'Space documentary',
      category: 'Science',
      episode: null,
    }
    const html = renderToStaticMarkup(<ProgrammeAmbientCard programme={prog} channel={dummyChannel} />)
    expect(html).toContain('Horizon: Deep Space')
    expect(html).toContain('Science')
    expect(html).toContain('BBC')
    expect(html).not.toContain('/art/')
  })

  it('suppresses title and metadata text when backdropOnly is true to prevent duplication in ChannelCard', () => {
    const prog: Programme = {
      id: 'test-prog-3',
      channelId: 'ch-1',
      start: 1700000000000,
      stop: 1700003600000,
      title: 'Overlapping Title',
      desc: 'Drama series',
      category: 'Drama',
      episode: null,
    }
    const html = renderToStaticMarkup(<ProgrammeArt programme={prog} channel={dummyChannel} backdropOnly />)
    expect(html).toContain('programme-ambient-card')
    expect(html).toContain('is-backdrop-only')
    expect(html).toContain('programme-ambient-mesh')
    expect(html).toContain('programme-ambient-watermark')
    // Must NOT contain the title or channel badge in the backdrop, preventing duplicate text
    expect(html).not.toContain('Overlapping Title')
    expect(html).not.toContain('programme-ambient-content')
  })

  it('never renders a blurred duplicate hero-portrait-backdrop element', () => {
    const html = renderToStaticMarkup(<ProgrammeArt programme={baseProgramme} channel={dummyChannel} backdropOnly className="hero-prog-art" />)
    expect(html).not.toContain('hero-portrait-backdrop')
  })
})
