import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { IconName } from '../components/Icon'
import {
  hashPin,
  verifyPin,
  isValidPinFormat,
  isPinVerificationLockedOut,
  getPinLockoutRemainingSeconds,
  recordPinSuccess,
  recordPinFailure,
  type StoredPinHash,
} from '../lib/crypto'

export interface UserProfile {
  id: string
  name: string
  avatarColor: string
  avatarIcon: IconName
  isKids: boolean
  pin?: string
  createdAt: number
}

interface ProfileContextType {
  profiles: UserProfile[]
  activeProfile: UserProfile
  isKidsMode: boolean
  parentalPin: string | null
  setParentalPin: (pin: string | null) => { success: boolean; error?: string }
  verifyParentalPin: (pin: string) => boolean
  requiresPinToSwitch: (targetProfileId: string) => boolean
  switchProfile: (id: string) => void
  switchProfileWithPin: (id: string, enteredPin?: string) => { success: boolean; requiresPin?: boolean; error?: string }
  addProfile: (name: string, isKids?: boolean, avatarColor?: string, avatarIcon?: IconName, pin?: string) => UserProfile
  updateProfile: (id: string, updates: Partial<UserProfile>) => void
  deleteProfile: (id: string) => boolean
}

const PROFILES_KEY = 'kinora.profiles.v1'
const ACTIVE_PROFILE_KEY = 'kinora.active_profile.v1'
const PARENTAL_PIN_KEY = 'kinora.parental_pin.v1'
const PARENTAL_PIN_SECURE_KEY = 'kinora.parental_pin_secure.v1'

const DEFAULT_PROFILES: UserProfile[] = [
  {
    id: 'default',
    name: 'Primary User',
    avatarColor: '#e50914',
    avatarIcon: 'user',
    isKids: false,
    createdAt: Date.now(),
  },
]

