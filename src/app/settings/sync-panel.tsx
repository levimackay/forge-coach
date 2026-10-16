"use client";

import { describeSync } from "@/components/shell/sync-chip";
import { dateTimeText } from "@/components/coach/format";
import { Notice } from "@/components/coach/notice";
import { Button } from "@/components/ui";
import { syncNow, useProfile, useSyncStatus } from "@/lib/local";
import { APP_VERSION } from "./version";

export function SyncPanel() {
  const sync = useSyncStatus();
  const profile = useProfile();
  const { text } = describeSync(sync);

  const rows: [string, string][] = [
    ["Sync", text],
    ["Last synced", sync.lastSyncedAt ? dateTimeText(sync.lastSyncedAt, profile?.timezone) : "Not yet on this device"],
    ["App version", APP_VERSION],
  ];

  return (
    <div className="flex flex-col gap-4">
      <dl className="border-b border-rule">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-h-11 items-baseline justify-between gap-4 border-t border-rule py-2.5">
            <dt>{label}</dt>
            <dd className="text-right">{value}</dd>
          </div>
        ))}
      </dl>
      {sync.failed > 0 ? (
        <Notice
          title={`${sync.failed} ${sync.failed === 1 ? "change was" : "changes were"} refused by the server and stay on this device. Export your data before you clear anything.`}
        />
      ) : null}
      {sync.error ? <p className="text-why">{sync.error}</p> : null}
      <Button variant="primary" className="bleed" loading={sync.syncing} disabled={!sync.online} onClick={() => void syncNow()}>
        Sync now
      </Button>
    </div>
  );
}
