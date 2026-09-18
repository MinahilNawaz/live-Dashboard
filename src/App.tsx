import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useLiveStream } from "./hooks/useLiveStream";
import { computeKpis } from "./utils/kpis";
import { randomId } from "./utils/helpers";
import { getAuthToken, setAuthToken } from "./services/authToken";
import { ConnectionBar, type StatusFilter, type TimeWindow } from "./components/ConnectionBar";
import { KpiCards } from "./components/KpiCards";
import { LiveChart } from "./components/LiveChart";
import { EventsList } from "./components/EventsList";
import { Loading } from "./components/Loading";
import { SettingsPanel } from "./components/SettingsPanel";
import { ErrorFallback } from "./components/ErrorFallback";
import type { MonitoringEvent, MetricPoint } from "./types/event";
import "./App.css";

const WINDOW_MS: Record<Exclude<TimeWindow, "all">, number> = {
  "30s": 30_000,
  "60s": 60_000,
  "5m": 5 * 60_000,
};

function withinWindow(timestamp: number, window: TimeWindow, now: number): boolean {
  if (window === "all") return true;
  return now - timestamp <= WINDOW_MS[window];
}

export default function App() {
  // Auth token lives only in memory (see services/authToken.ts) and is
  // never logged; in a real deployment this would come from your auth
  // flow (e.g. a short-lived session token), not be generated client-side.
  useEffect(() => {
    setAuthToken(`demo-${randomId()}`);
    return () => setAuthToken(undefined);
  }, []);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("all");
  const [flushIntervalMs, setFlushIntervalMs] = useState(250);
  const [maxEvents, setMaxEvents] = useState(200);
  const [maxPoints, setMaxPoints] = useState(120);

  const { status, events, points, stats, pause, resume } = useLiveStream({
    flushIntervalMs,
    maxEvents,
    maxPoints,
    getAuthToken,
  });

  const isPaused = status === "paused";
  const handleTogglePause = useCallback(() => {
    if (isPaused) resume();
    else pause();
  }, [isPaused, pause, resume]);

  const filteredEvents = useMemo<MonitoringEvent[]>(() => {
    const now = Date.now();
    return events.filter(
      (e) => (statusFilter === "all" || e.status === statusFilter) && withinWindow(e.timestamp, timeWindow, now),
    );
  }, [events, statusFilter, timeWindow]);

  const filteredPoints = useMemo<MetricPoint[]>(() => {
    const now = Date.now();
    return points.filter((p) => withinWindow(p.timestamp, timeWindow, now));
  }, [points, timeWindow]);

  const kpis = useMemo(() => computeKpis(filteredEvents), [filteredEvents]);

  const hasAnyData = stats.totalReceived > 0;
  const showInitialLoading = status === "connecting" && !hasAnyData;

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>Live Monitoring Dashboard</h1>
          <p>Real-time service health, latency, and event stream.</p>
        </div>
      </header>

      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <main className="app__main">
          <ConnectionBar
            status={status}
            reconnectAttempt={stats.reconnectAttempt}
            isPaused={isPaused}
            onTogglePause={handleTogglePause}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            timeWindow={timeWindow}
            onTimeWindowChange={setTimeWindow}
            malformedDropped={stats.malformedDropped}
            totalReceived={stats.totalReceived}
          />

          <SettingsPanel
            flushIntervalMs={flushIntervalMs}
            onFlushIntervalChange={setFlushIntervalMs}
            maxEvents={maxEvents}
            onMaxEventsChange={setMaxEvents}
            maxPoints={maxPoints}
            onMaxPointsChange={setMaxPoints}
          />

          {showInitialLoading ? (
            <Loading />
          ) : (
            <>
              <KpiCards kpis={kpis} />

              <div className="app__grid">
                <section className="app__panel app__panel--chart">
                  <LiveChart points={filteredPoints} label="Latency (ms)" />
                </section>

                <section className="app__panel app__panel--events">
                  <div className="app__panel-header">
                    <h3>Recent events</h3>
                    <span className="app__panel-count">{filteredEvents.length}</span>
                  </div>
                  <EventsList events={filteredEvents} />
                </section>
              </div>
            </>
          )}
        </main>
      </ErrorBoundary>

      <footer className="app__footer">
        <span>Buffer: {maxEvents} events / {maxPoints} points · Flush every {flushIntervalMs}ms</span>
      </footer>
    </div>
  );
}
