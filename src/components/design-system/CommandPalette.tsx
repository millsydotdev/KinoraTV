import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, type IconName } from '../Icon'
import { useProfiles } from '../../state/profiles'
import { useStore } from '../../state/store'
import './CommandPalette.css'

interface CommandItem {
  id: string
  title: string
  sub?: string
  icon: IconName
  category: 'Navigation' | 'Explore' | 'Library' | 'Actions' | 'Channels' | 'Titles' | 'Audio' | 'Settings' | 'Profiles'
  run: () => void
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const store = useStore()
  const { profiles, switchProfile } = useProfiles()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      window.setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Build command catalogue
  const commands: CommandItem[] = [
    // Core Navigation
    { id: 'nav-home', title: 'Go to Home', sub: 'Featured streaming and discovery', icon: 'home', category: 'Navigation', run: () => navigate('/') },
    { id: 'nav-live', title: 'Go to Live TV', sub: 'Interactive guide and channels', icon: 'live', category: 'Navigation', run: () => navigate('/live') },
    { id: 'nav-movies', title: 'Go to Movies', sub: 'On-demand films and verified archives', icon: 'film', category: 'Navigation', run: () => navigate('/movies') },
    { id: 'nav-series', title: 'Go to TV Shows', sub: 'Episodes and television series collection', icon: 'series', category: 'Navigation', run: () => navigate('/series') },
    { id: 'nav-search', title: 'Search Kinora', sub: 'Find channels, programmes, and titles', icon: 'search', category: 'Navigation', run: () => navigate('/search') },
    { id: 'nav-radio', title: 'Go to Live Radio', sub: 'Stream public radio and audio stations', icon: 'radio', category: 'Audio', run: () => navigate('/radio') },
    { id: 'nav-music', title: 'Go to Music & Classical', sub: 'Lossless concert and broadcast streams', icon: 'music', category: 'Audio', run: () => navigate('/music') },
    { id: 'nav-podcasts', title: 'Go to Podcasts', sub: 'Documentaries, news, and conversation', icon: 'podcast', category: 'Audio', run: () => navigate('/podcasts') },
    { id: 'nav-audiobooks', title: 'Go to Audiobooks', sub: 'Spoken word and literary recordings', icon: 'audio', category: 'Audio', run: () => navigate('/audiobooks') },
    { id: 'nav-library', title: 'Go to Your Library', sub: 'Favourites, watchlist, and history', icon: 'library', category: 'Navigation', run: () => navigate('/library') },
    { id: 'nav-sources', title: 'Go to Sources', sub: 'Playlists and XMLTV guides', icon: 'sources', category: 'Navigation', run: () => navigate('/sources') },
    { id: 'nav-settings', title: 'Go to Settings', sub: 'Preferences and application options', icon: 'settings', category: 'Navigation', run: () => navigate('/settings') },

    // Explore Categories
    { id: 'exp-documentaries', title: 'Explore: Documentaries', sub: 'Science, history, and natural world films', icon: 'film', category: 'Explore', run: () => navigate('/documentaries') },
    { id: 'exp-education', title: 'Explore: Education', sub: 'University lectures and open courseware', icon: 'folder', category: 'Explore', run: () => navigate('/education') },
    { id: 'exp-news', title: 'Explore: News & Current Affairs', sub: 'Live reporting and public affairs', icon: 'live', category: 'Explore', run: () => navigate('/news') },
    { id: 'exp-sports', title: 'Explore: Sports & Fitness', sub: 'Competitions, commentary, and athletics', icon: 'sparkles', category: 'Explore', run: () => navigate('/sports') },
    { id: 'exp-books', title: 'Explore: Books & Literature', sub: 'Open texts and classical manuscripts', icon: 'bookmark', category: 'Explore', run: () => navigate('/books') },
    { id: 'exp-culture', title: 'Explore: Culture & Society', sub: 'Arts, theatre, and cultural archives', icon: 'star', category: 'Explore', run: () => navigate('/culture') },
    { id: 'exp-gaming', title: 'Explore: Gaming & Esports', sub: 'Gaming channels and speedrun archives', icon: 'gaming', category: 'Explore', run: () => navigate('/gaming') },
    { id: 'exp-nature', title: 'Explore: Nature & Science', sub: 'Wildlife, planetary, and lab discoveries', icon: 'sparkles', category: 'Explore', run: () => navigate('/nature-science') },
    { id: 'exp-language', title: 'Explore: Language Learning', sub: 'Immersion broadcasts and language courses', icon: 'helpCircle', category: 'Explore', run: () => navigate('/language') },
    { id: 'exp-archives', title: 'Explore: Public Domain Archives', sub: 'Historical film and broadcast collections', icon: 'folder', category: 'Explore', run: () => navigate('/archives') },

    // Library Tabs
    { id: 'lib-watchlist', title: 'Library: Watchlist', sub: 'Titles and channels saved for later', icon: 'bookmark', category: 'Library', run: () => navigate('/library?tab=watchlist') },
    { id: 'lib-favourites', title: 'Library: Favourites', sub: 'Starred channels and titles', icon: 'heart', category: 'Library', run: () => navigate('/library?tab=favourites') },
    { id: 'lib-ratings', title: 'Library: Ratings & Reviews', sub: 'Personal star ratings and reviews', icon: 'star', category: 'Library', run: () => navigate('/library?tab=ratings') },
    { id: 'lib-collections', title: 'Library: Collections', sub: 'Curated playlists and custom groups', icon: 'folder', category: 'Library', run: () => navigate('/library?tab=collections') },
    { id: 'lib-history', title: 'Library: Viewing History', sub: 'Recently watched channels and programmes', icon: 'history', category: 'Library', run: () => navigate('/library?tab=history') },
    { id: 'lib-sources', title: 'Library: Personal Sources', sub: 'User-configured custom media feeds', icon: 'link', category: 'Library', run: () => navigate('/library?tab=sources') },

    // Settings Sections
    { id: 'set-playback', title: 'Settings: Playback', sub: 'Video quality, resume options, and buffering', icon: 'play', category: 'Settings', run: () => navigate('/settings/playback') },
    { id: 'set-appearance', title: 'Settings: Appearance', sub: 'Themes, accent colors, and display density', icon: 'palette', category: 'Settings', run: () => navigate('/settings/appearance') },
    { id: 'set-subtitles', title: 'Settings: Subtitles', sub: 'Subtitle styling, sizing, and language', icon: 'subtitles', category: 'Settings', run: () => navigate('/settings/subtitles') },
    { id: 'set-audio', title: 'Settings: Audio', sub: 'Preferred language and audio track options', icon: 'audio', category: 'Settings', run: () => navigate('/settings/audio') },
    { id: 'set-epg', title: 'Settings: EPG', sub: 'Time format, zoom level, and timezone offset', icon: 'guide', category: 'Settings', run: () => navigate('/settings/epg') },
    { id: 'set-profiles', title: 'Settings: Profiles', sub: 'Household profiles and parental controls', icon: 'user', category: 'Settings', run: () => navigate('/settings/profiles') },
    { id: 'set-data', title: 'Settings: Data & Backup', sub: 'Export, reset, and storage management', icon: 'database', category: 'Settings', run: () => navigate('/settings/data') },
    { id: 'set-about', title: 'Settings: About Kinora', sub: 'Application version, license, and shortcuts', icon: 'info', category: 'Settings', run: () => navigate('/settings/about') },

    // Actions
    { id: 'act-sources-add', title: 'Add New Source', sub: 'Import playlist or XMLTV guide address or file', icon: 'plus', category: 'Actions', run: () => navigate('/sources/add') },
    { id: 'act-sources-refresh', title: 'Open Sources & Sync', sub: 'View and refresh playlists and XMLTV guides', icon: 'refresh', category: 'Actions', run: () => navigate('/sources') },
    { id: 'act-export-backup', title: 'Export Data Backup', sub: 'Download JSON copy of preferences and library', icon: 'download', category: 'Actions', run: () => navigate('/settings/data') },
    { id: 'act-shortcuts', title: 'View Keyboard Shortcuts', sub: 'Display application keybindings modal', icon: 'helpCircle', category: 'Actions', run: () => { window.dispatchEvent(new CustomEvent('kinora:shortcuts')) } },
  ]

