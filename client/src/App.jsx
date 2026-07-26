import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { io } from 'socket.io-client'
import './App.css'

const socket = io('http://localhost:3099', {
  transports: ['websocket'],
})

const blankState = {
  today: dayjs().format('YYYY-MM-DD'),
  todayTotalPoints: 0,
  activities: [],
  history: [],
}

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const rankPrefixes = ['Sprout', 'Trail', 'Iron', 'Solar', 'Nova', 'Apex', 'Prime', 'Mythic']
const rankCores = ['Walker', 'Striker', 'Builder', 'Scholar', 'Breaker', 'Keeper', 'Ranger', 'Sage']
const particleModes = [
  'aurora',
  'glitch',
  'vortex',
  'fireworks',
  'plasma',
  'stardust',
  'lightning',
  'prism',
  'nebula',
  'supernova',
]

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const lerp = (start, end, t) => start + (end - start) * t
const normalizeCategory = (category) => `${category || ''}`.trim()

const categoryLabel = (category) => normalizeCategory(category) || 'Uncategorized'

const summarizeCategories = (items, valueKey) => {
  const summaryMap = new Map()

  items.forEach((item) => {
    const label = categoryLabel(item.category)
    const points = Number(item?.[valueKey]) || 0
    const existing = summaryMap.get(label) || {
      category: label,
      points: 0,
      activities: 0,
    }

    existing.points += points
    existing.activities += 1
    summaryMap.set(label, existing)
  })

  return [...summaryMap.values()].sort((left, right) => right.points - left.points || left.category.localeCompare(right.category))
}

const collectCategories = (items) =>
  [...new Set(items.map((item) => normalizeCategory(item.category)).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: 'base' }),
  )

const formatNumber = (value) => {
  const asNumber = Number(value)
  if (!Number.isFinite(asNumber)) {
    return '0'
  }

  return parseFloat(asNumber.toFixed(4)).toString()
}

const toMonthGrid = (state) => {
  const today = dayjs(state.today)
  const monthStart = today.startOf('month')
  const monthEnd = today.endOf('month')

  const historyByDay = new Map(state.history.map((item) => [item.day, item]))
  const days = []

  for (let i = 0; i < monthStart.day(); i += 1) {
    days.push({ key: `pad-start-${i}`, empty: true })
  }

  for (let cursor = monthStart; cursor.isBefore(monthEnd) || cursor.isSame(monthEnd, 'day'); cursor = cursor.add(1, 'day')) {
    const date = cursor.format('YYYY-MM-DD')
    days.push({
      key: date,
      date,
      label: cursor.date(),
      isToday: cursor.isSame(today, 'day'),
      summary: historyByDay.get(date),
    })
  }

  while (days.length % 7 !== 0) {
    days.push({ key: `pad-end-${days.length}`, empty: true })
  }

  return {
    monthLabel: today.format('MMMM YYYY'),
    days,
  }
}

