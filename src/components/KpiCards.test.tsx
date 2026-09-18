import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiCards } from "./KpiCards";
import type { Kpis } from "../utils/kpis";

const kpis: Kpis = {
  total: 42,
  okCount: 30,
  degradedCount: 10,
  downCount: 2,
  avgLatencyMs: 123,
  eventsPerSecond: 4.5,
};

describe("KpiCards", () => {
  it("renders each derived metric", () => {
    render(<KpiCards kpis={kpis} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("123ms")).toBeInTheDocument();
    expect(screen.getByText("4.5/s")).toBeInTheDocument();
  });
});
