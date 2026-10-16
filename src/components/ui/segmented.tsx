"use client";

import { Fragment, useRef, type KeyboardEvent } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  /** Names the group for screen readers, for example "Weight unit". */
  label: string;
  /** Puts a "/" between the words, as in Home / Gym. Leave it off for a row of metric tabs. */
  slash?: boolean;
  className?: string;
}

/**
 * A word switch. The chosen word is ink with a 2px underline and the rest are grey,
 * so the state is readable without colour.
 */
export function Segmented<T extends string>({ value, onChange, options, label, slash = false, className = "" }: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = options.length - 1;
    let next = index;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = index === last ? 0 : index + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = index === 0 ? last : index - 1;
    else return;
    e.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className={`flex items-center ${className}`}>
      {options.map((option, i) => {
        const selected = option.value === value;
        return (
          <Fragment key={option.value}>
            {slash && i > 0 ? (
              <span aria-hidden="true" className="text-word text-grey">
                /
              </span>
            ) : null}
            <button
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`inline-flex min-h-11 min-w-11 items-center justify-center px-2.5 text-word ${
                selected ? "text-ink underline decoration-2 underline-offset-[7px]" : "text-grey"
              }`}
            >
              {option.label}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
