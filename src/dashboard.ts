// ---------------------------------------------------------------------------
// HTML dashboard renderer
// ---------------------------------------------------------------------------

import type { MonitorStats } from "./db";

function statusBadge(stats: MonitorStats): string {
  const last = stats.lastCheck;
  if (!last) return `<span class="badge badge-unknown">No data</span>`;
  return last.status === "up"
    ? `<span class="badge badge-up">UP</span>`
    : `<span class="badge badge-down">DOWN</span>`;
}

function uptimeBar(pct: number): string {
  const color =
    pct >= 99 ? "#22c55e" : pct >= 95 ? "#f59e0b" : "#ef4444";
  return `
    <div class="uptime-bar-wrap" title="${pct}% uptime (24h)">
      <div class="uptime-bar-fill" style="width:${pct}%;background:${color}"></div>
    </div>`;
}

function monitorRow(s: MonitorStats): string {
  const latency =
    s.avgLatency != null ? `${s.avgLatency} ms` : "—";
  const checkedAt = s.lastCheck
    ? new Date(s.lastCheck.checked_at + "Z").toUTCString()
    : "Never";
  return `
  <tr>
    <td>
      <a href="/monitors/${s.monitor.id}" class="monitor-name">${esc(s.monitor.name)}</a>
      <br><small class="url">${esc(s.monitor.url)}</small>
    </td>
    <td class="center">${statusBadge(s)}</td>
    <td class="center">${uptimeBar(s.uptimePct)} ${s.uptimePct}%</td>
    <td class="center">${latency}</td>
    <td class="right"><small>${checkedAt}</small></td>
  </tr>`;
}

export function renderDashboard(stats: MonitorStats[]): string {
  const allUp = stats.every((s) => s.lastCheck?.status === "up");
  const headerColor = allUp ? "#22c55e" : "#ef4444";
  const headerMsg = allUp
    ? "All systems operational"
    : "Some monitors are down";

  const rows = stats.length
    ? stats.map(monitorRow).join("\n")
    : `<tr><td colspan="5" class="center muted">No monitors yet. Add one via the API.</td></tr>`;

  return html(`
    <div class="status-header" style="border-color:${headerColor}">
      <span class="dot" style="background:${headerColor}"></span>
      ${headerMsg}
    </div>

    <div class="card">
      <div class="card-header">
        <h2>Monitors</h2>
        <a href="/add" class="btn">+ Add monitor</a>
      </div>
      <table>
        <thead>
          <tr>
            <th>Name / URL</th>
            <th class="center">Status</th>
            <th class="center">Uptime (24h)</th>
            <th class="center">Avg latency</th>
            <th class="right">Last checked</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `, "Dashboard");
}

export function renderMonitorDetail(
  s: MonitorStats,
  checks: import("./db").Check[]
): string {
  const rows = checks
    .map((c) => {
      const ts = new Date(c.checked_at + "Z").toUTCString();
      const statusCell =
        c.status === "up"
          ? `<td class="center"><span class="badge badge-up">UP</span></td>`
          : `<td class="center"><span class="badge badge-down">DOWN</span></td>`;
      return `<tr>
        <td><small>${ts}</small></td>
        ${statusCell}
        <td class="center">${c.status_code ?? "—"}</td>
        <td class="center">${c.latency_ms != null ? c.latency_ms + " ms" : "—"}</td>
        <td>${c.error ? esc(c.error) : "—"}</td>
      </tr>`;
    })
    .join("\n");

  return html(`
    <p><a href="/">&larr; Back to dashboard</a></p>
    <div class="card">
      <div class="card-header">
        <div>
          <h2>${esc(s.monitor.name)}</h2>
          <small class="url"><a href="${esc(s.monitor.url)}" target="_blank" rel="noopener">${esc(s.monitor.url)}</a></small>
        </div>
        <div style="text-align:right">
          ${statusBadge(s)}
          <br><small>Uptime (24h): <strong>${s.uptimePct}%</strong></small>
          <br><small>Avg latency: <strong>${s.avgLatency != null ? s.avgLatency + " ms" : "—"}</strong></small>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Time (UTC)</th>
            <th class="center">Status</th>
            <th class="center">HTTP code</th>
            <th class="center">Latency</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="5" class="center muted">No checks recorded yet.</td></tr>'}</tbody>
      </table>
    </div>
  `, esc(s.monitor.name));
}

