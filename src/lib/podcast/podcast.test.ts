// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  parsePodcastXml,
  parsePodcastDuration,
  isAudioEnclosure,
} from './parser'
import {
  getPodcastSubscriptions,
  savePodcastSubscription,
  removePodcastSubscription,
  isPodcastSubscribed,
  getPodcastEpisodes,
  saveEpisodePlaybackProgress,
  getEpisodePlaybackProgress,
} from '../../state/podcastSubscriptions'

describe('Podcast RSS and Atom Parser', () => {
  const sampleRssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>In Our Time: History</title>
    <link>https://www.bbc.co.uk/programmes/b006qykl</link>
    <description>Melvyn Bragg and guests discuss the history of ideas.</description>
    <itunes:author>BBC Radio 4</itunes:author>
    <itunes:image href="https://example.com/art/in-our-time.jpg"/>
    <language>en-gb</language>
    <category>History</category>
    <category>Society &amp; Culture</category>
    
    <item>
      <title>The Siege of Malta</title>
      <guid isPermaLink="false">p0123456</guid>
      <pubDate>Thu, 15 Nov 2024 10:00:00 +0000</pubDate>
      <description>Melvyn Bragg discusses the Great Siege of 1565.</description>
      <enclosure url="https://example.com/audio/malta.mp3" length="45000000" type="audio/mpeg"/>
      <itunes:duration>45:30</itunes:duration>
      <itunes:episode>12</itunes:episode>
      <itunes:season>26</itunes:season>
      <itunes:image href="https://example.com/art/malta.jpg"/>
    </item>
    
    <!-- Duplicate episode testing -->
    <item>
      <title>The Siege of Malta (Duplicate Entry)</title>
      <guid isPermaLink="false">p0123456</guid>
      <enclosure url="https://example.com/audio/malta.mp3" length="45000000" type="audio/mpeg"/>
    </item>

    <!-- Non-audio enclosure item (should be filtered) -->
    <item>
      <title>Accompanying PDF Notes</title>
      <guid>pdf-notes-1</guid>
      <enclosure url="https://example.com/docs/notes.pdf" length="1024" type="application/pdf"/>
    </item>

    <item>
      <title>The Rosetta Stone</title>
      <guid isPermaLink="false">p0789012</guid>
      <pubDate>Thu, 08 Nov 2024 10:00:00 +0000</pubDate>
      <description>Melvyn Bragg explores the discovery of the Rosetta Stone.</description>
      <enclosure url="https://example.com/audio/rosetta.m4a" length="38000000" type="audio/x-m4a"/>
      <itunes:duration>2700</itunes:duration>
    </item>
  </channel>
</rss>`

  const sampleAtomXml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Independent Science Weekly</title>
  <subtitle>Weekly physics and space explorations.</subtitle>
  <link rel="alternate" href="https://example.com/science"/>
  <logo>https://example.com/logo.png</logo>
  <author><name>Dr. Jane Doe</name></author>
  
  <entry>
    <title>Gravitational Wave Observatory Update</title>
    <id>urn:uuid:1225c695-cfb8-4ebb-aaaa-80da344efa6a</id>
    <updated>2024-11-20T18:30:02Z</updated>
    <summary>Latest interferometer detections.</summary>
    <link rel="enclosure" href="https://example.com/audio/gw.ogg" type="audio/ogg"/>
  </entry>
</feed>`

  it('parses standard RSS 2.0 with iTunes podcast tags and deduplicates episodes', () => {
    const result = parsePodcastXml(sampleRssXml, 'https://example.com/feed.xml')
    expect(result.podcast.title).toBe('In Our Time: History')
    expect(result.podcast.author).toBe('BBC Radio 4')
    expect(result.podcast.artworkUrl).toBe('https://example.com/art/in-our-time.jpg')
    expect(result.podcast.categories).toContain('History')

    // Only 2 genuine audio episodes (duplicate and PDF notes were rejected)
    expect(result.episodes.length).toBe(2)

    const ep1 = result.episodes[0]!
    expect(ep1.title).toBe('The Siege of Malta')
    expect(ep1.duration).toBe('46 min')
    expect(ep1.durationMs).toBe(2730000)
    expect(ep1.audioUrl).toBe('https://example.com/audio/malta.mp3')
    expect(ep1.mimeType).toBe('audio/mpeg')
    expect(ep1.episodeNumber).toBe(12)
    expect(ep1.seasonNumber).toBe(26)
    expect(ep1.artworkUrl).toBe('https://example.com/art/malta.jpg')

    const ep2 = result.episodes[1]!
    expect(ep2.title).toBe('The Rosetta Stone')
    expect(ep2.duration).toBe('45 min')
    expect(ep2.durationMs).toBe(2700000)
    expect(ep2.mimeType).toBe('audio/x-m4a')
  })

  it('parses Atom podcast feeds correctly', () => {
    const result = parsePodcastXml(sampleAtomXml, 'https://example.com/atom.xml')
    expect(result.podcast.title).toBe('Independent Science Weekly')
    expect(result.podcast.author).toBe('Dr. Jane Doe')
    expect(result.podcast.artworkUrl).toBe('https://example.com/logo.png')
    expect(result.episodes.length).toBe(1)
    expect(result.episodes[0]!.audioUrl).toBe('https://example.com/audio/gw.ogg')
  })

  it('correctly validates audio enclosures and rejects non-audio links', () => {
    expect(isAudioEnclosure('audio/mpeg', 'https://example.com/audio.mp3')).toBe(true)
    expect(isAudioEnclosure('audio/x-m4a', 'https://example.com/audio.m4a')).toBe(true)
    expect(isAudioEnclosure('application/ogg', 'https://example.com/audio.ogg')).toBe(true)
    expect(isAudioEnclosure('video/mp4', 'https://example.com/audio.mp3')).toBe(true) // Extension check
    expect(isAudioEnclosure('application/pdf', 'https://example.com/notes.pdf')).toBe(false)
    expect(isAudioEnclosure('text/html', 'https://example.com/index.html')).toBe(false)
  })

  it('parses duration formats into formatted text and milliseconds', () => {
    expect(parsePodcastDuration('3600')).toEqual({ text: '60 min', ms: 3600000 })
    expect(parsePodcastDuration('01:30:00')).toEqual({ text: '90 min', ms: 5400000 })
    expect(parsePodcastDuration('25:10')).toEqual({ text: '25 min', ms: 1510000 })
    expect(parsePodcastDuration(null)).toEqual({ text: 'Unknown duration', ms: null })
  })

  it('throws descriptive error on malformed XML documents', () => {
    expect(() => parsePodcastXml('<invalid <xml', 'https://example.com/broken.xml')).toThrow(
      'Malformed XML document',
    )
  })
})

