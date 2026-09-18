import { memo } from "react";
import type { ConnectionStatus, ServiceStatus } from "../types/event";
import "./ConnectionBar.css";

export type StatusFilter = ServiceStatus | "all";
export type TimeWindow = "30s" | "60s" | "5m" | "all";

interface ConnectionBarProps {
  status: ConnectionStatus;
  reconnectAttempt: number;
  isPaused: boolean;
  onTogglePause: () => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  timeWindow: TimeWindow;
  onTimeWindowChange: (value: TimeWindow) => void;
  malformedDropped: number;
  totalReceived: number;
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  live: "Live",
  paused: "Paused",
  reconnecting: "Reconnecting…",
  error: "Error",
};

/**
 * Status/controls chrome. Receives only primitives and stable callback
 * refs from `App` (all wrapped in `useCallback`), and is wrapped in
 * `memo` itself, so it does not re-render on every incoming event —
 * only when connection status, filters, or the low-frequency counters
 * actually change.
 */
function ConnectionBarImpl({
  status,
  reconnectAttempt,
  isPaused,
  onTogglePause,
  statusFilter,
  onStatusFilterChange,
  timeWindow,
  onTimeWindowChange,
  malformedDropped,
  totalReceived,
}: ConnectionBarProps) {
  return (
    <div className="connection-bar">
      <div className="connection-bar__status">
        <span className={`status-pill status-pill--${status}`}>
          <span className="status-pill__dot" aria-hidden />
          {STATUS_LABEL[status]}
          {status === "reconnecting" && reconnectAttempt > 0 && (
            <span className="status-pill__attempt"> (attempt {reconnectAttempt})</span>
          )}
        </span>
        <span className="connection-bar__meta">
          {totalReceived.toLocaleString()} received
          {malformedDropped > 0 && ` · ${malformedDropped.toLocaleString()} rejected`}
        </span>
      </div>

      <div className="connection-bar__controls">
        <label className="connection-bar__field">
          <span>Status</span>
          <select value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value as StatusFilter)}>
            <option value="all">All</option>
            <option value="ok">OK</option>
            <option value="degraded">Degraded</option>
            <option value="down">Down</option>
          </select>
        </label>

        <label className="connection-bar__field">
          <span>Window</span>
          <select value={timeWindow} onChange={(e) => onTimeWindowChange(e.target.value as TimeWindow)}>
            <option value="30s">Last 30s</option>
            <option value="60s">Last 60s</option>
            <option value="5m">Last 5m</option>
            <option value="all">All buffered</option>
          </select>
        </label>

        <button
          type="button"
          className={`pause-button${isPaused ? " pause-button--paused" : ""}`}
          onClick={onTogglePause}
        >
          {isPaused ? "▶ Resume" : "⏸ Pause"}
        </button>
      </div>
    </div>
  );
}

export const ConnectionBar = memo(ConnectionBarImpl);
