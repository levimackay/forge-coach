"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { ListGroup, ListRow } from "@/components/ui/list-row";
import { clearLocalData } from "@/lib/local/data";
import { seedDevFixture } from "@/lib/local/dev-fixture";
import { devFixtureActive, setDevFixtureActive } from "@/lib/local/session";

const noopSubscribe = () => () => {};

const SCREENS = [
  ["Today", "/today"],
  ["Program", "/program"],
  ["Progress", "/progress"],
  ["History", "/history"],
  ["Recovery and body", "/log"],
  ["Coach", "/coach"],
  ["Settings", "/settings"],
];

export function DevHarness() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // The server render sees false; the client reads the real flag after hydration.
  const active = useSyncExternalStore(noopSubscribe, devFixtureActive, () => false);

  const load = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { workouts } = await seedDevFixture();
      setMessage(`Loaded ${workouts} fixture workouts. Reloading signed in as the fixture user.`);
      // A full load, so AuthProvider reads the fixture flag again.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/today";
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not load the fixture.");
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setDevFixtureActive(false);
    await clearLocalData();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  };

  return (
    <div className="flex flex-1 flex-col gap-6 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="title-large">Development fixture</h1>
        <p className="text-[17px] text-ink-dim">
          Fixture data, not real training. This loads a made-up lifter with five weeks of push, pull and legs history
          into this browser only, signs you in as a local fixture user and turns network sync off. It exists in
          development builds only.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <Button variant="primary" size="lg" fullWidth loading={busy} onClick={load}>
          {active ? "Reload fixture data" : "Load fixture data"}
        </Button>
        {active ? (
          <Button variant="danger" fullWidth disabled={busy} onClick={remove}>
            Remove fixture and sign out
          </Button>
        ) : null}
        {message ? (
          <p role="status" className="text-[15px] text-ink-dim">
            {message}
          </p>
        ) : null}
      </div>

      <ListGroup label="Screens">
        {SCREENS.map(([label, href]) => (
          <ListRow key={href} title={label} subtitle={href} href={href} />
        ))}
      </ListGroup>
    </div>
  );
}
