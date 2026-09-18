import type { ConnectionStatus } from "../types/event";
import { computeBackoffDelay, randomId } from "../utils/helpers";

type Unsubscribe = () => void;

/**
 * Transport-agnostic contract for "something that streams raw messages".
 * The rest of the app (the `useLiveStream` hook) only ever talks to this
 * interface, never to a concrete WebSocket/EventSource/timer. That's what
 * lets connection handling live in one place instead of being scattered
 * through UI components, and lets a real backend be swapped in later
 * (see `WebSocketStreamClient` below) with zero changes elsewhere.
 */
export interface StatusInfo {
  /** Reconnect attempt number this status corresponds to (0 when live/idle). */
  attempt: number;
}

export interface StreamClient {
  connect(): void;
  disconnect(): void;
  pause(): void;
  resume(): void;
  onStatus(cb: (status: ConnectionStatus, info: StatusInfo) => void): Unsubscribe;
  /** `raw` is an untrusted, unparsed payload — always a string. */
  onMessage(cb: (raw: string) => void): Unsubscribe;
}

export interface StreamClientOptions {
  /** Resolves an auth token at connect time. Kept only in closure/memory —
   * never persisted, logged, or put in a URL. Pass `undefined` for
   * unauthenticated streams. */
  getAuthToken?: () => string | undefined;
  maxBackoffMs?: number;
}

const SERVICES = ["api-gateway", "auth", "billing", "search", "checkout", "notifications"] as const;
const STATUS_WEIGHTS: Array<[status: "ok" | "degraded" | "down", weight: number]> = [
  ["ok", 82],
  ["degraded", 14],
  ["down", 4],
];

function weightedStatus(): "ok" | "degraded" | "down" {
  const total = STATUS_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [status, weight] of STATUS_WEIGHTS) {
    if (roll < weight) return status;
    roll -= weight;
  }
  return "ok";
}

function severityFor(status: "ok" | "degraded" | "down"): "info" | "warning" | "error" | "critical" {
  if (status === "ok") return Math.random() < 0.1 ? "info" : "info";
  if (status === "degraded") return Math.random() < 0.7 ? "warning" : "error";
  return Math.random() < 0.5 ? "error" : "critical";
}

const MESSAGES: Record<"ok" | "degraded" | "down", string[]> = {
  ok: ["heartbeat ok", "request served", "cache hit", "healthy check passed"],
  degraded: ["latency above p95 threshold", "retrying downstream call", "queue depth rising"],
  down: ["health check failed", "connection refused", "circuit breaker open"],
};

/** Builds one synthetic event as a JSON *string*, exactly as it would
 * arrive over a WebSocket — the hook must parse + validate it like any
 * other untrusted payload. Occasionally emits garbage to exercise the
 * validator's rejection path. */
function generateRawMessage(): string {
  const isMalformed = Math.random() < 0.02;
  if (isMalformed) {
    const variants = ["not json at all", "{\"id\": 1, \"broken\":", JSON.stringify({ unexpected: "shape" })];
    return variants[Math.floor(Math.random() * variants.length)];
  }

  const status = weightedStatus();
  const service = SERVICES[Math.floor(Math.random() * SERVICES.length)];
  const payload = {
    id: randomId(),
    timestamp: Date.now(),
    service,
    status,
    severity: severityFor(status),
    message: MESSAGES[status][Math.floor(Math.random() * MESSAGES[status].length)],
    latencyMs: status === "down" ? 0 : Math.round(20 + Math.random() * (status === "degraded" ? 800 : 180)),
  };
  return JSON.stringify(payload);
}

/**
 * Simulated live source: emits synthetic monitoring events on an interval
 * and occasionally drops the "connection" to exercise reconnect/backoff.
 * Stands in for a real WebSocket/SSE endpoint behind the same
 * `StreamClient` interface.
 */
export class SimulatedStreamClient implements StreamClient {
  private emitTimer: ReturnType<typeof setInterval> | null = null;
  private dropTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private destroyed = true;
  private paused = false;
  /** True once the (simulated) handshake has completed — distinct from
   * `paused`, so pause/resume requests made mid-connect or mid-reconnect
   * can be honoured correctly once the connection actually settles,
   * instead of racing a stale "live" status in behind them. */
  private connected = false;

  private statusListeners = new Set<(s: ConnectionStatus, info: StatusInfo) => void>();
  private messageListeners = new Set<(raw: string) => void>();

  constructor(
    private emitIntervalMs: number,
    private simulateDropEveryMs: number | null,
    private options: StreamClientOptions = {},
  ) {}

