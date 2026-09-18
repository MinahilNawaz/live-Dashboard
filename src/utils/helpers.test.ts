import { describe, expect, it } from "vitest";
import { computeBackoffDelay, pushBounded } from "./helpers";

describe("pushBounded", () => {
  it("appends items while under the cap", () => {
    const result = pushBounded([1, 2], [3, 4], 10);
    expect(result).toEqual([1, 2, 3, 4]);
  });

  it("drops the oldest items once the cap is exceeded", () => {
    const result = pushBounded([1, 2, 3], [4, 5], 4);
    expect(result).toEqual([2, 3, 4, 5]);
  });

  it("never exceeds max even when a single flush is huge", () => {
    const bigBatch = Array.from({ length: 50 }, (_, i) => i);
    const result = pushBounded([], bigBatch, 5);
    expect(result).toHaveLength(5);
    expect(result).toEqual([45, 46, 47, 48, 49]);
  });

  it("returns the same buffer reference when there is nothing to add", () => {
    const buffer = [1, 2, 3];
    expect(pushBounded(buffer, [], 10)).toBe(buffer);
  });
});

describe("computeBackoffDelay", () => {
  it("grows roughly exponentially and stays within the cap", () => {
    for (let attempt = 1; attempt <= 8; attempt++) {
      const delay = computeBackoffDelay(attempt, 100, 4000);
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(4000 * 1.25 + 1);
    }
  });
});
