"use client";

import { linear } from "./scale";
import { useElementWidth } from "./use-element-width";

export interface LinePoint {
  /** Position on the horizontal axis, such as a timestamp. Points must be sorted by x. */
  x: number;
  y: number;
  /** Plain-text name for this point, such as a date. Used on the axis and in the table for screen readers. */
  label: string;
}

export interface LineChartProps {
  points: LinePoint[];
  /** Names the chart for screen readers, for example "Bench press estimated max by workout". */
  label: string;
  unit?: string;
  formatY?: (y: number) => string;
}

// One line, one hairline. Only the first point carries its value (the latest is the figure above the chart)
// and only the first and last carry a date. Every value is also in a table for screen readers.
const HEIGHT = 306;
const PLOT_TOP = 61;
const BASELINE = 272.5;
const LOWEST_POINT_ABOVE_BASELINE = 64.5;
const DATE_BASELINE = 298;
const VALUE_ABOVE_POINT = 18;
const FIRST_PAINT_WIDTH = 358;

export function LineChart({ points, label, unit, formatY = (y) => String(Number(y.toFixed(1))) }: LineChartProps) {
  const [ref, measured] = useElementWidth<HTMLDivElement>();
  const width = measured ?? FIRST_PAINT_WIDTH;
  const count = points.length;
  if (count === 0) return null;
  const last = count - 1;

  const firstValue = formatY(points[0].y);
  // Room at both ends for a label centred on the first point.
  const pad = Math.max(22, Math.ceil(firstValue.length * 6));
  const ys = points.map((p) => p.y);
  const xScale = linear([points[0].x, points[last].x], [pad, Math.max(pad + 40, width - pad)]);
  const yScale = linear([Math.min(...ys), Math.max(...ys)], [BASELINE - LOWEST_POINT_ABOVE_BASELINE, PLOT_TOP]);
  const px = points.map((p) => xScale(p.x));
  const py = points.map((p) => yScale(p.y));
  const path = points.map((_, i) => `${i === 0 ? "M" : "L"}${px[i].toFixed(1)} ${py[i].toFixed(1)}`).join(" ");
  const valueText = (p: LinePoint) => `${formatY(p.y)}${unit ? ` ${unit}` : ""}`;

  return (
    <figure ref={ref} className="m-0">
      <svg
        width={measured ?? "100%"}
        height={measured ? HEIGHT : undefined}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        aria-hidden="true"
        focusable="false"
        className="block"
      >
        <line x1={0} x2={width} y1={BASELINE} y2={BASELINE} className="stroke-rule" strokeWidth={1} />
        {count > 1 ? <path d={path} fill="none" className="stroke-ink" strokeWidth={1.5} /> : null}
        {points.map((_, i) => (
          <circle key={i} cx={px[i]} cy={py[i]} r={i === last ? 4.5 : 2.5} className="fill-ink" />
        ))}
        <text x={px[0]} y={py[0] - VALUE_ABOVE_POINT} textAnchor="middle" fontSize={20} fontWeight={300} className="fill-ink">
          {firstValue}
        </text>
        <text x={px[0]} y={DATE_BASELINE} textAnchor="middle" fontSize={15} className="fill-ink">
          {points[0].label}
        </text>
        {count > 1 ? (
          <text x={px[last]} y={DATE_BASELINE} textAnchor="middle" fontSize={15} className="fill-ink">
            {points[last].label}
          </text>
        ) : null}
      </svg>
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
