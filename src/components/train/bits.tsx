import type { ReactNode } from "react";
import { named } from "@/components/ui/name";

/** A screen's page name, with its period. Anything under it is body text in ink. */
export function ScreenTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-1 pb-3 pt-1">
      <h1 className="text-head">{named(title)}</h1>
      {children ? <div className="text-body">{children}</div> : null}
    </header>
  );
}

/** A section name, with its period, and an optional value or action at the right edge. */
export function SectionTitle({ children, aside }: { children: string; aside?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-baseline justify-between gap-3 pb-2 pt-4">
      <h2 className="min-w-0 text-name">{named(children)}</h2>
      {aside ? <div className="shrink-0 text-body">{aside}</div> : null}
    </div>
  );
}

/**
 * A number set light with its unit beside it, as on the Today plan and the Log set weight.
 * Sizes are the figure steps in the type scale.
 */
const FIGURE_SIZE = { 24: "text-fig-24", 32: "text-fig-32", 48: "text-fig-48" } as const;

export function Figure({ value, unit, size = 32 }: { value: string; unit?: string; size?: keyof typeof FIGURE_SIZE }) {
  return (
    <span className="inline-flex shrink-0 items-baseline whitespace-nowrap">
      <span className={FIGURE_SIZE[size]}>{value}</span>
      {unit ? <span className="ml-1 text-body">{unit}</span> : null}
    </span>
  );
}

/**
 * A toggle for picking several things from a short list. The chosen ones are ink and underlined,
 * the rest grey, the same as a word switch. Put them in a row with `-mx-2.5` to line the text up with the gutter.
 */
export function Chip({
  selected,
  onClick,
  children,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center px-2.5 text-word disabled:text-grey ${
        selected ? "text-ink underline decoration-2 underline-offset-[7px]" : "text-grey active:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/** A full-width row with an on and off switch. The state is a word, and On is underlined. */
export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-rule py-3 text-left"
    >
      <span className="min-w-0">
        <span className="block text-body">{label}</span>
        {hint ? <span className="block text-small">{hint}</span> : null}
      </span>
      <span
        aria-hidden="true"
        className={`shrink-0 text-body ${checked ? "underline decoration-2 underline-offset-[7px]" : "text-grey"}`}
      >
        {checked ? "On" : "Off"}
      </span>
    </button>
  );
}

/** A 1 to 5 scale as a table row: the label, then five 56px cells. Tapping the chosen number again clears it. */
export function RatingRow({
  label,
  low,
  high,
  value,
  onChange,
}: {
  label: string;
  low: string;
  high: string;
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  return (
    <div role="group" aria-label={`${label}, 1 is ${low.toLowerCase()}, 5 is ${high.toLowerCase()}`} className="border-t border-rule">
      <div className="grid grid-cols-[var(--label-col)_repeat(5,minmax(0,1fr))] items-stretch">
        <span className="flex items-center pr-2 text-body">{label}</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            aria-label={`${label} ${n}`}
            onClick={() => onChange(value === n ? null : n)}
            className={`flex h-14 items-center justify-center border-l border-rule text-control active:bg-ink active:text-ground ${
              value === n ? "" : "text-grey"
            }`}
          >
            <span className={value === n ? "underline decoration-2 underline-offset-[7px]" : undefined}>{n}</span>
          </button>
        ))}
      </div>
      <p className="flex justify-between pb-3 pl-[var(--label-col)] text-small">
        <span>1, {low.toLowerCase()}</span>
        <span>5, {high.toLowerCase()}</span>
      </p>
    </div>
  );
}

/** A line of status text between two hairlines, with an optional action, for sync and offline notices. */
export function Notice({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-y border-rule py-1">
      <p className="py-2 text-body">{children}</p>
      {action ? <div className="-mr-2 shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * The primary band at the bottom of a sheet's scrolling content, with an error line above it.
 * The sheet's content has 24px of bottom padding and a sticky offset is measured inside padding,
 * so the band sticks 24px lower and ends flush with the sheet.
 */
export function SheetBand({ error, children }: { error?: string | null; children: ReactNode }) {
  return (
    <div className="bleed sticky -bottom-6 -mb-6 bg-ground [&>button]:w-full">
      {error ? (
        <p role="alert" className="border-t border-rule px-safe py-3 font-medium">
          {error}
        </p>
      ) : null}
      {children}
    </div>
  );
}

/**
 * Pins a primary band to the bottom edge on a screen with no tab bar, with the space the
 * home indicator needs under it. Reserve the scroll space under the content yourself.
 */
export function BottomBand({ children }: { children: ReactNode }) {
  return <div className="fixed inset-x-0 bottom-0 z-30 bg-ground pb-safe [&>button]:w-full">{children}</div>;
}
