import { memo, useMemo } from "react";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import type { MonitoringEvent } from "../types/event";
import { formatClockTime, formatLatency } from "../utils/helpers";
import "./EventsList.css";

interface EventsListProps {
  events: MonitoringEvent[];
}

const ROW_HEIGHT = 44;

/**
 * Virtualized (windowed) list: only the rows actually visible in the
 * scroll viewport are mounted as DOM nodes, via `react-window`. The event
 * buffer is already bounded upstream, but this is what keeps the *list
 * itself* cheap even at its max size — DOM node count stays constant
 * whether there are 50 events or 5,000.
 *
 * Text values are rendered as plain JSX children (never
 * `dangerouslySetInnerHTML`), so React's default escaping applies to any
 * stream-controlled string reaching the page.
 */
function EventsListImpl({ events }: EventsListProps) {
  const itemData = useMemo(() => events, [events]);

  if (events.length === 0) {
    return (
      <div className="events-list events-list--empty">
        <p>No events yet.</p>
      </div>
    );
  }

  return (
    <div className="events-list">
      <FixedSizeList
        height={360}
        itemCount={itemData.length}
        itemSize={ROW_HEIGHT}
        width="100%"
        itemData={itemData}
        itemKey={(index, data) => (data as MonitoringEvent[])[index].id}
      >
        {Row}
      </FixedSizeList>
    </div>
  );
}

function Row({ index, style, data }: ListChildComponentProps<MonitoringEvent[]>) {
  const event = data[index];
  return (
    <div className="events-list__row" style={style}>
      <span className={`events-list__dot events-list__dot--${event.status}`} aria-hidden />
      <span className="events-list__time">{formatClockTime(event.timestamp)}</span>
      <span className="events-list__service">{event.service}</span>
      <span className="events-list__message" title={event.message}>
        {event.message}
      </span>
      <span className="events-list__latency">{formatLatency(event.latencyMs)}</span>
      <span className={`events-list__severity events-list__severity--${event.severity}`}>{event.severity}</span>
    </div>
  );
}

export const EventsList = memo(EventsListImpl);
