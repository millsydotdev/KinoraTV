import { MediaCategoryPage } from '../components/MediaCategoryPage'
import { Icon } from '../components/Icon'

export function GamingScreen() {
  const customHero = (
    <div className="media-hero-banner gaming-hero">
      <div className="media-hero-content">
        <span className="media-hero-kicker">PRESERVATION, SPEEDRUNS & GAME CULTURE</span>
        <h1 className="media-hero-title">Gaming & Interactive Media</h1>
        <p className="media-hero-subtitle">
          Historical MS-DOS games preservation, world record speedrun databases, developer lectures from the GDC Vault,
          and interactive media history archives.
        </p>

        <div className="media-hero-stats">
          <span className="media-stat-item">
            <Icon name="tv" size={14} /> <strong>Internet Archive</strong> MS-DOS Historical Games
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="play" size={14} /> <strong>Speedrun.com</strong> World Records API
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="folder" size={14} /> <strong>GDC Vault</strong> Free Postmortems
          </span>
        </div>
      </div>
    </div>
  )

  const featured = ['res-gam-internet-archive-dos', 'res-gam-speedrun-api', 'res-gam-gdc-vault']

  return <MediaCategoryPage categoryId="gaming" customBannerHero={customHero} featuredIds={featured} />
}