  onStatus(cb: (status: ConnectionStatus, info: StatusInfo) => void): Unsubscribe {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  onMessage(cb: (raw: string) => void): Unsubscribe {
    this.messageListeners.add(cb);
    return () => this.messageListeners.delete(cb);
  }

  connect(): void {
    this.destroyed = false;
    this.connected = false;
    this.setStatus("connecting");

    // A real handshake would send this token as the first message after
    // `open` (never as a URL query param, never logged). It's read here
    // purely to demonstrate that shape; the simulator ignores its value.
    void this.options.getAuthToken?.();

    this.connectTimer = setTimeout(() => {
      if (this.destroyed) return;
      this.attempt = 0;
      this.settleConnected();
    }, 350 + Math.random() * 350);
  }

  pause(): void {
    this.paused = true;
    if (this.destroyed) return;
    // Cancel any in-flight simulated drop so a flapping-connection cycle
    // can't silently flip the status back to "live" behind the pause.
    if (this.dropTimer) {
      clearTimeout(this.dropTimer);
      this.dropTimer = null;
    }
    if (this.emitTimer) {
      clearInterval(this.emitTimer);
      this.emitTimer = null;
    }
    if (this.connected) this.setStatus("paused");
  }

  resume(): void {
    if (this.destroyed) return;
    this.paused = false;
    if (this.connected) {
      this.startEmitting();
      this.setStatus("live");
      this.scheduleRandomDrop();
    }
  }

  disconnect(): void {
    this.destroyed = true;
    this.clearTimers();
    this.statusListeners.clear();
    this.messageListeners.clear();
  }

  private startEmitting(): void {
    if (this.emitTimer) clearInterval(this.emitTimer);
    this.emitTimer = setInterval(() => {
      if (this.paused || this.destroyed) return;
      const raw = generateRawMessage();
      this.messageListeners.forEach((cb) => cb(raw));
    }, this.emitIntervalMs);
  }

  private scheduleRandomDrop(): void {
    if (!this.simulateDropEveryMs) return;
    if (this.dropTimer) clearTimeout(this.dropTimer);
    this.dropTimer = setTimeout(
      () => {
        if (this.destroyed) return;
        this.handleDrop();
      },
      this.simulateDropEveryMs * (0.6 + Math.random() * 0.8),
    );
  }

  private handleDrop(): void {
    if (this.emitTimer) clearInterval(this.emitTimer);
    this.connected = false;
    this.attempt += 1;
    this.setStatus("reconnecting");

    const delay = computeBackoffDelay(this.attempt, 500, this.options.maxBackoffMs ?? 8000);
    this.reconnectTimer = setTimeout(() => {
      if (this.destroyed) return;
      this.attempt = 0;
      this.settleConnected();
    }, delay);
  }

  /** Called once a (re)connect handshake completes. Lands on "paused" or
   * "live" depending on whether a pause was requested while we were
   * mid-connect — a pause request never gets silently overwritten by a
   * connection event that happens to resolve after it. */
  private settleConnected(): void {
    this.connected = true;
    if (this.paused) {
      this.setStatus("paused");
      return;
    }
    this.startEmitting();
    this.setStatus("live");
    this.scheduleRandomDrop();
  }

  private setStatus(status: ConnectionStatus): void {
    this.statusListeners.forEach((cb) => cb(status, { attempt: this.attempt }));
  }

  private clearTimers(): void {
    if (this.emitTimer) clearInterval(this.emitTimer);
    if (this.dropTimer) clearTimeout(this.dropTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.emitTimer = this.dropTimer = this.reconnectTimer = this.connectTimer = null;
  }
}

/**
 * Real transport, same interface. Auth is sent as the first application
 * message after `open` — never in the URL (which can end up in proxy/
 * server access logs) and never logged client-side. Not wired up by
 * default since there's no live backend to point it at yet, but dropping
 * a `VITE_STREAM_WS_URL` env var into `.env.local` switches
 * `createStreamClient` over to this implementation with no changes
 * anywhere else in the app.
 */
export class WebSocketStreamClient implements StreamClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private destroyed = true;
  private paused = false;

  private statusListeners = new Set<(s: ConnectionStatus, info: StatusInfo) => void>();
  private messageListeners = new Set<(raw: string) => void>();

  constructor(
    private url: string,
    private options: StreamClientOptions = {},
  ) {}

  onStatus(cb: (status: ConnectionStatus, info: StatusInfo) => void): Unsubscribe {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  onMessage(cb: (raw: string) => void): Unsubscribe {
    this.messageListeners.add(cb);
    return () => this.messageListeners.delete(cb);
  }

  connect(): void {
    this.destroyed = false;
    this.setStatus(this.attempt > 0 ? "reconnecting" : "connecting");

    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      if (this.destroyed) return;
      const token = this.options.getAuthToken?.();
      if (token) {
        socket.send(JSON.stringify({ type: "auth", token }));
      }
      this.attempt = 0;
      this.setStatus(this.paused ? "paused" : "live");
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      if (this.paused || this.destroyed) return;
      this.messageListeners.forEach((cb) => cb(event.data));
    };

    socket.onerror = () => {
      // Never log the event object — it can carry connection/auth detail.
      if (!this.destroyed) this.setStatus("error");
    };

    socket.onclose = () => {
      if (this.destroyed) return;
      this.scheduleReconnect();
    };
  }

  pause(): void {
    this.paused = true;
    if (!this.destroyed) this.setStatus("paused");
  }

  resume(): void {
    if (this.destroyed) return;
    this.paused = false;
    this.setStatus(this.socket?.readyState === WebSocket.OPEN ? "live" : "reconnecting");
  }

  disconnect(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
    this.statusListeners.clear();
    this.messageListeners.clear();
  }

  private setStatus(status: ConnectionStatus): void {
    this.statusListeners.forEach((cb) => cb(status, { attempt: this.attempt }));
  }

  private scheduleReconnect(): void {
    this.attempt += 1;
    this.setStatus("reconnecting");
    const delay = computeBackoffDelay(this.attempt, 500, this.options.maxBackoffMs ?? 15_000);
    this.reconnectTimer = setTimeout(() => {
      if (this.destroyed) return;
      this.connect();
    }, delay);
  }
}

export interface CreateStreamClientOptions extends StreamClientOptions {
  emitIntervalMs?: number;
  simulateDropEveryMs?: number | null;
}

/** Picks the simulated or real client based on env config. */
export function createStreamClient(opts: CreateStreamClientOptions = {}): StreamClient {
  const wsUrl = import.meta.env.VITE_STREAM_WS_URL as string | undefined;
  if (wsUrl) {
    return new WebSocketStreamClient(wsUrl, opts);
  }
  return new SimulatedStreamClient(opts.emitIntervalMs ?? 40, opts.simulateDropEveryMs ?? 20_000, opts);
}
