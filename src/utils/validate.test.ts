import { describe, expect, it } from "vitest";
import { parseStreamMessage } from "./validate";

const validPayload = {
  id: "evt-1",
  timestamp: Date.now(),
  service: "api-gateway",
  status: "ok",
  severity: "info",
  message: "heartbeat ok",
  latencyMs: 42,
};

describe("parseStreamMessage", () => {
  it("accepts a well-formed message", () => {
    const { event, reason } = parseStreamMessage(JSON.stringify(validPayload));
    expect(reason).toBeUndefined();
    expect(event).toMatchObject({ id: "evt-1", service: "api-gateway", status: "ok" });
  });

  it("rejects invalid JSON without throwing", () => {
    const { event, reason } = parseStreamMessage("not json at all {{{");
    expect(event).toBeNull();
    expect(reason).toBe("invalid-json");
  });

  it("rejects a message with an unknown status value", () => {
    const bad = { ...validPayload, status: "on-fire" };
    const { event, reason } = parseStreamMessage(JSON.stringify(bad));
    expect(event).toBeNull();
    expect(reason).toBe("schema-mismatch");
  });

  it("rejects a message missing required fields", () => {
    const { event } = parseStreamMessage(JSON.stringify({ id: "x" }));
    expect(event).toBeNull();
  });

  it("rejects out-of-range latency instead of clamping it silently", () => {
    const bad = { ...validPayload, latencyMs: 999_999 };
    const { event } = parseStreamMessage(JSON.stringify(bad));
    expect(event).toBeNull();
  });

  it("rejects a payload carrying unexpected extra fields (strict schema)", () => {
    const bad = { ...validPayload, extraField: "unexpected" };
    const { event, reason } = parseStreamMessage(JSON.stringify(bad));
    expect(event).toBeNull();
    expect(reason).toBe("schema-mismatch");
  });

  it("strips control characters from text fields", () => {
    const withControlChars = { ...validPayload, message: "helloworld" };
    const { event } = parseStreamMessage(JSON.stringify(withControlChars));
    expect(event?.message).toBe("helloworld");
  });
});
