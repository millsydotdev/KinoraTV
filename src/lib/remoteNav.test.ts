// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  calculateSpatialScore,
  getFocusableCandidates,
  initGlobalRemoteNav,
  isTypingActive,
  navigateSpatial,
  restoreRouteFocus,
  saveRouteFocus,
} from './remoteNav'

describe('Kinora Universal Spatial Navigation', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    container.id = 'main'
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('detects when the user is actively typing in text fields', () => {
    const input = document.createElement('input')
    input.type = 'text'
    container.appendChild(input)

    input.focus()
    expect(isTypingActive()).toBe(true)

    const textarea = document.createElement('textarea')
    container.appendChild(textarea)
    textarea.focus()
    expect(isTypingActive()).toBe(true)

    const button = document.createElement('button')
    container.appendChild(button)
    button.focus()
    expect(isTypingActive()).toBe(false)
  })

  it('calculates spatial scores correctly for directional alignment', () => {
    const fromRect = {
      left: 100,
      right: 200,
      top: 100,
      bottom: 150,
      width: 100,
      height: 50,
    } as DOMRect

    // Target directly to the right
    const rightTarget = {
      left: 220,
      right: 320,
      top: 100,
      bottom: 150,
      width: 100,
      height: 50,
    } as DOMRect

    const rightScore = calculateSpatialScore(fromRect, rightTarget, 'right')
    expect(rightScore).not.toBeNull()
    expect(rightScore).toBeGreaterThan(0)

    // Target to the left should return null when navigating right
    const leftTarget = {
      left: 10,
      right: 90,
      top: 100,
      bottom: 150,
      width: 80,
      height: 50,
    } as DOMRect

    expect(calculateSpatialScore(fromRect, leftTarget, 'right')).toBeNull()

    // Target directly below
    const downTarget = {
      left: 100,
      right: 200,
      top: 170,
      bottom: 220,
      width: 100,
      height: 50,
    } as DOMRect

    const downScore = calculateSpatialScore(fromRect, downTarget, 'down')
    expect(downScore).not.toBeNull()
    expect(calculateSpatialScore(fromRect, downTarget, 'up')).toBeNull()
  })

  it('identifies focusable candidates within the container', () => {
    const btn1 = document.createElement('button')
    btn1.textContent = 'Button 1'
    const btn2 = document.createElement('button')
    btn2.disabled = true
    const link = document.createElement('a')
    link.href = '#test'
    link.textContent = 'Link'

    container.appendChild(btn1)
    container.appendChild(btn2)
    container.appendChild(link)

    // Mock bounding client rects for testing
    vi.spyOn(btn1, 'getBoundingClientRect').mockReturnValue({
      width: 100,
      height: 40,
      left: 10,
      right: 110,
      top: 10,
      bottom: 50,
    } as DOMRect)
    vi.spyOn(link, 'getBoundingClientRect').mockReturnValue({
      width: 80,
      height: 30,
      left: 130,
      right: 210,
      top: 10,
      bottom: 40,
    } as DOMRect)

    const candidates = getFocusableCandidates(container)
    expect(candidates).toContain(btn1)
    expect(candidates).toContain(link)
    expect(candidates).not.toContain(btn2)
  })

  it('moves focus spatially between adjacent cards', () => {
    const card1 = document.createElement('button')
    card1.id = 'card-1'
    const card2 = document.createElement('button')
    card2.id = 'card-2'

    container.appendChild(card1)
    container.appendChild(card2)

    vi.spyOn(card1, 'getBoundingClientRect').mockReturnValue({
      left: 50,
      right: 150,
      top: 100,
      bottom: 200,
      width: 100,
      height: 100,
    } as DOMRect)

    vi.spyOn(card2, 'getBoundingClientRect').mockReturnValue({
      left: 180,
      right: 280,
      top: 100,
      bottom: 200,
      width: 100,
      height: 100,
    } as DOMRect)

    card1.focus()
    expect(document.activeElement).toBe(card1)

    const moved = navigateSpatial('right')
    expect(moved).toBe(true)
    expect(document.activeElement).toBe(card2)
  })

  it('confines spatial focus inside active modal dialogs', () => {
    const bgButton = document.createElement('button')
    bgButton.id = 'bg-btn'
    container.appendChild(bgButton)

    const dialog = document.createElement('dialog')
    dialog.open = true
    const modalBtn1 = document.createElement('button')
    modalBtn1.id = 'modal-btn-1'
    const modalBtn2 = document.createElement('button')
    modalBtn2.id = 'modal-btn-2'

    dialog.appendChild(modalBtn1)
    dialog.appendChild(modalBtn2)
    document.body.appendChild(dialog)

    vi.spyOn(modalBtn1, 'getBoundingClientRect').mockReturnValue({
      left: 200,
      right: 300,
      top: 200,
      bottom: 240,
      width: 100,
      height: 40,
    } as DOMRect)

    vi.spyOn(modalBtn2, 'getBoundingClientRect').mockReturnValue({
      left: 200,
      right: 300,
      top: 260,
      bottom: 300,
      width: 100,
      height: 40,
    } as DOMRect)

    modalBtn1.focus()
    const moved = navigateSpatial('down')
    expect(moved).toBe(true)
    expect(document.activeElement).toBe(modalBtn2)

    dialog.remove()
  })

  it('saves and restores focus across route paths', () => {
    const homeBtn = document.createElement('button')
    homeBtn.id = 'home-hero-btn'
    container.appendChild(homeBtn)

    homeBtn.focus()
    saveRouteFocus('/')

    document.body.focus()

    const restored = restoreRouteFocus('/')
    expect(restored).toBe(true)
    expect(document.activeElement).toBe(homeBtn)
  })

  it('listens to keyboard events and does not crash when unmounted', () => {
    const cleanup = initGlobalRemoteNav()
    expect(typeof cleanup).toBe('function')

    const keyEvent = new KeyboardEvent('keydown', { key: 'ArrowRight' })
    expect(() => window.dispatchEvent(keyEvent)).not.toThrow()

    cleanup()
  })
})
