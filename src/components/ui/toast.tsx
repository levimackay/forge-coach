"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IconClose } from "./icons";

export interface ToastOptions {
  tone?: "neutral" | "error";
  /** One tap action such as Undo. The toast stays a little longer when it has one. */
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
}

interface ToastApi {
  toast: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside ToastProvider.");
  return api;
}

const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, options: ToastOptions = {}) => {
    nextId.current += 1;
    const item: ToastItem = { id: nextId.current, message, ...options };
    setItems((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), item]);
  }, []);

  const api = useMemo<ToastApi>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
        style={{ bottom: "calc(var(--tabbar-height) + env(safe-area-inset-bottom) + 12px)" }}
      >
        {items.map((item) => (
          <ToastView key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const { id, durationMs, action } = item;
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), durationMs ?? (action ? 7000 : 4000));
    return () => clearTimeout(timer);
  }, [id, durationMs, action, onDismiss]);

  const error = item.tone === "error";
  return (
    <div
      role={error ? "alert" : undefined}
      className={`pointer-events-auto flex min-h-12 w-full max-w-md items-center gap-3 rounded-control border bg-raised py-2 pl-4 pr-2 text-[16px] motion-safe:animate-[toast-in_180ms_ease-out] ${
        error ? "border-danger text-ink" : "border-line text-ink"
      }`}
    >
      <p className="min-w-0 flex-1">{item.message}</p>
      {action ? (
        <button
          type="button"
          onClick={() => {
            action.onClick();
            onDismiss(id);
          }}
          className="min-h-11 shrink-0 rounded-[10px] px-3 font-semibold text-ember active:bg-line"
        >
          {action.label}
        </button>
      ) : (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => onDismiss(id)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-faint active:bg-line"
        >
          <IconClose size={20} />
        </button>
      )}
    </div>
  );
}
