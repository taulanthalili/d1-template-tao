// ---------------------------------------------------------------------------
// Uptime Monitor — Cloudflare Worker entry point
// ---------------------------------------------------------------------------
//
// Routes (HTTP):
//   GET  /                   → dashboard
//   GET  /monitors/:id       → monitor detail + recent checks
//   GET  /add                → add-monitor form
//   POST /add                → create monitor
//   POST /monitors/:id/delete → delete monitor
//   POST /monitors/:id/toggle → pause / resume monitor
//
// Cron (every 5 minutes):
//   runs all active monitor checks and stores results in D1
//
// REST JSON API (Content-Type: application/json):
//   GET  /api/monitors           → list monitors with stats
//   POST /api/monitors           → { name, url, interval? }
//   DELETE /api/monitors/:id     → delete monitor
//   GET  /api/monitors/:id/checks → recent checks (last 50)
// ---------------------------------------------------------------------------

import {
  createMonitor,
  deleteMonitor,
  getMonitor,
  getMonitorStats,
  getRecentChecks,
  toggleMonitor,
} from "./db";
import { runAllChecks } from "./checker";
import {
  renderAddForm,
  renderDashboard,
  renderMonitorDetail,
} from "./dashboard";

export default {
  // -------------------------------------------------------------------------
  // Scheduled handler — triggered by cron "*/5 * * * *"
  // -------------------------------------------------------------------------
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    await runAllChecks(env.DB);
  },

  // -------------------------------------------------------------------------
  // HTTP handler
  // -------------------------------------------------------------------------
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method.toUpperCase();
    const wantsJson =
      request.headers.get("Accept")?.includes("application/json") ||
      request.headers.get("Content-Type")?.includes("application/json");

    try {
      // -------------------------------------------------------------------
      // JSON REST API
      // -------------------------------------------------------------------
      if (pathname.startsWith("/api/")) {
        return handleApi(request, env, pathname, method);
      }

      // -------------------------------------------------------------------
      // GET /
      // -------------------------------------------------------------------
      if (pathname === "/" && method === "GET") {
        const stats = await getMonitorStats(env.DB);
        return html(renderDashboard(stats));
      }

      // -------------------------------------------------------------------
      // GET /add  — show form
      // POST /add — submit form
      // -------------------------------------------------------------------
      if (pathname === "/add" && method === "GET") {
        return html(renderAddForm());
      }

      if (pathname === "/add" && method === "POST") {
        const form = await request.formData();
        const name = (form.get("name") as string | null)?.trim() ?? "";
        const rawUrl = (form.get("url") as string | null)?.trim() ?? "";
        const interval = parseInt((form.get("interval") as string) ?? "5", 10);

        if (!name || !rawUrl) {
          return html(renderAddForm("Name and URL are required."));
        }
        try { new URL(rawUrl); } catch {
          return html(renderAddForm("Please enter a valid URL."));
        }

        await createMonitor(env.DB, name, rawUrl, isNaN(interval) ? 5 : interval);
        return Response.redirect(new URL("/", request.url).toString(), 303);
      }

      // -------------------------------------------------------------------
      // GET /monitors/:id
      // -------------------------------------------------------------------
      const detailMatch = pathname.match(/^\/monitors\/(\d+)$/);
      if (detailMatch && method === "GET") {
        const id = parseInt(detailMatch[1], 10);
        const stats = await getMonitorStats(env.DB);
        const s = stats.find((x) => x.monitor.id === id);
        if (!s) return notFound();
        const checks = await getRecentChecks(env.DB, id, 50);
        return html(renderMonitorDetail(s, checks));
      }

      // -------------------------------------------------------------------
      // POST /monitors/:id/delete
      // -------------------------------------------------------------------
      const deleteMatch = pathname.match(/^\/monitors\/(\d+)\/delete$/);
      if (deleteMatch && method === "POST") {
        const id = parseInt(deleteMatch[1], 10);
        await deleteMonitor(env.DB, id);
        return Response.redirect(new URL("/", request.url).toString(), 303);
      }

      // -------------------------------------------------------------------
      // POST /monitors/:id/toggle
      // -------------------------------------------------------------------
      const toggleMatch = pathname.match(/^\/monitors\/(\d+)\/toggle$/);
      if (toggleMatch && method === "POST") {
        const id = parseInt(toggleMatch[1], 10);
        const monitor = await getMonitor(env.DB, id);
        if (!monitor) return notFound();
        await toggleMonitor(env.DB, id, monitor.active === 1 ? 0 : 1);
        return Response.redirect(
          new URL(`/monitors/${id}`, request.url).toString(),
          303
        );
      }

      return notFound();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Worker error:", msg);
      if (wantsJson) {
        return json({ error: msg }, 500);
      }
      return new Response(`Internal error: ${msg}`, { status: 500 });
    }
  },
};

// ---------------------------------------------------------------------------
// JSON API routes
// ---------------------------------------------------------------------------

async function handleApi(
  request: Request,
  env: Env,
  pathname: string,
  method: string
): Promise<Response> {
  // GET /api/monitors
  if (pathname === "/api/monitors" && method === "GET") {
    const stats = await getMonitorStats(env.DB);
    return json(stats);
  }

  // POST /api/monitors
  if (pathname === "/api/monitors" && method === "POST") {
    const body = await request.json<{
      name: string;
      url: string;
      interval?: number;
    }>();
    if (!body.name || !body.url) {
      return json({ error: "name and url are required" }, 400);
    }
    try { new URL(body.url); } catch {
      return json({ error: "invalid url" }, 400);
    }
    const monitor = await createMonitor(
      env.DB,
      body.name,
      body.url,
      body.interval ?? 5
    );
    return json(monitor, 201);
  }

  // DELETE /api/monitors/:id
  const deletePath = pathname.match(/^\/api\/monitors\/(\d+)$/);
  if (deletePath && method === "DELETE") {
    const id = parseInt(deletePath[1], 10);
    await deleteMonitor(env.DB, id);
    return json({ deleted: id });
  }

  // GET /api/monitors/:id/checks
  const checksPath = pathname.match(/^\/api\/monitors\/(\d+)\/checks$/);
  if (checksPath && method === "GET") {
    const id = parseInt(checksPath[1], 10);
    const checks = await getRecentChecks(env.DB, id, 50);
    return json(checks);
  }

  return json({ error: "not found" }, 404);
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html;charset=UTF-8" },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}
