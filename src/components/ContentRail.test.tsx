// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContentRail } from './ContentRail'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ContentRail component', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => { root.unmount() })
    host.remove()
    vi.restoreAllMocks()
  })

  it('renders title, subtitle, See All link, and children', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ContentRail
            id="test-rail"
            title="Trending & Popular"
            sub="Critically acclaimed titles"
            icon="film"
            viewAll="/movies"
          >
            <a href="/movies/1" className="card">Card 1</a>
            <a href="/movies/2" className="card">Card 2</a>
          </ContentRail>
        </MemoryRouter>
      )
    })

    const titleEl = host.querySelector('.content-rail-title')
    expect(titleEl?.textContent).toContain('Trending & Popular')

    const subEl = host.querySelector('.content-rail-sub')
    expect(subEl?.textContent).toBe('Critically acclaimed titles')

    const viewAllLink = host.querySelector('.content-rail-view-all')
    expect(viewAllLink?.getAttribute('href')).toBe('/movies')

    const cards = host.querySelectorAll('.card')
    expect(cards.length).toBe(2)
  })

  it('supports directional left/right arrow navigation and enforces finite ends', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ContentRail id="nav-rail" title="Test Rail">
            <button type="button" className="card" id="card-0">Card 0</button>
            <button type="button" className="card" id="card-1">Card 1</button>
            <button type="button" className="card" id="card-2">Card 2</button>
          </ContentRail>
        </MemoryRouter>
      )
    })

    const card0 = host.querySelector('#card-0') as HTMLButtonElement
    const card1 = host.querySelector('#card-1') as HTMLButtonElement
    const card2 = host.querySelector('#card-2') as HTMLButtonElement

    // Initial focus on card 0
    card0.focus()
    expect(document.activeElement).toBe(card0)

    // Press ArrowRight -> moves to card 1
    await act(async () => {
      card0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(document.activeElement).toBe(card1)

    // Press ArrowRight -> moves to card 2
    await act(async () => {
      card1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(document.activeElement).toBe(card2)

    // Press ArrowRight at the end -> STOPS at card 2 (finite end, no endless wrapping)
    await act(async () => {
      card2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(document.activeElement).toBe(card2)

    // Press ArrowLeft -> moves back to card 1
    await act(async () => {
      card2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    })
    expect(document.activeElement).toBe(card1)

    // Press ArrowLeft -> moves back to card 0
    await act(async () => {
      card1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    })
    expect(document.activeElement).toBe(card0)

    // Press ArrowLeft at the start -> STOPS at card 0 (finite start)
    await act(async () => {
      card0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    })
    expect(document.activeElement).toBe(card0)

    // Press End -> jumps to card 2
    await act(async () => {
      card0.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    })
    expect(document.activeElement).toBe(card2)

    // Press Home -> jumps to card 0
    await act(async () => {
      card2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    })
    expect(document.activeElement).toBe(card0)
  })

  it('navigates up and down between adjacent rails', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ContentRail id="rail-1" title="Rail 1">
            <button type="button" className="card" id="r1-c0">R1 Card 0</button>
            <button type="button" className="card" id="r1-c1">R1 Card 1</button>
          </ContentRail>
          <ContentRail id="rail-2" title="Rail 2">
            <button type="button" className="card" id="r2-c0">R2 Card 0</button>
            <button type="button" className="card" id="r2-c1">R2 Card 1</button>
          </ContentRail>
        </MemoryRouter>
      )
    })

    const r1c0 = host.querySelector('#r1-c0') as HTMLButtonElement
    const r2c0 = host.querySelector('#r2-c0') as HTMLButtonElement

    r1c0.focus()
    expect(document.activeElement).toBe(r1c0)

    // Press ArrowDown on Rail 1 -> moves focus to corresponding card in Rail 2
    await act(async () => {
      r1c0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    expect(document.activeElement).toBe(r2c0)

    // Press ArrowUp on Rail 2 -> moves focus back up to Rail 1
    await act(async () => {
      r2c0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    })
    expect(document.activeElement).toBe(r1c0)
  })

  it('triggers smooth scroll when mouse chevron buttons are clicked', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ContentRail id="scroll-rail" title="Scroll Rail">
            <button type="button" className="card">Card 1</button>
            <button type="button" className="card">Card 2</button>
          </ContentRail>
        </MemoryRouter>
      )
    })

    const track = host.querySelector('.content-rail-track') as HTMLDivElement
    const scrollBySpy = vi.fn()
    track.scrollBy = scrollBySpy

    const prevBtn = host.querySelector('.content-rail-control-prev') as HTMLButtonElement
    const nextBtn = host.querySelector('.content-rail-control-next') as HTMLButtonElement

    await act(async () => {
      nextBtn.click()
    })
    expect(scrollBySpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))

    scrollBySpy.mockClear()
    await act(async () => {
      prevBtn.click()
    })
    expect(scrollBySpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
  })
})