  // Add Household Profiles
  for (const p of profiles) {
    commands.push({
      id: `prof-${p.id}`,
      title: `Switch Profile: ${p.name}`,
      sub: p.isKids ? 'Kids Mode Profile' : 'Household Profile',
      icon: p.avatarIcon || 'user',
      category: 'Profiles',
      run: () => switchProfile(p.id),
    })
  }

  // Add popular channels
  for (const c of store.channels.slice(0, 15)) {
    commands.push({
      id: `chan-${c.id}`,
      title: c.name,
      sub: `Channel ${c.number} · Live TV`,
      icon: 'tv',
      category: 'Channels',
      run: () => navigate(`/live?channel=${c.id}`),
    })
  }

  // Filter commands
  const cleanQ = query.trim().toLowerCase()
  const filtered = cleanQ
    ? commands.filter(
        (c) =>
          c.title.toLowerCase().includes(cleanQ) ||
          (c.sub && c.sub.toLowerCase().includes(cleanQ)) ||
          c.category.toLowerCase().includes(cleanQ),
      )
    : commands

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const selected = filtered[selectedIndex]
      if (selected) {
        selected.run()
        onClose()
      }
    }
  }

  if (!open) return null

  return (
    <div className="ds-command-backdrop" onClick={onClose}>
      <div
        className="ds-command-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="ds-command-header">
          <Icon name="search" size={20} className="ds-command-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="ds-command-input"
            placeholder="Type a command or search screens, channels, settings…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
          />
          <kbd className="ds-command-badge">ESC</kbd>
        </div>

        <div className="ds-command-body">
          {filtered.length === 0 ? (
            <p className="ds-command-empty">No matching commands or destinations.</p>
          ) : (
            <ul ref={listRef} className="ds-command-list" role="listbox">
              {filtered.map((item, idx) => (
                <li
                  key={item.id}
                  role="option"
                  aria-selected={idx === selectedIndex}
                  className={`ds-command-item ${idx === selectedIndex ? 'is-selected' : ''}`}
                  onClick={() => {
                    item.run()
                    onClose()
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <Icon name={item.icon} size={18} className="ds-command-item-icon" />
                  <div className="ds-command-item-text">
                    <span className="ds-command-item-title">{item.title}</span>
                    {item.sub && <span className="ds-command-item-sub">{item.sub}</span>}
                  </div>
                  <span className="ds-command-item-cat">{item.category}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
