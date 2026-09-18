import { memo } from "react";
import { formatLatency, formatRate } from "../utils/helpers";
import type { Kpis } from "../utils/kpis";
import "./KpiCards.css";

interface KpiCardsProps {
  kpis: Kpis;
}

/**
 * Pure presentation of already-derived numbers. All the aggregation work
 * happens once in `App` via `useMemo`, so this component only re-renders
 * when the derived KPI object actually changes — never on every raw
 * message, and `memo` skips the render entirely if the parent passes the
 * same object back (e.g. while paused).
 */
function KpiCardsImpl({ kpis }: KpiCardsProps) {
  const cards = [
    { label: "Total events", value: kpis.total.toLocaleString() },
    { label: "OK", value: kpis.okCount.toLocaleString(), tone: "ok" as const },
    { label: "Degraded", value: kpis.degradedCount.toLocaleString(), tone: "degraded" as const },
    { label: "Down", value: kpis.downCount.toLocaleString(), tone: "down" as const },
    { label: "Avg latency", value: formatLatency(kpis.avgLatencyMs) },
    { label: "Throughput", value: formatRate(kpis.eventsPerSecond) },
  ];

  return (
    <div className="kpi-cards">
      {cards.map((c) => (
        <div className={`kpi-card${c.tone ? ` kpi-card--${c.tone}` : ""}`} key={c.label}>
          <span className="kpi-card__label">{c.label}</span>
          <span className="kpi-card__value">{c.value}</span>
        </div>
      ))}
    </div>
  );
}

export const KpiCards = memo(KpiCardsImpl);
