"use client";

import { describeSync } from "@/components/shell/sync-chip";
import { dateTimeText } from "@/components/coach/format";
import { Notice } from "@/components/coach/notice";
import { Section } from "@/components/coach/section";
import { Button } from "@/components/ui";
import { ENGINE_VERSION } from "@/lib/engine/config";
import { syncNow, useProfile, useSyncStatus } from "@/lib/local";
import { APP_VERSION } from "./version";

export function AboutSection() {
  const sync = useSyncStatus();
  const profile = useProfile();
  const { text } = describeSync(sync);

  const rows: [string, string][] = [
    ["App version", APP_VERSION],
    ["Progression rules", ENGINE_VERSION],
    ["Sync", text],
    ["Last synced", sync.lastSyncedAt ? dateTimeText(sync.lastSyncedAt, profile?.timezone) : "Not yet on this device"],
  ];

  return (
    <Section title="About and sync">
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
      <Button variant="secondary" className="-ml-4 self-start" loading={sync.syncing} disabled={!sync.online} onClick={() => void syncNow()}>
        Sync now
      </Button>
      {!sync.online ? <p className="text-why">You are offline. Changes are saved here and sync when you reconnect.</p> : null}
    </Section>
  );
}
