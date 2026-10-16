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

const changes = (n: number) => `${n} ${n === 1 ? "change" : "changes"}`;

/**
 * The one line the lifter sees about sync, or null while everything is fine. A write that waits
 * for the network or retries is not worth saying until it is stuck: offline with something to
 * send, a failed push, or a write the server refused.
 */
export function syncProblem(s: SyncStatus): string | null {
  if (s.failed > 0) return `${changes(s.failed)} could not be saved.`;
  if (!s.online) return s.pending > 0 ? `Offline. ${changes(s.pending)} will sync later.` : null;
  if (s.error && s.pending > 0) return "Could not sync. Trying again.";
  return null;
}

/** Sits once at the top of every signed-in screen and says nothing when sync is fine. */
export function SyncLine() {
  const status = useSyncStatus();
  const text = syncProblem(status);
  if (text === null) return null;
  return (
    <div role="status" className="flex min-h-11 items-center justify-between gap-4 border-b border-rule text-small">
      <span>{text}</span>
      {status.online ? (
        <button
          type="button"
          onClick={() => void syncNow()}
          className="-mr-2 inline-flex min-h-11 min-w-11 items-center justify-center px-2 underline decoration-1 underline-offset-4 active:bg-ink active:text-ground"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

/** Kept so screens that still mount it compile. The sync line now lives once in the app shell. */
export const SyncChip: (props: { align?: "start" | "end" }) => null = () => null;
