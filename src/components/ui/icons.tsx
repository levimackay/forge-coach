import type { ReactNode, SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: number;
}

/**
 * Hand-drawn glyphs: straight strokes, square ends, 2px at any size. They take the
 * current text colour, so the parent decides whether one is ink or grey.
 */
function Icon({ size = 24, strokeWidth = 2, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

const Stroke = ({ d }: { d: string }) => <path d={d} vectorEffect="non-scaling-stroke" />;

export const IconMinus = (p: IconProps) => (
  <Icon {...p}>
    <Stroke d="M4 12h16" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <Stroke d="M4 12h16M12 4v16" />
  </Icon>
);

export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <Stroke d="M9 5l7 7-7 7" />
  </Icon>
);

export const IconChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <Stroke d="M5 9l7 7 7-7" />
  </Icon>
);

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <Stroke d="M5 5l14 14M19 5L5 19" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <Stroke d="M4 12.5l5 5L20 6.5" />
  </Icon>
);

/** The FORGE mark: an F and a period, set light in the app's own typeface. Same letterform as the app icon. */
export function ForgeMark({ size = 48, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block font-light leading-none tracking-[-0.05em] ${className}`}
      style={{ fontSize: size }}
    >
      F.
    </span>
  );
}
