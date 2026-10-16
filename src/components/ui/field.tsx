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

// A label above a control that is only an ink underline. An invalid field thickens the underline,
// so the state never rests on colour.
const CONTROL =
  "w-full border-0 border-b border-ink bg-transparent px-0 text-body text-ink placeholder:text-grey " +
  "aria-invalid:border-b-2";

export function Field(props: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const { label, hint, error, suffix } = props;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body">
        {label}
      </label>
      <div className="relative">
        {props.multiline ? (
          <textarea
            {...stripBase(props)}
            id={id}
            rows={props.rows ?? 2}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={`${CONTROL} min-h-14 resize-none py-2 ${props.className ?? ""}`}
          />
        ) : (
          <input
            {...stripBase(props)}
            id={id}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={`${CONTROL} min-h-12 ${suffix ? "pr-14" : ""} ${props.className ?? ""}`}
          />
        )}
        {suffix && !props.multiline ? (
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-body">
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-small font-medium">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-small">
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
