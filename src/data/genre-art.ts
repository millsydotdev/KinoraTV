/**
 * Bundled photographic fallback artwork for real-mode programmes and channels.
 * All paths must correspond to verified photographic assets bundled in `public/art/`.
 */

export const DEFAULT_GENRE_ARTWORK = '/art/harbour-lights.jpg'

export const GENRE_ARTWORK = {
  sport: '/art/live-football.jpg',
  news: '/art/live-news.jpg',
  kids: '/art/live-kids.jpg',
  music: '/art/live-concert.jpg',
  lifestyle: '/art/live-cooking.jpg',
  entertainment: '/art/live-quiz.jpg',
  wildlife: '/art/live-wildlife.jpg',
  documentary: '/art/live-ocean.jpg',
  movie: '/art/harbour-lights.jpg',
  drama: '/art/kingsmoor.jpg',
  scifi: '/art/salt-meridian.jpg',
  default: DEFAULT_GENRE_ARTWORK,
} as const

/**
 * Deterministically maps an XMLTV or guide category string to a bundled photographic asset.
 * Evaluates categories by keywords and regex term boundaries.
 * Returns DEFAULT_GENRE_ARTWORK if category is missing or unmapped.
 */
export function matchGenreArtwork(category?: string | null): string {
  if (!category) return DEFAULT_GENRE_ARTWORK
  const norm = category.toLowerCase().trim()
  if (!norm) return DEFAULT_GENRE_ARTWORK

  // Priority-ordered keyword matching for standard broadcaster and XMLTV categories
  if (/\b(sport|sports|football|soccer|rugby|cricket|tennis|basketball|baseball|athletics|racing|golf|motorsport|boxing|mma|formula|olympic)\b/i.test(norm)) {
    return GENRE_ARTWORK.sport
  }
  if (/\b(news|weather|current affairs|politics|political|business|financial|finance|parliament|bulletin)\b/i.test(norm)) {
    return GENRE_ARTWORK.news
  }
  if (/\b(kids|children|child|animation|animated|cartoon|youth|junior|toddler|family)\b/i.test(norm)) {
    return GENRE_ARTWORK.kids
  }
  if (/\b(music|concert|musical|pop|rock|jazz|classical|opera|dance|hip hop|singing)\b/i.test(norm)) {
    return GENRE_ARTWORK.music
  }
  if (/\b(cooking|cookery|cuisine|food|chef|recipe|baking|gardening|garden|home|lifestyle|travel|fashion|diy|house|makeover)\b/i.test(norm)) {
    return GENRE_ARTWORK.lifestyle
  }
  if (/\b(entertainment|quiz|game show|gameshow|comedy|comedian|sitcom|stand-up|variety|reality|talk|chat|chat show|soap)\b/i.test(norm)) {
    return GENRE_ARTWORK.entertainment
  }
  if (/\b(wildlife|nature|animals|animal|safari|ecology|environment|fauna|flora)\b/i.test(norm)) {
    return GENRE_ARTWORK.wildlife
  }
  if (/\b(documentary|docu|ocean|history|historical|science|factual|discovery|investigation|geographic|biography|educational)\b/i.test(norm)) {
    return GENRE_ARTWORK.documentary
  }
  if (/\b(film|movie|movies|cinema|thriller|western|action|horror|feature)\b/i.test(norm)) {
    return GENRE_ARTWORK.movie
  }
  if (/\b(drama|crime|detective|mystery|police|courtroom|legal|serial)\b/i.test(norm)) {
    return GENRE_ARTWORK.drama
  }
  if (/\b(sci-fi|science fiction|fantasy|space|supernatural|paranormal|alien)\b/i.test(norm)) {
    return GENRE_ARTWORK.scifi
  }

  return DEFAULT_GENRE_ARTWORK
}
