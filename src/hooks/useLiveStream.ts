import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { createStreamClient, type StreamClient } from "../services/streamClient";
import { parseStreamMessage } from "../utils/validate";
import { pushBounded } from "../utils/helpers";
import type { ConnectionStatus, MetricPoint, MonitoringEvent } from "../types/event";

export interface UseLiveStreamOptions {
  /** Max events kept in memory. Bounds memory under sustained load. */
  maxEvents?: number;
  /** Max chart points kept in memory. */
  maxPoints?: number;
  /** How often queued messages are flushed into React state. This is the
   * batching knob: raw messages can arrive every few ms, but state only
   * updates (and components only re-render) once per interval, however
   * many messages arrived in between. */
  flushIntervalMs?: number;
  /** Simulated per-message arrival rate (simulator only). */
  emitIntervalMs?: number;
  /** Simulated connection-drop interval, for exercising reconnection. */
  simulateDropEveryMs?: number | null;
  /** Resolves an auth token; kept in a ref, never logged. */
  getAuthToken?: () => string | undefined;
}

interface StreamState {
  status: ConnectionStatus;
  events: MonitoringEvent[];
  points: MetricPoint[];
  totalReceived: number;
  malformedDropped: number;
  reconnectAttempt: number;
  lastFlushSize: number;
}

type Action =
  | { type: "status"; status: ConnectionStatus; attempt: number }
  | { type: "flush"; events: MonitoringEvent[]; malformed: number; maxEvents: number; maxPoints: number };

function reducer(state: StreamState, action: Action): StreamState {
  switch (action.type) {
    case "status": {
      return { ...state, status: action.status, reconnectAttempt: action.attempt };
    }
    case "flush": {
      if (action.events.length === 0 && action.malformed === 0) return state;
      const newPoints: MetricPoint[] = action.events.map((e) => ({ timestamp: e.timestamp, value: e.latencyMs }));
      return {
        ...state,
        events: pushBounded(state.events, [...action.events].reverse(), action.maxEvents),
        points: pushBounded(state.points, newPoints, action.maxPoints),
        totalReceived: state.totalReceived + action.events.length,
        malformedDropped: state.malformedDropped + action.malformed,
        lastFlushSize: action.events.length,
      };
    }
    default:
      return state;
  }
}

const initialState: StreamState = {
  status: "connecting",
  events: [],
  points: [],
  totalReceived: 0,
  malformedDropped: 0,
  reconnectAttempt: 0,
  lastFlushSize: 0,
};

/**
 * Owns the live connection end-to-end: creates the transport, validates
 * every incoming message, batches updates into bounded buffers, and
 * exposes pause/resume. This is the single place connection + ingestion
 * logic lives — components only ever read the result.
 *
 * Performance: raw messages are pushed onto a plain array ref (`queueRef`)
 * as they arrive, which triggers no re-render at all. A separate timer
 * flushes that queue into reducer state at most once per `flushIntervalMs`,
 * so a burst of hundreds of messages between flushes collapses into a
 * single state update / re-render instead of hundreds.
 */
export function useLiveStream(options: UseLiveStreamOptions = {}) {
  const {
    maxEvents = 200,
    maxPoints = 120,
    flushIntervalMs = 250,
    emitIntervalMs = 40,
    simulateDropEveryMs = 20_000,
    getAuthToken,
  } = options;

  const [state, dispatch] = useReducer(reducer, initialState);

  const clientRef = useRef<StreamClient | null>(null);
  const queueRef = useRef<MonitoringEvent[]>([]);
  const malformedRef = useRef(0);
  const tokenGetterRef = useRef(getAuthToken);
  tokenGetterRef.current = getAuthToken;

  // Connection lifecycle. Intentionally does not depend on `flushIntervalMs`
  // so tuning the batching interval never tears down the socket.
  useEffect(() => {
    const client = createStreamClient({
      emitIntervalMs,
      simulateDropEveryMs,
      getAuthToken: () => tokenGetterRef.current?.(),
    });
    clientRef.current = client;

    const offStatus = client.onStatus((status, info) => dispatch({ type: "status", status, attempt: info.attempt }));
    const offMessage = client.onMessage((raw) => {
      const { event, reason } = parseStreamMessage(raw);
      if (!event) {
        malformedRef.current += 1;
        if (import.meta.env.DEV && reason) {
          // Diagnostic only, and never includes the raw payload itself.
          console.debug(`[stream] dropped malformed message (${reason})`);
        }
        return;
      }
      queueRef.current.push(event);
    });

    client.connect();

    return () => {
      offStatus();
      offMessage();
      client.disconnect();
      clientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emitIntervalMs, simulateDropEveryMs]);

  // Batching flush loop, decoupled from connection lifecycle.
  useEffect(() => {
    const id = setInterval(() => {
      if (queueRef.current.length === 0 && malformedRef.current === 0) return;
      const batch = queueRef.current;
      queueRef.current = [];
      const malformed = malformedRef.current;
      malformedRef.current = 0;
      dispatch({ type: "flush", events: batch, malformed, maxEvents, maxPoints });
    }, flushIntervalMs);
    return () => clearInterval(id);
  }, [flushIntervalMs, maxEvents, maxPoints]);

  const pause = useCallback(() => clientRef.current?.pause(), []);
  const resume = useCallback(() => clientRef.current?.resume(), []);

  const stats = useMemo(
    () => ({
      totalReceived: state.totalReceived,
      malformedDropped: state.malformedDropped,
      reconnectAttempt: state.reconnectAttempt,
    }),
    [state.totalReceived, state.malformedDropped, state.reconnectAttempt],
  );

  return {
    status: state.status,
    events: state.events,
    points: state.points,
    stats,
    pause,
    resume,
  };
}
