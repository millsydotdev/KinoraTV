import type { IconName } from '../components/Icon'
import type { Channel, StreamVariant } from './types'

export interface ChannelCategoryInfo {
  id: string
  name: string
  icon: IconName
  description: string
  subcategories: string[]
  keywords: string[]
}

export const LIVE_TV_CATEGORIES: ChannelCategoryInfo[] = [
  {
    id: 'entertainment',
    name: 'Entertainment',
    icon: 'sparkles',
    description: 'General entertainment, variety, comedy, drama and prime-time television networks.',
    subcategories: ['General Entertainment', 'Comedy', 'Drama', 'Variety', 'Talk Shows', 'Game Shows'],
    keywords: ['entertainment', 'variety', 'comedy', 'drama', 'general', 'prime', 'show', 'talk'],
  },
  {
    id: 'movies',
    name: 'Movies',
    icon: 'film',
    description: 'Feature films, cinema networks, classic movies, and thematic movie channels.',
    subcategories: ['Cinema', 'Classic Movies', 'Action Movies', 'World Cinema', 'Independent Film'],
    keywords: ['movie', 'movies', 'cinema', 'film', 'films', 'cine', 'blockbuster', 'kino', 'pelicula'],
  },
  {
    id: 'series',
    name: 'Series',
    icon: 'series',
    description: 'Scripted television series, serialized dramas, sit-coms, and episodic programming.',
    subcategories: ['Drama Series', 'Comedy Series', 'Crime Series', 'Sci-Fi Series', 'Classic Serials'],
    keywords: ['series', 'serial', 'serials', 'sitcom', 'episodic', 'soaps', 'telenovela'],
  },
  {
    id: 'sports',
    name: 'Sports',
    icon: 'sports',
    description: 'Live sporting events, sports news, match highlights, football, racing, and athletics.',
    subcategories: ['Football', 'Motorsport', 'Combat Sports', 'Athletics', 'Tennis', 'Extreme Sports'],
    keywords: ['sport', 'sports', 'football', 'soccer', 'racing', 'f1', 'tennis', 'nba', 'nfl', 'golf', 'cricket', 'rugby'],
  },
  {
    id: 'news',
    name: 'News',
    icon: 'news',
    description: '24-hour news networks, weather forecasts, financial markets, and current affairs.',
    subcategories: ['World News', 'National News', 'Financial News', 'Weather', 'Parliamentary & Politics'],
    keywords: ['news', 'current affairs', 'weather', 'finance', 'business', 'parliament', 'noticias', 'nouvelles', 'nachrichten'],
  },
  {
    id: 'kids',
    name: 'Kids',
    icon: 'star',
    description: "Children's programming, animation, educational cartoons, and family channels.",
    subcategories: ['Animation', 'Preschool', 'Junior', 'Family', 'Teens'],
    keywords: ['kid', 'kids', 'children', 'family', 'cartoon', 'cartoons', 'animation', 'junior', 'preschool', 'disney', 'nickelodeon', 'cbeebies'],
  },
  {
    id: 'documentary',
    name: 'Documentary',
    icon: 'documentary',
    description: 'History, investigative documentaries, biographies, and factual storytelling.',
    subcategories: ['History', 'Biography', 'Investigation', 'True Crime', 'Social Issues'],
    keywords: ['documentary', 'documentaries', 'history', 'discovery', 'national geographic', 'nat geo', 'docu', 'biography'],
  },
  {
    id: 'music',
    name: 'Music',
    icon: 'music',
    description: 'Music video channels, live concert streams, chart shows, and genre television.',
    subcategories: ['Pop & Charts', 'Rock & Alternative', 'Urban & Hip-Hop', 'Dance & Electronic', 'Classical Music'],
    keywords: ['music', 'mtv', 'concert', 'charts', 'vh1', 'hits', 'rock', 'pop', 'jazz', 'classical'],
  },
  {
    id: 'radio',
    name: 'Radio',
    icon: 'radio',
    description: 'Live broadcast radio stations, public radio networks, and audio-only streams.',
    subcategories: ['Public Radio', 'News Radio', 'Talk Radio', 'Community Radio', 'Music Radio'],
    keywords: ['radio', 'audio', 'fm', 'am', 'dab', 'broadcast radio'],
  },
  {
    id: 'lifestyle',
    name: 'Lifestyle',
    icon: 'heart',
    description: 'Cooking, home renovation, travel, fashion, gardening, and wellness channels.',
    subcategories: ['Cooking & Food', 'Home & Garden', 'Travel', 'Fashion', 'Health & Wellness'],
    keywords: ['lifestyle', 'food', 'cooking', 'travel', 'home', 'garden', 'fashion', 'health', 'wellness'],
  },
  {
    id: 'factual',
    name: 'Factual',
    icon: 'info',
    description: 'In-depth reporting, real-world events, public affairs, and expository programming.',
    subcategories: ['Public Affairs', 'Consumer Affairs', 'Law & Justice', 'Real Life'],
    keywords: ['factual', 'reality', 'investigative', 'expository', 'affairs'],
  },
  {
    id: 'education',
    name: 'Education',
    icon: 'education',
    description: 'Academic lectures, instructional television, language learning, and open universities.',
    subcategories: ['Academic', 'Language Learning', 'Instructional', 'University', 'Vocational'],
    keywords: ['education', 'educational', 'learning', 'university', 'academic', 'course', 'training'],
  },
  {
    id: 'culture',
    name: 'Culture and Arts',
    icon: 'palette',
    description: 'Theatre, opera, visual arts, literature, dance, and cultural heritage programming.',
    subcategories: ['Theatre', 'Opera', 'Visual Arts', 'Museums', 'Literature & Dance'],
    keywords: ['culture', 'art', 'arts', 'theatre', 'opera', 'ballet', 'dance', 'museum', 'cultural'],
  },
  {
    id: 'nature-science',
    name: 'Nature and Science',
    icon: 'nature',
    description: 'Wildlife, nature reserves, space exploration, astrophysics, and environmental science.',
    subcategories: ['Wildlife', 'Space & Astronomy', 'Earth Sciences', 'Technology & Science'],
    keywords: ['nature', 'science', 'wildlife', 'animal', 'animals', 'space', 'astronomy', 'nasa', 'earth'],
  },
  {
    id: 'international',
    name: 'International',
    icon: 'globe',
    description: 'Global broadcasters, multilingual services, and foreign-language national networks.',
    subcategories: ['European', 'Americas', 'Asian', 'African', 'Middle Eastern', 'Oceanian'],
    keywords: ['international', 'foreign', 'multilingual', 'global', 'world'],
  },
  {
    id: 'regional',
    name: 'Regional',
    icon: 'radar',
    description: 'Local and regional opt-outs, community stations, and provincial transmissions.',
    subcategories: ['Local News', 'Regional Feeds', 'Community Television', 'Municipal'],
    keywords: ['regional', 'local', 'provincial', 'community', 'scotland', 'wales', 'london', 'ulster'],
  },
  {
    id: 'general',
    name: 'General',
    icon: 'tv',
    description: 'Broad-appeal television stations and general public service networks.',
    subcategories: ['Public Broadcaster', 'National Network', 'Terrestrial Free-to-Air'],
    keywords: ['general', 'main', 'network', 'broadcast', 'public service'],
  },
  {
    id: 'other',
    name: 'Other',
    icon: 'folder',
    description: 'Uncategorised channels and niche special-interest broadcasts.',
    subcategories: ['Uncategorised', 'Special Interest'],
    keywords: ['other', 'uncategorised', 'misc', 'miscellaneous', 'special'],
  },
]

