"use client";

import { describeSync } from "@/components/shell/sync-chip";
import { dateTimeText } from "@/components/coach/format";
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
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
        <dl className="flex flex-col gap-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4">
              <dt className="text-[15px] text-ink-dim">{label}</dt>
              <dd className="text-right text-[17px] text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        {sync.failed > 0 ? (
          <p className="text-[15px] text-danger">
            {`${sync.failed} ${sync.failed === 1 ? "change was" : "changes were"} refused by the server and stay on this device. Export your data before you clear anything.`}
          </p>
        ) : null}
        {sync.error ? <p className="text-[15px] text-ink-dim">{sync.error}</p> : null}
        <Button variant="secondary" loading={sync.syncing} disabled={!sync.online} onClick={() => void syncNow()}>
          Sync now
        </Button>
        {!sync.online ? <p className="text-[15px] text-ink-dim">You are offline. Changes are saved here and sync when you reconnect.</p> : null}
      </div>
    </Section>
  );
}