const getRankData = (points) => {
  const safePoints = Math.max(0, Number(points) || 0)
  const rankLevel = Math.floor(safePoints / 10)
  const nextUnlockAt = (rankLevel + 1) * 10
  const pointsIntoLevel = safePoints - rankLevel * 10
  const progressPercent = Math.min(100, (pointsIntoLevel / 10) * 100)

  const prefix = rankPrefixes[rankLevel % rankPrefixes.length]
  const core = rankCores[Math.floor(rankLevel / rankPrefixes.length) % rankCores.length]
  const rankName = `${prefix} ${core}`
  const badgeCode = `R-${String(rankLevel + 1).padStart(3, '0')}`
  const hue = (36 + rankLevel * 29) % 360
  const particleMode = particleModes[rankLevel % particleModes.length]
  const excitement = Math.min(1, rankLevel / 18)
  const rankRamp = clamp(rankLevel / 9, 0, 1)
  const visualRamp = rankRamp ** 1.35

  const theme = {
    pageStart: `hsl(${hue} ${lerp(26, 92, visualRamp)}% ${lerp(62, 34, visualRamp)}%)`,
    pageMid: `hsl(${(hue + 38) % 360} ${lerp(24, 88, visualRamp)}% ${lerp(72, 40, visualRamp)}%)`,
    pageEnd: `hsl(${(hue + 78) % 360} ${lerp(28, 94, visualRamp)}% ${lerp(82, 52, visualRamp)}%)`,
    heroA: `hsl(${hue} ${lerp(34, 88, visualRamp)}% ${lerp(44, 30, visualRamp)}%)`,
    heroB: `hsl(${(hue + 24) % 360} ${lerp(36, 90, visualRamp)}% ${lerp(50, 36, visualRamp)}%)`,
    heroC: `hsl(${(hue + 56) % 360} ${lerp(40, 95, visualRamp)}% ${lerp(58, 44, visualRamp)}%)`,
    panelBorder: `hsl(${(hue + 16) % 360} ${lerp(20, 70, visualRamp)}% ${lerp(72, 38, visualRamp)}% / ${lerp(0.16, 0.35, visualRamp)})`,
    action: `hsl(${(hue + 8) % 360} ${lerp(40, 82, visualRamp)}% ${lerp(42, 34, visualRamp)}%)`,
    textStrong: `hsl(${(hue + 190) % 360} 36% 12%)`,
    textMuted: `hsl(${(hue + 170) % 360} 28% 22%)`,
    cardGlow: `hsla(${hue} ${lerp(32, 90, visualRamp)}% ${lerp(78, 55, visualRamp)}% / ${lerp(0.08, 0.34, visualRamp)})`,
    particle: `hsl(${(hue + 90) % 360} 100% ${64 + excitement * 20}%)`,
    particleAlt: `hsl(${(hue + 150) % 360} 100% ${68 + excitement * 20}%)`,
  }

  const particleCount = Math.min(24, 8 + rankLevel)
  const particles = Array.from({ length: particleCount }).map((_, idx) => {
    const left = (rankLevel * 37 + idx * 17) % 100
    const top = (rankLevel * 19 + idx * 29) % 100
    const size = 2 + ((rankLevel + idx * 3) % 7)
    const delay = ((rankLevel + idx) % 16) * -0.22
    const duration = Math.max(1.2, 3.8 - Math.min(2.1, rankLevel * 0.08) + (idx % 5) * 0.16)
    const driftX = -20 + ((rankLevel * 11 + idx * 13) % 41)
    const driftY = -24 + ((rankLevel * 7 + idx * 19) % 49)
    const spin = (rankLevel * 31 + idx * 47) % 360
    const shape = ['dot', 'diamond', 'ring', 'spark'][idx % 4]

    return {
      id: `${rankLevel}-${idx}`,
      left,
      top,
      size,
      delay,
      duration,
      opacity: Math.min(0.96, 0.48 + (idx % 7) * 0.06),
      useAlt: idx % 2 === 0,
      driftX,
      driftY,
      spin,
      shape,
    }
  })

  return {
    rankLevel,
    rankName,
    badgeCode,
    particleMode,
    theme,
    particles,
    nextUnlockAt,
    pointsToNext: Math.max(0, nextUnlockAt - safePoints),
    progressPercent,
  }
}

