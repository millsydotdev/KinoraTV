// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { StoreProvider } from '../state/store'
import { ViewingHabitsTab } from './ViewingHabitsTab'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ViewingHabitsTab screen', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('renders analytics dashboard, metric cards and charts', async () => {
    await act(async () => {
      root.render(
        <StoreProvider>
          <ViewingHabitsTab />
        </StoreProvider>
      )
    })

    const dashboard = host.querySelector('[data-testid="viewing-habits-dashboard"]')
    expect(dashboard).toBeTruthy()

    const title = host.querySelector('.vh-header-title')
    expect(title?.textContent).toContain('Viewing Habits & Analytics')

    const statCards = host.querySelectorAll('.vh-stat-card')
    expect(statCards.length).toBe(6)

    const barChart = host.querySelector('.vh-bar-chart')
    expect(barChart).toBeTruthy()

    const formatList = host.querySelector('.vh-format-list')
    expect(formatList).toBeTruthy()
  })
})
