/**
 * Appends `items` to `buffer` and caps the result at `max` elements,
 * dropping from the front (oldest first). Pure and allocation-predictable
 * so it's easy to unit test and cheap to call on every flush — this is
 * what keeps the in-memory event/point buffers from growing unbounded
 * under sustained high-frequency load.
 */
export function pushBounded<T>(buffer: T[], items: T[], max: number): T[] {
  if (max <= 0) return [];
  if (items.length === 0) return buffer;

  if (items.length >= max) {
    return items.slice(items.length - max);
  }

  const merged = buffer.length + items.length <= max ? buffer.concat(items) : buffer.slice(buffer.length - (max - items.length)).concat(items);

  return merged;
}

/** Exponential backoff with jitter, capped at `maxMs`. */
export function computeBackoffDelay(attempt: number, baseMs = 500, maxMs = 8000): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  const jitter = 0.75 + Math.random() * 0.5; // +/-25%
  return Math.round(Math.min(maxMs, exp * jitter));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatClockTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour12: false });
}

export function formatRate(perSecond: number): string {
  if (perSecond < 1) return `${(perSecond * 60).toFixed(1)}/min`;
  return `${perSecond.toFixed(1)}/s`;
}

export function formatLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

/** Short, non-cryptographic id generator for demo/simulated payloads only. */
export function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
