import { Link } from 'react-router-dom'
import { featured, movies, series } from '../data/catalog'
import { movieRef, runtimeLabel, seriesRef } from '../data/refs'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { ChannelCard, PosterCard, Section, WideCard, idleLabel } from '../components/Tiles'
import { useToast } from '../components/Toast'
import { Art, ChannelMark } from '../components/ui'
import { continueWatching, seriesNextUp } from '../lib/library'
import { minutesLeft, useNow } from '../lib/time'
import { NOT_TESTED } from '../state/playlists'
import { useStore } from '../state/store'
import './Home.css'

function Hero() {
  const store = useStore()
  const toast = useToast()
  const t = featured[0]
  if (!t) return null
  const ref = t.kind === 'movie' ? movieRef(t.id) : seriesRef(t.id)
  const inLibrary = store.library.watchlist.includes(ref)
  const play = t.kind === 'movie' ? `/watch/${encodeURIComponent(ref)}` : `/series/${t.id}`
  return (
    <section className="hero" aria-labelledby="hero-title">
      <Art src={t.art} focus={t.focus} eager className="hero-art" />
      <PageHeader overlay />
      <div className="hero-content">
        <p className="kicker"><Icon name="film" size={16} />{t.kind === 'movie' ? 'Featured movie' : 'Featured series'}</p>
        {/* The title opens the detail page, standing in for the brief's "More information" without a third button. */}
        <h1 id="hero-title" className="title-xl"><Link to={t.kind === 'movie' ? `/movies/${t.id}` : `/series/${t.id}`} className="hero-title-link">{t.title}</Link></h1>
        <p className="hero-sub">{t.tagline}</p>
        <div className="meta">
          {t.genres.map((g) => <span key={g}>{g}</span>)}
          <span>{t.kind === 'movie' ? t.year : t.years}</span>
          <span>{t.kind === 'movie' ? runtimeLabel(t.runtime) : `${t.seasons.length} seasons`}</span>
          <span><span className="cert">{t.certificate}</span></span>
        </div>
        <p className="hero-synopsis">{t.synopsis}</p>
        <div className="hero-actions">
          <Link to={play} className="btn btn-primary"><Icon name="play" size={16} />Watch Now</Link>
          <button
            type="button"
            className="btn btn-secondary"
            aria-pressed={inLibrary}
            onClick={() => {
              store.toggleWatchlist(ref)
              toast(inLibrary ? `Removed ${t.title} from your library` : `Added ${t.title} to your library`, { label: 'Undo', run: () => store.toggleWatchlist(ref) })
            }}
          >
            <Icon name={inLibrary ? 'check' : 'plus'} size={18} />{inLibrary ? 'In Library' : 'Add to Library'}
          </button>
        </div>
      </div>
    </section>
  )
}

export function Home() {
  const now = useNow()
  const { library, prefs, channels, findChannel, channelMode, programmeAt, nextProgramme, demoTitles } = useStore()
  const resume = continueWatching(library, demoTitles)
  const newFilms = [...movies].sort((a, b) => b.added.localeCompare(a.added))
  const newSeries = [...series].sort((a, b) => b.added.localeCompare(a.added))
  const lastChannel = library.history.find((h) => h.ref.startsWith('channel:'))?.ref.slice(8)
  const favChannels = library.favourites.filter((r) => r.startsWith('channel:')).map((r) => findChannel(r.slice(8))).filter((c) => !!c)
  const shortcuts = [
    { to: '/library?tab=watchlist', label: 'Watchlist', count: library.watchlist.length, icon: 'bookmark' as const },
    { to: '/library?tab=favourites', label: 'Favourites', count: library.favourites.length, icon: 'heart' as const },
    { to: '/library?tab=collections', label: 'Collections', count: library.collections.length, icon: 'folder' as const },
    { to: '/library?tab=history', label: 'Recently watched', count: library.history.length, icon: 'history' as const },
  ]

  return (
    <>
      {demoTitles ? <Hero /> : <PageHeader title="Home" />}
      <div className="page stack home-body">
        {resume.length > 0 && (
          <Section icon="history" title="Continue Watching" viewAll="/library?tab=history" grid="grid-4">
            {resume.slice(0, 4).map((r) => (
              <WideCard
                key={r.ref}
                to={r.play}
                title={r.title}
                sub={`${r.kind === 'episode' ? r.meta : 'Movie'} · ${minutesLeft(0, r.secondsLeft)} min left`}
                art={r.art}
                focus={r.focus}
                progress={r.progress}
                playable
              />
            ))}
          </Section>
        )}

        <Section icon="tv" title="On Now" sub="Live TV" viewAll="/live">
          {channels.slice(0, 6).map((c) => (
            <ChannelCard key={c.id} channel={c} now={programmeAt(c, now)} next={nextProgramme(c, now)} to={`/live?channel=${c.id}`} format={prefs.timeFormat} selected={c.id === lastChannel} at={now} />
          ))}
        </Section>

        {demoTitles && <Section icon="film" title="New Movies" viewAll="/movies" grid="grid-7">
          {newFilms.slice(0, 7).map((m) => (
            <PosterCard key={m.id} to={`/movies/${m.id}`} title={m.title} art={m.art} focus={m.focus} line={`${m.year} · ${m.genres[0]}`} />
          ))}
        </Section>}

        {demoTitles && <Section icon="series" title="Series" viewAll="/series" grid="grid-4">
          {newSeries.slice(0, 4).map((s) => {
            const up = seriesNextUp(library, s)
            const watching = up.state === 'resume' || up.state === 'next'
            return (
              <WideCard
                key={s.id}
                to={`/series/${s.id}`}
                title={s.title}
                sub={watching ? `Continue S${up.episode.season} E${up.episode.number} · ${s.genres[0]}` : `${s.seasons.length} season${s.seasons.length > 1 ? 's' : ''} · ${s.genres.join(' / ')}`}
                art={s.art}
                focus={s.focus}
                captionBelow
              />
            )
          })}
        </Section>}

        <div className="home-pair">
          {favChannels.length > 0 && (
            <Section icon="heart" title="Your Channels" viewAll="/live?group=Favourites" grid="channel-chips">
              {favChannels.map((c) => {
                const p = programmeAt(c, now)
                return (
                  <Link key={c.id} to={`/live?channel=${c.id}`} className="card channel-chip">
                    <ChannelMark channel={c} size={40} />
                    <span><strong>{c.name}</strong><span className="faint">{p ? p.title : idleLabel(c)}</span></span>
                  </Link>
                )
              })}
            </Section>
          )}
          <Section icon="library" title="Your Library" viewAll="/library" grid="shortcut-grid">
            {shortcuts.map((s) => (
              <Link key={s.label} to={s.to} className="card shortcut">
                <span className="shortcut-icon"><Icon name={s.icon} /></span>
                <span><strong>{s.label}</strong><span className="faint tnum">{s.count} {s.count === 1 ? 'item' : 'items'}</span></span>
                <Icon name="right" size={18} />
              </Link>
            ))}
          </Section>
        </div>

        <p className="footer-note faint">
          {channelMode === 'playlists'
            ? `Channels come from your imported playlists (${NOT_TESTED.toLowerCase()}). Kinora has no source for films and series yet.`
            : 'Kinora interface preview. Movies, series, channels and the guide are fictional demonstration data; nothing is streamed.'}
        </p>
      </div>
    </>
  )
}
