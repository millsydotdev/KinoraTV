/**
 * Viewing Habits and Analytics Dashboard Tab for Kinora Library.
 * Displays viewing activity metrics, weekly watch time charts, format breakdowns,
 * and top genres. Strictly adheres to project typography standards: zero em-dashes.
 */

import { useMemo } from 'react'
import { useStore } from '../state/store'
import { calculateViewingAnalytics } from '../lib/analytics'
import { Icon } from '../components/Icon'
import './ViewingHabitsTab.css'

export function ViewingHabitsTab() {
  const store = useStore()
  const report = useMemo(() => calculateViewingAnalytics(store.library), [store.library])

  const maxDailyMins = useMemo(() => {
    const vals = report.last7DaysDaily.map((d) => d.minutes)
    return Math.max(60, ...vals)
  }, [report.last7DaysDaily])

  return (
    <div className="viewing-habits-container" data-testid="viewing-habits-dashboard">
      <div className="vh-header-card">
        <h2 className="vh-header-title">Viewing Habits & Analytics</h2>
        <p className="vh-header-desc">
          Telemetry insights, playback session metrics, and content consumption trends calculated locally from your library activity.
        </p>
      </div>

      {/* Top Level Summary Metric Cards */}
      <div className="vh-stats-grid">
        <div className="vh-stat-card">
          <span className="vh-stat-label">Total Watch Time</span>
          <span className="vh-stat-value">{report.totalWatchHoursFormatted}</span>
          <span className="vh-stat-sub">{report.totalWatchMinutes} total minutes recorded</span>
        </div>

        <div className="vh-stat-card">
          <span className="vh-stat-label">7-Day Daily Average</span>
          <span className="vh-stat-value">{report.averageDailyMinutesLast7Days}m</span>
          <span className="vh-stat-sub">Minutes per active day</span>
        </div>

        <div className="vh-stat-card">
          <span className="vh-stat-label">Active Streak</span>
          <span className="vh-stat-value">{report.activeStreakDays} {report.activeStreakDays === 1 ? 'day' : 'days'}</span>
          <span className="vh-stat-sub">Consecutive days watching</span>
        </div>

        <div className="vh-stat-card">
          <span className="vh-stat-label">Prime Viewing Window</span>
          <span className="vh-stat-value" style={{ fontSize: '1.15rem' }}>{report.peakViewingHourFormatted}</span>
          <span className="vh-stat-sub">Peak activity window</span>
        </div>

        <div className="vh-stat-card">
          <span className="vh-stat-label">Estimated Bandwidth</span>
          <span className="vh-stat-value">{report.estimatedDataGbTotal} GB</span>
          <span className="vh-stat-sub">{report.estimatedDataGbThisWeek} GB this week</span>
        </div>

        <div className="vh-stat-card">
          <span className="vh-stat-label">Titles Watched</span>
          <span className="vh-stat-value">{report.completedCount}</span>
          <span className="vh-stat-sub">{report.inProgressCount} currently in progress</span>
        </div>
      </div>

      {/* Charts Row */}
      <div className="vh-charts-row">
        {/* Weekly Activity Bar Chart */}
        <div className="vh-panel">
          <h3 className="vh-panel-heading">
            <Icon name="history" size={16} />
            Weekly Activity (Last 7 Days)
          </h3>

          <div className="vh-bar-chart" role="region" aria-label="7-Day watch minutes bar chart">
            {report.last7DaysDaily.map((item) => {
              const heightPct = Math.max(4, Math.round((item.minutes / maxDailyMins) * 100))
              return (
                <div key={item.date} className="vh-bar-col">
                  <span className="vh-bar-val">{item.minutes > 0 ? `${item.minutes}m` : '0'}</span>
                  <div className="vh-bar-fill-wrap">
                    <div
                      className="vh-bar-fill"
                      style={{ height: `${heightPct}%` }}
                      title={`${item.dayLabel} (${item.date}): ${item.minutes} minutes`}
                    />
                  </div>
                  <span className="vh-bar-label">{item.dayLabel}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Format Distribution */}
        <div className="vh-panel">
          <h3 className="vh-panel-heading">
            <Icon name="grid" size={16} />
            Format Breakdown
          </h3>

          <div className="vh-format-list">
            {report.formatBreakdown.map((item) => (
              <div key={item.format} className="vh-format-row">
                <div className="vh-format-meta">
                  <span className="vh-format-name">{item.format}</span>
                  <span className="vh-format-time">
                    {item.minutes}m ({item.percentage}%)
                  </span>
                </div>
                <div className="vh-format-track">
                  <div
                    className="vh-format-progress"
                    style={{ width: `${Math.min(100, item.percentage)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row: Top Genres & Top Watched Items */}
      <div className="vh-charts-row">
        {/* Top Genres */}
        <div className="vh-panel">
          <h3 className="vh-panel-heading">
            <Icon name="star" size={16} />
            Favourite Genres
          </h3>

          {report.topGenres.length === 0 ? (
            <p style={{ fontSize: '0.875rem', opacity: 0.6, margin: 0 }}>
              No genre activity recorded yet. Start watching movies or series to view genre trends.
            </p>
          ) : (
            <div className="vh-genres-wrap">
              {report.topGenres.map((g) => (
                <div key={g.genre} className="vh-genre-chip">
                  <span>{g.genre}</span>
                  <span className="vh-genre-pct">{g.percentage}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Watched Items */}
        <div className="vh-panel">
          <h3 className="vh-panel-heading">
            <Icon name="film" size={16} />
            Most Watched Titles
          </h3>

          {report.topItems.length === 0 ? (
            <p style={{ fontSize: '0.875rem', opacity: 0.6, margin: 0 }}>
              No watched titles found in library.
            </p>
          ) : (
            <div className="vh-top-items-list">
              {report.topItems.map((item, idx) => (
                <div key={item.ref} className="vh-top-item">
                  <span className="vh-top-item-rank">#{idx + 1}</span>
                  <div className="vh-top-item-info">
                    <span className="vh-top-item-title">{item.title}</span>
                    <span className="vh-top-item-cat">{item.format}</span>
                  </div>
                  <span className="vh-top-item-time">{item.watchMinutes}m</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
