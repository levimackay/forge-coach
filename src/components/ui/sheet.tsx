"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconClose } from "./icons";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Pinned under the scrolling content, for the primary action. */
  footer?: ReactNode;
}

/**
 * A bottom sheet on the native dialog element, which gives focus trapping,
 * Escape to close and an inert page behind it without extra code.
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
          <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
            <h2 id={titleId} className="title">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-3 flex h-11 w-11 items-center justify-center rounded-full text-ink-dim active:bg-raised"
            >
              <IconClose />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-2">{children}</div>
          {footer ? (
            <div className="border-t border-line px-5 pb-safe pt-3">
              <div className="pb-3">{footer}</div>
            </div>
          ) : (
            <div className="pb-safe" />
          )}
        </div>
      ) : null}
    </dialog>
  );
}
