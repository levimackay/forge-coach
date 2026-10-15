import type { ReactNode } from "react";

export function ScreenTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-1 pb-2 pt-1">
      <h1 className="title-large">{title}</h1>
      {children ? <div className="text-[17px] text-ink-dim">{children}</div> : null}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 px-1">
      <h2 className="text-[15px] font-semibold text-ink-dim">{children}</h2>
      {action}
    </div>
  );
}

/** A toggle button for picking several things from a short list. */
export function Chip({
  selected,
  onClick,
  children,
  tone = "neutral",
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  tone?: "neutral" | "danger";
  disabled?: boolean;
}) {
  const on = tone === "danger" ? "border-danger bg-raised text-danger" : "border-ink bg-raised text-ink";
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-11 rounded-control border px-4 text-[16px] font-medium transition-colors disabled:opacity-40 ${
        selected ? on : "border-line text-ink-dim active:bg-raised"
      }`}
    >
      {children}
    </button>
  );
}

/** A full-width row with an on and off switch, for choosing equipment. */
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
      className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors active:bg-raised"
    >
      <span className="min-w-0">
        <span className="block text-[17px] text-ink">{label}</span>
        {hint ? <span className="block text-[15px] text-ink-dim">{hint}</span> : null}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors ${
          checked ? "border-ink bg-ink" : "border-line bg-raised"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-[26px] w-[26px] rounded-full transition-transform ${
            checked ? "translate-x-6 bg-ground" : "bg-ink-faint"
          }`}
        />
      </span>
    </button>
  );
}

/** One mark per set: filled in the accent when logged. */
export function SetDots({ done, total }: { done: number; total: number }) {
  const shown = Math.min(total, 12);
  return (
    <span role="img" aria-label={`${done} of ${total} sets done`} className="flex items-center gap-1">
      {Array.from({ length: shown }, (_, i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-full border ${i < done ? "border-ember bg-ember" : "border-ink-faint"}`}
        />
      ))}
      {done > total ? <span className="ml-1 text-[13px] text-ink-dim">+{done - total}</span> : null}
    </span>
  );
}

/** A 1 to 5 scale. Tapping the chosen number again clears it. */
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
    <div role="group" aria-label={`${label}, 1 is ${low.toLowerCase()}, 5 is ${high.toLowerCase()}`} className="flex flex-col gap-2">
      <span className="text-[15px] font-medium text-ink-dim">{label}</span>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            aria-label={`${label} ${n}`}
            onClick={() => onChange(value === n ? null : n)}
            className={`min-h-12 flex-1 rounded-control border text-[17px] font-semibold transition-colors ${
              value === n ? "border-ink bg-raised text-ink" : "border-line text-ink-dim active:bg-raised"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[13px] text-ink-faint">
        <span>1, {low.toLowerCase()}</span>
        <span>5, {high.toLowerCase()}</span>
      </div>
    </div>
  );
}

/** A short line of status text with an optional action, for sync and offline notices. */
export function Notice({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface py-1 pl-4 pr-1">
      <p className="py-2 text-[15px] text-ink-dim">{children}</p>
      {action}
    </div>
  );
}
