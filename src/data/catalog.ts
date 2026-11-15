// Demonstration and verified open catalogue.
import type { Episode, Movie, Series, Title } from './types'
import { OPEN_MOVIES, OPEN_SERIES } from './openCatalogue'

const art = (name: string) => `/art/${name}.jpg`
const SUBS = ['English', 'English (SDH)', 'French', 'Spanish']

export const curatedMovies: Movie[] = [
  {
    kind: 'movie', id: 'harbour-lights', title: 'Harbour Lights', year: 2024, runtime: 131,
    genres: ['Thriller', 'Crime'], certificate: '18', focus: 50, added: '2026-10-18',
    tagline: 'Every light in the harbour belongs to somebody.',
    synopsis: 'A disgraced customs officer is pulled back to the docks he once policed when a container arrives carrying a name he buried twenty years ago. Over one rain-soaked night he has to decide who in the city he still trusts.',
    art: art('harbour-lights'), audio: ['English 5.1', 'English Audio Description'], subtitles: SUBS,
  },
  {
    kind: 'movie', id: 'northern-trace', title: 'Northern Trace', year: 2024, runtime: 114,
    genres: ['Thriller', 'Mystery'], certificate: '15', focus: 50, added: '2026-10-22',
    tagline: 'Some tracks are never meant to be followed.',
    synopsis: 'A wildlife warden patrolling a remote Scandinavian highway uncovers an abandoned convoy carrying encrypted government telemetry deep into the frozen wilderness.',
    art: art('northern-trace'), audio: ['English 5.1', 'Swedish'], subtitles: SUBS,
  },
  {
    kind: 'movie', id: 'the-outpost', title: 'The Outpost', year: 2024, runtime: 122,
    genres: ['Action', 'Thriller'], certificate: '15', focus: 50, added: '2026-10-23',
    tagline: 'High above the storm, vigilance is the only defense.',
    synopsis: 'A remote mountain observatory team detects an unauthorized signal crossing international borders just as an unseasonal blizzard cuts all communication lines.',
    art: art('the-outpost'), audio: ['English 5.1', 'English Atmos'], subtitles: SUBS,
  },
  {
    kind: 'movie', id: 'neon-district', title: 'Neon District', year: 2024, runtime: 118,
    genres: ['Science fiction', 'Action'], certificate: '15', focus: 50, added: '2026-10-24',
    tagline: 'Under the neon canopy, memory is the most dangerous contraband.',
    synopsis: 'In a rain-drenched megacity running on biometric currency, a freelance memory courier races against the dawn to deliver an uncorrupted childhood recording.',
    art: art('neon-district'), audio: ['English Atmos', 'Japanese'], subtitles: SUBS,
  },
  {
    kind: 'movie', id: 'silent-tide', title: 'Silent Tide', year: 2024, runtime: 108,
    genres: ['Drama', 'Mystery'], certificate: '12A', focus: 50, added: '2026-10-25',
    tagline: 'The ocean keeps whatever you leave behind.',
    synopsis: 'A retired maritime investigator returns to his coastal hometown to settle his brother\'s estate, only to find decades of unexplained coastal disappearances.',
    art: art('silent-tide'), audio: ['English 5.1'], subtitles: SUBS,
  },
  {
    kind: 'movie', id: 'the-archive', title: 'The Archive', year: 2023, runtime: 134,
    genres: ['Mystery', 'Drama'], certificate: 'PG', focus: 50, added: '2026-10-26',
    tagline: 'Every classified history has a keeper.',
    synopsis: 'An archivist working within a subterranean historical repository uncovers a cataloguing system that appears to predict political crises before they occur.',
    art: art('the-archive'), audio: ['English 5.1', 'French'], subtitles: SUBS,
  },
  {
    kind: 'movie', id: 'valley-of-ashes', title: 'Valley of Ashes', year: 2024, runtime: 128,
    genres: ['Science fiction', 'Thriller'], certificate: '15', focus: 50, added: '2026-10-27',
    tagline: 'Listening to the silence between the stars.',
    synopsis: 'Stationed in a high-desert radio observatory crater, a radio astronomer captures an anomalous pulse pattern repeating on a cadence identical to ancient earth broadcasts.',
    art: art('valley-of-ashes'), audio: ['English Atmos'], subtitles: SUBS,
  },
  {
    kind: 'movie', id: 'redline', title: 'Redline', year: 2024, runtime: 110,
    genres: ['Action', 'Thriller'], certificate: '15', focus: 50, added: '2026-10-28',
    tagline: 'Velocity is the only way out.',
    synopsis: 'An underground test driver is coerced into one final cross-border pursuit across illuminated mountain passes in an experimental high-performance machine.',
    art: art('redline'), audio: ['English 5.1', 'English Atmos'], subtitles: SUBS,
  },
  {
    kind: 'movie', id: 'salt-meridian', title: 'The Salt Meridian', year: 2025, runtime: 148,
    genres: ['Science fiction', 'Adventure'], certificate: '12A', focus: 55, added: '2026-10-12',
    tagline: 'Four hundred kilometres of nothing. One way back.',
    synopsis: 'When their survey ship fails above an uncharted world, three geologists cross a salt plain the size of a continent to reach the only signal on the planet. The further they walk, the less it sounds like a beacon.',
    art: art('salt-meridian'), audio: ['English 5.1', 'French'], subtitles: SUBS,
  },
  {
    kind: 'movie', id: 'glasshouse', title: 'Glasshouse', year: 2023, runtime: 104,
    genres: ['Thriller', 'Mystery'], certificate: '15', focus: 55, added: '2026-09-28',
    tagline: 'Nothing is hidden. That is the problem.',
    synopsis: 'An architect house-sits the glass home she designed for a reclusive client, and starts finding rooms that were never on her plans.',
    art: art('glasshouse'), audio: ['English 5.1'], subtitles: SUBS,
  },
  {
    kind: 'movie', id: 'northbound', title: 'Northbound', year: 2022, runtime: 117,
    genres: ['Drama'], certificate: '12A', focus: 48, added: '2026-09-02',
    tagline: 'Some roads only go one way.',
    synopsis: 'A father and his estranged teenage son drive a failing estate car to the far north to scatter his mother\'s ashes, with one map, one cassette and a lot left unsaid.',
    art: art('northbound'), audio: ['English stereo'], subtitles: SUBS,
  },
  {
    kind: 'movie', id: 'ash-and-ivory', title: 'Ash & Ivory', year: 2024, runtime: 139,
    genres: ['Drama', 'Romance'], certificate: '12A', focus: 40, added: '2026-10-05',
    tagline: 'A season of silk. A lifetime of consequence.',
    synopsis: 'In 1851, a pianist\'s daughter enters society on borrowed money and a borrowed name, and falls for the one man who knows both are false.',
    art: art('ash-and-ivory'), audio: ['English 5.1', 'English Audio Description'], subtitles: SUBS,
  },
  {
    kind: 'movie', id: 'low-orbit', title: 'Low Orbit', year: 2025, runtime: 112,
    genres: ['Science fiction', 'Thriller'], certificate: '12A', focus: 62, added: '2026-10-20',
    tagline: 'Ninety minutes per orbit. Eighty minutes of air.',
    synopsis: 'A maintenance engineer is the last person aboard a crippled research station, with one working suit and a rescue window that closes before the next sunrise.',
    art: art('low-orbit'), audio: ['English Atmos', 'German'], subtitles: SUBS,
  },
  {
    kind: 'movie', id: 'cartographer', title: 'The Cartographer\'s Daughter', year: 2023, runtime: 126,
    genres: ['Fantasy', 'Adventure'], certificate: 'PG', focus: 42, added: '2026-08-21',
    tagline: 'The map was never finished. Neither is she.',
    synopsis: 'Left an unfinished map by her late father, a young mapmaker follows its blank edges into a valley that rearranges itself every night.',
    art: art('cartographer'), audio: ['English 5.1', 'Spanish'], subtitles: SUBS,
  },
  {
    kind: 'movie', id: 'velvet-hour', title: 'Velvet Hour', year: 2021, runtime: 109,
    genres: ['Romance', 'Music'], certificate: '12A', focus: 50, added: '2026-07-30',
    tagline: 'Play it once. Play it like you mean it.',
    synopsis: 'A session saxophonist and a club owner\'s niece trade songs and secrets across one summer in a basement jazz club that is about to be sold.',
    art: art('velvet-hour'), audio: ['English 5.1'], subtitles: SUBS,
  },
  {
    kind: 'movie', id: 'undertow', title: 'Undertow', year: 2024, runtime: 118,
    genres: ['Action', 'Crime'], certificate: '15', focus: 35, added: '2026-10-09',
    tagline: 'The job is easy. The sea is not.',
    synopsis: 'A retired smuggler agrees to one last run across the strait, and finds the crew she trained has a plan she was never meant to survive.',
    art: art('undertow'), audio: ['English Atmos', 'French'], subtitles: SUBS,
  },
  {
    kind: 'movie', id: 'paper-kingdoms', title: 'Paper Kingdoms', year: 2025, runtime: 94,
    genres: ['Animation', 'Family'], certificate: 'U', focus: 55, added: '2026-10-01',
    tagline: 'Fold the world you want.',
    synopsis: 'An origami fox sets out across a kingdom of folded paper to stop the great unfolding, with a crumpled crane and a very anxious envelope for company.',
    art: art('paper-kingdoms'), audio: ['English 5.1', 'Welsh', 'Spanish'], subtitles: SUBS,
  },
  {
    kind: 'movie', id: 'signal-fire', title: 'Signal Fire', year: 2023, runtime: 98,
    genres: ['Horror'], certificate: '15', focus: 38, added: '2026-09-15',
    tagline: 'Keep the lamp burning. Whatever you see.',
    synopsis: 'Two keepers take over a remote lighthouse after the previous crew vanish, and learn why the logbook insists the light must never go out.',
    art: art('signal-fire'), audio: ['English 5.1'], subtitles: SUBS,
  },
  {
    kind: 'movie', id: 'long-quiet', title: 'The Long Quiet', year: 2022, runtime: 141,
    genres: ['War', 'Drama'], certificate: '15', focus: 55, added: '2026-06-11',
    tagline: 'The guns stopped. The walk home did not.',
    synopsis: 'In the days after the armistice, a stretcher-bearer crosses a ruined countryside on foot to return a letter he promised to deliver by hand.',
    art: art('long-quiet'), audio: ['English 5.1', 'English Audio Description'], subtitles: SUBS,
  },
  {
    kind: 'movie', id: 'copper-saints', title: 'Copper Saints', year: 2024, runtime: 122,
    genres: ['Western', 'Action'], certificate: '15', focus: 50, added: '2026-08-04',
    tagline: 'The town burned. The debt did not.',
    synopsis: 'A bounty rider returns to the copper town that hanged her brother, the same week the mine company comes to collect on everyone else.',
    art: art('copper-saints'), audio: ['English 5.1'], subtitles: SUBS,
  },
  {
    kind: 'movie', id: 'midnight-arcade', title: 'Midnight Arcade', year: 2021, runtime: 101,
    genres: ['Comedy', 'Adventure'], certificate: '12A', focus: 45, added: '2026-07-14',
    tagline: 'One more credit. One more chance.',
    synopsis: 'Four friends get locked in their town\'s arcade on its final night, and discover the high-score table has started keeping score of them.',
    art: art('midnight-arcade'), audio: ['English stereo'], subtitles: SUBS,
  },
]

