"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useProfile, useSyncStatus } from "@/lib/local/hooks";
import { syncNow } from "@/lib/local/sync";
import { Button } from "@/components/ui/button";
import { Splash } from "@/components/shell/splash";

/** Entry point only: decides where a visitor belongs and sends them there. */
export default function Home() {
  const router = useRouter();
  const { status } = useAuth();
  const profile = useProfile();
  const sync = useSyncStatus();

  const signedIn = status === "signed_in";
  const onboarded = Boolean(profile?.onboarded_at);

  useEffect(() => {
    if (status === "signed_out") router.replace("/login");
    else if (signedIn && profile !== undefined) {
      if (onboarded) router.replace("/today");
      // An empty local database only means "new account" once a pull has finished.
      else if (sync.hydrated) router.replace("/onboarding");
    }
  }, [status, signedIn, profile, onboarded, sync.hydrated, router]);

  const waitingForData = signedIn && profile !== undefined && !onboarded && !sync.hydrated;
  if (waitingForData && (!sync.online || sync.error)) {
    return (
      <div className="flex flex-1 flex-col justify-center gap-6 py-10">
        <div className="flex flex-col gap-3">
          <h1 className="title-large">Connect once to load your data</h1>
          <p className="text-[17px] text-ink-dim">
            This device has not downloaded your account yet. Go online and it will load, then FORGE works offline
            from then on.
          </p>
        </div>
        {sync.error ? <p className="text-[15px] text-ink-faint">{sync.error}</p> : null}
        <Button variant="primary" size="lg" fullWidth loading={sync.syncing} onClick={() => void syncNow()}>
          Try again
        </Button>
      </div>
    );
  }
  return <Splash />;
}
