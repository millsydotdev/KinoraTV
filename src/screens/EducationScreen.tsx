import { MediaCategoryPage } from '../components/MediaCategoryPage'
import { Icon } from '../components/Icon'

export function EducationScreen() {
  const customHero = (
    <div className="media-hero-banner edu-hero">
      <div className="media-hero-content">
        <span className="media-hero-kicker">OPEN LEARNING & ACADEMIC REPOSITORIES</span>
        <h1 className="media-hero-title">Educational Media & Lectures</h1>
        <p className="media-hero-subtitle">
          University lecture archives, open courseware video libraries, computer science curricula, and STEM tutorials
          from MIT, Yale, Khan Academy, and leading global academic institutions.
        </p>

        <div className="media-hero-stats">
          <span className="media-stat-item">
            <Icon name="folder" size={14} /> <strong>MIT OpenCourseWare</strong> Full Courses
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="play" size={14} /> <strong>Open Yale</strong> Lectures
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="check" size={14} /> <strong>100% Free</strong> Public Education
          </span>
        </div>
      </div>
    </div>
  )

  const featured = ['res-edu-mit-ocw', 'res-edu-khan-academy', 'res-edu-yale-open-courses']

  return <MediaCategoryPage categoryId="education" customBannerHero={customHero} featuredIds={featured} />
}
