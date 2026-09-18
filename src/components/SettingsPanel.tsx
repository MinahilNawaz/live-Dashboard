import { memo } from "react";
import "./SettingsPanel.css";

interface SettingsPanelProps {
  flushIntervalMs: number;
  onFlushIntervalChange: (value: number) => void;
  maxEvents: number;
  onMaxEventsChange: (value: number) => void;
  maxPoints: number;
  onMaxPointsChange: (value: number) => void;
}

/**
 * Exposes the performance knobs (batch/flush interval, buffer sizes)
 * instead of burying them as hardcoded constants — useful for demoing
 * the batching behaviour live (e.g. set the flush interval to 1000ms and
 * watch updates arrive in visible chunks instead of continuously).
 */
function SettingsPanelImpl({
  flushIntervalMs,
  onFlushIntervalChange,
  maxEvents,
  onMaxEventsChange,
  maxPoints,
  onMaxPointsChange,
}: SettingsPanelProps) {
  return (
    <details className="settings-panel">
      <summary>Performance settings</summary>
      <div className="settings-panel__grid">
        <label>
          <span>Batch flush interval (ms)</span>
          <input
            type="number"
            min={50}
            max={5000}
            step={50}
            value={flushIntervalMs}
            onChange={(e) => onFlushIntervalChange(Number(e.target.value))}
          />
        </label>
        <label>
          <span>Max buffered events</span>
          <input
            type="number"
            min={20}
            max={2000}
            step={20}
            value={maxEvents}
            onChange={(e) => onMaxEventsChange(Number(e.target.value))}
          />
        </label>
        <label>
          <span>Max chart points</span>
          <input
            type="number"
            min={20}
            max={1000}
            step={20}
            value={maxPoints}
            onChange={(e) => onMaxPointsChange(Number(e.target.value))}
          />
        </label>
      </div>
    </details>
  );
}

export const SettingsPanel = memo(SettingsPanelImpl);
