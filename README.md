# Live Monitoring Dashboard

A real-time service-monitoring dashboard built in React 18 + TypeScript + Vite. It's built around two priorities: **performance under high-frequency updates** and **secure handling of untrusted streamed data**.

## Running it

```bash
npm install
npm run dev
```

Open the printed local URL. The dashboard connects to a **simulated live stream** automatically — no backend is required (see [Data source](#data-source-simulated--pluggable) below for how to point it at a real one).

Other scripts:

```bash
npm run build     # type-check + production build
npm run preview   # preview the production build
npm test          # run the test suite once (Vitest)
npm run test:watch
```

## Project structure

```
live-dashboard/
├── src/
│   ├── components/
│   │   ├── KpiCards.tsx        derived stat cards
│   │   ├── LiveChart.tsx       canvas-based live latency chart
│   │   ├── EventsList.tsx      virtualized event list (react-window)
│   │   ├── ConnectionBar.tsx   status pill, pause/resume, filters
│   │   ├── SettingsPanel.tsx   exposes buffer size / flush interval
│   │   ├── ErrorFallback.tsx   error boundary UI
│   │   └── Loading.tsx
│   ├── hooks/
│   │   └── useLiveStream.ts    connection + ingestion + batching (the core)
│   ├── services/
│   │   ├── streamClient.ts     transport layer (simulated + real WebSocket)
│   │   └── authToken.ts        in-memory-only token store
│   ├── types/event.ts
│   ├── utils/
│   │   ├── validate.ts         zod schema for untrusted stream payloads
│   │   ├── helpers.ts          pushBounded, backoff, formatters
│   │   └── kpis.ts             pure KPI aggregation
│   ├── App.tsx
│   └── main.tsx
├── package.json
└── README.md
```

## Architecture

**Data flow:** `streamClient` (transport) → `useLiveStream` (validate, batch, bound, expose state) → `App` (filter, derive KPIs) → presentation components (`KpiCards`, `LiveChart`, `EventsList`, `ConnectionBar`).

All connection logic lives behind the `StreamClient` interface in `services/streamClient.ts` and is only ever touched by `useLiveStream`. No component talks to a socket, a timer, or `JSON.parse` directly — that's what keeps connection handling out of the UI layer.

### Data source: simulated & pluggable

`SimulatedStreamClient` generates synthetic monitoring events on an interval and randomly drops its "connection" so you can watch reconnection/backoff happen. It implements the same `StreamClient` interface as `WebSocketStreamClient`, a real-transport implementation that's also included (connects via `new WebSocket(url)`, sends auth as the first post-`open` message, reconnects with backoff on `close`).

`services/streamClient.ts#createStreamClient` picks between them based on env config — set `VITE_STREAM_WS_URL` in a `.env.local` file to point the dashboard at a real WebSocket endpoint with no other code changes:

```
VITE_STREAM_WS_URL=wss://your-endpoint.example.com/stream
```

## Performance decisions

- **Batched ingestion, not per-message re-renders.** Raw messages are validated and pushed onto a plain `useRef` array (`queueRef`) as they arrive — this touches no React state and causes zero re-renders. A separate timer (`flushIntervalMs`, default 250ms, adjustable live in the "Performance settings" panel) drains that queue into a `useReducer` dispatch. A burst of hundreds of messages between flushes collapses into a single state update instead of hundreds. Connection lifecycle and the flush loop are two independent `useEffect`s, so tuning the flush interval never tears down and reconnects the socket.
- **Canvas chart, not an SVG/DOM chart library.** `LiveChart` draws directly to a `<canvas>` inside a `useEffect` keyed on `points`. At high update frequency, an SVG-based chart means the DOM (or a chart library's virtual layer) reconciling potentially hundreds of nodes per second; imperative canvas drawing is a fixed handful of draw calls that never touch the DOM tree, so redraw cost stays flat regardless of point count.
- **Virtualized list.** `EventsList` uses `react-window`'s `FixedSizeList` so only the rows in view are ever mounted — DOM node count is constant whether the buffer holds 20 events or its configured max.
- **Bounded buffers.** `utils/helpers.ts#pushBounded` caps both the event buffer and the chart's point buffer at a configurable max (`maxEvents`, `maxPoints`), dropping the oldest entries first. Memory is flat under sustained load, never growing with total messages received.
- **Isolated re-renders via `memo` + `useMemo`/`useCallback`.** `KpiCards`, `LiveChart`, `EventsList`, `ConnectionBar`, and `SettingsPanel` are all wrapped in `React.memo`. `App` only passes them new object/array references when the underlying data actually changed (derived via `useMemo`) and only passes stable function references (via `useCallback`), so — e.g. — toggling a filter that doesn't affect the chart's points doesn't re-render the chart.
- **Correctness under pause/filter.** Pausing calls into the stream client (`client.pause()`), which stops emission at the source rather than just hiding data in the UI — no wasted work happens while paused. Filtering (status + time window) is a pure `useMemo` derivation over the canonical bounded buffer, so the buffer itself is never mutated by filter state and switching filters back always shows correct, consistent data.

## Security decisions

- **Untrusted-by-default stream data.** Every message is `JSON.parse`'d and run through a strict Zod schema (`utils/validate.ts`) before it is allowed anywhere near component state — wrong types, out-of-range numbers, unknown enum values, or unexpected extra fields are all rejected outright (never coerced). Malformed input (bad JSON, schema mismatches) is silently dropped and counted, never thrown, so one bad payload can't crash ingestion.
- **No `dangerouslySetInnerHTML` anywhere.** All stream-derived text (service name, message) is rendered as ordinary JSX children, so React's default escaping applies. A dedicated test (`EventsList.test.tsx`) asserts that a payload containing `<script>`/`<img onerror>` renders as inert text and never becomes a real DOM element.
- **No secrets in the client.** There are no hardcoded API keys or tokens anywhere in the source. `services/authToken.ts` holds the auth token in a module-scoped variable only (never `localStorage`/cookies, which are readable by any script on the page, including an XSS payload) and it is never logged or placed in a URL/query string — `WebSocketStreamClient` sends it as the first application message after the socket opens instead.
- **Resilient, bounded reconnection.** Both stream clients use exponential backoff with jitter (`computeBackoffDelay`), capped at a max delay, so a flapping connection retries with decreasing frequency instead of hammering the server or spinning the UI. Combined with the bounded buffers above, neither a flood of valid data nor a flapping connection can grow memory unbounded or hang the app.
- **No sensitive detail in logs.** The one `console.debug` in the codebase (in `useLiveStream`, dev-only) logs *why* a message was rejected, never the payload itself. Socket error events are never logged directly, since they can carry connection/auth detail.

## Edge cases covered

Empty feed (initial `Loading` state), malformed messages (rejected + counted, visible in the connection bar), paused state (source stops emitting; UI freezes correctly, no stale-looking "live" indicator), dropped/reconnecting connection (visible status + attempt count, exponential backoff), and bursts of rapid updates (batched flush + bounded buffers keep memory and render cost flat).

## Testing

Vitest + React Testing Library cover the parts with the most non-obvious behaviour: the validator's accept/reject paths (`utils/validate.test.ts`), the bounded-buffer and backoff math (`utils/helpers.test.ts`), KPI aggregation (`utils/kpis.test.ts`), and XSS-safe rendering of stream text (`components/EventsList.test.tsx`). Run with `npm test`.