describe('Podcast Subscription and Progress Store', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  const testFeed = {
    id: 'pod-history-test',
    feedUrl: 'https://example.com/history.xml',
    title: 'History Test Podcast',
    description: 'A test podcast',
    categories: ['History'],
    episodesCount: 1,
  }

  const testEpisode = {
    id: 'pod-history-test-ep-1',
    podcastId: 'pod-history-test',
    guid: 'ep-guid-1',
    title: 'Episode 1',
    description: 'First episode description',
    publishedDate: '2024-11-20',
    duration: '30 min',
    audioUrl: 'https://example.com/ep1.mp3',
    mimeType: 'audio/mpeg',
  }

  it('manages podcast subscriptions and persists cached episodes', () => {
    expect(getPodcastSubscriptions().length).toBe(0)
    expect(isPodcastSubscribed('https://example.com/history.xml')).toBe(false)

    savePodcastSubscription(testFeed, [testEpisode])
    expect(getPodcastSubscriptions().length).toBe(1)
    expect(isPodcastSubscribed('https://example.com/history.xml')).toBe(true)
    expect(isPodcastSubscribed('pod-history-test')).toBe(true)

    const cached = getPodcastEpisodes('pod-history-test')
    expect(cached.length).toBe(1)
    expect(cached[0]!.title).toBe('Episode 1')

    removePodcastSubscription('pod-history-test')
    expect(getPodcastSubscriptions().length).toBe(0)
    expect(getPodcastEpisodes('pod-history-test').length).toBe(0)
  })

  it('saves and retrieves episode playback progress', () => {
    expect(getEpisodePlaybackProgress('pod-history-test-ep-1')).toBeNull()

    saveEpisodePlaybackProgress('pod-history-test-ep-1', 45000, false)
    const prog = getEpisodePlaybackProgress('pod-history-test-ep-1')
    expect(prog).not.toBeNull()
    expect(prog?.positionMs).toBe(45000)
    expect(prog?.isFinished).toBe(false)

    saveEpisodePlaybackProgress('pod-history-test-ep-1', 1800000, true)
    const finishedProg = getEpisodePlaybackProgress('pod-history-test-ep-1')
    expect(finishedProg?.isFinished).toBe(true)
  })
})
