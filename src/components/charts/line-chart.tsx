"use client";

import type { KeyboardEvent, PointerEvent } from "react";
import { num } from "@/lib/reports/format";
import { clamp, labelIndices, linear, nearestIndex } from "./scale";
import { useElementWidth } from "./use-element-width";

export interface LinePoint {
  /** Position on the horizontal axis, such as a timestamp. Points must be sorted by x. */
  x: number;
  y: number;
  /** Plain-text name for this point, such as a date. Used on the axis and in the readout. */
  label: string;
}

export interface LineChartProps {
  points: LinePoint[];
  selected: number;
  onSelect: (index: number) => void;
  /** Names the chart for screen readers, for example "Bench press estimated one rep max". */
  label: string;
  unit?: string;
  formatY?: (y: number) => string;
  height?: number;
}

// No y axis and no gridlines: every point carries its own value, and one hairline carries the dates.
const PLOT_TOP = 38;
const BASELINE_FROM_BOTTOM = 26.5;
const LOWEST_POINT_ABOVE_BASELINE = 31;
const DATE_FROM_BOTTOM = 6;
const MIN_DATE_GAP = 56;
const FIRST_PAINT_WIDTH = 358;

export function LineChart({ points, selected, onSelect, label, unit, formatY = (y) => num(y, 1), height = 162 }: LineChartProps) {
  const [ref, measured] = useElementWidth<HTMLDivElement>();
  const width = measured ?? FIRST_PAINT_WIDTH;
  const count = points.length;
  if (count === 0) return null;
  const index = clamp(selected, 0, Math.max(0, count - 1));
  const current = points[index];

  const shown = points.map((p) => formatY(p.y));
  const widest = Math.max(...shown.map((s) => s.length));
  // Room at both ends for a label centred on the first and last point.
  const pad = Math.max(22, Math.ceil(widest * 5.5));
  const baseline = height - BASELINE_FROM_BOTTOM;
  const ys = points.map((p) => p.y);
  const xs = points.map((p) => p.x);
  const xScale = linear([xs[0], xs[count - 1]], [pad, Math.max(pad + 40, width - pad)]);
  const yScale = linear([Math.min(...ys), Math.max(...ys)], [baseline - LOWEST_POINT_ABOVE_BASELINE, PLOT_TOP]);
  const px = points.map((p) => xScale(p.x));
  const py = points.map((p) => yScale(p.y));
  const path = points.map((_, i) => `${i === 0 ? "M" : "L"}${px[i].toFixed(1)} ${py[i].toFixed(1)}`).join(" ");

  const valueLabels = labelIndices(px, Math.max(36, widest * 8 + 10), index);
  const dateLabels = labelIndices(px, MIN_DATE_GAP, index);

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    onSelect(nearestIndex(px, e.clientX - box.left));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (step !== 0) onSelect(clamp(index + step, 0, count - 1));
    else if (e.key === "Home") onSelect(0);
    else if (e.key === "End") onSelect(count - 1);
    else return;
    e.preventDefault();
  };

  const valueText = (p: LinePoint) => `${formatY(p.y)}${unit ? ` ${unit}` : ""}`;

  return (
    <figure className="m-0">
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={`${label}. Use the arrow keys to move between points.`}
        aria-valuemin={0}
        aria-valuemax={count - 1}
        aria-valuenow={index}
        aria-valuetext={`${current.label}: ${valueText(current)}`}
        onKeyDown={onKeyDown}
        className="focus-visible:outline-offset-2"
      >
        <svg
          width={measured ?? "100%"}
          height={measured ? height : undefined}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          focusable="false"
          className="block touch-pan-y select-none"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            pick(e);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) pick(e);
          }}
        >
          <line x1={0} x2={width} y1={baseline} y2={baseline} className="stroke-rule" strokeWidth={1} />
          {count > 1 ? <path d={path} fill="none" className="stroke-ink" strokeWidth={1.5} /> : null}
          {points.map((_, i) => (
            <circle key={i} cx={px[i]} cy={py[i]} r={i === index ? 4 : 2.5} className="fill-ink" />
          ))}
          {points.map((_, i) =>
            i === index ? (
              <text key={i} x={px[i]} y={py[i] - 12.4} textAnchor="middle" fontSize={18} fontWeight={400} className="fill-ink">
                {shown[i]}
              </text>
            ) : valueLabels.has(i) ? (
              <text key={i} x={px[i]} y={py[i] - 12} textAnchor="middle" fontSize={15} fontWeight={300} className="fill-ink">
                {shown[i]}
              </text>
            ) : null,
          )}
          {points.map((p, i) =>
            dateLabels.has(i) ? (
              <text key={i} x={px[i]} y={height - DATE_FROM_BOTTOM} textAnchor="middle" fontSize={13} fontWeight={400} className="fill-ink">
                {p.label}
              </text>
            ) : null,
          )}
        </svg>
      </div>
      <figcaption aria-live="polite" className="sr-only">
        {`${valueText(current)} on ${current.label}`}
      </figcaption>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <th scope="row">{p.label}</th>
              <td>{valueText(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
