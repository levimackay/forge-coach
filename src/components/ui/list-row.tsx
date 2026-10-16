import Link from "next/link";
import { Children, type ReactNode } from "react";
import { IconChevronRight } from "./icons";

export interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Puts a label in the 76px label column, with the title in the value column beside it. */
  label?: ReactNode;
  leading?: ReactNode;
  /** A value aligned to the right edge. */
  trailing?: ReactNode;
  /** The title is a day or lift name, set in the name style like every other name. */
  name?: boolean;
  /** Navigates with next/link. Shows a chevron unless `chevron` is false. */
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
  disabled?: boolean;
}

// A row is a hairline underneath and nothing else. The screen's gutter is the only padding on the sides.
const ROW = "flex w-full min-h-14 items-center gap-3 border-b border-rule py-3 text-left";
const INTERACTIVE = "active:underline aria-disabled:pointer-events-none";

export function ListRow({ title, subtitle, label, leading, trailing, name, href, onClick, chevron, disabled }: ListRowProps) {
  const interactive = Boolean(href || onClick);
  const showChevron = chevron ?? Boolean(href);

  const body = (
    <>
      {label ? <span className="w-[var(--label-col)] shrink-0 text-body">{label}</span> : null}
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className={`block break-words ${name ? "text-name" : "text-body"}`}>{title}</span>
        {subtitle ? <span className="block break-words text-small">{subtitle}</span> : null}
      </span>
      {trailing ? <span className="shrink-0 text-body">{trailing}</span> : null}
      {showChevron ? <IconChevronRight size={20} className="shrink-0" /> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} aria-disabled={disabled || undefined} className={`${ROW} ${INTERACTIVE}`}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={`${ROW} ${INTERACTIVE} disabled:text-grey`}>
        {body}
      </button>
    );
  }
  return <div className={interactive ? `${ROW} ${INTERACTIVE}` : ROW}>{body}</div>;
}

/** Rows stacked in a list. Each child becomes a list item, and each row carries its own hairline. */
export function ListGroup({ children, label, className = "" }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <ul aria-label={label} className={className}>
      {Children.toArray(children).map((child, i) => (
        <li key={i}>{child}</li>
      ))}
    </ul>
  );
}
