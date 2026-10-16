import { useId } from "react";
import { IconChevronDown } from "@/components/ui/icons";

export interface NativeSelectOption {
  value: string;
  label: string;
}

/** The platform picker, which on iPhone is the wheel everyone already knows. A label above an ink underline, like a Field. */
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
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="min-h-12 w-full appearance-none border-0 border-b border-ink bg-transparent pl-0 pr-8 text-body text-ink"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <IconChevronDown size={20} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2" />
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="text-small">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
