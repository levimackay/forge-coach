import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

interface FieldBase {
  label: string;
  hint?: string;
  error?: string | null;
  /** Short unit or note shown inside the right edge, such as "lb". */
  suffix?: ReactNode;
}

type InputFieldProps = FieldBase &
  Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> & { multiline?: false };

type TextareaFieldProps = FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement> & { multiline: true };

export type FieldProps = InputFieldProps | TextareaFieldProps;

const CONTROL =
  "w-full rounded-control border bg-surface px-4 text-ink placeholder:text-ink-faint " +
  "focus:border-ink focus:outline-none focus-visible:outline-none aria-invalid:border-danger";

export function Field(props: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const { label, hint, error, suffix } = props;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  const border = error ? "border-danger" : "border-line";

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[15px] font-medium text-ink-dim">
        {label}
      </label>
      <div className="relative">
        {props.multiline ? (
          <textarea
            {...stripBase(props)}
            id={id}
            rows={props.rows ?? 3}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={`${CONTROL} ${border} min-h-24 py-3 ${props.className ?? ""}`}
          />
        ) : (
          <input
            {...stripBase(props)}
            id={id}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={`${CONTROL} ${border} min-h-12 ${suffix ? "pr-14" : ""} ${props.className ?? ""}`}
          />
        )}
        {suffix && !props.multiline ? (
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[15px] text-ink-faint">
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-[15px] text-danger">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-[15px] text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function stripBase<T extends FieldProps>(props: T) {
  const { label: _l, hint: _h, error: _e, suffix: _s, multiline: _m, className: _c, ...rest } = props;
  void _l;
  void _h;
  void _e;
  void _s;
  void _m;
  void _c;
  return rest;
}
