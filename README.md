# Activity Tracker

A real-time full-stack habit and activity tracker with scoring, category rollups, calendar history, and rank-based gamification effects.

## What This App Does

- Lets you create activities with:
  - name
  - score per completion
  - optional category
- Lets you update existing activities:
  - rename activity
  - change times done today
  - change score
  - change category
  - delete activity (with confirmation)
- Calculates points using:
  - `points = times today * score`
- Shows total points for today.
- Shows category score breakdown at the top (including `Uncategorized`).
- Shows calendar history by day.
- Lets you click any day to open a popup with:
  - total points for that day
  - category breakdown for that day
  - full activity-level breakdown
- Syncs updates live across clients with Socket.IO.
- Stores data in SQLite.

## Tech Stack

- Client: React + Vite
- Server: Node.js + Express + Socket.IO
- Database: SQLite
- Realtime transport: WebSocket (Socket.IO)

## Project Structure

- `client/` React frontend
- `server/` Express + Socket.IO backend
- `server/data/` local SQLite database file (ignored by git)

## Requirements

- Node.js 18+ recommended
- npm

## Setup

From the project root:

```bash
npm install
npm install --prefix client
npm install --prefix server
```

## Run In Development

From the project root:

```bash
npm run dev
```

This starts:

- backend on `http://localhost:3099`
- frontend dev server (Vite)

## Useful Scripts

From project root:

- `npm run dev` start server + client together
- `npm run dev:server` start only backend
- `npm run dev:client` start only frontend

From `client/`:

- `npm run build` production build
- `npm run preview` preview production build

From `server/`:

- `npm run dev` run backend with nodemon
- `npm run start` run backend with node

## Data Notes

- Activities can have a nullable category.
- Legacy activities without category are treated as `Uncategorized` in UI summaries.
- Category values are free-text and can be selected from existing categories via dropdown suggestions.

## API / Socket Events (High Level)

Client emits and server handles:

- `activity:create`
- `activity:rename`
- `activity:update-score`
- `activity:update-today-count`
- `activity:update-category`
- `activity:delete`

Server broadcasts:

- `state:update` full snapshot of activities/history

## License

ISC
