// @vitest-environment happy-dom
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProfileProvider, useProfiles, type UserProfile } from './profiles'
import { resetPinLockoutStateForTesting } from '../lib/crypto'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ProfileProvider and useProfiles', () => {
  let host: HTMLDivElement
  let root: Root
  let currentContext: ReturnType<typeof useProfiles> | null = null

  function Harness() {
    const ctx = useProfiles()
    useEffect(() => {
      currentContext = ctx
    })
    return null
  }

  beforeEach(() => {
    localStorage.clear()
    resetPinLockoutStateForTesting()
    currentContext = null
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    host.remove()
  })

  it('provides the default primary user profile out of the box', async () => {
    await act(async () => {
      root.render(
        <ProfileProvider>
          <Harness />
        </ProfileProvider>,
      )
    })

    expect(currentContext).not.toBeNull()
    expect(currentContext?.activeProfile.id).toBe('default')
    expect(currentContext?.activeProfile.name).toBe('Primary User')
    expect(currentContext?.isKidsMode).toBe(false)
    expect(currentContext?.parentalPin).toBeNull()
  })

  it('adds a new household profile and allows switching to it', async () => {
    await act(async () => {
      root.render(
        <ProfileProvider>
          <Harness />
        </ProfileProvider>,
      )
    })

    await act(async () => {
      currentContext?.addProfile('Charlie', true, '#10b981', 'gaming')
    })

    expect(currentContext?.profiles).toHaveLength(2)
    const kidsProfile = currentContext?.profiles.find((p: UserProfile) => p.name === 'Charlie')
    expect(kidsProfile).toBeDefined()
    expect(kidsProfile?.isKids).toBe(true)

    await act(async () => {
      if (kidsProfile) currentContext?.switchProfile(kidsProfile.id)
    })

    expect(currentContext?.activeProfile.name).toBe('Charlie')
    expect(currentContext?.isKidsMode).toBe(true)
  })

  it('manages parental PIN configuration, salted hashing and verification', async () => {
    await act(async () => {
      root.render(
        <ProfileProvider>
          <Harness />
        </ProfileProvider>,
      )
    })

    expect(currentContext?.parentalPin).toBeNull()

    // Rejects non-4-digit PIN
    await act(async () => {
      const res = currentContext?.setParentalPin('12')
      expect(res?.success).toBe(false)
    })
    expect(currentContext?.parentalPin).toBeNull()

    // Sets valid 4-digit PIN
    await act(async () => {
      const res = currentContext?.setParentalPin('1234')
      expect(res?.success).toBe(true)
    })

    // Active indicator is truthy, not plaintext
    expect(currentContext?.parentalPin).toBe('****')

    // Confirm plaintext is never stored in localStorage
    expect(localStorage.getItem('kinora.parental_pin.v1')).toBeNull()

    // Confirm salted hash is stored
    const secureRaw = localStorage.getItem('kinora.parental_pin_secure.v1')
    expect(secureRaw).not.toBeNull()
    const secureParsed = JSON.parse(secureRaw!)
    expect(secureParsed.salt).toBeDefined()
    expect(secureParsed.hash).toHaveLength(64)
    expect(secureParsed.hash).not.toBe('1234')

    // Correct PIN verifies
    expect(currentContext?.verifyParentalPin('1234')).toBe(true)
    // Incorrect PIN fails
    expect(currentContext?.verifyParentalPin('9999')).toBe(false)

    // Remove PIN
    await act(async () => {
      currentContext?.setParentalPin(null)
    })

    expect(currentContext?.parentalPin).toBeNull()
    expect(localStorage.getItem('kinora.parental_pin_secure.v1')).toBeNull()
  })

  it('enforces lockout after 5 consecutive failed PIN attempts', async () => {
    await act(async () => {
      root.render(
        <ProfileProvider>
          <Harness />
        </ProfileProvider>,
      )
    })

    await act(async () => {
      currentContext?.setParentalPin('4321')
    })

    // 4 failed attempts
    for (let i = 0; i < 4; i++) {
      expect(currentContext?.verifyParentalPin('0000')).toBe(false)
    }

    // 5th failed attempt triggers lockout
    expect(currentContext?.verifyParentalPin('0000')).toBe(false)

    // Even the correct PIN is rejected during lockout
    expect(currentContext?.verifyParentalPin('4321')).toBe(false)
  })

  it('enforces PIN challenge when switching from a Kids profile to an Adult profile', async () => {
    await act(async () => {
      root.render(
        <ProfileProvider>
          <Harness />
        </ProfileProvider>,
      )
    })

    await act(async () => {
      currentContext?.setParentalPin('5678')
      currentContext?.addProfile('Junior', true)
    })

    const junior = currentContext?.profiles.find((p: UserProfile) => p.name === 'Junior')!
    expect(junior).toBeDefined()

    // Switch into Kids profile (allowed without PIN)
    await act(async () => {
      currentContext?.switchProfile(junior.id)
    })

    expect(currentContext?.activeProfile.name).toBe('Junior')
    expect(currentContext?.isKidsMode).toBe(true)

    // Attempting to switch back to adult profile requires PIN
    expect(currentContext?.requiresPinToSwitch('default')).toBe(true)

    // Switching with wrong PIN fails
    let res: { success: boolean; error?: string } = { success: false }
    await act(async () => {
      res = currentContext?.switchProfileWithPin('default', '0000') ?? { success: false }
    })
    expect(res.success).toBe(false)
    expect(currentContext?.activeProfile.name).toBe('Junior')

    // Switching with correct PIN succeeds
    await act(async () => {
      res = currentContext?.switchProfileWithPin('default', '5678') ?? { success: false }
    })
    expect(res.success).toBe(true)
    expect(currentContext?.activeProfile.name).toBe('Primary User')
    expect(currentContext?.isKidsMode).toBe(false)
  })

  it('cleans up scoped profile storage when deleting a profile', async () => {
    await act(async () => {
      root.render(
        <ProfileProvider>
          <Harness />
        </ProfileProvider>,
      )
    })

    let newProfileId = ''
    await act(async () => {
      const p = currentContext?.addProfile('TempUser', false)
      newProfileId = p?.id ?? ''
    })

    // Populate scoped storage keys
    localStorage.setItem(`kinora.library.v2.${newProfileId}`, JSON.stringify({ watched: [] }))
    localStorage.setItem(`kinora.personalMediaLibrary.v1.${newProfileId}`, JSON.stringify({ items: {} }))

    expect(localStorage.getItem(`kinora.personalMediaLibrary.v1.${newProfileId}`)).not.toBeNull()

    // Delete profile
    await act(async () => {
      currentContext?.deleteProfile(newProfileId)
    })

    // Scoped keys must be purged
    expect(localStorage.getItem(`kinora.library.v2.${newProfileId}`)).toBeNull()
    expect(localStorage.getItem(`kinora.personalMediaLibrary.v1.${newProfileId}`)).toBeNull()
  })
})
