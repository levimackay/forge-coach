"use client";

import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { IconMinus, IconPlus } from "./icons";
import { clamp, formatNumber, parseNumber, stepValue } from "./number-math";

export interface NumberStepperProps {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  hint?: string;
  /** Taller buttons and larger digits for logging mid-set. */
  large?: boolean;
  disabled?: boolean;
}

const HOLD_DELAY_MS = 450;
const HOLD_INTERVAL_MS = 110;

export function NumberStepper({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  unit,
  hint,
  large = false,
  disabled = false,
}: NumberStepperProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const latest = useRef({ value, onChange, step, min, max });
  const timers = useRef<{ delay?: ReturnType<typeof setTimeout>; repeat?: ReturnType<typeof setInterval> }>({});

  useEffect(() => {
    latest.current = { value, onChange, step, min, max };
  });

  const stopHold = () => {
    clearTimeout(timers.current.delay);
    clearInterval(timers.current.repeat);
  };
  useEffect(() => {
    const t = timers.current;
    return () => {
      clearTimeout(t.delay);
      clearInterval(t.repeat);
    };
  }, []);

  const bump = (direction: 1 | -1) => {
    const { value: v, onChange: change, step: s, min: lo, max: hi } = latest.current;
    const next = stepValue(v, direction, { step: s, min: lo, max: hi });
    // A disabled button may never see the pointer-up, so stop once the bound is hit.
    if (next === v) stopHold();
    else change(next);
  };

  // Pointer press steps once and keeps stepping while held. Keyboard activation
  // arrives as a click with detail 0, so it is handled separately.
  const startHold = (e: ReactPointerEvent<HTMLButtonElement>, direction: 1 | -1) => {
    if (e.button !== 0) return;
    setDraft(null);
    bump(direction);
    stopHold();
    timers.current.delay = setTimeout(() => {
      timers.current.repeat = setInterval(() => bump(direction), HOLD_INTERVAL_MS);
    }, HOLD_DELAY_MS);
  };

  const commit = (text: string) => {
    const n = parseNumber(text);
    if (n !== null) onChange(clamp(n, min, max));
    setDraft(null);
  };

  const shown = draft ?? (value === null ? "" : formatNumber(value, step));
  const buttonSize = large ? "h-16 w-16" : "h-12 w-12";
  const button =
    `${buttonSize} flex shrink-0 select-none items-center justify-center rounded-control border border-line ` +
    "bg-raised text-ink active:bg-line disabled:opacity-40";
  const atMin = min !== undefined && value !== null && value <= min;
  const atMax = max !== undefined && value !== null && value >= max;

  return (
    <div role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-1.5">
      <label id={`${id}-label`} htmlFor={id} className="text-[15px] font-medium text-ink-dim">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={button}
          aria-label={`Decrease ${label}`}
          disabled={disabled || atMin}
          onPointerDown={(e) => startHold(e, -1)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
          onClick={(e) => {
            if (e.detail === 0) bump(-1);
          }}
        >
          <IconMinus />
        </button>
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            disabled={disabled}
            value={shown}
            placeholder="0"
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const text = e.target.value;
              setDraft(text);
              const n = parseNumber(text);
              if (n !== null && n === clamp(n, min, max)) onChange(n);
            }}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className={`w-full rounded-control border border-line bg-surface text-center font-semibold text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none ${
              large ? "h-16 text-[28px]" : "h-12 text-[20px]"
            } ${unit ? "pr-8" : ""}`}
          />
          {unit ? (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[15px] text-ink-faint">
              {unit}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className={button}
          aria-label={`Increase ${label}`}
          disabled={disabled || atMax}
          onPointerDown={(e) => startHold(e, 1)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
          onClick={(e) => {
            if (e.detail === 0) bump(1);
          }}
        >
          <IconPlus />
        </button>
      </div>
      {hint ? <p className="text-[15px] text-ink-faint">{hint}</p> : null}
    </div>
  );
}
