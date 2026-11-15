// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { usePersonalMediaLibrary, type PersonalMediaLibrary } from './mediaLibrary'
import { DISCOVERED_RESOURCES } from '../data/discoveredResources'
import type { MediaResource } from '../data/personalLibrary'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('usePersonalMediaLibrary', () => {
  let root: Root
  let host: HTMLDivElement
  let currentLib!: PersonalMediaLibrary

  function TestHookComponent() {
    currentLib = usePersonalMediaLibrary()
    return null
  }

  beforeEach(async () => {
    localStorage.clear()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root.render(<TestHookComponent />)
    })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('loads discovered resources on initial state', () => {
    expect(currentLib.allResources.length).toBeGreaterThanOrEqual(DISCOVERED_RESOURCES.length)
    expect(currentLib.mySources.length).toBe(0)
    expect(currentLib.isAudioPlaying).toBe(false)
    expect(currentLib.currentAudio).toBeNull()
  })

  it('adds and removes a resource to/from personal library', async () => {
    const initialCount = currentLib.mySources.length
    const target = currentLib.allResources.find((r) => !currentLib.isInPersonalLibrary(r.id))!
    expect(currentLib.isInPersonalLibrary(target.id)).toBe(false)

    await act(async () => {
      currentLib.addToPersonalLibrary(target.id, 'My private note')
    })

    expect(currentLib.isInPersonalLibrary(target.id)).toBe(true)
    expect(currentLib.getResourceNotes(target.id)).toBe('My private note')
    expect(currentLib.mySources.length).toBe(initialCount + 1)
    expect(currentLib.mySources.some((s) => s.resourceId === target.id)).toBe(true)

    await act(async () => {
      currentLib.removeFromPersonalLibrary(target.id)
    })

    expect(currentLib.isInPersonalLibrary(target.id)).toBe(false)
    expect(currentLib.mySources.length).toBe(initialCount)
  })

  it('toggles favourite status', async () => {
    const target = currentLib.allResources[1]!
    expect(currentLib.isResourceFavourite(target.id)).toBe(false)

    await act(async () => {
      currentLib.toggleResourceFavourite(target.id)
    })

    expect(currentLib.isInPersonalLibrary(target.id)).toBe(true)
    expect(currentLib.isResourceFavourite(target.id)).toBe(true)

    await act(async () => {
      currentLib.toggleResourceFavourite(target.id)
    })

    expect(currentLib.isResourceFavourite(target.id)).toBe(false)
  })

  it('updates personal notes for a resource', async () => {
    const target = currentLib.allResources[2]!

    await act(async () => {
      currentLib.updateResourceNotes(target.id, 'Initial review')
    })
    expect(currentLib.getResourceNotes(target.id)).toBe('Initial review')

    await act(async () => {
      currentLib.updateResourceNotes(target.id, 'Updated review comments')
    })
    expect(currentLib.getResourceNotes(target.id)).toBe('Updated review comments')
  })

  it('adds a custom resource and integrates it into allResources and mySources', async () => {
    const customData: Omit<MediaResource, 'id'> = {
      name: 'Custom Community FM',
      description: 'Independent local community radio station',
      resourceType: 'stream',
      category: 'radio',
      subcategory: 'Community radio',
      url: 'https://stream.community.example/live.mp3',
      provider: 'Community Radio Org',
      discoveryUrl: 'https://community.example',
      dateDiscovered: '2026-11-11',
      lastVerified: '2026-11-11',
      verificationStatus: 'verified',
      provides: 'Live FM audio broadcast',
      supportedByKinora: true,
      playbackUrl: 'https://stream.community.example/live.mp3',
      playbackType: 'audio',
      tags: ['community', 'radio', 'local'],
    }

    let generatedId = ''
    await act(async () => {
      generatedId = currentLib.addCustomResource(customData, 'Personal community favourite')
    })

    expect(generatedId).toMatch(/^custom-res-/)
    expect(currentLib.isInPersonalLibrary(generatedId)).toBe(true)
    expect(currentLib.getResourceNotes(generatedId)).toBe('Personal community favourite')

    const found = currentLib.allResources.find((r) => r.id === generatedId)
    expect(found).toBeDefined()
    expect(found?.name).toBe('Custom Community FM')
    expect(found?.category).toBe('radio')
  })

  it('exports and imports personal library correctly with JSON', async () => {
    const target = currentLib.allResources.find((r) => !currentLib.isInPersonalLibrary(r.id))!

    await act(async () => {
      currentLib.addToPersonalLibrary(target.id, 'Backup test note')
      currentLib.toggleResourceFavourite(target.id)
    })

    const exportedJson = currentLib.exportPersonalLibrary()
    expect(exportedJson).toContain('"app": "Kinora"')
    expect(exportedJson).toContain('"version": 1')
    expect(exportedJson).toContain(target.id)
    expect(exportedJson).toContain('Backup test note')

    let res!: { success: boolean; count: number }
    await act(async () => {
      res = currentLib.importPersonalLibrary(exportedJson)
    })
    expect(res.success).toBe(true)
    expect(res.count).toBeGreaterThanOrEqual(1)
    expect(currentLib.isInPersonalLibrary(target.id)).toBe(true)
    expect(currentLib.getResourceNotes(target.id)).toBe('Backup test note')
    expect(currentLib.isResourceFavourite(target.id)).toBe(true)
  })

  it('manages audio playback controls and volume', async () => {
    await act(async () => {
      currentLib.playAudio({
        id: 'test-track',
        name: 'BBC Radio 6 Music',
        provider: 'BBC',
        streamUrl: 'https://stream.live.vc.bbcmedia.co.uk/bbc_6music',
      })
    })

    expect(currentLib.isAudioPlaying).toBe(true)
    expect(currentLib.currentAudio?.name).toBe('BBC Radio 6 Music')

    await act(async () => {
      currentLib.setAudioVolume(0.65)
    })
    expect(currentLib.audioVolume).toBe(0.65)

    await act(async () => {
      currentLib.toggleAudioPlay()
    })
    expect(currentLib.isAudioPlaying).toBe(false)

    await act(async () => {
      currentLib.stopAudio()
    })
    expect(currentLib.currentAudio).toBeNull()
    expect(currentLib.isAudioPlaying).toBe(false)
  })

  it('isolates personal library data across different profiles', async () => {
    let lib1!: PersonalMediaLibrary
    let lib2!: PersonalMediaLibrary

    function DualProfileHarness() {
      lib1 = usePersonalMediaLibrary('profile-alpha')
      lib2 = usePersonalMediaLibrary('profile-beta')
      return null
    }

    await act(async () => {
      root.render(<DualProfileHarness />)
    })

    const target = lib1.allResources.find((r) => !lib1.isInPersonalLibrary(r.id))!

    await act(async () => {
      lib1.addToPersonalLibrary(target.id, 'Alpha specific note')
      lib1.toggleResourceFavourite(target.id)
    })

    // Profile Alpha has the item
    expect(lib1.isInPersonalLibrary(target.id)).toBe(true)
    expect(lib1.getResourceNotes(target.id)).toBe('Alpha specific note')
    expect(lib1.isResourceFavourite(target.id)).toBe(true)

    // Profile Beta does not leak Alpha data
    expect(lib2.isInPersonalLibrary(target.id)).toBe(false)
    expect(lib2.getResourceNotes(target.id)).toBe('')
    expect(lib2.isResourceFavourite(target.id)).toBe(false)

    // Scoped storage keys exist independently
    expect(localStorage.getItem('kinora.personalMediaLibrary.v1.profile-alpha')).not.toBeNull()
    expect(localStorage.getItem('kinora.personalMediaLibrary.v1.profile-beta')).not.toBeNull()
  })
})
