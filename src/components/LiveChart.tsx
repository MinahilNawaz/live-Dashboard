import { memo, useEffect, useRef } from "react";
import type { MetricPoint } from "../types/event";
import "./LiveChart.css";

interface LiveChartProps {
  points: MetricPoint[];
  label: string;
}

/**
 * Live latency chart, drawn on a <canvas> instead of an SVG/DOM chart
 * library. At high update frequency an SVG chart means React reconciling
 * (or a chart lib re-rendering) potentially hundreds of DOM nodes per
 * second; canvas drawing is a handful of imperative calls that never touch
 * the DOM tree, so it stays smooth regardless of point count. The
 * component is still a normal memoized React component — it just delegates
 * the actual paint to an effect keyed on `points`.
 */
function LiveChartImpl({ points, label }: LiveChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = container.getBoundingClientRect();
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    draw(ctx, points, width, height);
  }, [points]);

  // Redraw on resize too, without depending on `points` for the observer.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = container.getBoundingClientRect();
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      draw(ctx, points, width, height);
    });
    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="live-chart">
      <div className="live-chart__header">
        <h3>{label}</h3>
        <span className="live-chart__count">{points.length} pts</span>
      </div>
      <div className="live-chart__canvas-wrap" ref={containerRef}>
        {points.length === 0 ? (
          <div className="live-chart__empty">Waiting for data…</div>
        ) : (
          <canvas ref={canvasRef} />
        )}
      </div>
    </div>
  );
}

function draw(ctx: CanvasRenderingContext2D, points: MetricPoint[], width: number, height: number) {
  ctx.clearRect(0, 0, width, height);
  if (points.length < 2) return;

  const padding = 8;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const xStep = (width - padding * 2) / (points.length - 1);
  const toY = (v: number) => padding + (1 - (v - min) / range) * (height - padding * 2);

  // Filled area under the line.
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = padding + i * xStep;
    const y = toY(p.value);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(padding + (points.length - 1) * xStep, height - padding);
  ctx.lineTo(padding, height - padding);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(79, 124, 255, 0.28)");
  gradient.addColorStop(1, "rgba(79, 124, 255, 0.02)");
  ctx.fillStyle = gradient;
  ctx.fill();

  // Line.
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = padding + i * xStep;
    const y = toY(p.value);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#4f7cff";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Latest point marker.
  const last = points[points.length - 1];
  const lx = padding + (points.length - 1) * xStep;
  const ly = toY(last.value);
  ctx.beginPath();
  ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = "#4f7cff";
  ctx.fill();
}

export const LiveChart = memo(LiveChartImpl);
