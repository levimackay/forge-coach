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

/**
 * Sync state as plain text. A state that needs attention is set in medium weight,
 * so it reads without colour.
 */
export function SyncChip({ align = "start" }: { align?: "start" | "end" }) {
  const status = useSyncStatus();
  const { text, tone } = describeSync(status);
  return (
    <div className="flex">
      <button
        type="button"
        onClick={() => void syncNow()}
        aria-label={`Sync status: ${text}. Tap to sync now.`}
        className={`inline-flex min-h-11 min-w-11 items-center text-small ${
          align === "end" ? "justify-end" : "justify-start"
        } ${tone === "warn" || tone === "error" ? "font-medium" : ""}`}
      >
        {text}
      </button>
      {/* Outside the button so changes are announced; button content is not a live region. */}
      <span role="status" className="sr-only">
        {text}
      </span>
    </div>
  );
}
