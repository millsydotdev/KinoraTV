// Demonstration channels and guide. Channel names, programmes and schedules are fictional;
// no stream URLs exist, so nothing here can play.
import type { Channel, Programme } from './types'

const art = (name: string) => `/art/${name}.jpg`

export const CHANNEL_GROUPS = ['Entertainment', 'News', 'Sports', 'Documentary', 'Movies', 'Kids', 'Music', 'Lifestyle'] as const

const demoLogo = (bg: string, fg: string, glyph: string, sub?: string) =>
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="${encodeURIComponent(bg)}"/><text x="50" y="${sub ? '52' : '62'}" font-family="system-ui,-apple-system,sans-serif" font-weight="800" font-size="${sub ? '28' : '38'}" fill="${encodeURIComponent(fg)}" text-anchor="middle">${glyph}</text>${sub ? `<text x="50" y="78" font-family="system-ui,-apple-system,sans-serif" font-weight="700" font-size="16" fill="${encodeURIComponent(fg)}" opacity="0.85" text-anchor="middle">${sub}</text>` : ''}</svg>`

const ch = (number: number, id: string, name: string, group: string, text: string, tone: string, hd = true, subText?: string): Channel => ({
  id, number, name, group, categories: [group], logoUrl: demoLogo(tone, '#ffffff', text, subText), mark: { text, tone }, streamUrl: null, hd, sourceId: null, tvgId: null,
})

export const channels: Channel[] = [
  ch(1, 'northlight-one', 'Northlight One', 'Entertainment', 'N1', '#2f4a6b', true, 'ONE'),
  ch(2, 'northlight-two', 'Northlight Two', 'Entertainment', 'N2', '#3a3f6e', true, 'TWO'),
  ch(3, 'meridian-news', 'Meridian News', 'News', 'MN', '#7a2e2e', true, 'NEWS'),
  ch(4, 'pitchside', 'Pitchside', 'Sports', 'PS', '#1f5a43', true, 'LIVE'),
  ch(5, 'pitchside-extra', 'Pitchside Extra', 'Sports', 'PS+', '#2b5d3a', true, 'EXTRA'),
  ch(6, 'atlas', 'Atlas', 'Documentary', 'AT', '#6b5326', true, 'DOC'),
  ch(7, 'habitat', 'Habitat', 'Documentary', 'HB', '#3f5f2a', true, 'EARTH'),
  ch(8, 'reel-classics', 'Reel Classics', 'Movies', 'RC', '#5b2a44', true, 'CINEMA'),
  ch(9, 'matinee', 'Matinee', 'Movies', 'MT', '#6a3a22', true, 'FILM'),
  ch(10, 'tidewater', 'Tidewater', 'Entertainment', 'TW', '#22566a', false, 'TV'),
  ch(11, 'pocket', 'Pocket', 'Kids', 'PK', '#6a5a1e', true, 'KIDS'),
  ch(12, 'encore', 'Encore', 'Music', 'EN', '#4e2f6a', true, 'MUSIC'),
  ch(13, 'civic', 'Civic', 'News', 'CV', '#3d4650', false, 'CIVIC'),
  ch(14, 'hearth', 'Hearth', 'Lifestyle', 'HR', '#6e3b2c', true, 'HOME'),
]

type Slot = { title: string; desc: string; category: string; mins: number; art: string; episode?: boolean }

const pools: Record<string, Slot[]> = {
  'northlight-one': [
    { title: 'The Long Table', desc: 'Four strangers, one dinner, and a secret recipe each of them is hiding.', category: 'Entertainment', mins: 60, art: art('live-cooking'), episode: true },
    { title: 'The Ninth Ward', desc: 'Calloway follows a lead to the river and finds someone got there first.', category: 'Drama', mins: 60, art: art('ninth-ward-3'), episode: true },
    { title: 'Northlight Evening News', desc: 'The day\'s main stories from home and abroad.', category: 'News', mins: 30, art: art('live-news') },
    { title: 'Brightside', desc: 'Light-hearted magazine show with guests, music and viewer stories.', category: 'Entertainment', mins: 60, art: art('live-quiz') },
    { title: 'Kingsmoor', desc: 'A letter in the library is addressed to Eleanor, dated forty years ago.', category: 'Drama', mins: 60, art: art('kingsmoor-2'), episode: true },
    { title: 'Final Answer', desc: 'Three contestants, nine questions and a jackpot that rolls over every week.', category: 'Game show', mins: 30, art: art('live-quiz') },
  ],
  'northlight-two': [
    { title: 'The Understudies', desc: 'A late-night rehearsal on the empty stage goes very wrong, very quietly.', category: 'Comedy', mins: 30, art: art('understudies-2'), episode: true },
    { title: 'Station Life', desc: 'Behind the scenes at a mountain fire station through a long summer.', category: 'Documentary', mins: 60, art: art('wildfire-season-3'), episode: true },
    { title: 'Panel Beaters', desc: 'Topical comedy panel show taking apart the week\'s headlines.', category: 'Comedy', mins: 45, art: art('live-quiz') },
    { title: 'Static', desc: 'An antenna on a city rooftop is broadcasting on a frequency nobody owns.', category: 'Drama', mins: 60, art: art('static-2'), episode: true },
    { title: 'Late Supper', desc: 'Relaxed late-night cooking with whatever is left in the fridge.', category: 'Lifestyle', mins: 30, art: art('live-cooking') },
  ],
  'meridian-news': [
    { title: 'Meridian Tonight', desc: 'Live coverage and analysis of the day\'s developing stories.', category: 'News', mins: 60, art: art('live-news') },
    { title: 'World Desk', desc: 'International news with correspondents across five continents.', category: 'News', mins: 30, art: art('live-news') },
    { title: 'The Briefing', desc: 'Headlines, business, weather and sport on the hour.', category: 'News', mins: 30, art: art('static-3') },
  ],
  pitchside: [
    { title: 'Live: Harbour City v Kingsmoor Rovers', desc: 'Floodlit league fixture with build-up and full-time analysis.', category: 'Football', mins: 120, art: art('live-football') },
    { title: 'Pitchside Tonight', desc: 'Goals, reaction and debate from every match of the round.', category: 'Football', mins: 60, art: art('live-football') },
    { title: 'Matchday Classics', desc: 'Restored broadcast of a celebrated cup final.', category: 'Football', mins: 90, art: art('live-football') },
  ],
  'pitchside-extra': [
    { title: 'Live: Valley Cup Semi-final', desc: 'Second leg from the valley, with extra time if needed.', category: 'Football', mins: 120, art: art('live-football') },
    { title: 'Training Ground', desc: 'Coaches break down the tactics behind the weekend\'s results.', category: 'Sport', mins: 30, art: art('live-football') },
    { title: 'Extra Time', desc: 'Late-night phone-in on the week in football.', category: 'Sport', mins: 60, art: art('live-football') },
  ],
  atlas: [
    { title: 'Deep Water', desc: 'Following the migration routes of humpback whales across an ocean.', category: 'Documentary', mins: 60, art: art('live-ocean') },
    { title: 'Built to Last', desc: 'The engineering behind the world\'s oldest working bridges.', category: 'Documentary', mins: 60, art: art('cartographer') },
    { title: 'Orbit', desc: 'A year aboard a research station, told by the crew who lived it.', category: 'Science', mins: 60, art: art('low-orbit') },
    { title: 'Salt Roads', desc: 'Caravans that still cross the world\'s largest salt flats.', category: 'Documentary', mins: 45, art: art('salt-meridian') },
  ],
  habitat: [
    { title: 'Pride', desc: 'A lioness raises three cubs through the hardest dry season in a decade.', category: 'Nature', mins: 60, art: art('live-wildlife') },
    { title: 'The Blue Hour', desc: 'What happens in the ocean in the minutes after sunset.', category: 'Nature', mins: 60, art: art('live-ocean') },
    { title: 'Burn Scars', desc: 'How forests come back after wildfire.', category: 'Nature', mins: 45, art: art('wildfire-season-2') },
  ],
  'reel-classics': [
    { title: 'Velvet Hour', desc: 'A session saxophonist and a club owner\'s niece trade songs and secrets across one summer.', category: 'Film', mins: 120, art: art('velvet-hour') },
    { title: 'The Long Quiet', desc: 'After the armistice, a stretcher-bearer crosses a ruined countryside to deliver a letter.', category: 'Film', mins: 150, art: art('long-quiet') },
    { title: 'Copper Saints', desc: 'A bounty rider returns to the copper town that hanged her brother.', category: 'Film', mins: 135, art: art('copper-saints') },
  ],
  matinee: [
    { title: 'Midnight Arcade', desc: 'Four friends get locked in their town\'s arcade on its final night.', category: 'Film', mins: 105, art: art('midnight-arcade') },
    { title: 'Northbound', desc: 'A father and son drive to the far north with one map and one cassette.', category: 'Film', mins: 120, art: art('northbound') },
    { title: 'Signal Fire', desc: 'Two keepers take over a remote lighthouse after the previous crew vanish.', category: 'Film', mins: 105, art: art('signal-fire') },
  ],
  tidewater: [
    { title: 'Tidewater Tonight', desc: 'Regional news, weather and the stories from along the coast.', category: 'News', mins: 30, art: art('live-news') },
    { title: 'Harbour Market', desc: 'Traders, fishers and cooks at the oldest market on the coast.', category: 'Lifestyle', mins: 30, art: art('live-cooking') },
    { title: 'Coastline', desc: 'Walking the coast path one headland at a time.', category: 'Documentary', mins: 60, art: art('live-ocean') },
  ],
  pocket: [
    { title: 'Teacup Harbour', desc: 'Pip and Pom sail their teacup boat to the jelly islands.', category: 'Kids', mins: 15, art: art('live-kids') },
    { title: 'Paper Pals', desc: 'Folding adventures with a crane, a fox and a nervous envelope.', category: 'Kids', mins: 15, art: art('paper-kingdoms') },
    { title: 'Big Questions', desc: 'Why is the sea salty? A curious science show for young viewers.', category: 'Kids', mins: 30, art: art('live-ocean') },
  ],
  encore: [
    { title: 'Encore Live', desc: 'Full festival headline sets, broadcast in concert sound.', category: 'Music', mins: 90, art: art('live-concert') },
    { title: 'Basement Sessions', desc: 'Small rooms, big sound: live sets from jazz clubs.', category: 'Music', mins: 60, art: art('velvet-hour') },
    { title: 'Countdown Forty', desc: 'The week\'s most played tracks.', category: 'Music', mins: 60, art: art('live-concert') },
  ],
  civic: [
    { title: 'Civic Chamber', desc: 'Live coverage of the day\'s chamber proceedings.', category: 'Politics', mins: 120, art: art('static-3') },
    { title: 'Committee Room', desc: 'Selected committee hearings from the past week.', category: 'Politics', mins: 60, art: art('static-3') },
  ],
  hearth: [
    { title: 'Slow Kitchen', desc: 'One dish, cooked properly, start to finish.', category: 'Cookery', mins: 30, art: art('live-cooking') },
    { title: 'Restoration Road', desc: 'Restoring old houses with the people who live in them.', category: 'Lifestyle', mins: 60, art: art('kingsmoor-2') },
    { title: 'Home Grown', desc: 'Gardening through the seasons in a small walled garden.', category: 'Lifestyle', mins: 30, art: art('cartographer') },
  ],
}

const MIN = 60_000
const DAY = 24 * 60 * MIN

export function startOfDay(t: number) {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Local midnight `n` days after the local midnight `day`; 23 or 25 hours away across a clock change. */
export function addDays(day: number, n: number) {
  const d = new Date(day)
  d.setDate(d.getDate() + n)
  return startOfDay(d.getTime())
}

/** Programmes for one channel covering the local day containing `day`. Deterministic per channel and date. */
const cache = new Map<string, Programme[]>()

export function scheduleFor(channel: Channel, day: number): Programme[] {
  const key = `${channel.id}@${startOfDay(day)}`
  const hit = cache.get(key)
  if (hit) return hit
  const built = buildSchedule(channel, day)
  cache.set(key, built)
  return built
}

function buildSchedule(channel: Channel, day: number): Programme[] {
  const pool = pools[channel.id] ?? []
  if (pool.length === 0) return []
  const dayStart = startOfDay(day)
  const dayIndex = Math.floor(dayStart / DAY)
  const out: Programme[] = []
  let t = dayStart
  let i = (dayIndex * 3 + channel.number * 7) % pool.length
  let n = 0
  while (t < dayStart + DAY) {
    const slot = pool[i % pool.length] as Slot
    const stop = Math.min(t + slot.mins * MIN, dayStart + DAY)
    out.push({
      id: `${channel.id}@${t}`,
      channelId: channel.id,
      start: t,
      stop,
      title: slot.title,
      desc: slot.desc,
      category: slot.category,
      episode: slot.episode ? `S${1 + (dayIndex % 3)} E${1 + ((n + dayIndex) % 8)}` : null,
      art: slot.art,
    })
    t = stop
    // Stride coprime with the pool length so every slot still gets airtime.
    i += pool.length % 2 === 0 ? 1 : 2
    n++
  }
  return out
}

export function programmeAt(channel: Channel, t: number): Programme | undefined {
  return scheduleFor(channel, t).find((p) => p.start <= t && t < p.stop)
}

export function nextProgramme(channel: Channel, t: number): Programme | undefined {
  const today = scheduleFor(channel, t)
  return today.find((p) => p.start > t) ?? scheduleFor(channel, startOfDay(t) + DAY)[0]
}

export const channelById = (id: string) => channels.find((c) => c.id === id)

export const GUIDE_DAYS = 7
export { DAY, MIN }
