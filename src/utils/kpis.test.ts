import { describe, expect, it } from "vitest";
import { computeKpis } from "./kpis";
import type { MonitoringEvent } from "../types/event";

function makeEvent(overrides: Partial<MonitoringEvent>): MonitoringEvent {
  return {
    id: "id",
    timestamp: Date.now(),
    service: "api-gateway",
    status: "ok",
    severity: "info",
    message: "ok",
    latencyMs: 100,
    ...overrides,
  };
}

describe("computeKpis", () => {
  it("returns zeroed values for an empty feed", () => {
    const kpis = computeKpis([]);
    expect(kpis).toMatchObject({ total: 0, okCount: 0, degradedCount: 0, downCount: 0, avgLatencyMs: 0 });
  });

  it("counts statuses and averages latency", () => {
    const events = [
      makeEvent({ status: "ok", latencyMs: 100 }),
      makeEvent({ status: "ok", latencyMs: 200 }),
      makeEvent({ status: "degraded", latencyMs: 300 }),
      makeEvent({ status: "down", latencyMs: 0 }),
    ];
    const kpis = computeKpis(events, events[0].timestamp);
    expect(kpis.total).toBe(4);
    expect(kpis.okCount).toBe(2);
    expect(kpis.degradedCount).toBe(1);
    expect(kpis.downCount).toBe(1);
    expect(kpis.avgLatencyMs).toBe(150);
  });

  it("only counts events within the last 10s toward throughput", () => {
    const now = 1_000_000;
    const events = [
      makeEvent({ timestamp: now - 1000 }),
      makeEvent({ timestamp: now - 5000 }),
      makeEvent({ timestamp: now - 20_000 }), // outside the 10s window
    ];
    const kpis = computeKpis(events, now);
    expect(kpis.eventsPerSecond).toBeCloseTo(2 / 10, 5);
  });
});
