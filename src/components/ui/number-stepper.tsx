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
  /** The 116px row with the 88px figure, for the weight being logged. Without it the row is 80px. */
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
  const atMin = min !== undefined && value !== null && value <= min;
  const atMax = max !== undefined && value !== null && value >= max;

  // The figure is the loudest thing in the row, so it steps down in size rather than clip a long value.
  const chars = Math.max(shown.length, 1);
  const figure = !large ? "text-fig-48" : chars <= 3 ? "text-fig-88" : chars === 4 ? "text-fig-72" : "text-fig-48";
  const cell =
    "flex h-full w-14 select-none items-center justify-center border-l border-rule " +
    "active:bg-ink active:text-ground disabled:text-grey disabled:active:bg-transparent";

  return (
    <div role="group" aria-labelledby={`${id}-label`}>
      <div
        className={`grid grid-cols-[var(--label-col)_minmax(0,1fr)_56px_56px] items-stretch border-t border-rule ${
          large ? "h-[116px]" : "h-20"
        }`}
      >
        <label id={`${id}-label`} htmlFor={id} className="flex items-center pr-2 text-body">
          {label}
        </label>
        <div className="flex min-w-0 items-baseline pt-[14px]">
          <span className="relative inline-grid min-w-0">
            {/* Takes the width of the digits, so the unit sits against them and the input overlays it. */}
            <span aria-hidden="true" className={`invisible whitespace-pre ${figure} ${large ? "-ml-1" : ""}`}>
              {shown || "0"}
            </span>
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
              className={`absolute inset-y-0 -left-3 h-full w-[calc(100%+1.5rem)] bg-transparent px-3 py-0 text-ink placeholder:text-grey ${figure} ${
                large ? "-ml-1" : ""
              }`}
            />
          </span>
          {unit ? <span className="ml-1 shrink-0 text-body">{unit}</span> : null}
        </div>
        <button
          type="button"
          className={cell}
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
        <button
          type="button"
          className={cell}
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
      {hint ? <p className="pb-2 text-small">{hint}</p> : null}
    </div>
  );
}
