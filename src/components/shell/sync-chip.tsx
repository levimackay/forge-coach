"use client";

import { useSyncStatus, type SyncStatus } from "@/lib/local/hooks";
import { syncNow } from "@/lib/local/sync";

type Tone = "quiet" | "busy" | "warn" | "error";

export function describeSync(s: SyncStatus): { text: string; tone: Tone } {
  if (s.failed > 0) return { text: `${s.failed} not saved`, tone: "error" };
  if (!s.online) return { text: s.pending > 0 ? `Offline, ${s.pending} to sync` : "Offline", tone: "warn" };
  if (s.syncing) return { text: "Syncing", tone: "busy" };
  if (s.error) return { text: s.pending > 0 ? `${s.pending} to sync, retrying` : "Sync paused", tone: "warn" };
  if (s.pending > 0) return { text: `${s.pending} to sync`, tone: "warn" };
  if (!s.hydrated) return { text: "Loading data", tone: "busy" };
  return { text: "Synced", tone: "quiet" };
}

const DOT: Record<Tone, string> = {
  quiet: "bg-ink-faint",
  busy: "bg-ink-dim motion-safe:animate-pulse",
  warn: "bg-ink",
  error: "bg-danger",
};

const TEXT: Record<Tone, string> = {
  quiet: "text-ink-faint",
  busy: "text-ink-dim",
  warn: "text-ink",
  error: "text-danger",
};

export function SyncChip() {
  const status = useSyncStatus();
  const { text, tone } = describeSync(status);
  return (
    <div className="flex">
      <button
        type="button"
        onClick={() => void syncNow()}
        aria-label={`Sync status: ${text}. Tap to sync now.`}
        className="-mr-2 flex h-11 items-center px-2"
      >
        <span
          className={`flex h-7 items-center gap-2 rounded-full border border-line bg-surface px-3 text-[13px] font-medium ${TEXT[tone]}`}
        >
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${DOT[tone]}`} />
          {text}
        </span>
      </button>
      {/* Outside the button so changes are announced; button content is not a live region. */}
      <span role="status" className="sr-only">
        {text}
      </span>
    </div>
  );
}
