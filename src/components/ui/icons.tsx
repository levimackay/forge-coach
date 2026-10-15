import type { ReactNode, SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: number;
}

function Icon({ size = 24, strokeWidth = 1.8, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconToday = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3c.9 3.1 4.6 4.7 4.6 9a4.6 4.6 0 1 1-9.2 0c0-1.8.8-3.1 1.7-4 .2 1.2.9 1.9 1.6 2.2C10.4 7.6 11 5.4 12 3z" />
  </Icon>
);

export const IconProgram = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
  </Icon>
);

export const IconProgress = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4v16h16M8 15l4-4 3 3 5-6" />
  </Icon>
);

export const IconCoach = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
  </Icon>
);

export const IconSettings = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h8M18 7h2M4 17h2M12 17h8" />
    <circle cx="15" cy="7" r="2.2" />
    <circle cx="9" cy="17" r="2.2" />
  </Icon>
);

export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 6l6 6-6 6" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const IconMinus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
);

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12.5l4.6 4.6L19 7.6" />
  </Icon>
);

export const IconMail = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
    <path d="M4 7.5l8 6 8-6" />
  </Icon>
);

/** The FORGE mark: an anvil in the current color with three strike sparks in ink. Same geometry as the app icon. */
export function ForgeMark({ size = 48, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 6 64 52"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path
        d="M4 27.5L18 22H57V29.5H50.5C50.5 33.2 47.5 35.6 43.5 36.2V44.2L51 48.2V54.5H15V48.2L22.5 44.2V36.2C15 35.6 8.2 32 4 27.5Z"
        fill="currentColor"
      />
      <path
        d="M36.5 17.2L34.4 11.4M43.5 15.6V9.4M50.6 17.2L52.7 11.4"
        fill="none"
        style={{ stroke: "var(--color-ink)" }}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
