/**
 * Canonical Genre and Subgenre Taxonomy for Kinora.
 *
 * Defines hierarchical taxonomy across Movies, Television, Live Broadcasting,
 * Audio, and Books with multi-media associations, international aliases,
 * provider category mappings, and dedicated artwork specifications.
 * Strictly adheres to project typography standards: zero em-dashes across all code and comments.
 */

import type { IconName } from '../components/Icon'

export type MediaType = 'movies' | 'series' | 'live' | 'audio' | 'books'

export type ArtworkProvenance = 'user' | 'verified' | 'inherited' | 'fallback'

export interface GenreArtworkVariants {
  landscape: string
  portrait: string
  banner: string
  icon: IconName
  ambient: {
    primaryHue: number
    secondaryHue: number
    saturation: number
    lightness: number
  }
}

export interface GenreDefinition {
  id: string
  name: string
  parentId?: string
  subgenreIds: string[]
  mediaTypes: MediaType[]
  description: string
  aliases: string[]
  internationalNames: Record<string, string>
  providerMappings: Record<string, string[]>
  relatedGenreIds: string[]
  featured?: boolean
  sortOrder: number
  artwork: GenreArtworkVariants
}

export const CANONICAL_GENRES: GenreDefinition[] = [
  // ==========================================
  // 1. MOVIES & TELEVISION - ACTION & ADVENTURE
  // ==========================================
  {
    id: 'action',
    name: 'Action',
    subgenreIds: ['action-martial-arts', 'action-superhero', 'action-spy', 'action-disaster', 'action-military'],
    mediaTypes: ['movies', 'series', 'live'],
    description: 'High-octane cinema featuring intense stunts, physical confrontations, explosive chases, and heroic spectacle.',
    aliases: ['Action & Adventure', 'Action Adventure', 'Aksion', 'Accion', 'Azione', 'Action Movie'],
    internationalNames: { fr: 'Action', es: 'Acción', de: 'Action', it: 'Azione', ja: 'アクション' },
    providerMappings: {
      m3u: ['action', 'action movies', 'action & adventure', 'accion'],
      xmltv: ['Action', 'Action/Adventure', 'Martial Arts'],
      xtream: ['Action', 'Action & Adventure', 'Action/Thriller'],
    },
    relatedGenreIds: ['adventure', 'thriller', 'crime', 'science-fiction'],
    featured: true,
    sortOrder: 1,
    artwork: {
      landscape: '/art/genres/action.svg',
      portrait: '/art/genres/action.svg',
      banner: '/art/genres/action.svg',
      icon: 'flame',
      ambient: { primaryHue: 20, secondaryHue: 35, saturation: 90, lightness: 20 },
    },
  },
  {
    id: 'action-martial-arts',
    name: 'Martial Arts',
    parentId: 'action',
    subgenreIds: [],
    mediaTypes: ['movies', 'series'],
    description: 'Disciplined combat choreography spanning Kung Fu, Wuxia, Karate, and close-quarters hand-to-hand combat.',
    aliases: ['Kung Fu', 'Wuxia', 'Karate', 'Hand to Hand Combat', 'Artes Marciales'],
    internationalNames: { fr: 'Arts Martiaux', es: 'Artes Marciales', de: 'Kampfkunst', it: 'Arti Marziali' },
    providerMappings: { m3u: ['martial arts', 'kung fu'], xmltv: ['Martial Arts'] },
    relatedGenreIds: ['action', 'adventure'],
    sortOrder: 11,
    artwork: {
      landscape: '/art/genres/action.svg',
      portrait: '/art/genres/action.svg',
      banner: '/art/genres/action.svg',
      icon: 'flame',
      ambient: { primaryHue: 15, secondaryHue: 30, saturation: 85, lightness: 22 },
    },
  },
  {
    id: 'action-superhero',
    name: 'Superhero',
    parentId: 'action',
    subgenreIds: [],
    mediaTypes: ['movies', 'series', 'books'],
    description: 'Masked vigilantes, extraordinary superhuman abilities, comic book universes, and epic battles against supervillains.',
    aliases: ['Superheroes', 'Comic Book', 'Super-Hero', 'Super-Heros'],
    internationalNames: { fr: 'Super-héros', es: 'Superhéroes', de: 'Superhelden', it: 'Supereroi' },
    providerMappings: { m3u: ['superhero', 'marvel', 'dc'], xmltv: ['Superhero'] },
    relatedGenreIds: ['action', 'science-fiction', 'fantasy'],
    sortOrder: 12,
    artwork: {
      landscape: '/art/genres/action.svg',
      portrait: '/art/genres/action.svg',
      banner: '/art/genres/action.svg',
      icon: 'sparkles',
      ambient: { primaryHue: 30, secondaryHue: 50, saturation: 90, lightness: 25 },
    },
  },
  {
    id: 'action-spy',
    name: 'Spy & Espionage',
    parentId: 'action',
    subgenreIds: [],
    mediaTypes: ['movies', 'series', 'books'],
    description: 'Undercover field operatives, covert intelligence agencies, high-stakes espionage, and geopolitical intrigue.',
    aliases: ['Espionage', 'Secret Agent', 'Secret Service', 'Intelligence', 'Spies'],
    internationalNames: { fr: 'Espionnage', es: 'Espionaje', de: 'Spionage', it: 'Spionaggio' },
    providerMappings: { m3u: ['spy', 'espionage'], xmltv: ['Spy Drama', 'Espionage'] },
    relatedGenreIds: ['action', 'thriller', 'mystery'],
    sortOrder: 13,
    artwork: {
      landscape: '/art/genres/thriller.svg',
      portrait: '/art/genres/thriller.svg',
      banner: '/art/genres/thriller.svg',
      icon: 'shield',
      ambient: { primaryHue: 210, secondaryHue: 230, saturation: 80, lightness: 15 },
    },
  },

  {
    id: 'adventure',
    name: 'Adventure',
    subgenreIds: ['adventure-exploration', 'adventure-survival', 'adventure-treasure'],
    mediaTypes: ['movies', 'series', 'books'],
    description: 'Grand journeys into uncharted territories, hazardous expeditions, survival against nature, and epic quests.',
    aliases: ['Abenteuer', 'Aventura', 'Aventure'],
    internationalNames: { fr: 'Aventure', es: 'Aventura', de: 'Abenteuer', it: 'Avventura' },
    providerMappings: {
      m3u: ['adventure', 'aventura', 'abenteuer'],
      xmltv: ['Adventure', 'Travel/Adventure'],
      xtream: ['Adventure'],
    },
    relatedGenreIds: ['action', 'fantasy', 'travel'],
    featured: true,
    sortOrder: 2,
    artwork: {
      landscape: '/art/genres/adventure.svg',
      portrait: '/art/genres/adventure.svg',
      banner: '/art/genres/adventure.svg',
      icon: 'compass',
      ambient: { primaryHue: 175, secondaryHue: 195, saturation: 85, lightness: 18 },
    },
  },

  // ==========================================
  // 2. ANIMATION & ANIME
  // ==========================================
  {
    id: 'animation',
    name: 'Animation',
    subgenreIds: ['animation-traditional', 'animation-stop-motion', 'animation-cgi', 'anime'],
    mediaTypes: ['movies', 'series', 'live'],
    description: 'Hand-drawn, computer-generated, and stop-motion animated cinema for children, families, and adult audiences.',
    aliases: ['Animated', 'Cartoons', 'CGI Animation', 'Dessin Anime', 'Animacion'],
    internationalNames: { fr: 'Animation', es: 'Animación', de: 'Animation', it: 'Animazione' },
    providerMappings: {
      m3u: ['animation', 'cartoons', 'animated', 'animacion'],
      xmltv: ['Animation', 'Children/Youth', 'Animated'],
      xtream: ['Animation', 'Cartoons'],
    },
    relatedGenreIds: ['family', 'anime', 'comedy'],
    featured: true,
    sortOrder: 3,
    artwork: {
      landscape: '/art/genres/animation.svg',
      portrait: '/art/genres/animation.svg',
      banner: '/art/genres/animation.svg',
      icon: 'star',
      ambient: { primaryHue: 280, secondaryHue: 310, saturation: 85, lightness: 22 },
    },
  },
  {
    id: 'anime',
    name: 'Anime',
    parentId: 'animation',
    subgenreIds: ['anime-shonen', 'anime-seinen', 'anime-mecha', 'anime-isekai'],
    mediaTypes: ['movies', 'series'],
    description: 'Distinctive Japanese animation spanning dynamic battle sagas, psychological character studies, and futuristic mecha.',
    aliases: ['Japanese Animation', 'Japanimation', 'Anime Series', 'Anime Movies'],
    internationalNames: { fr: 'Animé', es: 'Anime', de: 'Anime', it: 'Anime', ja: 'アニメ' },
    providerMappings: {
      m3u: ['anime', 'animé', 'anime series'],
      xmltv: ['Anime', 'Japanese Animation'],
      xtream: ['Anime'],
    },
    relatedGenreIds: ['animation', 'science-fiction', 'fantasy', 'action'],
    featured: true,
    sortOrder: 4,
    artwork: {
      landscape: '/art/genres/anime.svg',
      portrait: '/art/genres/anime.svg',
      banner: '/art/genres/anime.svg',
      icon: 'sparkles',
      ambient: { primaryHue: 330, secondaryHue: 185, saturation: 90, lightness: 20 },
    },
  },

  // ==========================================
  // 3. COMEDY & ENTERTAINMENT
  // ==========================================
  {
    id: 'comedy',
    name: 'Comedy',
    subgenreIds: ['comedy-sitcom', 'comedy-romcom', 'comedy-dark', 'comedy-satire', 'comedy-standup', 'comedy-sketch'],
    mediaTypes: ['movies', 'series', 'live', 'audio'],
    description: 'Humorous storytelling designed to amuse, including situational comedy, satirical commentary, and stand-up performances.',
    aliases: ['Comedies', 'Comedie', 'Comedia', 'Komödie', 'Commedia'],
    internationalNames: { fr: 'Comédie', es: 'Comedia', de: 'Komödie', it: 'Commedia' },
    providerMappings: {
      m3u: ['comedy', 'comedies', 'comedia', 'komoedie'],
      xmltv: ['Comedy', 'Sitcom', 'Standup'],
      xtream: ['Comedy', 'Stand-up'],
    },
    relatedGenreIds: ['family', 'romance', 'drama'],
    featured: true,
    sortOrder: 5,
    artwork: {
      landscape: '/art/genres/comedy.svg',
      portrait: '/art/genres/comedy.svg',
      banner: '/art/genres/comedy.svg',
      icon: 'sparkles',
      ambient: { primaryHue: 45, secondaryHue: 30, saturation: 95, lightness: 22 },
    },
  },
  {
    id: 'comedy-sitcom',
    name: 'Sitcom',
    parentId: 'comedy',
    subgenreIds: [],
    mediaTypes: ['series'],
    description: 'Classic episodic situational comedies revolving around recurring characters in domestic or workplace settings.',
    aliases: ['Situation Comedy', 'Comedia de Situacion', 'Sit-Com'],
    internationalNames: { fr: 'Sitcom', es: 'Comedia de situación', de: 'Sitcom' },
    providerMappings: { m3u: ['sitcom', 'sitcoms'], xmltv: ['Sitcom', 'Situation Comedy'] },
    relatedGenreIds: ['comedy'],
    sortOrder: 51,
    artwork: {
      landscape: '/art/genres/comedy.svg',
      portrait: '/art/genres/comedy.svg',
      banner: '/art/genres/comedy.svg',
      icon: 'sparkles',
      ambient: { primaryHue: 40, secondaryHue: 25, saturation: 90, lightness: 24 },
    },
  },
  {
    id: 'comedy-dark',
    name: 'Dark Comedy',
    parentId: 'comedy',
    subgenreIds: [],
    mediaTypes: ['movies', 'series'],
    description: 'Black comedy making light of taboo, cynical, grim, or morbid subjects with biting wit.',
    aliases: ['Black Comedy', 'Dark Humor', 'Comedia Negra', 'Humor Negro'],
    internationalNames: { fr: 'Comédie noire', es: 'Comedia negra', de: 'Schwarze Komödie' },
    providerMappings: { m3u: ['dark comedy', 'black comedy'], xmltv: ['Dark Comedy'] },
    relatedGenreIds: ['comedy', 'crime', 'drama'],
    sortOrder: 52,
    artwork: {
      landscape: '/art/genres/comedy.svg',
      portrait: '/art/genres/comedy.svg',
      banner: '/art/genres/comedy.svg',
      icon: 'sparkles',
      ambient: { primaryHue: 35, secondaryHue: 15, saturation: 75, lightness: 18 },
    },
  },

  // ==========================================
  // 4. CRIME, DETECTIVE & MYSTERY
  // ==========================================
  {
    id: 'crime',
    name: 'Crime',
    subgenreIds: ['crime-detective', 'crime-procedural', 'crime-gangster', 'crime-heist', 'crime-true-crime', 'crime-noir'],
    mediaTypes: ['movies', 'series', 'audio', 'books'],
    description: 'Criminal investigations, underworld syndicates, police operations, forensic mysteries, and lawful justice.',
    aliases: ['Crimen', 'Krimi', 'Policier', 'Delito'],
    internationalNames: { fr: 'Policier / Crime', es: 'Crimen', de: 'Krimi', it: 'Giallo / Crimine' },
    providerMappings: {
      m3u: ['crime', 'krimi', 'policier', 'detective'],
      xmltv: ['Crime', 'Detective/Police', 'Police Drama'],
      xtream: ['Crime', 'Crime Drama'],
    },
    relatedGenreIds: ['mystery', 'thriller', 'drama'],
    featured: true,
    sortOrder: 6,
    artwork: {
      landscape: '/art/genres/crime.svg',
      portrait: '/art/genres/crime.svg',
      banner: '/art/genres/crime.svg',
      icon: 'shield',
      ambient: { primaryHue: 220, secondaryHue: 48, saturation: 80, lightness: 14 },
    },
  },
  {
    id: 'crime-detective',
    name: 'Detective & Whodunit',
    parentId: 'crime',
    subgenreIds: [],
    mediaTypes: ['movies', 'series', 'books'],
    description: 'Private investigators and astute sleuths unravelling intricate clues to solve confounding homicides.',
    aliases: ['Detective', 'Whodunit', 'Sleuth', 'Private Eye', 'Investigador Privado'],
    internationalNames: { fr: 'Détective', es: 'Detective', de: 'Detektiv' },
    providerMappings: { m3u: ['detective', 'whodunit'], xmltv: ['Detective'] },
    relatedGenreIds: ['crime', 'mystery'],
    sortOrder: 61,
    artwork: {
      landscape: '/art/genres/mystery.svg',
      portrait: '/art/genres/mystery.svg',
      banner: '/art/genres/mystery.svg',
      icon: 'search',
      ambient: { primaryHue: 215, secondaryHue: 200, saturation: 85, lightness: 16 },
    },
  },
  {
    id: 'crime-procedural',
    name: 'Police Procedural',
    parentId: 'crime',
    subgenreIds: [],
    mediaTypes: ['series', 'movies'],
    description: 'Detailed depiction of police departments, forensic crime scene labs, and lawful investigative methodologies.',
    aliases: ['Procedural', 'Cop Show', 'Police Drama', 'Law Enforcement', 'Policia'],
    internationalNames: { fr: 'Série policière', es: 'Procedimiento policial', de: 'Polizeiserie' },
    providerMappings: { m3u: ['police', 'procedural', 'cop'], xmltv: ['Police Procedural', 'Law Enforcement'] },
    relatedGenreIds: ['crime', 'drama'],
    sortOrder: 62,
    artwork: {
      landscape: '/art/genres/crime.svg',
      portrait: '/art/genres/crime.svg',
      banner: '/art/genres/crime.svg',
      icon: 'shield',
      ambient: { primaryHue: 225, secondaryHue: 210, saturation: 85, lightness: 15 },
    },
  },
  {
    id: 'crime-true-crime',
    name: 'True Crime',
    parentId: 'crime',
    subgenreIds: [],
    mediaTypes: ['series', 'movies', 'audio', 'books'],
    description: 'Factual examinations of real-world criminal cases, infamous trials, serial killers, and forensic breakthroughs.',
    aliases: ['Real Crime', 'Documentary Crime', 'Crimenes Reales'],
    internationalNames: { fr: 'Faits divers', es: 'Crímenes reales', de: 'Wahre Verbrechen' },
    providerMappings: { m3u: ['true crime'], xmltv: ['True Crime', 'Factual Crime'] },
    relatedGenreIds: ['crime', 'documentary'],
    sortOrder: 63,
    artwork: {
      landscape: '/art/genres/documentary.svg',
      portrait: '/art/genres/documentary.svg',
      banner: '/art/genres/documentary.svg',
      icon: 'documentary',
      ambient: { primaryHue: 210, secondaryHue: 0, saturation: 70, lightness: 14 },
    },
  },

  // ==========================================
  // 5. DOCUMENTARY & FACTUAL
  // ==========================================
  {
    id: 'documentary',
    name: 'Documentary',
    subgenreIds: ['doc-history', 'doc-nature', 'doc-science', 'doc-investigative', 'doc-biography'],
    mediaTypes: ['movies', 'series', 'live'],
    description: 'Non-fictional cinema documenting real events, scientific discoveries, wildlife habitats, and human narratives.',
    aliases: ['Documentaries', 'Factual', 'Documental', 'Dokumentation', 'Docu'],
    internationalNames: { fr: 'Documentaire', es: 'Documental', de: 'Dokumentation', it: 'Documentario' },
    providerMappings: {
      m3u: ['documentary', 'documentaries', 'docu', 'documental', 'doku'],
      xmltv: ['Documentary', 'Factual', 'Educational', 'Special Interest'],
      xtream: ['Documentary', 'Factual'],
    },
    relatedGenreIds: ['historical', 'nature-wildlife', 'biography'],
    featured: true,
    sortOrder: 7,
    artwork: {
      landscape: '/art/genres/documentary.svg',
      portrait: '/art/genres/documentary.svg',
      banner: '/art/genres/documentary.svg',
      icon: 'documentary',
      ambient: { primaryHue: 200, secondaryHue: 215, saturation: 80, lightness: 18 },
    },
  },

  // ==========================================
  // 6. DRAMA
  // ==========================================
  {
    id: 'drama',
    name: 'Drama',
    subgenreIds: ['drama-period', 'drama-medical', 'drama-legal', 'drama-melodrama', 'drama-coming-of-age'],
    mediaTypes: ['movies', 'series', 'live', 'books'],
    description: 'Realistic and emotionally charged narratives driven by complex human conflict, moral choices, and relationships.',
    aliases: ['Dramas', 'Drame', 'Drammatico'],
    internationalNames: { fr: 'Drame', es: 'Drama', de: 'Drama', it: 'Drammatico' },
    providerMappings: {
      m3u: ['drama', 'dramas', 'drame'],
      xmltv: ['Drama', 'Serial', 'Play'],
      xtream: ['Drama'],
    },
    relatedGenreIds: ['romance', 'crime', 'historical'],
    featured: true,
    sortOrder: 8,
    artwork: {
      landscape: '/art/genres/drama.svg',
      portrait: '/art/genres/drama.svg',
      banner: '/art/genres/drama.svg',
      icon: 'film',
      ambient: { primaryHue: 345, secondaryHue: 20, saturation: 80, lightness: 18 },
    },
  },
  {
    id: 'drama-period',
    name: 'Period Drama',
    parentId: 'drama',
    subgenreIds: [],
    mediaTypes: ['movies', 'series'],
    description: 'Elaborate historical costume dramas depicting bygone eras, aristocratic society, and historical family dynasties.',
    aliases: ['Costume Drama', 'Historical Drama', 'Drame d Époque', 'Drama de Epoca'],
    internationalNames: { fr: "Drame d'époque", es: 'Drama de época', de: 'Kostümdrama' },
    providerMappings: { m3u: ['period drama', 'costume drama'], xmltv: ['Period Drama', 'Historical Drama'] },
    relatedGenreIds: ['drama', 'historical'],
    sortOrder: 81,
    artwork: {
      landscape: '/art/genres/historical.svg',
      portrait: '/art/genres/historical.svg',
      banner: '/art/genres/historical.svg',
      icon: 'archive',
      ambient: { primaryHue: 35, secondaryHue: 25, saturation: 70, lightness: 19 },
    },
  },
  {
    id: 'drama-medical',
    name: 'Medical Drama',
    parentId: 'drama',
    subgenreIds: [],
    mediaTypes: ['series'],
    description: 'Urgent hospital emergency rooms, surgical theatre dilemmas, and the personal lives of medical professionals.',
    aliases: ['Hospital Drama', 'Medical Series', 'Serie Medica'],
    internationalNames: { fr: 'Série médicale', es: 'Drama médico', de: 'Arztserie' },
    providerMappings: { m3u: ['medical', 'hospital'], xmltv: ['Medical', 'Hospital Drama'] },
    relatedGenreIds: ['drama'],
    sortOrder: 82,
    artwork: {
      landscape: '/art/genres/drama.svg',
      portrait: '/art/genres/drama.svg',
      banner: '/art/genres/drama.svg',
      icon: 'activity',
      ambient: { primaryHue: 180, secondaryHue: 200, saturation: 75, lightness: 20 },
    },
  },

  // ==========================================
  // 7. FANTASY
  // ==========================================
  {
    id: 'fantasy',
    name: 'Fantasy',
    subgenreIds: ['fantasy-high', 'fantasy-dark', 'fantasy-urban', 'fantasy-mythology'],
    mediaTypes: ['movies', 'series', 'books'],
    description: 'Mythical realms, ancient magic, legendary creatures, swords and sorcery, and extraordinary folklore.',
    aliases: ['Fantasie', 'Fantaisie', 'Fantasia', 'High Fantasy', 'Sword and Sorcery'],
    internationalNames: { fr: 'Fantastique / Fantasy', es: 'Fantasía', de: 'Fantasy', it: 'Fantasy' },
    providerMappings: {
      m3u: ['fantasy', 'fantasia', 'fantastique'],
      xmltv: ['Fantasy', 'Mythology'],
      xtream: ['Fantasy'],
    },
    relatedGenreIds: ['science-fiction', 'adventure', 'horror'],
    featured: true,
    sortOrder: 9,
    artwork: {
      landscape: '/art/genres/fantasy.svg',
      portrait: '/art/genres/fantasy.svg',
      banner: '/art/genres/fantasy.svg',
      icon: 'sparkles',
      ambient: { primaryHue: 275, secondaryHue: 295, saturation: 90, lightness: 22 },
    },
  },

  // ==========================================
  // 8. HORROR
  // ==========================================
  {
    id: 'horror',
    name: 'Horror',
    subgenreIds: ['horror-supernatural', 'horror-psychological', 'horror-slasher', 'horror-folk', 'horror-found-footage', 'horror-creature'],
    mediaTypes: ['movies', 'series', 'books'],
    description: 'Chilling narratives engineered to elicit fear, dread, psychological distress, and macabre fascination.',
    aliases: ['Terror', 'Epouvante', 'Grusel', 'Horreur'],
    internationalNames: { fr: 'Horreur', es: 'Terror', de: 'Horror', it: 'Horror' },
    providerMappings: {
      m3u: ['horror', 'terror', 'horreur'],
      xmltv: ['Horror', 'Supernatural'],
      xtream: ['Horror'],
    },
    relatedGenreIds: ['thriller', 'mystery', 'fantasy'],
    featured: true,
    sortOrder: 10,
    artwork: {
      landscape: '/art/genres/horror.svg',
      portrait: '/art/genres/horror.svg',
      banner: '/art/genres/horror.svg',
      icon: 'moon',
      ambient: { primaryHue: 350, secondaryHue: 0, saturation: 100, lightness: 12 },
    },
  },
  {
    id: 'horror-slasher',
    name: 'Slasher',
    parentId: 'horror',
    subgenreIds: [],
    mediaTypes: ['movies'],
    description: 'Unstoppable masked antagonists stalking and eliminating victims in suspenseful isolation.',
    aliases: ['Slasher Film', 'Slasher Movie'],
    internationalNames: { fr: 'Slasher', es: 'Slasher' },
    providerMappings: { m3u: ['slasher'], xmltv: ['Slasher'] },
    relatedGenreIds: ['horror', 'thriller'],
    sortOrder: 101,
    artwork: {
      landscape: '/art/genres/horror.svg',
      portrait: '/art/genres/horror.svg',
      banner: '/art/genres/horror.svg',
      icon: 'moon',
      ambient: { primaryHue: 355, secondaryHue: 10, saturation: 95, lightness: 14 },
    },
  },
  {
    id: 'horror-psychological',
    name: 'Psychological Horror',
    parentId: 'horror',
    subgenreIds: [],
    mediaTypes: ['movies', 'series', 'books'],
    description: 'Disturbing unravelling of sanity, paranoia, uncanny environments, and psychological torment.',
    aliases: ['Psychological Terror', 'Terror Psicologico'],
    internationalNames: { fr: 'Horreur psychologique', es: 'Terror psicológico' },
    providerMappings: { m3u: ['psychological horror'], xmltv: ['Psychological Horror'] },
    relatedGenreIds: ['horror', 'thriller', 'mystery'],
    sortOrder: 102,
    artwork: {
      landscape: '/art/genres/horror.svg',
      portrait: '/art/genres/horror.svg',
      banner: '/art/genres/horror.svg',
      icon: 'moon',
      ambient: { primaryHue: 340, secondaryHue: 270, saturation: 80, lightness: 13 },
    },
  },

  // ==========================================
  // 9. SCIENCE FICTION
  // ==========================================
  {
    id: 'science-fiction',
    name: 'Science Fiction',
    subgenreIds: ['scifi-space-opera', 'scifi-cyberpunk', 'scifi-dystopian', 'scifi-time-travel', 'scifi-post-apocalyptic', 'scifi-alien'],
    mediaTypes: ['movies', 'series', 'books'],
    description: 'Visionary speculation regarding futuristic science, advanced technology, interstellar space travel, and parallel dimensions.',
    aliases: ['Sci-Fi', 'Scifi', 'Science Fiction', 'SF', 'Ciencia Ficcion', 'SciFi'],
    internationalNames: { fr: 'Science-Fiction', es: 'Ciencia Ficción', de: 'Science-Fiction', it: 'Fantascienza', ja: 'SF' },
    providerMappings: {
      m3u: ['sci-fi', 'scifi', 'science fiction', 'ciencia ficcion', 'sf'],
      xmltv: ['Science Fiction', 'SciFi', 'Sci-Fi'],
      xtream: ['Sci-Fi', 'Science Fiction', 'Sci-Fi & Fantasy'],
    },
    relatedGenreIds: ['fantasy', 'action', 'thriller'],
    featured: true,
    sortOrder: 11,
    artwork: {
      landscape: '/art/genres/science-fiction.svg',
      portrait: '/art/genres/science-fiction.svg',
      banner: '/art/genres/science-fiction.svg',
      icon: 'compass',
      ambient: { primaryHue: 190, secondaryHue: 270, saturation: 95, lightness: 18 },
    },
  },
  {
    id: 'scifi-space-opera',
    name: 'Space Opera',
    parentId: 'science-fiction',
    subgenreIds: [],
    mediaTypes: ['movies', 'series', 'books'],
    description: 'Sweeping interstellar empires, starship armadas, galactic warfare, and mythic space exploration.',
    aliases: ['Galactic Opera', 'Space Adventure', 'Interstellar'],
    internationalNames: { fr: 'Space Opera', es: 'Ópera espacial' },
    providerMappings: { m3u: ['space opera', 'space'], xmltv: ['Space Opera'] },
    relatedGenreIds: ['science-fiction', 'adventure'],
    sortOrder: 111,
    artwork: {
      landscape: '/art/genres/science-fiction.svg',
      portrait: '/art/genres/science-fiction.svg',
      banner: '/art/genres/science-fiction.svg',
      icon: 'compass',
      ambient: { primaryHue: 200, secondaryHue: 250, saturation: 90, lightness: 20 },
    },
  },
  {
    id: 'scifi-cyberpunk',
    name: 'Cyberpunk',
    parentId: 'science-fiction',
    subgenreIds: [],
    mediaTypes: ['movies', 'series', 'books'],
    description: 'High tech and low life: neon metropolis alleys, rogue netrunners, cybernetic enhancements, and megacorporation dominance.',
    aliases: ['Cyber-Punk', 'Cyber'],
    internationalNames: { fr: 'Cyberpunk', es: 'Cyberpunk', de: 'Cyberpunk' },
    providerMappings: { m3u: ['cyberpunk'], xmltv: ['Cyberpunk'] },
    relatedGenreIds: ['science-fiction', 'crime'],
    sortOrder: 112,
    artwork: {
      landscape: '/art/genres/science-fiction.svg',
      portrait: '/art/genres/science-fiction.svg',
      banner: '/art/genres/science-fiction.svg',
      icon: 'compass',
      ambient: { primaryHue: 180, secondaryHue: 320, saturation: 100, lightness: 22 },
    },
  },

  // ==========================================
  // 10. THRILLER & SUSPENSE
  // ==========================================
  {
    id: 'thriller',
    name: 'Thriller',
    subgenreIds: ['thriller-psychological', 'thriller-political', 'thriller-tech', 'thriller-crime'],
    mediaTypes: ['movies', 'series', 'books'],
    description: 'Relentless narrative momentum, high-stakes countdowns, unbearable psychological suspense, and sudden twists.',
    aliases: ['Suspense', 'Thrillers'],
    internationalNames: { fr: 'Thriller', es: 'Suspense', de: 'Thriller', it: 'Thriller' },
    providerMappings: {
      m3u: ['thriller', 'suspense', 'thrillers'],
      xmltv: ['Thriller', 'Suspense'],
      xtream: ['Thriller'],
    },
    relatedGenreIds: ['crime', 'action', 'mystery'],
    featured: true,
    sortOrder: 12,
    artwork: {
      landscape: '/art/genres/thriller.svg',
      portrait: '/art/genres/thriller.svg',
      banner: '/art/genres/thriller.svg',
      icon: 'alertCircle',
      ambient: { primaryHue: 355, secondaryHue: 210, saturation: 85, lightness: 16 },
    },
  },

  // ==========================================
  // 11. WESTERN
  // ==========================================
  {
    id: 'western',
    name: 'Western',
    subgenreIds: ['western-classic', 'western-spaghetti', 'western-revisionist'],
    mediaTypes: ['movies', 'series', 'books'],
    description: 'Frontier life, rugged outlaws, gunslingers, desolate desert landscapes, and the mythic American frontier.',
    aliases: ['Westerns', 'Cowboy', 'Spaghetti Western', 'Far West'],
    internationalNames: { fr: 'Western', es: 'Western / Del Oeste', de: 'Western', it: 'Western' },
    providerMappings: {
      m3u: ['western', 'westerns', 'cowboy'],
      xmltv: ['Western'],
      xtream: ['Western'],
    },
    relatedGenreIds: ['action', 'historical'],
    sortOrder: 13,
    artwork: {
      landscape: '/art/genres/western.svg',
      portrait: '/art/genres/western.svg',
      banner: '/art/genres/western.svg',
      icon: 'compass',
      ambient: { primaryHue: 22, secondaryHue: 35, saturation: 90, lightness: 20 },
    },
  },

  // ==========================================
  // 12. WAR & MILITARY
  // ==========================================
  {
    id: 'war',
    name: 'War & Military',
    subgenreIds: ['war-historical', 'war-anti-war', 'war-submarine'],
    mediaTypes: ['movies', 'series', 'books'],
    description: 'Depiction of armed military combat, frontline soldiers, tactical naval and air warfare, and the human cost of conflict.',
    aliases: ['War', 'Military', 'Guerra', 'Krieg', 'Bélico'],
    internationalNames: { fr: 'Guerre', es: 'Bélico / Guerra', de: 'Kriegsfilm', it: 'Guerra' },
    providerMappings: {
      m3u: ['war', 'military', 'belico', 'guerra'],
      xmltv: ['War', 'Military'],
      xtream: ['War'],
    },
    relatedGenreIds: ['historical', 'action', 'drama'],
    sortOrder: 14,
    artwork: {
      landscape: '/art/genres/war.svg',
      portrait: '/art/genres/war.svg',
      banner: '/art/genres/war.svg',
      icon: 'shield',
      ambient: { primaryHue: 38, secondaryHue: 90, saturation: 60, lightness: 16 },
    },
  },

  // ==========================================
  // 13. ROMANCE
  // ==========================================
  {
    id: 'romance',
    name: 'Romance',
    subgenreIds: ['romance-comedy', 'romance-period', 'romance-contemporary'],
    mediaTypes: ['movies', 'series', 'books'],
    description: 'Passion, intimate relationships, courtship, heartbreak, and emotional devotion between lovers.',
    aliases: ['Romantic', 'Romantico', 'Romantique', 'Love Story'],
    internationalNames: { fr: 'Romance', es: 'Romance', de: 'Liebesfilm', it: 'Romantico' },
    providerMappings: {
      m3u: ['romance', 'romantic'],
      xmltv: ['Romance', 'Romantic Comedy'],
      xtream: ['Romance'],
    },
    relatedGenreIds: ['comedy', 'drama'],
    featured: true,
    sortOrder: 15,
    artwork: {
      landscape: '/art/genres/romance.svg',
      portrait: '/art/genres/romance.svg',
      banner: '/art/genres/romance.svg',
      icon: 'heart',
      ambient: { primaryHue: 340, secondaryHue: 350, saturation: 90, lightness: 22 },
    },
  },

  // ==========================================
  // 14. MUSIC & MUSICAL
  // ==========================================
  {
    id: 'musical',
    name: 'Music & Musical',
    subgenreIds: ['musical-broadway', 'musical-biopic'],
    mediaTypes: ['movies', 'series'],
    description: 'Songs and choreographed dance integrated directly into cinematic narrative, stage adaptations, and musical lives.',
    aliases: ['Musical', 'Musicals', 'Music Cinema', 'Comédie Musicale'],
    internationalNames: { fr: 'Comédie musicale', es: 'Musical', de: 'Musical' },
    providerMappings: {
      m3u: ['musical', 'musicals'],
      xmltv: ['Musical', 'Music/Dance'],
      xtream: ['Musical'],
    },
    relatedGenreIds: ['music', 'romance', 'comedy'],
    sortOrder: 16,
    artwork: {
      landscape: '/art/genres/musical.svg',
      portrait: '/art/genres/musical.svg',
      banner: '/art/genres/musical.svg',
      icon: 'music',
      ambient: { primaryHue: 310, secondaryHue: 45, saturation: 85, lightness: 20 },
    },
  },

  // ==========================================
  // 15. LIVE TELEVISION BROADCASTING GENRES
  // ==========================================
  {
    id: 'live-news',
    name: 'News & Current Affairs',
    subgenreIds: [],
    mediaTypes: ['live'],
    description: '24-hour global news networks, political debates, financial market bulletins, and investigative reporting.',
    aliases: ['News', 'Noticias', 'Nouvelles', 'Nachrichten', 'Current Affairs', 'Weather'],
    internationalNames: { fr: 'Actualités', es: 'Noticias', de: 'Nachrichten', it: 'Notizie' },
    providerMappings: {
      m3u: ['news', 'world news', 'noticias', 'actualites', 'nachrichten'],
      xmltv: ['News', 'Current Affairs', 'Weather', 'Finance'],
    },
    relatedGenreIds: ['live-sports', 'documentary'],
    featured: true,
    sortOrder: 17,
    artwork: {
      landscape: '/art/genres/news.svg',
      portrait: '/art/genres/news.svg',
      banner: '/art/genres/news.svg',
      icon: 'news',
      ambient: { primaryHue: 215, secondaryHue: 355, saturation: 90, lightness: 18 },
    },
  },
  {
    id: 'live-sports',
    name: 'Live Sports',
    subgenreIds: [],
    mediaTypes: ['live'],
    description: 'Live competitive athletic fixtures, football matches, racing grand prix, combat sports, and tournament broadcasts.',
    aliases: ['Sports', 'Sport', 'Deportes', 'Football', 'Soccer', 'Racing'],
    internationalNames: { fr: 'Sport', es: 'Deportes', de: 'Sport', it: 'Sport' },
    providerMappings: {
      m3u: ['sports', 'sport', 'deportes', 'football', 'racing'],
      xmltv: ['Sports', 'Football', 'Motorsport', 'Athletics'],
    },
    relatedGenreIds: ['live-news'],
    featured: true,
    sortOrder: 18,
    artwork: {
      landscape: '/art/genres/sports.svg',
      portrait: '/art/genres/sports.svg',
      banner: '/art/genres/sports.svg',
      icon: 'sports',
      ambient: { primaryHue: 155, secondaryHue: 175, saturation: 85, lightness: 18 },
    },
  },
  {
    id: 'live-lifestyle',
    name: 'Lifestyle & Culinary',
    subgenreIds: [],
    mediaTypes: ['live', 'series'],
    description: 'Culinary mastery, home improvement, gardening, travel exploration, fashion, and everyday wellness.',
    aliases: ['Lifestyle', 'Cooking', 'Food', 'Home & Garden', 'Cuisine', 'Cocina'],
    internationalNames: { fr: 'Art de vivre', es: 'Estilo de vida', de: 'Lifestyle' },
    providerMappings: {
      m3u: ['lifestyle', 'cooking', 'food', 'culinary', 'gardening'],
      xmltv: ['Cooking', 'Lifestyle', 'Home/Garden', 'Travel'],
    },
    relatedGenreIds: ['documentary'],
    sortOrder: 19,
    artwork: {
      landscape: '/art/genres/lifestyle-cooking.svg',
      portrait: '/art/genres/lifestyle-cooking.svg',
      banner: '/art/genres/lifestyle-cooking.svg',
      icon: 'sparkles',
      ambient: { primaryHue: 28, secondaryHue: 40, saturation: 90, lightness: 22 },
    },
  },
  {
    id: 'live-nature',
    name: 'Nature & Wildlife',
    subgenreIds: [],
    mediaTypes: ['live', 'series', 'movies'],
    description: 'Natural history expeditions, oceanic depths, remote wildlife ecosystems, and planetary conservation.',
    aliases: ['Nature', 'Wildlife', 'Fauna', 'Ecology', 'Animals'],
    internationalNames: { fr: 'Nature et animaux', es: 'Naturaleza y fauna', de: 'Natur' },
    providerMappings: {
      m3u: ['nature', 'wildlife', 'animals', 'national geographic'],
      xmltv: ['Nature', 'Wildlife', 'Ecology', 'Animals'],
    },
    relatedGenreIds: ['documentary'],
    sortOrder: 20,
    artwork: {
      landscape: '/art/genres/nature-wildlife.svg',
      portrait: '/art/genres/nature-wildlife.svg',
      banner: '/art/genres/nature-wildlife.svg',
      icon: 'nature',
      ambient: { primaryHue: 110, secondaryHue: 130, saturation: 85, lightness: 18 },
    },
  },

  // ==========================================
  // 16. MUSIC & AUDIO GENRES
  // ==========================================
  {
    id: 'audio-rock',
    name: 'Rock',
    subgenreIds: [],
    mediaTypes: ['audio'],
    description: 'Electric guitars, driving rhythm sections, alternative rock, classic anthems, and indie songwriting.',
    aliases: ['Classic Rock', 'Alternative Rock', 'Indie Rock', 'Hard Rock'],
    internationalNames: { fr: 'Rock', es: 'Rock', de: 'Rock' },
    providerMappings: { m3u: ['rock', 'classic rock', 'hard rock'] },
    relatedGenreIds: ['audio-metal', 'audio-electronic'],
    featured: true,
    sortOrder: 21,
    artwork: {
      landscape: '/art/genres/rock.svg',
      portrait: '/art/genres/rock.svg',
      banner: '/art/genres/rock.svg',
      icon: 'music',
      ambient: { primaryHue: 5, secondaryHue: 25, saturation: 95, lightness: 18 },
    },
  },
  {
    id: 'audio-electronic',
    name: 'Electronic & Dance',
    subgenreIds: [],
    mediaTypes: ['audio'],
    description: 'Synthesizers, hypnotic club beats, house, techno, drum & bass, ambient soundscapes, and synthwave.',
    aliases: ['Electronic', 'Dance', 'EDM', 'Techno', 'House', 'Synthwave'],
    internationalNames: { fr: 'Électronique', es: 'Electrónica', de: 'Elektronische Musik' },
    providerMappings: { m3u: ['electronic', 'dance', 'techno', 'house'] },
    relatedGenreIds: ['audio-rock', 'audio-pop'],
    featured: true,
    sortOrder: 22,
    artwork: {
      landscape: '/art/genres/electronic.svg',
      portrait: '/art/genres/electronic.svg',
      banner: '/art/genres/electronic.svg',
      icon: 'music',
      ambient: { primaryHue: 185, secondaryHue: 270, saturation: 95, lightness: 20 },
    },
  },
  {
    id: 'audio-jazz',
    name: 'Jazz & Blues',
    subgenreIds: [],
    mediaTypes: ['audio'],
    description: 'Virtuosic improvisation, syncopated swing, soulful acoustic bass, expressive brass, and Delta blues.',
    aliases: ['Jazz', 'Blues', 'Swing', 'Bebop', 'Smooth Jazz'],
    internationalNames: { fr: 'Jazz et Blues', es: 'Jazz y Blues', de: 'Jazz' },
    providerMappings: { m3u: ['jazz', 'blues', 'smooth jazz'] },
    relatedGenreIds: ['audio-classical'],
    sortOrder: 23,
    artwork: {
      landscape: '/art/genres/jazz.svg',
      portrait: '/art/genres/jazz.svg',
      banner: '/art/genres/jazz.svg',
      icon: 'music',
      ambient: { primaryHue: 32, secondaryHue: 48, saturation: 75, lightness: 20 },
    },
  },
  {
    id: 'audio-classical',
    name: 'Classical',
    subgenreIds: [],
    mediaTypes: ['audio'],
    description: 'Symphonic orchestral works, chamber ensembles, baroque concertos, solo piano, and operatic masterworks.',
    aliases: ['Symphonic', 'Orchestral', 'Opera', 'Klassik', 'Classique'],
    internationalNames: { fr: 'Classique', es: 'Clásica', de: 'Klassische Musik' },
    providerMappings: { m3u: ['classical', 'classique', 'klassik', 'opera'] },
    relatedGenreIds: ['audio-jazz'],
    sortOrder: 24,
    artwork: {
      landscape: '/art/genres/classical.svg',
      portrait: '/art/genres/classical.svg',
      banner: '/art/genres/classical.svg',
      icon: 'music',
      ambient: { primaryHue: 265, secondaryHue: 210, saturation: 60, lightness: 22 },
    },
  },
  {
    id: 'audio-hiphop',
    name: 'Hip-Hop & Rap',
    subgenreIds: [],
    mediaTypes: ['audio'],
    description: 'Rhythmic vocal delivery, sampling craft, booming 808 percussion, street poetry, and urban anthems.',
    aliases: ['Hip Hop', 'Rap', 'Urban', 'Trap'],
    internationalNames: { fr: 'Hip-Hop', es: 'Hip-hop', de: 'Hip-Hop' },
    providerMappings: { m3u: ['hip-hop', 'hip hop', 'rap', 'urban'] },
    relatedGenreIds: ['audio-electronic'],
    sortOrder: 25,
    artwork: {
      landscape: '/art/genres/hip-hop.svg',
      portrait: '/art/genres/hip-hop.svg',
      banner: '/art/genres/hip-hop.svg',
      icon: 'music',
      ambient: { primaryHue: 40, secondaryHue: 20, saturation: 95, lightness: 20 },
    },
  },
  {
    id: 'audio-podcasts',
    name: 'Podcasts & Spoken Word',
    subgenreIds: [],
    mediaTypes: ['audio'],
    description: 'In-depth conversational audio, investigative serialized journalism, comedic podcasts, and oral history.',
    aliases: ['Podcast', 'Podcasting', 'Talk Radio', 'Audio Shows'],
    internationalNames: { fr: 'Podcasts', es: 'Podcasts', de: 'Podcasts' },
    providerMappings: { m3u: ['podcast', 'podcasts', 'talk radio'] },
    relatedGenreIds: ['documentary', 'crime'],
    featured: true,
    sortOrder: 26,
    artwork: {
      landscape: '/art/genres/podcasts.svg',
      portrait: '/art/genres/podcasts.svg',
      banner: '/art/genres/podcasts.svg',
      icon: 'podcast',
      ambient: { primaryHue: 275, secondaryHue: 290, saturation: 80, lightness: 22 },
    },
  },

  // ==========================================
  // 17. BOOKS & PUBLICATIONS
  // ==========================================
  {
    id: 'books-fiction',
    name: 'Fiction & Literature',
    subgenreIds: [],
    mediaTypes: ['books'],
    description: 'Literary fiction, contemporary novels, historical narratives, classic literature, and captivating prose.',
    aliases: ['Fiction', 'Literature', 'Novels', 'Roman', 'Literatura'],
    internationalNames: { fr: 'Fiction', es: 'Ficción', de: 'Belletristik' },
    providerMappings: { m3u: ['books', 'fiction'] },
    relatedGenreIds: ['drama', 'historical'],
    featured: true,
    sortOrder: 27,
    artwork: {
      landscape: '/art/genres/books-fiction.svg',
      portrait: '/art/genres/books-fiction.svg',
      banner: '/art/genres/books-fiction.svg',
      icon: 'book',
      ambient: { primaryHue: 195, secondaryHue: 215, saturation: 80, lightness: 20 },
    },
  },
  {
    id: 'biography',
    name: 'Biography & Memoir',
    subgenreIds: [],
    mediaTypes: ['books', 'movies', 'series'],
    description: 'Chronicles of extraordinary lives, historic leaders, pioneering artists, personal memoirs, and legacies.',
    aliases: ['Biography', 'Autobiography', 'Memoir', 'Biopic', 'Biografía'],
    internationalNames: { fr: 'Biographie', es: 'Biografía', de: 'Biografie' },
    providerMappings: { m3u: ['biography', 'biopic'], xmltv: ['Biography'] },
    relatedGenreIds: ['documentary', 'historical'],
    sortOrder: 28,
    artwork: {
      landscape: '/art/genres/biography.svg',
      portrait: '/art/genres/biography.svg',
      banner: '/art/genres/biography.svg',
      icon: 'user',
      ambient: { primaryHue: 25, secondaryHue: 40, saturation: 65, lightness: 20 },
    },
  },
]

