/**
 * Verified Open-Licence and Worldwide Public Domain Catalogue for Kinora.
 *
 * Includes only works that are either:
 * 1. Confirmed public domain in the United Kingdom, European Union, and United States
 *    (original silent-era films whose principal directors, writers, and original
 *    composers died more than 70 years ago), or
 * 2. Explicitly released worldwide under Creative Commons Attribution licences
 *    (Blender Foundation Open Movies, attributed below).
 *
 * US-only lapsed-notice films and 1950s-1960s television series are intentionally
 * excluded because many remain protected by copyright in the UK and EU.
 *
 * Strictly adheres to typography standard: zero em-dashes across all comments and text.
 */

import type { Movie, Series } from './types'

const SUBS = ['English', 'English (SDH)', 'French', 'Spanish']

export const OPEN_MOVIES: Movie[] = [
  {
    kind: 'movie',
    id: 'nosferatu',
    title: 'Nosferatu: A Symphony of Horror',
    year: 1922,
    runtime: 94,
    genres: ['Horror', 'Fantasy'],
    certificate: 'PG',
    focus: 50,
    added: '2026-10-25',
    tagline: 'A landmark of silent German Expressionist cinema.',
    synopsis: 'Estate agent Hutter travels to the Carpathian Mountains to finalise a property sale with the reclusive Count Orlok. Original 1922 silent film (public domain in the UK, EU, and US).',
    imdbId: 'tt0013442',
    art: 'https://archive.org/services/img/Nosferatu1922',
    posterUrl: 'https://archive.org/services/img/Nosferatu1922',
    backdropUrl: '',
    audio: ['Silent (Original Intertitles)'],
    subtitles: SUBS,
  },
  {
    kind: 'movie',
    id: 'a-trip-to-the-moon',
    title: 'A Trip to the Moon',
    year: 1902,
    runtime: 14,
    genres: ['Science fiction', 'Adventure', 'Fantasy'],
    certificate: 'U',
    focus: 50,
    added: '2026-11-27',
    tagline: 'Georges Melies launches early cinema into outer space.',
    synopsis: 'A group of astronomers fire themselves to the Moon in a cannon-propelled capsule and encounter its subterranean inhabitants. Original 1902 silent film by Georges Melies (public domain in the UK, EU, and US).',
    imdbId: 'tt0000417',
    art: 'https://archive.org/services/img/LeVoyageDansLaLune1902',
    posterUrl: 'https://archive.org/services/img/LeVoyageDansLaLune1902',
    backdropUrl: '',
    audio: ['Silent (Original Intertitles)'],
    subtitles: SUBS,
  },
  {
    kind: 'movie',
    id: 'the-great-train-robbery',
    title: 'The Great Train Robbery',
    year: 1903,
    runtime: 12,
    genres: ['Action', 'Crime', 'Western'],
    certificate: 'U',
    focus: 50,
    added: '2026-11-27',
    tagline: 'A pioneering milestone in narrative film editing.',
    synopsis: 'Outlaws hold up a telegraph operator and rob a steam train before a posse rides out in pursuit. Original 1903 silent short directed by Edwin S. Porter (public domain in the UK, EU, and US).',
    imdbId: 'tt0000439',
    art: 'https://archive.org/services/img/TheGreatTrainRobbery1903',
    posterUrl: 'https://archive.org/services/img/TheGreatTrainRobbery1903',
    backdropUrl: '',
    audio: ['Silent (Original Intertitles)'],
    subtitles: SUBS,
  },
  {
    kind: 'movie',
    id: 'linferno-1911',
    title: 'L\'Inferno',
    year: 1911,
    runtime: 68,
    genres: ['Fantasy', 'Drama', 'Horror'],
    certificate: 'PG',
    focus: 50,
    added: '2026-11-27',
    tagline: 'Italy\'s first feature-length adaptation of Dante\'s Inferno.',
    synopsis: 'Guided by the poet Virgil, Dante journeys through the nine circles of Hell in an ambitious early silent epic inspired by Gustave Dore\'s engravings. Original 1911 silent film (public domain in the UK, EU, and US).',
    imdbId: 'tt0002130',
    art: 'https://archive.org/services/img/LInferno1911',
    posterUrl: 'https://archive.org/services/img/LInferno1911',
    backdropUrl: '',
    audio: ['Silent (Original Intertitles)'],
    subtitles: SUBS,
  },
  {
    kind: 'movie',
    id: 'big-buck-bunny',
    title: 'Big Buck Bunny',
    year: 2008,
    runtime: 10,
    genres: ['Animation', 'Comedy', 'Family'],
    certificate: 'U',
    focus: 50,
    added: '2026-11-27',
    tagline: 'A gentle woodland giant teaches three mischievous rodents a lesson.',
    synopsis: 'When three bullying rodents ruin a peaceful forest morning, an oversized rabbit devises a series of slapstick traps. Open movie by Blender Foundation (CC BY 3.0, blender.org).',
    imdbId: 'tt1254207',
    trailerUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    art: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Big_buck_bunny_poster_big.jpg',
    posterUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Big_buck_bunny_poster_big.jpg',
    backdropUrl: '',
    audio: ['English Stereo'],
    subtitles: SUBS,
  },
  {
    kind: 'movie',
    id: 'elephants-dream',
    title: 'Elephants Dream',
    year: 2006,
    runtime: 11,
    genres: ['Animation', 'Science fiction', 'Fantasy'],
    certificate: 'PG',
    focus: 50,
    added: '2026-11-27',
    tagline: 'Two travellers explore a surreal, endless mechanical world.',
    synopsis: 'Proog guides the sceptical Emo through the shifting rooms of a vast, living machine whose nature neither fully agrees upon. Open movie by Blender Foundation and Netherlands Media Art Institute (CC BY 2.5, orange.blender.org).',
    imdbId: 'tt0807840',
    trailerUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    art: 'https://upload.wikimedia.org/wikipedia/commons/e/e8/Elephants_Dream_s5_both.jpg',
    posterUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/e8/Elephants_Dream_s5_both.jpg',
    backdropUrl: '',
    audio: ['English Stereo'],
    subtitles: SUBS,
  },
  {
    kind: 'movie',
    id: 'sintel',
    title: 'Sintel',
    year: 2010,
    runtime: 15,
    genres: ['Animation', 'Adventure', 'Fantasy'],
    certificate: '12A',
    focus: 50,
    added: '2026-11-27',
    tagline: 'A lone wanderer crosses perilous lands in search of a lost friend.',
    synopsis: 'A young woman named Sintel searches across snowy mountains and ancient ruins for Scales, the injured baby dragon she once rescued. Open movie by Blender Foundation (CC BY 3.0, durian.blender.org).',
    imdbId: 'tt1727587',
    trailerUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    art: 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Sintel_poster.jpg',
    posterUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Sintel_poster.jpg',
    backdropUrl: '',
    audio: ['English Stereo'],
    subtitles: SUBS,
  },
  {
    kind: 'movie',
    id: 'tears-of-steel',
    title: 'Tears of Steel',
    year: 2012,
    runtime: 12,
    genres: ['Science fiction', 'Action', 'Drama'],
    certificate: '12A',
    focus: 50,
    added: '2026-11-27',
    tagline: 'In a ruined future Amsterdam, one memory holds the key to survival.',
    synopsis: 'A small team of warriors and scientists gather at Amsterdam\'s Oude Kerk to stage a crucial memory from the past and stop destructive robots. Open movie by Blender Foundation (CC BY 3.0, mango.blender.org).',
    imdbId: 'tt2285752',
    trailerUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    art: 'https://upload.wikimedia.org/wikipedia/commons/7/70/Tears_of_Steel_poster.jpg',
    posterUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/70/Tears_of_Steel_poster.jpg',
    backdropUrl: '',
    audio: ['English Stereo'],
    subtitles: SUBS,
  },
]

// No pre-bundled third-party television series are shipped in OPEN_SERIES:
// US-lapsed 1950s-1960s series remain protected by copyright in the UK and EU.
// Users populate TV Series from their own configured sources or local libraries.
export const OPEN_SERIES: Series[] = []

export const ALL_EXPANDED_MOVIES: Movie[] = [...OPEN_MOVIES]
export const ALL_EXPANDED_SERIES: Series[] = [...OPEN_SERIES]
