import type { ReactNode } from "react";
import { named } from "./name";

export interface EmptyStateProps {
  /** Shown as a name, so it gets its period. */
  title: string;
  /** What to do next, in a sentence or two. */
  children?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-3 py-12">
      <h2 className="text-name">{named(title)}</h2>
      {children ? <p className="max-w-sm text-body">{children}</p> : null}
      {action ? <div className="mt-2 self-stretch">{action}</div> : null}
    </div>
  );
}