export function renderAddForm(error?: string): string {
  return html(`
    <p><a href="/">&larr; Back to dashboard</a></p>
    <div class="card" style="max-width:480px;margin:0 auto">
      <div class="card-header"><h2>Add monitor</h2></div>
      ${error ? `<p class="error">${esc(error)}</p>` : ""}
      <form method="POST" action="/add">
        <label>
          Name
          <input type="text" name="name" required placeholder="My Website" />
        </label>
        <label>
          URL
          <input type="url" name="url" required placeholder="https://example.com" />
        </label>
        <label>
          Check interval (minutes)
          <input type="number" name="interval" value="5" min="1" max="60" />
        </label>
        <button type="submit" class="btn" style="width:100%;margin-top:8px">Add monitor</button>
      </form>
    </div>
  `, "Add monitor");
}

// ---------------------------------------------------------------------------
// Shared HTML shell
// ---------------------------------------------------------------------------

function html(body: string, title = "Uptime Monitor"): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title} — Uptime Monitor</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a; color: #e2e8f0; min-height: 100vh;
    }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }

    header {
      background: #1e293b; border-bottom: 1px solid #334155;
      padding: 0 24px; display: flex; align-items: center;
      justify-content: space-between; height: 56px;
    }
    header .brand { font-weight: 700; font-size: 1.1rem; color: #f1f5f9; }
    header .brand span { color: #60a5fa; }

    main { max-width: 1100px; margin: 32px auto; padding: 0 16px; }

    .status-header {
      display: flex; align-items: center; gap: 10px;
      background: #1e293b; border: 1px solid; border-radius: 10px;
      padding: 16px 20px; margin-bottom: 24px; font-weight: 600;
    }
    .dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }

    .card {
      background: #1e293b; border: 1px solid #334155;
      border-radius: 10px; overflow: hidden; margin-bottom: 24px;
    }
    .card-header {
      padding: 16px 20px; border-bottom: 1px solid #334155;
      display: flex; align-items: center; justify-content: space-between;
    }
    .card-header h2 { font-size: 1rem; font-weight: 600; color: #f1f5f9; }

    table { width: 100%; border-collapse: collapse; }
    th, td {
      padding: 12px 16px; font-size: 0.875rem;
      border-bottom: 1px solid #1e3a4f;
    }
    th { font-weight: 500; color: #94a3b8; text-align: left; }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr:hover { background: rgba(255,255,255,0.03); }
    .center { text-align: center; }
    .right  { text-align: right; }

    .monitor-name { color: #f1f5f9; font-weight: 500; }
    .url { color: #64748b; font-size: 0.75rem; }
    .muted { color: #64748b; padding: 24px; }

    .badge {
      display: inline-block; padding: 2px 10px; border-radius: 9999px;
      font-size: 0.7rem; font-weight: 700; letter-spacing: 0.05em;
    }
    .badge-up      { background: #14532d; color: #86efac; }
    .badge-down    { background: #7f1d1d; color: #fca5a5; }
    .badge-unknown { background: #1e293b; color: #94a3b8; border: 1px solid #334155; }

    .uptime-bar-wrap {
      background: #0f172a; border-radius: 4px; height: 6px;
      overflow: hidden; margin-bottom: 4px;
    }
    .uptime-bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }

    .btn {
      display: inline-block; padding: 6px 14px; border-radius: 6px;
      background: #2563eb; color: #fff; font-size: 0.875rem;
      font-weight: 500; border: none; cursor: pointer;
    }
    .btn:hover { background: #1d4ed8; text-decoration: none; }

    label { display: block; margin-bottom: 14px; font-size: 0.875rem; color: #94a3b8; }
    label input {
      display: block; width: 100%; margin-top: 4px; padding: 8px 12px;
      background: #0f172a; border: 1px solid #334155; border-radius: 6px;
      color: #e2e8f0; font-size: 0.9rem;
    }
    label input:focus { outline: none; border-color: #2563eb; }
    form { padding: 20px; }

    .error {
      margin: 0 20px; padding: 10px 14px; background: #7f1d1d;
      border-radius: 6px; color: #fca5a5; font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <header>
    <a href="/" class="brand">&#9654; <span>Uptime</span>Monitor</a>
    <small style="color:#64748b">Powered by Cloudflare Workers + D1</small>
  </header>
  <main>${body}</main>
</body>
</html>`;
}

/** Minimal HTML-escape to prevent XSS in user-supplied strings. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
