"use client";

import type { KeyboardEvent, PointerEvent } from "react";
import { num } from "@/lib/reports/format";
import { clamp, linear, nearestIndex, niceTicks } from "./scale";
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

const MARGIN = { top: 14, right: 14, bottom: 26 };
// Drawn at this width until the container has been measured, scaled to fit by the viewBox.
const FIRST_PAINT_WIDTH = 340;

export function LineChart({ points, selected, onSelect, label, unit, formatY = (y) => num(y, 1), height = 200 }: LineChartProps) {
  const [ref, measured] = useElementWidth<HTMLDivElement>();
  const width = measured ?? FIRST_PAINT_WIDTH;
  const count = points.length;
  if (count === 0) return null;
  const index = clamp(selected, 0, Math.max(0, count - 1));
  const current = points[index];

  const ys = points.map((p) => p.y);
  const { ticks, min: yMin, max: yMax } = niceTicks(Math.min(...ys), Math.max(...ys), 3);
  const left = 12 + Math.max(...ticks.map((t) => formatY(t).length)) * 7;
  const innerWidth = Math.max(40, width - left - MARGIN.right);
  const xs = points.map((p) => p.x);
  const xScale = linear([xs[0], xs[count - 1]], [left, left + innerWidth]);
  const yScale = linear([yMin, yMax], [height - MARGIN.bottom, MARGIN.top]);
  const px = points.map((p) => xScale(p.x));
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${px[i].toFixed(1)} ${yScale(p.y).toFixed(1)}`).join(" ");

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
    <figure className="m-0 flex flex-col gap-2">
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
        className="rounded-control focus-visible:outline-2 focus-visible:outline-offset-2"
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
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={left + innerWidth} y1={yScale(t)} y2={yScale(t)} className="stroke-line" strokeWidth={1} />
              <text x={left - 8} y={yScale(t) + 4} textAnchor="end" className="fill-ink-faint text-[12px]">
                {formatY(t)}
              </text>
            </g>
          ))}
          <text x={px[0]} y={height - 6} textAnchor={count === 1 ? "middle" : "start"} className="fill-ink-faint text-[12px]">
            {points[0].label}
          </text>
          {count > 1 ? (
            <text x={px[count - 1]} y={height - 6} textAnchor="end" className="fill-ink-faint text-[12px]">
              {points[count - 1].label}
            </text>
          ) : null}
          {count > 1 ? <path d={path} fill="none" className="stroke-ember" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
          {points.map((p, i) => (
            <circle key={i} cx={px[i]} cy={yScale(p.y)} r={i === index ? 0 : 3} className="fill-ember" />
          ))}
          <line x1={px[index]} x2={px[index]} y1={MARGIN.top} y2={height - MARGIN.bottom} className="stroke-ink-faint" strokeWidth={1} strokeDasharray="3 3" />
          <circle cx={px[index]} cy={yScale(current.y)} r={6} className="fill-ground stroke-ember" strokeWidth={3} />
        </svg>
      </div>
      <figcaption aria-live="polite" className="text-[17px] text-ink">
        <span className="font-semibold">{valueText(current)}</span>
        <span className="text-ink-dim">{` on ${current.label}`}</span>
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
