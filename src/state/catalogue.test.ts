import { describe, expect, it } from 'vitest'
import { IngestError, type Catalogue, type CatalogueEntry } from '../lib/native'
import { filterEntries, idleCatalogue, importedAs, isStale, placeOf, runCatalogue, STALE_AFTER_MS, uniqueName, type CatalogueState } from './catalogue'
import { createSource, DESKTOP_ONLY } from './playlists'

const entry = (kind: CatalogueEntry['kind'], folder: string, code: string, name: string, extra: Partial<CatalogueEntry> = {}): CatalogueEntry => ({
  id: `${folder}/${code}`, kind, code, name, flag: null, parent: null, channels: null, url: `https://iptv-org.github.io/iptv/${folder}/${code}.m3u`, ...extra,
})
const entries = [
  entry('country', 'countries', 'uk', 'United Kingdom', { flag: '🇬🇧' }),
  entry('country', 'countries', 'ci', 'Côte d’Ivoire'),
  entry('country', 'countries', 'al', 'Albania'),
  entry('subdivision', 'subdivisions', 'al-04', 'Fier', { parent: 'countries/al' }),
  entry('city', 'cities', 'alfie', 'Fier', { parent: 'subdivisions/al-04' }),
  entry('language', 'languages', 'eng', 'English', { channels: 3016 }),
  entry('category', 'categories', 'news', 'News', { channels: 1049 }),
]
const catalogue = (fetchedAt = 1000, list = entries): Catalogue => ({ fetchedAt, entries: list, skipped: 0 })

describe('browsing the catalogue', () => {
  it('filters by kind and finds names, codes and places regardless of case or accents', () => {
    expect(filterEntries(entries, 'country', '').map((e) => e.code)).toEqual(['uk', 'ci', 'al'])
    expect(filterEntries(entries, 'country', 'KING').map((e) => e.code)).toEqual(['uk'])
    expect(filterEntries(entries, 'country', 'cote').map((e) => e.code)).toEqual(['ci'])
    expect(filterEntries(entries, 'country', 'uk').map((e) => e.code)).toEqual(['uk'])
    expect(filterEntries(entries, 'local', '').map((e) => e.id)).toEqual(['subdivisions/al-04', 'cities/alfie'])
    expect(filterEntries(entries, 'local', 'albania').map((e) => e.id)).toEqual(['subdivisions/al-04'])
    expect(filterEntries(entries, 'language', 'eng').map((e) => e.code)).toEqual(['eng'])
    expect(filterEntries(entries, 'category', 'nothing')).toEqual([])
  })

  it('names where a local playlist belongs, nearest first', () => {
    expect(placeOf(entries[4]!, entries)).toBe('Fier, Albania')
    expect(placeOf(entries[0]!, entries)).toBeNull()
  })

  it('is out of date after a day, and still usable', () => {
    expect(isStale(catalogue(0), STALE_AFTER_MS)).toBe(false)
    expect(isStale(catalogue(0), STALE_AFTER_MS + 1)).toBe(true)
  })
})

describe('imports from the catalogue', () => {
  const report = { channels: [], skipped: 0, duplicates: 0, warnings: [], host: 'iptv-org.github.io' }
  it('recognises an imported entry by its exact address, never by its name', () => {
    const sameName = createSource('pl-a', { name: 'United Kingdom', origin: 'url', url: 'https://other.example/uk.m3u', label: 'x' }, report, 1)
    expect(importedAs(entries[0]!, [sameName])).toBeUndefined()
    const sameUrl = createSource('pl-b', { name: 'Mine', origin: 'url', url: entries[0]!.url, label: 'x' }, report, 1)
    expect(importedAs(entries[0]!, [sameName, sameUrl])?.id).toBe('pl-b')
  })

  it('suggests a free name within the length limit', () => {
    expect(uniqueName(entries[0]!, [])).toBe('iptv-org · United Kingdom')
    expect(uniqueName(entries[0]!, ['IPTV-ORG · united kingdom', 'iptv-org · United Kingdom 2'])).toBe('iptv-org · United Kingdom 3')
    const long = uniqueName({ ...entries[0]!, name: 'x'.repeat(80) }, [])
    expect(long.length).toBeLessThanOrEqual(48)
  })
})

describe('fetching the catalogue', () => {
  function harness(initial: CatalogueState = idleCatalogue) {
    let state = initial
    return { update: (fn: (s: CatalogueState) => CatalogueState) => { state = fn(state) }, get: () => state }
  }

  it('a success replaces the copy', async () => {
    const h = harness()
    await runCatalogue(h.update, 1, async () => catalogue(5))
    expect(h.get()).toMatchObject({ status: 'ready', catalogue: { fetchedAt: 5 }, error: null })
  })

  it('a failure keeps the copy already shown and says why, without echoing raw errors', async () => {
    const h = harness({ status: 'ready', catalogue: catalogue(5), error: null, op: 0 })
    await runCatalogue(h.update, 1, async () => { throw new IngestError('network', 'Could not connect to raw.githubusercontent.com.') })
    expect(h.get()).toMatchObject({ status: 'failed', catalogue: { fetchedAt: 5 }, error: 'Could not connect to raw.githubusercontent.com.' })
    await runCatalogue(h.update, 2, async () => { throw new Error('https://raw.githubusercontent.com/x?token=T failed') })
    expect(h.get().error).toBe('Kinora could not read the catalogue.')
  })

  it('an older request that finishes last is dropped', async () => {
    const h = harness()
    let finishOld!: (c: Catalogue) => void
    const older = runCatalogue(h.update, 1, () => new Promise((r) => { finishOld = r }))
    await runCatalogue(h.update, 2, async () => catalogue(20))
    finishOld(catalogue(10))
    await older
    expect(h.get().catalogue?.fetchedAt).toBe(20)
  })

  it('outside the desktop app says so', async () => {
    const h = harness()
    await runCatalogue(h.update, 1, async () => null)
    expect(h.get()).toMatchObject({ status: 'failed', error: DESKTOP_ONLY })
  })
})
