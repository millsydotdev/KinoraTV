import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CollectionCoverMontage } from '../components/CollectionCoverMontage'
import type { Resolved } from '../data/refs'

describe('CollectionCoverMontage 2x2 Artwork Montage', () => {
  it('MONTAGE-01: renders empty state with folder icon when no items exist', () => {
    const html = renderToStaticMarkup(<CollectionCoverMontage items={[]} />)

    expect(html).toContain('collection-montage')
    expect(html).toContain('is-empty')
    expect(html).toContain('collection-empty')
  })

  it('MONTAGE-02: renders full single tile for single-item collections', () => {
    const single: Resolved[] = [
      {
        kind: 'movie',
        ref: 'movie:solaris',
        title: 'Solaris',
        meta: '2026 · Sci-Fi',
        art: '/art/solaris.jpg',
        focus: 50,
        href: '/movies/solaris',
        play: '/watch/movie:solaris',
        streamUrl: null,
        item: {
          kind: 'movie',
          id: 'solaris',
          title: 'Solaris',
          year: 2026,
          runtime: 120,
          genres: ['Sci-Fi'],
          certificate: '12A',
          director: 'Tarkovsky',
          cast: [],
          synopsis: '',
          art: '/art/solaris.jpg',
          focus: 50,
          theme: 'space',
        } as any,
      },
    ]

    const html = renderToStaticMarkup(<CollectionCoverMontage resolvedItems={single} />)

    expect(html).toContain('collection-montage')
    expect(html).toContain('count-1')
    expect(html).not.toContain('is-empty')
    expect(html).toContain('montage-tile')
    expect(html).toContain('/art/solaris.jpg')
  })

  it('MONTAGE-03: renders 2-column split grid for two-item collections', () => {
    const two: Resolved[] = [
      {
        kind: 'movie',
        ref: 'movie:one',
        title: 'Film One',
        meta: '2025',
        art: '/art/one.jpg',
        focus: 50,
        href: '/movies/one',
        play: '/watch/movie:one',
        streamUrl: null,
        item: {} as any,
      },
      {
        kind: 'movie',
        ref: 'movie:two',
        title: 'Film Two',
        meta: '2026',
        art: '/art/two.jpg',
        focus: 50,
        href: '/movies/two',
        play: '/watch/movie:two',
        streamUrl: null,
        item: {} as any,
      },
    ]

    const html = renderToStaticMarkup(<CollectionCoverMontage resolvedItems={two} />)

    expect(html).toContain('count-2')
    expect(html).toContain('/art/one.jpg')
    expect(html).toContain('/art/two.jpg')
  })

  it('MONTAGE-04: renders 3-tile composite for three-item collections', () => {
    const three: Resolved[] = [
      {
        kind: 'movie',
        ref: 'movie:one',
        title: 'Film One',
        meta: '2025',
        art: '/art/one.jpg',
        focus: 50,
        href: '/movies/one',
        play: '/watch/movie:one',
        streamUrl: null,
        item: {} as any,
      },
      {
        kind: 'movie',
        ref: 'movie:two',
        title: 'Film Two',
        meta: '2026',
        art: '/art/two.jpg',
        focus: 50,
        href: '/movies/two',
        play: '/watch/movie:two',
        streamUrl: null,
        item: {} as any,
      },
      {
        kind: 'series',
        ref: 'series:three',
        title: 'Series Three',
        meta: '2026',
        art: '/art/three.jpg',
        focus: 50,
        href: '/series/three',
        play: '/watch/series:three',
        item: {} as any,
      },
    ]

    const html = renderToStaticMarkup(<CollectionCoverMontage resolvedItems={three} />)

    expect(html).toContain('count-3')
    expect(html).toContain('montage-col-stack')
    expect(html).toContain('/art/one.jpg')
    expect(html).toContain('/art/two.jpg')
    expect(html).toContain('/art/three.jpg')
  })

  it('MONTAGE-05: renders 2x2 4-quadrant grid for four or more items', () => {
    const four: Resolved[] = [
      {
        kind: 'movie',
        ref: 'movie:1',
        title: '1',
        meta: '',
        art: '/art/1.jpg',
        focus: 50,
        href: '/1',
        play: '/1',
        streamUrl: null,
        item: {} as any,
      },
      {
        kind: 'movie',
        ref: 'movie:2',
        title: '2',
        meta: '',
        art: '/art/2.jpg',
        focus: 50,
        href: '/2',
        play: '/2',
        streamUrl: null,
        item: {} as any,
      },
      {
        kind: 'movie',
        ref: 'movie:3',
        title: '3',
        meta: '',
        art: '/art/3.jpg',
        focus: 50,
        href: '/3',
        play: '/3',
        streamUrl: null,
        item: {} as any,
      },
      {
        kind: 'movie',
        ref: 'movie:4',
        title: '4',
        meta: '',
        art: '/art/4.jpg',
        focus: 50,
        href: '/4',
        play: '/4',
        streamUrl: null,
        item: {} as any,
      },
      {
        kind: 'movie',
        ref: 'movie:5',
        title: '5 (overflow)',
        meta: '',
        art: '/art/5.jpg',
        focus: 50,
        href: '/5',
        play: '/5',
        streamUrl: null,
        item: {} as any,
      },
    ]

    const html = renderToStaticMarkup(<CollectionCoverMontage resolvedItems={four} />)

    expect(html).toContain('count-4')
    expect(html).toContain('/art/1.jpg')
    expect(html).toContain('/art/2.jpg')
    expect(html).toContain('/art/3.jpg')
    expect(html).toContain('/art/4.jpg')
    expect(html).not.toContain('/art/5.jpg')
  })

  it('MONTAGE-06: handles fallback icons when item has no artwork', () => {
    const noArt: Resolved[] = [
      {
        kind: 'series',
        ref: 'series:mystery',
        title: 'Mystery Series',
        meta: '2026',
        art: '',
        focus: 50,
        href: '/series/mystery',
        play: '/watch/series:mystery',
        item: {} as any,
      },
    ]

    const html = renderToStaticMarkup(<CollectionCoverMontage resolvedItems={noArt} />)

    expect(html).toContain('montage-tile-fallback')
  })
})
