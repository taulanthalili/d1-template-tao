// ---------------------------------------------------------------------------
// HTTP check logic — fetches a URL and returns status + latency
// ---------------------------------------------------------------------------

import { getMonitors, saveCheck } from "./db";

export interface CheckResult {
  status: "up" | "down";
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
}

/**
 * Fetch a single URL with a 10-second timeout and measure latency.
 */
export async function checkUrl(url: string): Promise<CheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  const start = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "UptimeMonitor/1.0" },
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - start;
    const up = response.status < 500;
    return {
      status: up ? "up" : "down",
      statusCode: response.status,
      latencyMs,
      error: null,
    };
  } catch (err: unknown) {
    clearTimeout(timeout);
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Timeout after 10s"
          : err.message
        : String(err);
    return {
      status: "down",
      statusCode: null,
      latencyMs: Date.now() - start,
      error: message,
    };
  }
}

/**
 * Run checks for all active monitors and persist results to D1.
 * Called by the Worker's `scheduled` handler.
 */
export async function runAllChecks(db: D1Database): Promise<void> {
  const monitors = await getMonitors(db);
  const active = monitors.filter((m) => m.active === 1);

  await Promise.allSettled(
    active.map(async (monitor) => {
      const result = await checkUrl(monitor.url);
      await saveCheck(
        db,
        monitor.id,
        result.status,
        result.statusCode,
        result.latencyMs,
        result.error
      );
      console.log(
        `[check] ${monitor.name} (${monitor.url}) → ${result.status} ` +
          `${result.statusCode ?? ""} ${result.latencyMs ?? ""}ms`
      );
    })
  );
}
