import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventsList } from "./EventsList";
import type { MonitoringEvent } from "../types/event";

describe("EventsList", () => {
  it("shows an empty state when there are no events", () => {
    render(<EventsList events={[]} />);
    expect(screen.getByText("No events yet.")).toBeInTheDocument();
  });

  it("renders stream text as plain text, never as HTML", () => {
    const malicious: MonitoringEvent = {
      id: "evt-xss",
      timestamp: Date.now(),
      service: "<img src=x onerror=alert(1)>",
      status: "down",
      severity: "critical",
      message: "<script>window.__pwned = true</script>",
      latencyMs: 10,
    };

    const { container } = render(<EventsList events={[malicious]} />);

    // The literal tag text should appear as visible text content...
    expect(screen.getByText(malicious.message)).toBeInTheDocument();
    // ...and must never have been parsed into a real <script> element.
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
});
