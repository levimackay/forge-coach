import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface Look {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-ember text-on-ember active:bg-ember-press font-semibold",
  secondary: "bg-raised text-ink border border-line active:bg-line font-medium",
  ghost: "text-ink active:bg-raised font-medium",
  danger: "bg-raised text-danger border border-line active:bg-line font-medium",
};

// Every size keeps the tap target at 44px or taller.
const SIZE: Record<ButtonSize, string> = {
  sm: "min-h-11 px-4 text-[15px]",
  md: "min-h-12 px-5 text-[17px]",
  lg: "min-h-14 px-6 text-[17px]",
};

export function buttonClass({ variant = "secondary", size = "md", fullWidth = false }: Look = {}): string {
  return [
    "inline-flex select-none items-center justify-center gap-2 rounded-control",
    "transition-colors disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40",
    VARIANT[variant],
    SIZE[size],
    fullWidth ? "w-full" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export interface ButtonProps extends Look, ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
}

export function Button({
  variant,
  size,
  fullWidth,
  loading = false,
  disabled,
  type = "button",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${buttonClass({ variant, size, fullWidth })} ${className}`}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export interface ButtonLinkProps extends Look, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  children: ReactNode;
}

/** A link that looks like a button, for navigation such as "Start workout". */
export function ButtonLink({ variant, size, fullWidth, className = "", href, children, ...rest }: ButtonLinkProps) {
  return (
    <Link href={href} className={`${buttonClass({ variant, size, fullWidth })} ${className}`} {...rest}>
      {children}
    </Link>
  );
}
