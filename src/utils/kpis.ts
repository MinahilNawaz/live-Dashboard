import type { MonitoringEvent } from "../types/event";

export interface Kpis {
  total: number;
  okCount: number;
  degradedCount: number;
  downCount: number;
  avgLatencyMs: number;
  eventsPerSecond: number;
}

const RECENT_WINDOW_MS = 10_000;

/** Pure aggregation over the (already filtered) event slice — no side
 * effects, no dependency on React, so it's trivially unit-testable and
 * safe to call from a `useMemo`. */
export function computeKpis(events: MonitoringEvent[], nowMs: number = Date.now()): Kpis {
  let okCount = 0;
  let degradedCount = 0;
  let downCount = 0;
  let latencySum = 0;
  let recentCount = 0;

  for (const event of events) {
    if (event.status === "ok") okCount += 1;
    else if (event.status === "degraded") degradedCount += 1;
    else downCount += 1;

    latencySum += event.latencyMs;
    if (nowMs - event.timestamp <= RECENT_WINDOW_MS) recentCount += 1;
  }

  return {
    total: events.length,
    okCount,
    degradedCount,
    downCount,
    avgLatencyMs: events.length ? latencySum / events.length : 0,
    eventsPerSecond: recentCount / (RECENT_WINDOW_MS / 1000),
  };
}
