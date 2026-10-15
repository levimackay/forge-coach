import Link from "next/link";
import { Children, type ReactNode } from "react";
import { IconChevronRight } from "./icons";

export interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Navigates with next/link. Shows a chevron unless `chevron` is false. */
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
  disabled?: boolean;
}

const ROW =
  "flex w-full min-h-14 items-center gap-3 px-4 py-3 text-left transition-colors " +
  "border-b border-line last:border-b-0";
const INTERACTIVE = "active:bg-raised aria-disabled:opacity-40 aria-disabled:pointer-events-none";

export function ListRow({ title, subtitle, leading, trailing, href, onClick, chevron, disabled }: ListRowProps) {
  const interactive = Boolean(href || onClick);
  const showChevron = chevron ?? Boolean(href);

  const body = (
    <>
      {leading ? <span className="shrink-0 text-ink-dim">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] text-ink">{title}</span>
        {subtitle ? <span className="block truncate text-[15px] text-ink-dim">{subtitle}</span> : null}
      </span>
      {trailing ? <span className="shrink-0 text-[17px] text-ink-dim">{trailing}</span> : null}
      {showChevron ? <IconChevronRight size={20} className="shrink-0 text-ink-faint" /> : null}
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
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`${ROW} ${INTERACTIVE} disabled:opacity-40`}
      >
        {body}
      </button>
    );
  }
  return <div className={interactive ? `${ROW} ${INTERACTIVE}` : ROW}>{body}</div>;
}

/** A rounded group of rows with hairline dividers. Each child becomes a list item. */
export function ListGroup({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="overflow-hidden rounded-card border border-line bg-surface">
      {Children.toArray(children).map((child, i) => (
        <li key={i}>{child}</li>
      ))}
    </ul>
  );
}
