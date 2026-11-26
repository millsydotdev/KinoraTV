/**
 * Channel title intelligence and metadata sanitisation engine.
 * Strips provider noise, cleans all-caps formatting, extracts technical
 * and regional tags, and detects divider/spacer rows in IPTV playlists.
 */

export interface ChannelBadge {
  label: string
  kind: 'quality' | 'framerate' | 'country' | 'badge'
}

export interface ChannelMetadata {
  cleanTitle: string
  rawTitle: string
  country?: string
  resolution?: string
  framerate?: string
  isBackup?: boolean
  badges: ChannelBadge[]
}

const SUPERSCRIPT_MAP: Record<string, string> = {
  '\u2070': '0',
  '\u00B9': '1',
  '\u00B2': '2',
  '\u00B3': '3',
  '\u2074': '4',
  '\u2075': '5',
  '\u2076': '6',
  '\u2077': '7',
  '\u2078': '8',
  '\u2079': '9',
  '\u1D50': 'm',
  '\u1D52': 'o',
  '\u1DA0': 'f',
  '\u1D56': 'p',
  '\u02E2': 's',
}

const KNOWN_REGIONS = new Set([
  'UK', 'US', 'USA', 'CA', 'CAN', 'AU', 'AUS', 'NZ', 'IE', 'IRL',
  'FR', 'FRA', 'DE', 'DEU', 'IT', 'ITA', 'ES', 'ESP', 'PT', 'PRT',
  'NL', 'NLD', 'BE', 'BEL', 'CH', 'CHE', 'AT', 'AUT', 'SE', 'SWE',
  'NO', 'NOR', 'DK', 'DNK', 'FI', 'FIN', 'PL', 'POL', 'RO', 'ROU',
  'GR', 'GRC', 'TR', 'TUR', 'RU', 'RUS', 'UA', 'UKR', 'IN', 'IND',
  'PK', 'PAK', 'ZA', 'ZAF', 'MX', 'MEX', 'BR', 'BRA', 'AR', 'ARG',
  'LAT', 'ARAB', 'VIP', 'INT', 'WORLD',
])

const PRESERVE_UPPERCASE = new Set([
  'BBC', 'ITV', 'CNN', 'HBO', 'ESPN', 'TNT', 'CBS', 'NBC', 'ABC', 'FOX',
  'TLC', 'MTV', 'CNBC', 'MSNBC', 'UFC', 'WWE', 'NFL', 'NBA', 'MLB', 'NHL',
  'F1', 'TV', 'FM', 'AM', 'UK', 'US', 'USA', 'HD', 'SD', '4K', 'UHD', 'FHD',
  'TSN', 'BT', 'DAZN', 'WNBA', 'PGA', 'NASCAR', 'MAX', 'CW', 'VOD', 'PPV',
])

/** Replaces superscript characters like ⁶⁰ᶠᵖˢ with ASCII equivalents. */
function normaliseSuperscript(s: string): string {
  return s.replace(/[\u2070\u00B9\u00B2\u00B3\u2074-\u2079\u1D50\u1D52\u1DA0\u1D56\u02E2]/g, (c) => SUPERSCRIPT_MAP[c] ?? c)
}