// Fast lookup index
export const GENRE_BY_ID = new Map<string, GenreDefinition>(
  CANONICAL_GENRES.map((g) => [g.id, g]),
)

export const PARENT_GENRES: GenreDefinition[] = CANONICAL_GENRES.filter((g) => !g.parentId)

export const SUBGENRES: GenreDefinition[] = CANONICAL_GENRES.filter((g) => Boolean(g.parentId))

export const GENRES_BY_MEDIA_TYPE: Record<MediaType, GenreDefinition[]> = {
  movies: CANONICAL_GENRES.filter((g) => g.mediaTypes.includes('movies')),
  series: CANONICAL_GENRES.filter((g) => g.mediaTypes.includes('series')),
  live: CANONICAL_GENRES.filter((g) => g.mediaTypes.includes('live')),
  audio: CANONICAL_GENRES.filter((g) => g.mediaTypes.includes('audio')),
  books: CANONICAL_GENRES.filter((g) => g.mediaTypes.includes('books')),
}

export function getGenreById(id: string): GenreDefinition | undefined {
  if (!id) return undefined
  const clean = id.toLowerCase().trim()
  return GENRE_BY_ID.get(clean)
}

export function getSubgenresForParent(parentId: string): GenreDefinition[] {
  return SUBGENRES.filter((g) => g.parentId === parentId)
}

export function getParentForSubgenre(subgenreId: string): GenreDefinition | undefined {
  const sub = getGenreById(subgenreId)
  return sub?.parentId ? getGenreById(sub?.parentId) : undefined
}

export function getRelatedGenres(genreId: string): GenreDefinition[] {
  const g = getGenreById(genreId)
  if (!g) return []
  return g.relatedGenreIds
    .map((id) => getGenreById(id))
    .filter((rel): rel is GenreDefinition => rel !== undefined)
}
