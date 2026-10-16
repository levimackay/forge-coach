import { num } from "@/lib/reports/format";

export interface BandRow {
  key: string;
  label: string;
  value: number;
  /** Extra words for screen readers, such as "8 direct, 5 indirect". */
  detail?: string;
}

export type BandStatus = "below" | "within" | "above";

export function bandStatus(value: number, band: { min: number; max: number }): BandStatus {
  return value < band.min ? "below" : value > band.max ? "above" : "within";
}

const STATUS_TEXT: Record<BandStatus, string> = {
  below: "below the reference range",
  within: "inside the reference range",
  above: "above the reference range",
};

export interface BandBarsProps {
  rows: BandRow[];
  band: { min: number; max: number };
  /** Names the list, for example "Hard sets per muscle this week". */
  label: string;
}

/**
 * One row per muscle: a label, an ink bar from zero on a scale shared by every row, and the count.
 * The reference band is a rule-coloured segment behind the bars, so a bar that stops short of it
 * shows the gap and a bar that passes it covers it. The screen says which numbers the band spans.
 */
export function BandBars({ rows, band, label }: BandBarsProps) {
  const top = Math.max(band.max * 1.15, ...rows.map((r) => r.value * 1.05));
  const pct = (v: number) => `${Math.min(100, (v / top) * 100)}%`;

  return (
    <ul aria-label={label} className="border-b border-rule">
      {rows.map((row) => {
        const status = bandStatus(row.value, band);
        return (
          <li key={row.key} className="grid h-[38px] grid-cols-[104px_minmax(0,1fr)_40px] items-center border-t border-rule">
            <span className="truncate text-body">{row.label}</span>
            <span aria-hidden="true" className="relative block h-3">
              <span className="absolute inset-y-1 bg-rule" style={{ left: pct(band.min), width: `${((band.max - band.min) / top) * 100}%` }} />
              <span className="absolute inset-y-1 left-0 bg-ink" style={{ width: pct(row.value) }} />
            </span>
            <span className="text-right text-fig-24">
              {num(row.value)}
              <span className="sr-only">{`, ${STATUS_TEXT[status]}${row.detail ? `, ${row.detail}` : ""}`}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
