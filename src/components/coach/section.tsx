import { useId, type ReactNode } from "react";

/** A titled block of a screen. The heading names the region for screen reader navigation. */
export function Section({
  title,
  description,
  children,
  anchor,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Makes the section a link target such as `#connect`. */
  anchor?: string;
}) {
  const id = useId();
  return (
    <section id={anchor} aria-labelledby={id} className="flex scroll-mt-4 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="title">
          {title}
        </h2>
        {description ? <p className="text-[15px] text-ink-dim">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-card border border-line bg-surface p-4 ${className}`}>{children}</div>;
}
