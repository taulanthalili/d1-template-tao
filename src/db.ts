// ---------------------------------------------------------------------------
// Typed D1 helpers for the uptime monitor
// ---------------------------------------------------------------------------

export interface Monitor {
  id: number;
  name: string;
  url: string;
  interval: number; // minutes
  active: number;   // 1 | 0
  created_at: string;
}

export interface Check {
  id: number;
  monitor_id: number;
  status: "up" | "down";
  status_code: number | null;
  latency_ms: number | null;
  error: string | null;
  checked_at: string;
}

export interface MonitorStats {
  monitor: Monitor;
  lastCheck: Check | null;
  uptimePct: number;      // last 24 h, 0–100
  avgLatency: number | null;
  totalChecks: number;
}

// ---------------------------------------------------------------------------
// Monitors
// ---------------------------------------------------------------------------

export async function getMonitors(db: D1Database): Promise<Monitor[]> {
  const result = await db
    .prepare("SELECT * FROM monitors ORDER BY name ASC")
    .all<Monitor>();
  return result.results;
}

export async function getMonitor(
  db: D1Database,
  id: number
): Promise<Monitor | null> {
  const result = await db
    .prepare("SELECT * FROM monitors WHERE id = ?")
    .bind(id)
    .first<Monitor>();
  return result ?? null;
}

export async function createMonitor(
  db: D1Database,
  name: string,
  url: string,
  interval = 5
): Promise<Monitor> {
  const result = await db
    .prepare(
      "INSERT INTO monitors (name, url, interval) VALUES (?, ?, ?) RETURNING *"
    )
    .bind(name, url, interval)
    .first<Monitor>();
  if (!result) throw new Error("Failed to create monitor");
  return result;
}

export async function deleteMonitor(
  db: D1Database,
  id: number
): Promise<void> {
  await db.prepare("DELETE FROM monitors WHERE id = ?").bind(id).run();
}

export async function toggleMonitor(
  db: D1Database,
  id: number,
  active: 0 | 1
): Promise<void> {
  await db
    .prepare("UPDATE monitors SET active = ? WHERE id = ?")
    .bind(active, id)
    .run();
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export async function saveCheck(
  db: D1Database,
  monitorId: number,
  status: "up" | "down",
  statusCode: number | null,
  latencyMs: number | null,
  error: string | null
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO checks (monitor_id, status, status_code, latency_ms, error)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(monitorId, status, statusCode, latencyMs, error)
    .run();
}

export async function getRecentChecks(
  db: D1Database,
  monitorId: number,
  limit = 50
): Promise<Check[]> {
  const result = await db
    .prepare(
      `SELECT * FROM checks WHERE monitor_id = ?
       ORDER BY checked_at DESC LIMIT ?`
    )
    .bind(monitorId, limit)
    .all<Check>();
  return result.results;
}

/** Aggregate stats for every active monitor, used by the dashboard. */
export async function getMonitorStats(
  db: D1Database
): Promise<MonitorStats[]> {
  const monitors = await getMonitors(db);

  const stats: MonitorStats[] = await Promise.all(
    monitors.map(async (monitor) => {
      const lastCheck = await db
        .prepare(
          `SELECT * FROM checks WHERE monitor_id = ?
           ORDER BY checked_at DESC LIMIT 1`
        )
        .bind(monitor.id)
        .first<Check>() ?? null;

      const agg = await db
        .prepare(
          `SELECT
             COUNT(*)                                        AS total,
             SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) AS up_count,
             AVG(CASE WHEN status = 'up' THEN latency_ms END) AS avg_latency
           FROM checks
           WHERE monitor_id = ?
             AND checked_at >= datetime('now', '-24 hours')`
        )
        .bind(monitor.id)
        .first<{ total: number; up_count: number; avg_latency: number | null }>();

      const total = agg?.total ?? 0;
      const upCount = agg?.up_count ?? 0;

      return {
        monitor,
        lastCheck,
        uptimePct: total > 0 ? Math.round((upCount / total) * 100) : 100,
        avgLatency: agg?.avg_latency != null ? Math.round(agg.avg_latency) : null,
        totalChecks: total,
      };
    })
  );

  return stats;
}
