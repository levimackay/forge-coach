"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { named } from "./name";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Shown as a section name, so it gets its period. */
  title: string;
  children: ReactNode;
  /** Pinned under the scrolling content, full width, for the primary band. */
  footer?: ReactNode;
}

/**
 * A full-width square sheet with a hairline on top, on the native dialog element,
 * which gives focus trapping, Escape to close and an inert page behind it.
 */
export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        // A click on the dialog element itself is a click on the backdrop.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open ? (
        <div className="flex max-h-[90dvh] flex-col">
          <div className="flex items-center justify-between gap-4 px-safe pt-2">
            <h2 id={titleId} className="py-3 text-name">
              {named(title)}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-body underline decoration-1 underline-offset-4 active:bg-ink active:text-ground"
            >
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-safe pb-6 pt-2">{children}</div>
          {footer ? <div className="border-t border-rule pb-safe">{footer}</div> : <div className="pb-safe" />}
        </div>
      ) : null}
    </dialog>
  );
}