const CATEGORY_MAP = new Map<string, ChannelCategoryInfo>()
for (const cat of LIVE_TV_CATEGORIES) {
  CATEGORY_MAP.set(cat.id.toLowerCase(), cat)
  CATEGORY_MAP.set(cat.name.toLowerCase(), cat)
}

const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  uk: 'United Kingdom',
  gb: 'United Kingdom',
  us: 'United States',
  ca: 'Canada',
  au: 'Australia',
  nz: 'New Zealand',
  ie: 'Ireland',
  fr: 'France',
  de: 'Germany',
  es: 'Spain',
  it: 'Italy',
  nl: 'Netherlands',
  be: 'Belgium',
  ch: 'Switzerland',
  at: 'Austria',
  pt: 'Portugal',
  br: 'Brazil',
  mx: 'Mexico',
  ar: 'Argentina',
  co: 'Colombia',
  cl: 'Chile',
  za: 'South Africa',
  eg: 'Egypt',
  ng: 'Nigeria',
  in: 'India',
  pk: 'Pakistan',
  sg: 'Singapore',
  th: 'Thailand',
  jp: 'Japan',
  kr: 'South Korea',
  cn: 'China',
  ae: 'United Arab Emirates',
  qa: 'Qatar',
  tr: 'Turkey',
  gr: 'Greece',
  pl: 'Poland',
  se: 'Sweden',
  no: 'Norway',
  dk: 'Denmark',
  fi: 'Finland',
}

/** Returns the icon corresponding to a category name or keyword. */
export function getCategoryIcon(categoryName: string): IconName {
  const norm = categoryName.trim().toLowerCase()
  if (norm === 'all' || norm === 'channels') return 'grid'
  if (norm === 'favourites' || norm === 'favorites') return 'heart'
  if (norm === 'recently watched' || norm === 'recent' || norm === 'history') return 'history'
  const direct = CATEGORY_MAP.get(norm)
  if (direct) return direct.icon

  for (const cat of LIVE_TV_CATEGORIES) {
    if (cat.keywords.some((kw) => norm.includes(kw))) {
      return cat.icon
    }
  }

  if (norm.includes('sport')) return 'sports'
  if (norm.includes('film') || norm.includes('cinema') || norm.includes('movie')) return 'film'
  if (norm.includes('news') || norm.includes('weather')) return 'news'
  if (norm.includes('kid') || norm.includes('child') || norm.includes('cartoon') || norm.includes('anim')) return 'star'
  if (norm.includes('music')) return 'music'
  if (norm.includes('radio')) return 'radio'
  if (norm.includes('doc')) return 'documentary'
  if (norm.includes('nature') || norm.includes('wild')) return 'nature'
  if (norm.includes('sci')) return 'nature'
  if (norm.includes('art') || norm.includes('theat') || norm.includes('opera')) return 'palette'
  if (norm.includes('educat') || norm.includes('learn')) return 'education'

  return 'folder'
}

