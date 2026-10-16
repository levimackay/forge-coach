"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveTextFile } from "@/components/coach/browser-actions";
import { useOnline } from "@/components/coach/use-now";
import { ScreenBar } from "@/components/shell/screen-bar";
import { describeSync } from "@/components/shell/sync-chip";
import { Button, ButtonLink, ListGroup, ListRow, Sheet, useToast } from "@/components/ui";
import { ScreenTitle } from "@/components/train/bits";
import { useAuth } from "@/lib/auth";
import { deleteAllMyData, exportAll, syncNow, useProfile, useSyncStatus } from "@/lib/local";
import { clearLocalData } from "@/lib/local/data";
import { callRpc } from "@/lib/local/proposals";
import { EquipmentPanel } from "./equipment-panel";
import { GoalsPanel } from "./goals-panel";
import { ImportPanel } from "./import-panel";
import { InstallPanel } from "./install-panel";
import { ProfilePanel } from "./profile-panel";
import { SyncPanel } from "./sync-panel";
import { TypedConfirm } from "./typed-confirm";

type Panel = "profile" | "equipment" | "goals" | "import" | "install" | "sync" | "sign-out" | "delete-data" | "delete-account";

const TITLE: Record<Panel, string> = {
  profile: "Units and profile",
  equipment: "Equipment",
  goals: "Goals",
  import: "Import data",
  install: "Install on iPhone",
  sync: "Sync",
  "sign-out": "Sign out with unsynced changes?",
  "delete-data": "Delete all your data?",
  "delete-account": "Delete your account?",
};

export function SettingsScreen() {
  const { user, signOut } = useAuth();
  const profile = useProfile();
  const sync = useSyncStatus();
  const online = useOnline();
  const router = useRouter();
  const { toast } = useToast();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [exporting, setExporting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const unsynced = sync.pending + sync.failed;
  const close = () => setPanel(null);
  const offline = online ? undefined : "Needs a connection";

  const runExport = async () => {
    setExporting(true);
    try {
      const data = await exportAll();
      const rows = Object.values(data.tables).reduce((n, list) => n + (list?.length ?? 0), 0);
      await saveTextFile(`forge-export-${data.exported_at.slice(0, 10)}.json`, `${JSON.stringify(data, null, 2)}\n`, "application/json");
      toast(`Exported ${rows.toLocaleString("en-US")} rows.`);
    } catch (err) {
      toast(`Could not export: ${err instanceof Error ? err.message : "unknown error"}`, { tone: "error" });
    } finally {
      setExporting(false);
    }
  };

  const doSignOut = async () => {
    close();
    setSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      toast(`Could not sign out: ${err instanceof Error ? err.message : "unknown error"}`, { tone: "error" });
      setSigningOut(false);
    }
  };

  const deleteData = async () => {
    await deleteAllMyData();
    // Clearing the device also cleared the "first pull done" marker; pull the now empty account so setup can start.
    await syncNow();
    toast("All your data is deleted.");
    router.replace("/");
  };

  const deleteAccount = async () => {
    await callRpc("delete_my_account");
    // The account is gone; wipe this device too so nothing tries to sync to it.
    await clearLocalData();
    await signOut();
  };

  return (
    <div className="flex flex-col pb-6">
      <ScreenBar
        start={
          <ButtonLink href="/more" variant="ghost" size="sm" className="-ml-2">
            Back
          </ButtonLink>
        }
      />
      <ScreenTitle title="Settings" />

      <ListGroup label="Settings" className="mt-3 border-t border-rule">
        <ListRow title="Units and profile" trailing={profile?.unit} chevron onClick={() => setPanel("profile")} />
        <ListRow title="Equipment" chevron onClick={() => setPanel("equipment")} />
        <ListRow title="Goals" chevron onClick={() => setPanel("goals")} />
        <ListRow title="Export" trailing={exporting ? "Exporting" : undefined} disabled={exporting} onClick={() => void runExport()} />
        <ListRow title="Import" chevron onClick={() => setPanel("import")} />
        <ListRow title="Install on iPhone" chevron onClick={() => setPanel("install")} />
        <ListRow title="Sync" trailing={describeSync(sync).text} chevron onClick={() => setPanel("sync")} />
      </ListGroup>

      <ListGroup label="Account" className="mt-10 border-t border-rule">
        <ListRow
          title="Sign out"
          subtitle={user?.email}
          trailing={signingOut ? "Signing out" : undefined}
          disabled={signingOut}
          onClick={() => (unsynced > 0 ? setPanel("sign-out") : void doSignOut())}
        />
        <ListRow title="Delete all my data" subtitle={offline} chevron disabled={!online} onClick={() => setPanel("delete-data")} />
        <ListRow title="Delete my account" subtitle={offline} chevron disabled={!online} onClick={() => setPanel("delete-account")} />
      </ListGroup>

      <Sheet
        open={panel !== null}
        onClose={close}
        title={panel ? TITLE[panel] : ""}
        footer={
          panel === "sign-out" ? (
            <div className="flex items-stretch">
              <Button variant="secondary" className="flex-1" onClick={close}>
                Stay signed in
              </Button>
              <Button variant="primary" className="flex-1" onClick={() => void doSignOut()}>
                Sign out
              </Button>
            </div>
          ) : undefined
        }
      >
        {panel === "profile" ? <ProfilePanel onDone={close} /> : null}
        {panel === "equipment" ? <EquipmentPanel /> : null}
        {panel === "goals" ? <GoalsPanel /> : null}
        {panel === "import" ? <ImportPanel onDone={close} /> : null}
        {panel === "install" ? <InstallPanel /> : null}
        {panel === "sync" ? <SyncPanel /> : null}
        {panel === "sign-out" ? (
          <p>
            {`${unsynced} ${unsynced === 1 ? "change has" : "changes have"} not reached the server. They stay on this device and sync the next time you sign in to this account. If someone signs in to a different account here first, FORGE asks before deleting them.`}
          </p>
        ) : null}
        {panel === "delete-data" ? (
          <TypedConfirm
            description="This permanently deletes your workouts, program, goals, recovery logs and measurements, on the server and on this device. It cannot be undone."
            action="Delete all my data"
            onConfirm={deleteData}
            onClose={close}
          />
        ) : null}
        {panel === "delete-account" ? (
          <TypedConfirm
            description="This permanently deletes your account and everything in it, on the server and on this device. It cannot be undone."
            action="Delete my account"
            onConfirm={deleteAccount}
            onClose={close}
          />
        ) : null}
      </Sheet>
    </div>
  );
}
