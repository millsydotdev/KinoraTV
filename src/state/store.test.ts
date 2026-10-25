import { describe, expect, it } from 'vitest'
import { defaultPrefs, sanitizePrefs } from './store'

describe('saved preferences', () => {
  it('drops the removed source-checking settings so they are no longer stored', () => {
    const stored = { ...defaultPrefs, autoRefresh: true, refreshInterval: '12h', validateOnAdd: true, dropAfterFailures: '5', parallelChecks: 8 }
    const clean = sanitizePrefs(stored)
    for (const key of ['autoRefresh', 'refreshInterval', 'validateOnAdd', 'dropAfterFailures', 'parallelChecks']) expect(key in clean).toBe(false)
    expect(clean).toEqual(defaultPrefs)
  })
})