/** Extracts country and region from a channel's metadata. */
export function extractChannelLocation(channel: Channel): {
  country?: string
  countryCode?: string
  region?: string
} {
  let country: string | undefined
  let countryCode: string | undefined
  let region: string | undefined

  const tvg = channel.tvgId?.trim() ?? ''
  if (tvg) {
    const parts = tvg.split('@')
    const chanPart = parts[0] ?? ''
    const feedPart = parts[1]
    if (feedPart) {
      const feedClean = feedPart.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
      if (feedClean && !/^(sd|hd|fhd|uhd|4k|ukhd|uksd|ushd|ussd)$/.test(feedClean)) {
        region = feedPart.trim()
      }
    }
    const dot = chanPart.lastIndexOf('.')
    if (dot > 0) {
      const code = chanPart.slice(dot + 1).replace(/[0-9]+$/, '').toLowerCase()
      if (code.length === 2 && COUNTRY_CODE_TO_NAME[code]) {
        countryCode = code.toUpperCase()
        country = COUNTRY_CODE_TO_NAME[code]
      }
    }
  }

  if (!country) {
    const textToCheck = `${channel.name} ${channel.group} ${channel.categories.join(' ')}`
    const countryMatch = textToCheck.match(/\b(UK|GB|USA|US|CA|AU|NZ|IE|FR|DE|ES|IT|BR|MX|ZA|IN|JP|KR)\b/i)
    if (countryMatch && countryMatch[1]) {
      const code = countryMatch[1].toLowerCase()
      const normCode = code === 'usa' ? 'us' : code === 'gb' ? 'uk' : code
      if (COUNTRY_CODE_TO_NAME[normCode]) {
        countryCode = normCode.toUpperCase()
        country = COUNTRY_CODE_TO_NAME[normCode]
      }
    }
  }

  if (!region) {
    const textToCheck = `${channel.name} ${channel.group}`
    const regionMatch = textToCheck.match(/\b(Scotland|Wales|Northern Ireland|London|Midlands|Yorkshire|North West|Meridian|Anglia|Tyne Tees|Granada)\b/i)
    if (regionMatch && regionMatch[1]) {
      region = regionMatch[1]
    }
  }

  return { country, countryCode, region }
}

/** Classifies any channel into a canonical Kinora category and icon. */
export function classifyChannelCategory(channel: Channel): {
  category: string
  icon: IconName
  subcategory?: string
} {
  const text = `${channel.group} ${channel.categories.join(' ')} ${channel.name}`.toLowerCase()

  // High-signal priority order so specific genres (Sports, Movies, News, Kids...) are checked before general entertainment
  const PRIORITY_ORDER = [
    'movies',
    'sports',
    'news',
    'kids',
    'music',
    'radio',
    'documentary',
    'nature-science',
    'education',
    'culture',
    'lifestyle',
    'series',
    'factual',
    'regional',
    'international',
    'entertainment',
  ]

  for (const catId of PRIORITY_ORDER) {
    const cat = CATEGORY_MAP.get(catId)
    if (!cat) continue
    for (const kw of cat.keywords) {
      const pattern = new RegExp(`\\b${kw}\\b`, 'i')
      if (pattern.test(text)) {
        return {
          category: cat.name,
          icon: cat.icon,
          subcategory: cat.subcategories[0],
        }
      }
    }
  }

  if (channel.group && channel.group !== 'Uncategorised') {
    return {
      category: 'General',
      icon: 'tv',
      subcategory: channel.group,
    }
  }

  return {
    category: 'Other',
    icon: 'folder',
    subcategory: 'Uncategorised',
  }
}

/** Formats a descriptive label for a server variant without exposing sensitive upstream URLs. */
export function formatServerLabel(variant: StreamVariant, index = 1): string {
  const parts: string[] = [`Server ${index}`]

  if (variant.sourceName && variant.sourceName !== 'Source' && variant.sourceName !== 'Unknown source') {
    parts.push(variant.sourceName)
  }

  if (variant.region) {
    parts.push(variant.region)
  } else if (variant.country) {
    parts.push(variant.country)
  }

  if (variant.quality) {
    parts.push(variant.quality)
  } else if (variant.resolution) {
    parts.push(variant.resolution)
  }

  return parts.join(' - ')
}
