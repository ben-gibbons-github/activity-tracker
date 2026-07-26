const fs = require('fs')
const path = require('path')
const express = require('express')
const cors = require('cors')
const { createServer } = require('http')
const { Server } = require('socket.io')
const dayjs = require('dayjs')
const sqlite3 = require('sqlite3').verbose()

const PORT = 3099
const DB_DIR = path.join(__dirname, '..', 'data')
const DB_PATH = path.join(DB_DIR, 'activity-tracker.sqlite')

fs.mkdirSync(DB_DIR, { recursive: true })

const db = new sqlite3.Database(DB_PATH)

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err)
        return
      }
      resolve(this)
    })
  })

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err)
        return
      }
      resolve(row)
    })
  })

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err)
        return
      }
      resolve(rows)
    })
  })

const today = () => dayjs().format('YYYY-MM-DD')

const ensureColumn = async (tableName, columnName, columnDefinition) => {
  const columns = await all(`PRAGMA table_info(${tableName})`)

  if (!columns.some((column) => column.name === columnName)) {
    await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`)
  }
}

const initDb = async () => {
  await run(`
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 1,
      category TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS activity_counts (
      day TEXT NOT NULL,
      activity_id INTEGER NOT NULL,
      count REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (day, activity_id),
      FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
    )
  `)

  await ensureColumn('activities', 'category', 'category TEXT')
}

const getSnapshot = async () => {
  const date = today()

  const activityRows = await all(
    `
    SELECT
      a.id,
      a.name,
      a.score,
      a.category,
      COALESCE(ac.count, 0) AS todayCount,
      COALESCE(totals.allTimeCount, 0) AS allTimeCount
    FROM activities a
    LEFT JOIN activity_counts ac
      ON ac.activity_id = a.id
      AND ac.day = ?
    LEFT JOIN (
      SELECT activity_id, SUM(count) AS allTimeCount
      FROM activity_counts
      GROUP BY activity_id
    ) totals
      ON totals.activity_id = a.id
    ORDER BY allTimeCount DESC, todayCount DESC, a.name COLLATE NOCASE ASC, a.id ASC
  `,
    [date],
  )

  const activities = activityRows.map((row) => ({
    id: row.id,
    name: row.name,
    score: row.score,
    category: row.category,
    todayCount: row.todayCount,
    allTimeCount: row.allTimeCount,
    todayPoints: row.todayCount * row.score,
  }))

  const todayTotalPoints = activities.reduce((sum, activity) => sum + activity.todayPoints, 0)

  const dayRows = await all(
    `
    SELECT
      c.day,
      c.activity_id AS activityId,
      c.count,
      a.name,
      a.score,
      a.category
    FROM activity_counts c
    JOIN activities a ON a.id = c.activity_id
    ORDER BY c.day DESC, c.activity_id ASC
  `,
  )

  const historyMap = new Map()

  dayRows.forEach((row) => {
    const existing = historyMap.get(row.day) || {
      day: row.day,
      totalPoints: 0,
      activities: [],
    }

    const points = row.count * row.score

    existing.totalPoints += points
    existing.activities.push({
      activityId: row.activityId,
      name: row.name,
      score: row.score,
      category: row.category,
      count: row.count,
      points,
    })

    historyMap.set(row.day, existing)
  })

  const history = [...historyMap.values()].sort((a, b) => a.day.localeCompare(b.day))

  return {
    today: date,
    todayTotalPoints,
    activities,
    history,
  }
}

const upsertTodayCount = async (activityId, count) => {
  const safeCount = Math.max(0, Number(count) || 0)
  const stamp = dayjs().toISOString()

  await run(
    `
    INSERT INTO activity_counts(day, activity_id, count, updated_at)
    VALUES(?, ?, ?, ?)
    ON CONFLICT(day, activity_id)
    DO UPDATE SET count = excluded.count, updated_at = excluded.updated_at
  `,
    [today(), activityId, safeCount, stamp],
  )
}

const app = express()
app.use(cors())

app.get('/.well-known/appspecific/com.chrome.devtools.json', (_req, res) => {
  res.status(204).end()
})

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    message: 'Activity tracker backend is running',
    health: '/health',
  })
})

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
})

const emitSnapshot = async () => {
  const snapshot = await getSnapshot()
  io.emit('state:update', snapshot)
}

io.on('connection', async (socket) => {
  socket.emit('state:update', await getSnapshot())

  socket.on('activity:create', async (payload, callback) => {
    try {
      const name = `${payload?.name || ''}`.trim()
      const score = Number(payload?.score)
      const category = `${payload?.category || ''}`.trim() || null

      if (!name) {
        throw new Error('Activity name is required')
      }

      if (!Number.isFinite(score) || score < 0) {
        throw new Error('Score must be a non-negative number')
      }

      const stamp = dayjs().toISOString()
      const result = await run(
        `
        INSERT INTO activities(name, score, category, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?)
      `,
        [name, score, category, stamp, stamp],
      )

      await upsertTodayCount(result.lastID, 0)
      await emitSnapshot()
      callback?.({ ok: true })
    } catch (error) {
      callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('activity:rename', async (payload, callback) => {
    try {
      const id = Number(payload?.id)
      const name = `${payload?.name || ''}`.trim()

      if (!id || !name) {
        throw new Error('Valid id and name are required')
      }

      const stamp = dayjs().toISOString()
      const result = await run(
        `UPDATE activities SET name = ?, updated_at = ? WHERE id = ?`,
        [name, stamp, id],
      )

      if (!result.changes) {
        throw new Error('Activity not found')
      }

      await emitSnapshot()
      callback?.({ ok: true })
    } catch (error) {
      callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('activity:update-category', async (payload, callback) => {
    try {
      const id = Number(payload?.id)
      const category = `${payload?.category || ''}`.trim() || null

      if (!id) {
        throw new Error('Valid id is required')
      }

      const found = await get(`SELECT id, category FROM activities WHERE id = ?`, [id])

      if (!found) {
        throw new Error('Activity not found')
      }

      if (found.category === category) {
        callback?.({ ok: true })
        return
      }

      const stamp = dayjs().toISOString()
      const result = await run(
        `UPDATE activities SET category = ?, updated_at = ? WHERE id = ?`,
        [category, stamp, id],
      )

      if (!result.changes) {
        throw new Error('Activity not found')
      }

      await emitSnapshot()
      callback?.({ ok: true })
    } catch (error) {
      callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('activity:update-score', async (payload, callback) => {
    try {
      const id = Number(payload?.id)
      const score = Number(payload?.score)

      if (!id || !Number.isFinite(score) || score < 0) {
        throw new Error('Valid id and non-negative score are required')
      }

      const stamp = dayjs().toISOString()
      const result = await run(
        `UPDATE activities SET score = ?, updated_at = ? WHERE id = ?`,
        [score, stamp, id],
      )

      if (!result.changes) {
        throw new Error('Activity not found')
      }

      await emitSnapshot()
      callback?.({ ok: true })
    } catch (error) {
      callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('activity:update-today-count', async (payload, callback) => {
    try {
      const id = Number(payload?.id)
      const count = Number(payload?.count)

      if (!id || !Number.isFinite(count) || count < 0) {
        throw new Error('Valid id and non-negative count are required')
      }

      const found = await get(`SELECT id FROM activities WHERE id = ?`, [id])

      if (!found) {
        throw new Error('Activity not found')
      }

      await upsertTodayCount(id, count)
      await emitSnapshot()
      callback?.({ ok: true })
    } catch (error) {
      callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('activity:delete', async (payload, callback) => {
    try {
      const id = Number(payload?.id)

      if (!id) {
        throw new Error('Valid id is required')
      }

      const result = await run(`DELETE FROM activities WHERE id = ?`, [id])

      if (!result.changes) {
        throw new Error('Activity not found')
      }

      await emitSnapshot()
      callback?.({ ok: true })
    } catch (error) {
      callback?.({ ok: false, error: error.message })
    }
  })
})

initDb()
  .then(() => {
    httpServer.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Server running on http://localhost:${PORT}`)
    })
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize database', error)
    process.exit(1)
  })
