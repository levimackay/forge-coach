import type { ReactNode } from "react";
import { IconCheck } from "@/components/ui";

/**
 * A checkbox drawn as a 24px square: hollow when off, filled ink with a check when on, so the state
 * shows in shape and not in colour. The whole row is the 44px target.
 */
export function CheckField({
  checked,
  onChange,
  disabled,
  children,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="flex min-h-11 items-start gap-3 py-2.5">
      <span className="relative mt-px flex h-6 w-6 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer h-6 w-6 appearance-none border-2 border-ink bg-ground checked:bg-ink disabled:border-grey disabled:checked:bg-grey"
        />
        <IconCheck size={20} className="pointer-events-none absolute inset-0 m-auto hidden text-ground peer-checked:block" />
      </span>
      <span className="flex min-w-0 flex-col">
        {children}
        {hint ? <span className="text-small">{hint}</span> : null}
      </span>
    </label>
  );
}
