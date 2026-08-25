# Uptime Monitor

A lightweight website uptime monitoring service built on **Cloudflare Workers** and **D1** (SQLite at the edge).

- Checks all active monitors every **5 minutes** via a cron trigger
- Stores HTTP status, latency, and errors in D1
- Serves a live **status dashboard** at `/`
- Exposes a small **JSON REST API** under `/api/`

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| Scheduling | Cloudflare Cron Triggers |
| Language | TypeScript |

---

## Getting started

### 1. Prerequisites

- [Node.js](https://nodejs.org) ≥ 18
- [pnpm](https://pnpm.io) (or npm/yarn)
- A Cloudflare account with Workers + D1 access

### 2. Create the D1 database

```bash
npx wrangler d1 create uptime-monitor-db
```

Copy the `database_id` from the output and paste it into `wrangler.json`:

```json
{
  "d1_databases": [{
    "binding": "DB",
    "database_id": "<your-database-id>",
    "database_name": "uptime-monitor-db"
  }]
}
```

### 3. Install dependencies

```bash
pnpm install
```

### 4. Run locally

```bash
pnpm dev
```

This applies migrations to a local D1 replica and starts `wrangler dev`.  
Open [http://localhost:8787](http://localhost:8787) to see the dashboard.

### 5. Deploy

```bash
pnpm deploy
```

This automatically applies the migrations to the remote D1 database before deploying.

---

## Project structure

```
src/
  index.ts       — Worker entry point (HTTP router + cron handler)
  db.ts          — Typed D1 helpers (monitors & checks)
  checker.ts     — HTTP check logic with timeout handling
  dashboard.ts   — HTML dashboard renderer (no client-side JS)

migrations/
  0001_create_uptime_tables.sql   — monitors + checks schema + seed data
```

---

## HTTP routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Status dashboard |
| `GET` | `/add` | Add-monitor form |
| `POST` | `/add` | Create monitor (form submit) |
| `GET` | `/monitors/:id` | Monitor detail + recent checks |
| `POST` | `/monitors/:id/delete` | Delete a monitor |
| `POST` | `/monitors/:id/toggle` | Pause / resume a monitor |

## REST API

| Method | Path | Body / Response |
|---|---|---|
| `GET` | `/api/monitors` | Array of monitor stats |
| `POST` | `/api/monitors` | `{ name, url, interval? }` → created monitor |
| `DELETE` | `/api/monitors/:id` | `{ deleted: id }` |
| `GET` | `/api/monitors/:id/checks` | Last 50 check results |

---

## Cron schedule

The cron `*/5 * * * *` fires every 5 minutes and runs HTTP checks against all active monitors in parallel.  
You can change the interval in `wrangler.json` under `triggers.crons`.

---

## License

MIT
