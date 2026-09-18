/**
 * Domain types for the live monitoring feed.
 *
 * `MonitoringEvent` is the *trusted, validated* shape the rest of the app
 * consumes. Raw data off the wire is `unknown` until it passes
 * `parseStreamMessage` in `utils/validate.ts` — nothing downstream ever
 * touches unvalidated stream data.
 */

export type ConnectionStatus =
  | "connecting"
  | "live"
  | "paused"
  | "reconnecting"
  | "error";

export type ServiceStatus = "ok" | "degraded" | "down";

export type EventSeverity = "info" | "warning" | "error" | "critical";

export interface MonitoringEvent {
  id: string;
  timestamp: number;
  service: string;
  status: ServiceStatus;
  severity: EventSeverity;
  message: string;
  latencyMs: number;
}

export interface MetricPoint {
  timestamp: number;
  value: number;
}

export interface StreamStats {
  totalReceived: number;
  malformedDropped: number;
  reconnectAttempt: number;
}
