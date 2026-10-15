import { useId } from "react";
import { IconChevronRight } from "@/components/ui/icons";

export interface NativeSelectOption {
  value: string;
  label: string;
}

/** The platform picker, which on iPhone is the wheel everyone already knows. */
export function NativeSelect({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: NativeSelectOption[];
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[15px] font-medium text-ink-dim">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="min-h-12 w-full appearance-none rounded-control border border-line bg-surface pl-4 pr-11 text-ink focus:border-ink focus:outline-none"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <IconChevronRight size={20} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-ink-faint" />
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="text-[15px] text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
