// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SyncPlayModal } from './SyncPlayModal'
import { syncPlayManager } from '../lib/syncPlay'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('SyncPlayModal component', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    syncPlayManager.leaveRoom()
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    syncPlayManager.leaveRoom()
    host.remove()
  })

  it('renders nothing when open is false', async () => {
    await act(async () => {
      root.render(
        <SyncPlayModal
          open={false}
          onClose={() => {}}
          mediaTitle="Test Movie"
        />
      )
    })

    expect(host.innerHTML).toBe('')
  })

  it('renders create room tab and form inputs when opened', async () => {
    await act(async () => {
      root.render(
        <SyncPlayModal
          open={true}
          onClose={() => {}}
          mediaTitle="Test Movie"
        />
      )
    })

    const title = host.querySelector('.syncplay-title')
    expect(title?.textContent).toContain('SyncPlay Co-Watching')

    const roomNameInput = host.querySelector('#syncplay-room-name') as HTMLInputElement
    expect(roomNameInput).toBeTruthy()
  })

  it('switches between Create and Join tabs', async () => {
    await act(async () => {
      root.render(
        <SyncPlayModal
          open={true}
          onClose={() => {}}
          mediaTitle="Test Movie"
        />
      )
    })

    const joinTabBtn = Array.from(host.querySelectorAll('.syncplay-tab-btn')).find(
      (b) => b.textContent?.includes('Join Room')
    ) as HTMLButtonElement
    expect(joinTabBtn).toBeTruthy()

    await act(async () => {
      joinTabBtn.click()
    })

    const roomCodeInput = host.querySelector('#syncplay-room-code')
    expect(roomCodeInput).toBeTruthy()
  })

  it('creates a room and displays room code and active viewers', async () => {
    await act(async () => {
      root.render(
        <SyncPlayModal
          open={true}
          onClose={() => {}}
          mediaTitle="Interstellar 4K"
        />
      )
    })

    const submitBtn = host.querySelector('button[type="submit"]') as HTMLButtonElement
    expect(submitBtn).toBeTruthy()

    await act(async () => {
      submitBtn.click()
    })

    const codeBadge = host.querySelector('.syncplay-room-code-badge')
    expect(codeBadge).toBeTruthy()
    expect(codeBadge?.textContent).toMatch(/^KIN-/)

    const roster = host.querySelector('.syncplay-roster')
    expect(roster).toBeTruthy()

    const leaveBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Leave Room')
    )
    expect(leaveBtn).toBeTruthy()

    await act(async () => {
      leaveBtn?.click()
    })

    expect(syncPlayManager.getRoom()).toBeNull()
  })
})