type EpisodeSeed = [title: string, synopsis: string, runtime: number]

function buildSeasons(seriesId: string, stills: string[], seasons: EpisodeSeed[][]): Episode[][] {
  const focuses = [50, 30, 70]
  return seasons.map((eps, s) =>
    eps.map(([title, synopsis, runtime], e) => {
      const i = s * 7 + e
      return {
        id: `s${s + 1}e${e + 1}`, seriesId, season: s + 1, number: e + 1, title, synopsis, runtime,
        still: stills[i % stills.length] ?? stills[0] ?? '', stillFocus: focuses[i % focuses.length] ?? 50,
      }
    }),
  )
}

const stills = (id: string) => [art(id), art(`${id}-2`), art(`${id}-3`)]

export const curatedSeries: Series[] = [
  {
    kind: 'series', id: 'ninth-ward', title: 'The Ninth Ward', years: '2023 to present',
    genres: ['Crime', 'Drama'], certificate: '15', focus: 50, added: '2026-10-16',
    tagline: 'Every case leads back under the tracks.',
    synopsis: 'Detective Ines Calloway works the precinct nobody asks for, where the elevated line runs past every window and every crime seems to trace back to the same three blocks.',
    art: art('ninth-ward'),
    seasons: buildSeasons('ninth-ward', stills('ninth-ward'), [
      [
        ['Under the Line', 'A body under the elevated tracks pulls Calloway into a precinct she was meant to pass through.', 52],
        ['Night Fares', 'A cab dispatcher becomes the only witness willing to talk, for a price.', 49],
        ['Sodium', 'The streetlights go out across the ward, and so does the case file.', 51],
        ['The Quiet Room', 'An interrogation runs through the night while the clock on a deal runs out.', 54],
        ['Dawn Shift', 'Calloway follows a lead to the river and finds someone got there first.', 50],
        ['Terminus', 'The first season closes where the line ends, with a name nobody expected.', 58],
      ],
      [
        ['Return Fare', 'Six months on, a familiar face asks for protection Calloway cannot offer.', 50],
        ['Signal Failure', 'A blackout on the line hides a robbery and exposes an old alliance.', 48],
        ['Overtime', 'Internal affairs takes an interest in the precinct\'s most decorated officer.', 52],
        ['Riverside', 'A crime scene at dawn connects two cases separated by a decade.', 53],
        ['Platform Nine', 'Calloway sets a trap on the night train and becomes the bait.', 51],
        ['Last Stop', 'Loyalties split as the ward\'s oldest secret finally surfaces.', 61],
      ],
      [
        ['New Timetable', 'A new captain arrives with a reform plan and an agenda of her own.', 52],
        ['Crosswalk', 'A hit-and-run outside the precinct turns out to be anything but random.', 49],
        ['Third Rail', 'Calloway goes off the books to protect a witness from her own department.', 54],
        ['Viaduct', 'The investigation moves above ground, and the whole ward is watching.', 50],
        ['Lost Property', 'A box of unclaimed evidence reopens the case that made Calloway\'s name.', 55],
        ['End of the Line', 'The series reaches the terminus it has been heading for all along.', 63],
      ],
    ]),
  },
  {
    kind: 'series', id: 'fathom', title: 'Fathom', years: '2024 to present',
    genres: ['Science fiction', 'Drama'], certificate: '12A', focus: 50, added: '2026-10-07',
    tagline: 'Four kilometres down, nobody hears the surface.',
    synopsis: 'The eleven-person crew of a deep-sea research habitat lose contact with the surface the same day their sonar picks up something moving in the trench below.',
    art: art('fathom'),
    seasons: buildSeasons('fathom', stills('fathom'), [
      [
        ['Pressure', 'A routine supply drop never arrives, and the habitat goes quiet.', 47],
        ['Bioluminescence', 'A dive into the trench returns with footage nobody can explain.', 45],
        ['Ballast', 'Rationing begins, and so does a fight over who decides.', 48],
        ['Echo', 'The sonar pings back a shape that matches the habitat itself.', 46],
        ['Thermocline', 'A crew member goes missing between two locked doors.', 49],
        ['Ascent', 'The crew attempt the climb to the surface, and not everyone agrees to go.', 55],
      ],
      [
        ['Surface Tension', 'The survivors are debriefed by people who already know too much.', 48],
        ['Return Dive', 'A second expedition is assembled to go back down.', 47],
        ['Abyssal', 'The trench is deeper than the charts, and still getting deeper.', 50],
        ['Cold Seep', 'A message from the first crew is found where it should not be.', 46],
        ['Hadal', 'Inside the trench, the habitat\'s systems start answering to someone else.', 49],
        ['Fathomless', 'The second season ends further down than anyone has gone before.', 57],
      ],
    ]),
  },
  {
    kind: 'series', id: 'kingsmoor', title: 'Kingsmoor', years: '2022 to 2024',
    genres: ['Mystery', 'Drama'], certificate: '12A', focus: 52, added: '2026-09-19',
    tagline: 'The moor keeps what it takes.',
    synopsis: 'In 1887, a young archivist is hired to catalogue the papers of a dying estate on the moor, and finds the family\'s records end abruptly on the same night every generation.',
    art: art('kingsmoor'),
    seasons: buildSeasons('kingsmoor', stills('kingsmoor'), [
      [
        ['The Archivist', 'Eleanor Vale arrives at Kingsmoor with a trunk, a contract and no idea why she was chosen.', 58],
        ['Correspondence', 'A letter in the library is addressed to Eleanor, dated forty years ago.', 56],
        ['The Lantern Path', 'A light on the moor leads Eleanor to the churchyard after midnight.', 57],
        ['Inheritance', 'The family gathers for a reading of a will that has not yet been written.', 59],
        ['Midwinter', 'The night every record stops arrives, and Eleanor is still in the house.', 64],
      ],
      [
        ['A New Hand', 'Months later, someone else is cataloguing Eleanor\'s own papers.', 57],
        ['Below Stairs', 'The servants\' corridor holds a door nobody admits to opening.', 55],
        ['Parish Records', 'The village church keeps a second register, written in Eleanor\'s hand.', 58],
        ['The Carriage', 'A carriage arrives at Kingsmoor with no driver and one passenger.', 56],
        ['Last Entry', 'The final record is written, and the house finally lets someone leave.', 66],
      ],
    ]),
  },
  {
    kind: 'series', id: 'static', title: 'Static', years: '2025',
    genres: ['Thriller', 'Drama'], certificate: '15', focus: 50, added: '2026-10-14',
    tagline: 'The signal was never the problem.',
    synopsis: 'A network engineer at a national broadcaster discovers a pattern hidden in the interference on every channel, and a newsroom that would rather she had not.',
    art: art('static'),
    seasons: buildSeasons('static', stills('static'), [
      [
        ['Noise Floor', 'Mara Quist notices the same eight seconds of interference repeating across every feed.', 48],
        ['Carrier', 'An antenna on a city rooftop is broadcasting on a frequency nobody owns.', 46],
        ['Dead Air', 'The newsroom kills Mara\'s story an hour before it goes to air.', 50],
        ['Handshake', 'Someone on the inside makes contact, through the interference itself.', 47],
        ['Uplink', 'Mara takes the evidence to the one place it cannot be switched off.', 49],
        ['Clear Signal', 'The pattern is decoded live, in front of the whole country.', 56],
      ],
    ]),
  },
  {
    kind: 'series', id: 'wildfire-season', title: 'Wildfire Season', years: '2024 to present',
    genres: ['Drama', 'Action'], certificate: '12A', focus: 50, added: '2026-08-29',
    tagline: 'One ridge. One crew. One summer.',
    synopsis: 'A volunteer fire crew in a dry mountain valley face the worst fire season on record while the town they protect argues over whether to rebuild.',
    art: art('wildfire-season'),
    seasons: buildSeasons('wildfire-season', stills('wildfire-season'), [
      [
        ['Red Flag', 'The first lightning strike of the summer catches the crew short-handed.', 49],
        ['Firebreak', 'A new recruit freezes on the line, and the captain covers for him.', 47],
        ['Water Drop', 'The only helicopter in the valley is needed in two places at once.', 50],
        ['Back Burn', 'The crew make a call that saves the town and costs a ranch.', 48],
        ['Containment', 'The fire turns, and the evacuation route closes behind it.', 55],
      ],
      [
        ['Ashfall', 'The valley counts what it lost, and who is to blame.', 48],
        ['Engine Bay', 'Funding cuts leave the station with one engine and no backup.', 46],
        ['Dry Lightning', 'A storm with no rain sets six fires before midnight.', 50],
        ['Ridgeline', 'Two crews are cut off on opposite sides of the same ridge.', 51],
        ['Monsoon', 'The rain comes, but not before the season\'s final test.', 56],
      ],
    ]),
  },
  {
    kind: 'series', id: 'understudies', title: 'The Understudies', years: '2025 to present',
    genres: ['Comedy'], certificate: '12A', focus: 50, added: '2026-09-24',
    tagline: 'Ready to go on. Never asked.',
    synopsis: 'The understudies of a fading West End musical wait in the wings for a lead to fall ill, and occasionally consider helping fate along.',
    art: art('understudies'),
    seasons: buildSeasons('understudies', stills('understudies'), [
      [
        ['Half Hour', 'Opening week, and the understudies learn the leads have never missed a show.', 27],
        ['The Ghost Light', 'A late-night rehearsal on the empty stage goes very wrong, very quietly.', 25],
        ['Notes', 'The director gives notes to the understudies by mistake, and they take them.', 26],
        ['Matinee', 'A lead loses their voice, and four understudies claim the same role.', 28],
        ['Press Night', 'A critic is in, and so, briefly, is the wrong understudy.', 27],
        ['Closing Notice', 'The show is closing, and the understudies finally get the stage.', 31],
      ],
    ]),
  },
]

export const movies: Movie[] = [...curatedMovies, ...OPEN_MOVIES]
export const series: Series[] = [...curatedSeries, ...OPEN_SERIES]
export const titles: Title[] = [...movies, ...series]

export const movieById = (id: string) => movies.find((m) => m.id === id)
export const seriesById = (id: string) => series.find((s) => s.id === id)

export function findEpisode(seriesId: string, episodeId: string) {
  const s = seriesById(seriesId)
  const ep = s?.seasons.flat().find((e) => e.id === episodeId)
  return s && ep ? { series: s, episode: ep } : undefined
}

export function nextEpisode(s: Series, ep: Episode): Episode | undefined {
  const all = s.seasons.flat()
  return all[all.findIndex((e) => e.id === ep.id) + 1]
}

export const genresOf = (list: Title[]) => [...new Set(list.flatMap((t) => t.genres))].sort()

export const featured: Title[] = [movieById('harbour-lights'), seriesById('ninth-ward'), movieById('salt-meridian')].filter(
  (t): t is Title => t !== undefined,
)
