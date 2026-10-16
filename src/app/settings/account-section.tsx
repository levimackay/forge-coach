"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Section } from "@/components/coach/section";
import { useOnline } from "@/components/coach/use-now";
import { Button, Field, ListGroup, ListRow, Sheet, useToast } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { deleteAllMyData, syncNow, useSyncStatus } from "@/lib/local";
import { clearLocalData } from "@/lib/local/data";
import { callRpc } from "@/lib/local/proposals";

const WORD = "DELETE";

type Danger = "data" | "account" | null;

export function AccountSection() {
  const { user, signOut } = useAuth();
  const sync = useSyncStatus();
  const online = useOnline();
  const router = useRouter();
  const { toast } = useToast();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [danger, setDanger] = useState<Danger>(null);

  const unsynced = sync.pending + sync.failed;

  const doSignOut = async () => {
    setConfirmSignOut(false);
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
    <Section
      title="Account"
      description="Deleting your data or your account needs a connection, because it removes data from the server as well as this device. Export first if you want a copy."
    >
      <ListGroup label="Account" className="border-t border-rule">
        <ListRow label="Email" title={user?.email ?? "Unknown"} />
        <ListRow
          title="Sign out"
          trailing={signingOut ? "Signing out" : undefined}
          disabled={signingOut}
          onClick={() => (unsynced > 0 ? setConfirmSignOut(true) : void doSignOut())}
        />
        <ListRow
          title="Delete all my data"
          subtitle="Clears your workouts, program, goals and logs. You keep your account and start setup again."
          chevron
          disabled={!online}
          onClick={() => setDanger("data")}
        />
        <ListRow
          title="Delete my account"
          subtitle="Removes your data and your sign-in for good."
          chevron
          disabled={!online}
          onClick={() => setDanger("account")}
        />
      </ListGroup>
      {!online ? <p className="text-why">You are offline. Connect to delete anything.</p> : null}

      <Sheet
        open={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        title="Sign out with unsynced changes?"
        footer={
          <div className="flex items-stretch">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmSignOut(false)}>
              Stay signed in
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => void doSignOut()}>
              Sign out
            </Button>
          </div>
        }
      >
        <p>
          {`${unsynced} ${unsynced === 1 ? "change has" : "changes have"} not reached the server. They stay on this device and sync the next time you sign in to this account. If someone signs in to a different account here first, FORGE asks before deleting them.`}
        </p>
      </Sheet>

      <Sheet
        open={danger !== null}
        onClose={() => setDanger(null)}
        title={danger === "account" ? "Delete your account?" : "Delete all your data?"}
      >
        {danger ? (
          <TypedConfirm
            description={
              danger === "account"
                ? "This permanently deletes your account and everything in it, on the server and on this device. It cannot be undone."
                : "This permanently deletes your workouts, program, goals, recovery logs and measurements, on the server and on this device. It cannot be undone."
            }
            action={danger === "account" ? "Delete my account" : "Delete all my data"}
            onConfirm={danger === "account" ? deleteAccount : deleteData}
            onClose={() => setDanger(null)}
          />
        ) : null}
      </Sheet>
    </Section>
  );
}

function TypedConfirm({
  description,
  action,
  onConfirm,
  onClose,
}: {
  description: string;
  action: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work.");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p>{description}</p>
      <Field
        label={`Type ${WORD} to confirm`}
        value={typed}
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        error={error}
        onChange={(e) => setTyped(e.target.value)}
      />
      <div className="flex flex-col">
        <Button variant="danger" className="bleed" loading={busy} disabled={typed.trim() !== WORD} onClick={() => void run()}>
          {action}
        </Button>
        <Button variant="secondary" size="lg" fullWidth disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
