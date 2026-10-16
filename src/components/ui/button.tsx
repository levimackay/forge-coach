import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

/**
 * primary    full-width ink band, black label. The one action a screen is for.
 * live       red band, only on the live workout screen (Log set).
 * danger     red band, only for confirming something destructive.
 * secondary  plain underlined text in a 44px or taller target.
 * ghost      the same, tighter, for an action that sits inside a sentence or a row.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "live";
export type ButtonSize = "sm" | "md" | "lg";
/** Fix a band to the screen: above the tab bar, or flush with the bottom edge. */
export type ButtonPin = "tabs" | "bottom";

interface Look {
  variant?: ButtonVariant;
  /** Sets the height of a text button. Bands have one height. */
  size?: ButtonSize;
  /** Stretches a text button across its container. Bands are always full width. */
  fullWidth?: boolean;
  /** Draws the button as unavailable, in grey. Set by Button itself when it is disabled. */
  inactive?: boolean;
  /** Bands only. Pins the band full-bleed to the screen. */
  pinned?: ButtonPin;
}

const BAND_VARIANTS: ButtonVariant[] = ["primary", "danger", "live"];

const BAND =
  "flex select-none items-center justify-between gap-4 px-safe text-left text-band " +
  "focus-visible:-outline-offset-4";

const BAND_HEIGHT: Record<string, string> = {
  primary: "min-h-16",
  danger: "min-h-16",
  live: "min-h-[calc(var(--live-band-height)+env(safe-area-inset-bottom))] pb-safe",
};

const BAND_COLOR: Record<string, string> = {
  primary:
    "bg-ink text-ground focus-visible:outline-ground " +
    "active:bg-ground active:text-ink active:outline-2 active:-outline-offset-2 active:outline-ink",
  danger:
    "bg-red text-ink focus-visible:outline-ink " +
    "active:bg-ground active:outline-2 active:-outline-offset-2 active:outline-red",
  live:
    "bg-red text-ink focus-visible:outline-ink " +
    "active:bg-ground active:outline-2 active:-outline-offset-2 active:outline-red",
};

// An unavailable band gives up its fill, so it cannot be mistaken for the action it stands in for.
const BAND_INACTIVE = "border-y border-rule bg-ground text-grey";

const TEXT =
  "inline-flex select-none items-center gap-2 underline decoration-1 underline-offset-4 " +
  "active:bg-ink active:text-ground";

const TEXT_SIZE: Record<ButtonSize, string> = {
  sm: "min-h-11 text-small",
  md: "min-h-12 text-body",
  lg: "min-h-14 text-body",
};

const TEXT_PAD: Record<string, string> = { secondary: "px-4", ghost: "px-2" };

const PIN: Record<ButtonPin, string> = {
  tabs: "fixed inset-x-0 z-30 bottom-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))]",
  bottom: "fixed inset-x-0 bottom-0 z-30",
};

export function buttonClass({
  variant = "secondary",
  size = "md",
  fullWidth = false,
  inactive = false,
  pinned,
}: Look = {}): string {
  const band = BAND_VARIANTS.includes(variant);
  const parts = band
    ? [BAND, BAND_HEIGHT[variant], inactive ? BAND_INACTIVE : BAND_COLOR[variant], pinned ? PIN[pinned] : ""]
    : [
        TEXT,
        TEXT_SIZE[size],
        // Stretched across a row, the label sits on the gutter like every other line of text.
        fullWidth ? "w-full justify-start px-0 text-left" : `justify-center text-center ${TEXT_PAD[variant]}`,
        inactive ? "text-grey" : "",
      ];
  return [...parts, "disabled:pointer-events-none aria-disabled:pointer-events-none"].filter(Boolean).join(" ");
}

/** A quarter arc that turns. No track, so nothing in it is a tint. */
function Spinner() {
  return (
    <svg className="h-5 w-5 shrink-0 motion-safe:animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Content({
  band,
  loading,
  detail,
  children,
}: {
  band: boolean;
  loading: boolean;
  detail?: ReactNode;
  children: ReactNode;
}) {
  if (!band) {
    return (
      <>
        {loading ? <Spinner /> : null}
        {children}
      </>
    );
  }
  return (
    <>
      <span>{children}</span>
      {loading ? <Spinner /> : detail ? <span className="text-fig-24 font-normal">{detail}</span> : null}
    </>
  );
}

interface BandContent {
  /** Bands only. Right-aligned value the action applies, such as "160 × 6, 2 RIR". */
  detail?: ReactNode;
}

export interface ButtonProps extends Look, BandContent, ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
}

export function Button({
  variant,
  size,
  fullWidth,
  pinned,
  detail,
  loading = false,
  disabled,
  type = "button",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const inactive = Boolean(disabled) && !loading;
  const band = BAND_VARIANTS.includes(variant ?? "secondary");
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${buttonClass({ variant, size, fullWidth, inactive, pinned })} ${className}`}
      {...rest}
    >
      <Content band={band} loading={loading} detail={detail}>
        {children}
      </Content>
    </button>
  );
}

export interface ButtonLinkProps
  extends Omit<Look, "inactive">,
    BandContent,
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  children: ReactNode;
}

/** A link drawn as a button, for navigation such as "Start workout". */
export function ButtonLink({
  variant,
  size,
  fullWidth,
  pinned,
  detail,
  className = "",
  href,
  children,
  ...rest
}: ButtonLinkProps) {
  const band = BAND_VARIANTS.includes(variant ?? "secondary");
  return (
    <Link href={href} className={`${buttonClass({ variant, size, fullWidth, pinned })} ${className}`} {...rest}>
      <Content band={band} loading={false} detail={detail}>
        {children}
      </Content>
    </Link>
  );
}