const ProfileContext = createContext<ProfileContextType | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<UserProfile[]>(() => {
    try {
      const saved = localStorage.getItem(PROFILES_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as UserProfile[]
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {
      // Storage unavailable
    }
    return DEFAULT_PROFILES
  })

  const [activeId, setActiveId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_PROFILE_KEY)
      if (saved) return saved
    } catch {
      // Storage unavailable
    }
    return 'default'
  })

  const [parentalPinHash, setParentalPinHash] = useState<StoredPinHash | null>(() => {
    try {
      const secure = localStorage.getItem(PARENTAL_PIN_SECURE_KEY)
      if (secure) {
        const parsed = JSON.parse(secure) as StoredPinHash
        if (parsed && parsed.salt && parsed.hash) return parsed
      }
      // Migrate legacy plaintext PIN if present
      const legacy = localStorage.getItem(PARENTAL_PIN_KEY)
      if (legacy && isValidPinFormat(legacy)) {
        const hashed = hashPin(legacy)
        localStorage.setItem(PARENTAL_PIN_SECURE_KEY, JSON.stringify(hashed))
        localStorage.removeItem(PARENTAL_PIN_KEY)
        return hashed
      }
    } catch {
      // Storage unavailable
    }
    return null
  })

  useEffect(() => {
    try {
      localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
    } catch {}
  }, [profiles])

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_PROFILE_KEY, activeId)
    } catch {}
  }, [activeId])

  const setParentalPin = (pin: string | null): { success: boolean; error?: string } => {
    if (pin === null) {
      setParentalPinHash(null)
      try {
        localStorage.removeItem(PARENTAL_PIN_SECURE_KEY)
        localStorage.removeItem(PARENTAL_PIN_KEY)
      } catch {}
      return { success: true }
    }

    if (!isValidPinFormat(pin)) {
      return { success: false, error: 'PIN must be exactly 4 numeric digits.' }
    }

    const hashed = hashPin(pin)
    setParentalPinHash(hashed)
    try {
      localStorage.setItem(PARENTAL_PIN_SECURE_KEY, JSON.stringify(hashed))
      localStorage.removeItem(PARENTAL_PIN_KEY)
    } catch {}
    return { success: true }
  }

  const verifyParentalPin = (pin: string): boolean => {
    if (!parentalPinHash) return true
    if (isPinVerificationLockedOut()) return false

    const matches = verifyPin(pin, parentalPinHash)
    if (matches) {
      recordPinSuccess()
      return true
    } else {
      recordPinFailure()
      return false
    }
  }

  const activeProfile: UserProfile = profiles.find((p) => p.id === activeId) ?? profiles[0] ?? DEFAULT_PROFILES[0]!

  const requiresPinToSwitch = (targetProfileId: string): boolean => {
    const target = profiles.find((p) => p.id === targetProfileId)
    if (!target) return false

    // If currently in Kids Mode and switching to an adult profile, requires PIN if set
    if (activeProfile.isKids && !target.isKids && parentalPinHash) {
      return true
    }

    // If target profile has its own PIN
    if (target.pin) {
      return true
    }

    return false
  }

  const switchProfileWithPin = (
    id: string,
    enteredPin?: string,
  ): { success: boolean; requiresPin?: boolean; error?: string } => {
    const target = profiles.find((p) => p.id === id)
    if (!target) return { success: false, error: 'Profile not found' }

    if (requiresPinToSwitch(id)) {
      if (isPinVerificationLockedOut()) {
        const remaining = getPinLockoutRemainingSeconds()
        return { success: false, requiresPin: true, error: `Locked out. Try again in ${remaining}s.` }
      }

      if (!enteredPin) {
        return { success: false, requiresPin: true }
      }

      if (!isValidPinFormat(enteredPin)) {
        return { success: false, requiresPin: true, error: 'PIN must be exactly 4 numeric digits.' }
      }

      let verified = false
      if (target.pin) {
        if (target.pin.length === 4 && /^\d{4}$/.test(target.pin)) {
          verified = enteredPin.trim() === target.pin.trim()
        } else {
          try {
            const parsed = JSON.parse(target.pin) as StoredPinHash
            verified = verifyPin(enteredPin, parsed)
          } catch {
            verified = enteredPin.trim() === target.pin.trim()
          }
        }
      } else if (parentalPinHash) {
        verified = verifyPin(enteredPin, parentalPinHash)
      } else {
        verified = true
      }

      if (!verified) {
        const fail = recordPinFailure()
        if (fail.lockedOut) {
          return { success: false, requiresPin: true, error: 'Too many incorrect attempts. Locked out for 30s.' }
        }
        return { success: false, requiresPin: true, error: `Incorrect PIN. ${fail.remainingAttempts} attempts remaining.` }
      }

      recordPinSuccess()
    }

    setActiveId(id)
    return { success: true }
  }

  const switchProfile = (id: string) => {
    const res = switchProfileWithPin(id)
    if (!res.success && res.requiresPin) {
      return
    }
  }

  const addProfile = (
    name: string,
    isKids = false,
    avatarColor = '#3b82f6',
    avatarIcon: IconName = 'user',
    pin?: string,
  ): UserProfile => {
    const id = `profile-${Date.now()}`
    let storedPin: string | undefined = undefined
    if (pin && isValidPinFormat(pin)) {
      storedPin = JSON.stringify(hashPin(pin))
    }
    const newProfile: UserProfile = {
      id,
      name: name.trim() || 'User',
      avatarColor,
      avatarIcon,
      isKids,
      pin: storedPin,
      createdAt: Date.now(),
    }
    setProfiles((prev) => [...prev, newProfile])
    return newProfile
  }

  const updateProfile = (id: string, updates: Partial<UserProfile>) => {
    const sanitized = { ...updates }
    if (sanitized.pin !== undefined) {
      if (sanitized.pin && isValidPinFormat(sanitized.pin)) {
        sanitized.pin = JSON.stringify(hashPin(sanitized.pin))
      } else if (sanitized.pin === '') {
        sanitized.pin = undefined
      }
    }
    setProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...sanitized, id: p.id } : p)),
    )
  }

  const deleteProfile = (id: string): boolean => {
    if (profiles.length <= 1) return false
    setProfiles((prev) => {
      const next = prev.filter((p) => p.id !== id)
      if (activeId === id) {
        setActiveId(next[0]?.id ?? 'default')
      }
      return next
    })

    // Clean up scoped profile storage
    try {
      localStorage.removeItem(`kinora.library.v2.${id}`)
      localStorage.removeItem(`kinora.userPreferences.v1.${id}`)
      localStorage.removeItem(`kinora.saved_searches.v1.${id}`)
      localStorage.removeItem(`kinora.home_sections.v1.${id}`)
      localStorage.removeItem(`kinora.reading_bookmarks.v1.${id}`)
      localStorage.removeItem(`kinora.personalMediaLibrary.v1.${id}`)
      localStorage.removeItem(`kinora.prefs.v2.${id}`)
      localStorage.removeItem(`kinora.audio_queue.v1.${id}`)
      localStorage.removeItem(`kinora.recently_played_stations.v1.${id}`)
    } catch {}

    return true
  }

  return (
    <ProfileContext.Provider
      value={{
        profiles,
        activeProfile,
        isKidsMode: activeProfile.isKids,
        parentalPin: parentalPinHash ? '****' : null,
        setParentalPin,
        verifyParentalPin,
        requiresPinToSwitch,
        switchProfile,
        switchProfileWithPin,
        addProfile,
        updateProfile,
        deleteProfile,
      }}
    >
      {children}
    </ProfileContext.Provider>
  )
}

const defaultProfileContext: ProfileContextType = {
  profiles: DEFAULT_PROFILES,
  activeProfile: DEFAULT_PROFILES[0]!,
  isKidsMode: false,
  parentalPin: null,
  setParentalPin: () => ({ success: true }),
  verifyParentalPin: () => true,
  requiresPinToSwitch: () => false,
  switchProfile: () => {},
  switchProfileWithPin: () => ({ success: true }),
  addProfile: (name: string) => ({
    id: 'default',
    name,
    avatarColor: '#e50914',
    avatarIcon: 'user',
    isKids: false,
    createdAt: Date.now(),
  }),
  updateProfile: () => {},
  deleteProfile: () => false,
}

export function useProfiles(): ProfileContextType {
  const ctx = useContext(ProfileContext)
  return ctx ?? defaultProfileContext
}