function App() {
  const [state, setState] = useState(blankState)
  const [newActivityName, setNewActivityName] = useState('')
  const [newActivityScore, setNewActivityScore] = useState(1)
  const [newActivityCategory, setNewActivityCategory] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedDay, setSelectedDay] = useState(null)

  useEffect(() => {
    const onState = (nextState) => {
      setState(nextState)
      setErrorMessage('')
    }

    socket.on('state:update', onState)
    return () => {
      socket.off('state:update', onState)
    }
  }, [])

    useEffect(() => {
      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          setSelectedDay(null)
        }
      }

      window.addEventListener('keydown', onKeyDown)
      return () => {
        window.removeEventListener('keydown', onKeyDown)
      }
    }, [])

  const monthGrid = useMemo(() => toMonthGrid(state), [state])
  const rank = useMemo(() => getRankData(state.todayTotalPoints), [state.todayTotalPoints])
  const categoryOptions = useMemo(() => collectCategories(state.activities), [state.activities])
  const categoryBreakdown = useMemo(
    () => summarizeCategories(state.activities, 'todayPoints'),
    [state.activities],
  )
  const selectedDayBreakdown = useMemo(
    () => summarizeCategories(selectedDay?.activities || [], 'points'),
    [selectedDay],
  )

  useEffect(() => {
    const root = document.documentElement

    root.style.setProperty('--page-bg-start', rank.theme.pageStart)
    root.style.setProperty('--page-bg-mid', rank.theme.pageMid)
    root.style.setProperty('--page-bg-end', rank.theme.pageEnd)
    root.style.setProperty('--hero-a', rank.theme.heroA)
    root.style.setProperty('--hero-b', rank.theme.heroB)
    root.style.setProperty('--hero-c', rank.theme.heroC)
    root.style.setProperty('--panel-border', rank.theme.panelBorder)
    root.style.setProperty('--action-color', rank.theme.action)
    root.style.setProperty('--text-strong', rank.theme.textStrong)
    root.style.setProperty('--text-muted', rank.theme.textMuted)
    root.style.setProperty('--card-glow', rank.theme.cardGlow)
    root.style.setProperty('--particle-color', rank.theme.particle)
    root.style.setProperty('--particle-alt-color', rank.theme.particleAlt)
  }, [rank])

  const submitWithAck = (eventName, payload) => {
    socket.emit(eventName, payload, (result) => {
      if (!result?.ok) {
        setErrorMessage(result?.error || 'Something went wrong')
      }
    })
  }

  const createActivity = (event) => {
    event.preventDefault()
    if (!newActivityName.trim()) {
      setErrorMessage('Activity name is required')
      return
    }

    const category = normalizeCategory(newActivityCategory)

    submitWithAck('activity:create', {
      name: newActivityName,
      score: Number(newActivityScore) || 0,
      category,
    })

    setNewActivityName('')
    setNewActivityScore(1)
    setNewActivityCategory('')
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">Activity Tracker</p>
        <h1>{formatNumber(state.todayTotalPoints)} points today</h1>
        <p className="formula">Formula: times done * activity score</p>
      </header>

      <section className="panel category-panel">
        <div className="calendar-header">
          <h2>Today by Category</h2>
          <p>All points across active activities</p>
        </div>

        {categoryBreakdown.length > 0 ? (
          <div className="category-breakdown">
            {categoryBreakdown.map((entry) => (
              <div className="category-chip" key={entry.category}>
                <span>{entry.category}</span>
                <strong>{formatNumber(entry.points)} pts</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="panel-note">Add an activity to see category totals here.</p>
        )}
      </section>

      <section className="panel">
        <h2>Add Activity</h2>
        <form className="add-form" onSubmit={createActivity}>
          <label>
            Activity name
            <input
              value={newActivityName}
              onChange={(event) => setNewActivityName(event.target.value)}
              placeholder="Read, run, meditate..."
            />
          </label>

          <label>
            Score per execution
            <input
              type="number"
              min="0"
              step="any"
              value={newActivityScore}
              onChange={(event) => setNewActivityScore(event.target.value)}
            />
          </label>

          <label>
            Category
            <input
              list="category-options"
              value={newActivityCategory}
              onChange={(event) => setNewActivityCategory(event.target.value)}
              placeholder="Optional"
            />
          </label>

          <button type="submit">Add</button>
        </form>
      </section>

      <datalist id="category-options">
        {categoryOptions.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>

      {!!errorMessage && <p className="error">{errorMessage}</p>}

      <section className="panel">
        <h2>Today&apos;s Activities</h2>
        <p className="panel-note">Sorted by all-time usage so your most frequent actions stay on top.</p>
        <div className="activity-list">
          {state.activities.length === 0 && <p>No activities yet. Add your first one above.</p>}

          {state.activities.map((activity) => {
            const timesValue = Math.max(0, Number(activity.todayCount) || 0)
            const timesIntensity = Math.min(timesValue / 4, 1)
            const timesHue = Math.max(12, 112 - timesIntensity * 100)
            const activityCategory = normalizeCategory(activity.category)

            return (
            <article
              className={`activity-item ${timesValue > 0 ? 'is-active' : ''}`}
              style={{ '--times-intensity': timesIntensity, '--times-hue': timesHue }}
              key={activity.id}
            >
              <label className="name-field">
                <span className="label-text">Activity</span>
                <input
                  key={`name-${activity.id}-${activity.name}`}
                  defaultValue={activity.name}
                  onBlur={(event) => {
                    const nextName = event.target.value.trim()
                    if (!nextName || nextName === activity.name) {
                      event.target.value = activity.name
                      return
                    }

                    submitWithAck('activity:rename', {
                      id: activity.id,
                      name: nextName,
                    })
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur()
                    }
                  }}
                />
              </label>

              <label className="times-field">
                <span className="label-text">Times</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  key={`count-${activity.id}-${activity.todayCount}`}
                  defaultValue={activity.todayCount}
                  onWheel={(event) => {
                    event.currentTarget.blur()
                  }}
                  onBlur={(event) => {
                    const nextCount = Number(event.target.value)
                    if (!Number.isFinite(nextCount) || nextCount < 0 || nextCount === activity.todayCount) {
                      event.target.value = activity.todayCount
                      return
                    }

                    submitWithAck('activity:update-today-count', {
                      id: activity.id,
                      count: nextCount,
                    })
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur()
                    }
                  }}
                />
              </label>

              <label className="category-field">
                <span className="label-text">Category</span>
                <input
                  list="category-options"
                  key={`category-${activity.id}-${activityCategory}`}
                  defaultValue={activityCategory}
                  placeholder="Optional"
                  onBlur={(event) => {
                    const nextCategory = normalizeCategory(event.target.value)
                    if (nextCategory === activityCategory) {
                      event.target.value = activityCategory
                      return
                    }

                    submitWithAck('activity:update-category', {
                      id: activity.id,
                      category: nextCategory,
                    })
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur()
                    }
                  }}
                />
              </label>

              <label className="score-field">
                <span className="label-text">Score</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  key={`score-${activity.id}-${activity.score}`}
                  defaultValue={activity.score}
                  onBlur={(event) => {
                    const nextScore = Number(event.target.value)
                    if (!Number.isFinite(nextScore) || nextScore < 0 || nextScore === activity.score) {
                      event.target.value = activity.score
                      return
                    }

                    submitWithAck('activity:update-score', {
                      id: activity.id,
                      score: nextScore,
                    })
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur()
                    }
                  }}
                />
              </label>

              <div className="item-stats">
                <p className="item-points">{formatNumber(activity.todayPoints)} pts</p>
                <p className="item-usage">{formatNumber(activity.allTimeCount)} all time</p>
              </div>

              <button
                className="btn-delete"
                onClick={() => {
                  if (window.confirm(`Delete "${activity.name}"? This cannot be undone.`)) {
                    submitWithAck('activity:delete', { id: activity.id })
                  }
                }}
              >
                Delete
              </button>
            </article>
            )
          })}
        </div>
      </section>

      <section className="panel">
        <div className="calendar-header">
          <h2>Calendar History</h2>
          <p>{monthGrid.monthLabel}</p>
        </div>

        <div className="weekday-row">
          {weekdayLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>

        <div className="calendar-grid">
          {monthGrid.days.map((day) => {
            if (day.empty) {
              return <div className="day empty" key={day.key} />
            }

            return (
              <div
                className={`day day-button ${day.isToday ? 'today' : ''} ${day.summary ? 'has-details' : ''}`}
                key={day.key}
                role={day.summary ? 'button' : undefined}
                tabIndex={day.summary ? 0 : -1}
                onClick={() => {
                  setSelectedDay(day.summary || { day: day.date, totalPoints: 0, activities: [] })
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedDay(day.summary || { day: day.date, totalPoints: 0, activities: [] })
                  }
                }}
              >
                <div className="day-top">
                  <span>{day.label}</span>
                  <strong>{formatNumber(day.summary?.totalPoints || 0)} pts</strong>
                </div>

                <ul>
                  {(day.summary?.activities || []).map((entry) => (
                    <li key={`${day.date}-${entry.activityId}`}>
                      {entry.name}: {formatNumber(entry.count)} * {formatNumber(entry.score)} = {formatNumber(entry.points)}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </section>

      {selectedDay && (
        <div
          className="day-modal-backdrop"
          role="presentation"
          onClick={() => setSelectedDay(null)}
        >
          <section
            className="day-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Details for ${dayjs(selectedDay.day).format('MMMM D, YYYY')}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="day-modal-header">
              <div>
                <p className="day-modal-eyebrow">Day Details</p>
                <h3>{dayjs(selectedDay.day).format('MMMM D, YYYY')}</h3>
              </div>

              <button type="button" className="day-modal-close" onClick={() => setSelectedDay(null)}>
                Close
              </button>
            </div>

            <p className="day-modal-total">{formatNumber(selectedDay.totalPoints)} pts total</p>

            {selectedDayBreakdown.length > 0 && (
              <div className="day-modal-categories">
                {selectedDayBreakdown.map((entry) => (
                  <div className="category-chip" key={entry.category}>
                    <span>{entry.category}</span>
                    <strong>{formatNumber(entry.points)} pts</strong>
                  </div>
                ))}
              </div>
            )}

            {selectedDay.activities.length > 0 ? (
              <ul className="day-modal-list">
                {selectedDay.activities.map((entry) => (
                  <li key={`${selectedDay.day}-${entry.activityId}`}>
                    <span className="day-modal-name">{entry.name}</span>
                    <span className="day-modal-category">{categoryLabel(entry.category)}</span>
                    <span>{formatNumber(entry.count)} times</span>
                    <span>{formatNumber(entry.score)} score</span>
                    <strong>{formatNumber(entry.points)} pts</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="day-modal-empty">No activity logged for this day.</p>
            )}
          </section>
        </div>
      )}

      <aside className={`rank-badge fx-${rank.particleMode}`} aria-live="polite">
        <div className="rank-particle-layer" aria-hidden="true">
          {rank.particles.map((particle) => (
            <span
              className={`rank-particle shape-${particle.shape} ${particle.useAlt ? 'alt' : ''}`}
              key={particle.id}
              style={{
                left: `${particle.left}%`,
                top: `${particle.top}%`,
                width: `${particle.size}px`,
                height: `${particle.size}px`,
                animationDelay: `${particle.delay}s`,
                animationDuration: `${particle.duration}s`,
                opacity: particle.opacity,
                '--dx': `${particle.driftX}px`,
                '--dy': `${particle.driftY}px`,
                '--spin': `${particle.spin}deg`,
              }}
            />
          ))}
        </div>

        <p className="rank-label">Rank Badge</p>
        <h3>{rank.rankName}</h3>
        <p className="rank-code">{rank.badgeCode}</p>
        <p className="rank-meta">Level {rank.rankLevel + 1}</p>

        <div className="rank-progress-track" role="presentation">
          <span className="rank-progress-fill" style={{ width: `${rank.progressPercent}%` }} />
        </div>

        <p className="rank-next">{formatNumber(rank.pointsToNext)} pts to unlock next rank at {rank.nextUnlockAt}</p>
      </aside>
    </main>
  )
}

export default App