/** Converts shouting uppercase titles to title case while keeping recognized acronyms uppercase. */
function toCleanCase(str: string): string {
  if (str !== str.toUpperCase() || !/[A-Z]/.test(str)) {
    return str
  }
  return str
    .split(' ')
    .map((word) => {
      // Check if word is an acronym with delimiters like M*A*S*H, S.W.A.T., N.Y.P.D.
      if (/^[A-Z]([.*_-][A-Z])+[.*_-]?$/i.test(word)) {
        return word.toUpperCase()
      }
      const stripped = word.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
      const withoutDigits = stripped.replace(/\d+$/, '')
      if (PRESERVE_UPPERCASE.has(stripped) || (withoutDigits && PRESERVE_UPPERCASE.has(withoutDigits))) {
        return word.toUpperCase()
      }
      if (/^(I|II|III|IV|V|VI|VII|VIII|IX|X)$/i.test(stripped)) {
        return word.toUpperCase()
      }
      if (word.length <= 1) return word.toUpperCase()
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

/**
 * Checks whether an M3U entry is a non-playable divider or category spacer line.
 * Example: "### UK SPORTS ###", "=== MOVIES ===", "..:: VIP CINEMA ::..", "-----".
 */
export function isDividerChannel(name: string, streamUrl?: string | null): boolean {
  if (!name) return false
  const s = name.trim()
  if (s.length === 0) return false

  if (/^[#=\-*~_|<:!+]{3,}.*[#=\-*~_|>+:!]{3,}$/.test(s)) return true
  if (/^(\.{2,}::|::\.{2,})/.test(s)) return true
  if (/^[-=_*#~]{4,}$/.test(s)) return true

  const isDummyUrl = !streamUrl || streamUrl === '#' || streamUrl.includes('dummy') || streamUrl.endsWith('/divider')
  if (isDummyUrl && /^\s*(category|section|divider|group|notice|info)\s*[-:|]/i.test(s)) {
    return true
  }

  return false
}

/**
 * Parses channel title strings to separate clean names from technical and regional tags.
 */
export function parseChannelMetadata(rawName: string): ChannelMetadata {
  if (!rawName || typeof rawName !== 'string') {
    return {
      cleanTitle: 'Unnamed channel',
      rawTitle: rawName ?? '',
      badges: [],
    }
  }

  let s = rawName.trim()
  s = normaliseSuperscript(s)

  let country: string | undefined
  let resolution: string | undefined
  let framerate: string | undefined
  let isBackup = false
  const badges: ChannelBadge[] = []

  // 1. Prefix resolution stripping (e.g. "4K-A+ - DUNE", "1080p - BBC ONE")
  const prefixResMatch = s.match(/^(4k|uhd|2160p|1080p|1080i|720p|hd|sd)(?:-[a-z0-9+]+)?\s*[-:|/.]\s*/i)
  if (prefixResMatch) {
    const rawRes = prefixResMatch[1]!.toUpperCase()
    if (rawRes === '2160P' || rawRes === 'UHD') resolution = '4K'
    else if (rawRes === '1080I') resolution = '1080p'
    else resolution = rawRes
    s = s.slice(prefixResMatch[0]!.length)
  }

  // 2. Country / regional tag checking (prefixes or bracketed tags anywhere)
  s = s.replace(/\s*\[([A-Za-z]{2,5})\]/gi, (match, code) => {
    if (KNOWN_REGIONS.has(code.toUpperCase())) {
      if (!country) country = code.toUpperCase()
      return ''
    }
    return match
  })
  s = s.replace(/\s*\(([A-Za-z]{2,5})\)/gi, (match, code) => {
    if (KNOWN_REGIONS.has(code.toUpperCase())) {
      if (!country) country = code.toUpperCase()
      return ''
    }
    return match
  })

  if (!country) {
    const sepPrefix = s.match(/^([A-Za-z]{2,5})\s*[-:|/.]\s*/i)
    if (sepPrefix && KNOWN_REGIONS.has(sepPrefix[1]!.toUpperCase())) {
      country = sepPrefix[1]!.toUpperCase()
      s = s.slice(sepPrefix[0]!.length)
    }
  }

  // 3. Framerate extraction (e.g. 50fps, 60fps, 59.94fps)
  const fpsMatch = s.match(/\b(50|59\.94|60)\s*fps\b/i) ?? s.match(/[[/(](50|60)\s*fps[\]/)]/i)
  if (fpsMatch) {
    framerate = `${Math.round(parseFloat(fpsMatch[1]!))}fps`
    s = s.replace(/\s*[[/(]?(?:50|59\.94|60)\s*fps[\]/)]?/gi, '')
  }

  // 4. Backup / alternative stream detection
  if (/\b(?:backup|alt|alternative)\b/i.test(s)) {
    isBackup = true
    s = s.replace(/\s*[[/(]?(?:backup|alt|alternative)[\]/)]?/gi, '')
  }

  // 5. Resolution token extraction
  if (!resolution) {
    if (/\b(?:4k|uhd|2160p)\b/i.test(s)) {
      resolution = '4K'
    } else if (/\b(?:fhd|1080p|1080i)\b/i.test(s)) {
      resolution = '1080p'
    } else if (/\b(?:720p|720i)\b/i.test(s)) {
      resolution = '720p'
    } else if (/\bhd\b/i.test(s)) {
      resolution = 'HD'
    } else if (/\b(?:sd|576p|480p|576i|480i)\b/i.test(s)) {
      resolution = 'SD'
    }
  }

  // 6. Strip trailing country in brackets e.g. "Sky News [UK]", "(UK)"
  const trailingCountry = s.match(/\s*\[([A-Za-z]{2,5})\]$/i) ?? s.match(/\s*\(([A-Za-z]{2,5})\)$/i)
  if (trailingCountry && KNOWN_REGIONS.has(trailingCountry[1]!.toUpperCase())) {
    if (!country) country = trailingCountry[1]!.toUpperCase()
    s = s.slice(0, s.length - trailingCountry[0]!.length).trim()
  }

  // 7. Strip technical brackets and trailing quality labels
  s = s.replace(/\s*\[(?:4k|uhd|fhd|hd|sd|1080p|1080i|720p|576p|480p|hevc|h\.?265|h\.?264)\]/gi, '')
  s = s.replace(/\s*\((?:4k|uhd|fhd|hd|sd|1080p|1080i|720p|576p|480p|hevc|h\.?265|h\.?264)\)/gi, '')
  s = s.replace(/\s+-\s+(?:4k|uhd|fhd|hd|sd|1080p|720p)$/i, '')
  s = s.replace(/\s+\b(?:4k|uhd|fhd|hd|sd|1080p|1080i|720p|576p|480p)\b$/i, '')
  s = s.replace(/\s*\[(?:geo-blocked|raw|direct|vip)\]/gi, '')
  s = s.replace(/\s*\((?:geo-blocked|raw|direct|vip)\)/gi, '')

  // 8. Clean trailing/leading delimiters and whitespace
  s = s.replace(/^[-:|/.\s]+|[-:|/.\s]+$/g, '').trim()
  s = s.replace(/\s{2,}/g, ' ')

  // 9. Apply smart title-casing if shouting uppercase
  const cleaned = toCleanCase(s)

  // 10. Assemble ordered badges
  if (country) badges.push({ label: country, kind: 'country' })
  if (resolution) badges.push({ label: resolution, kind: 'quality' })
  if (framerate) badges.push({ label: framerate, kind: 'framerate' })
  if (isBackup) badges.push({ label: 'Backup', kind: 'badge' })

  return {
    cleanTitle: cleaned || rawName.trim() || 'Unnamed channel',
    rawTitle: rawName,
    country,
    resolution,
    framerate,
    isBackup,
    badges,
  }
}

/** Strips noisy technical and regional tags from channel titles for display. */
export function cleanChannelTitle(name: string): string {
  return parseChannelMetadata(name).cleanTitle
}
