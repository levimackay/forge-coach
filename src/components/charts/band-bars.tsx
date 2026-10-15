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

/** Horizontal bars on one shared scale with a shaded reference band behind them. */
export function BandBars({ rows, band, label }: BandBarsProps) {
  const top = Math.max(band.max * 1.15, ...rows.map((r) => r.value * 1.05));
  const pct = (v: number) => `${Math.min(100, (v / top) * 100)}%`;
  const COLUMNS = "grid grid-cols-[6.5rem_1fr_2.75rem] gap-x-2";
  const grid = `${COLUMNS} items-center`;

  return (
    <div className="flex flex-col">
      <div className="relative">
        {/* One band behind every row, on the same columns as the rows, so it reads as a single reference range. */}
        <div aria-hidden="true" className={`${COLUMNS} pointer-events-none absolute inset-0`}>
          <span />
          <div className="relative">
            <div className="absolute inset-y-0 bg-ink/10" style={{ left: pct(band.min), width: `${((band.max - band.min) / top) * 100}%` }} />
          </div>
          <span />
        </div>
        <ul aria-label={label} className="relative flex flex-col">
          {rows.map((row) => {
            const status = bandStatus(row.value, band);
            return (
              <li key={row.key} className={`${grid} min-h-9`}>
                <span className="truncate text-[15px] text-ink-dim">{row.label}</span>
                <div className="relative h-5">
                  <div
                    aria-hidden="true"
                    className={`absolute inset-y-1 left-0 rounded-r-[3px] ${status === "below" ? "bg-ink-faint" : "bg-ember"}`}
                    style={{ width: pct(row.value) }}
                  />
                </div>
                <span className="text-right text-[15px] font-medium text-ink">
                  {num(row.value)}
                  <span className="sr-only">{`, ${STATUS_TEXT[status]}${row.detail ? `, ${row.detail}` : ""}`}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <div aria-hidden="true" className={`${grid} mt-1`}>
        <span />
        <div className="relative h-5 text-[12px] text-ink-faint">
          <span className="absolute -translate-x-1/2" style={{ left: pct(band.min) }}>
            {band.min}
          </span>
          <span className="absolute -translate-x-1/2" style={{ left: pct(band.max) }}>
            {band.max}
          </span>
        </div>
        <span />
      </div>
    </div>
  );
}
