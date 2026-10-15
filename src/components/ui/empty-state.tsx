import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  /** What to do next, in a sentence or two. */
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, children, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon ? <div className="text-ink-faint">{icon}</div> : null}
      <h2 className="title">{title}</h2>
      {children ? <p className="max-w-sm text-[17px] text-ink-dim">{children}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
