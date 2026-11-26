/**
 * Authoritative genre artwork helper backed by the dedicated `/art/genres/` collection.
 * All paths map strictly to verified genre assets under `public/art/genres/` and never
 * return obsolete demo title imagery from `public/art/`.
 */

export const DEFAULT_GENRE_ARTWORK = '/art/genres/drama.jpg'

export const GENRE_ARTWORK = {
  sport: '/art/genres/sports.jpg',
  news: '/art/genres/news.jpg',
  kids: '/art/genres/family.jpg',
  music: '/art/genres/music.jpg',
  lifestyle: '/art/genres/lifestyle-cooking.jpg',
  entertainment: '/art/genres/comedy.jpg',
  wildlife: '/art/genres/nature-wildlife.jpg',
  documentary: '/art/genres/documentary.jpg',
  movie: '/art/genres/action.jpg',
  drama: '/art/genres/drama.jpg',
  scifi: '/art/genres/science-fiction.jpg',
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
