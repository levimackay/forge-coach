"use client";

import { useSyncExternalStore } from "react";
import { Section } from "@/components/coach/section";
import { Steps } from "@/components/coach/steps";

const noopSubscribe = () => () => {};

function installed(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallSection() {
  const isInstalled = useSyncExternalStore(noopSubscribe, installed, () => false);

  return (
    <Section title="Install on iPhone" description="FORGE works best from your Home Screen: it opens full screen and keeps your data on the phone.">
      {isInstalled ? (
        <p>You are using the installed app, so there is nothing to do here.</p>
      ) : (
        <Steps>
          <p>Open this page in Safari. Other browsers on iPhone cannot add it to the Home Screen.</p>
          <p>Tap the Share button, the square with an arrow, in the toolbar.</p>
          <p>Scroll the sheet and tap Add to Home Screen, then Add.</p>
          <p>Open FORGE from the Home Screen and sign in there. The installed app keeps its own storage, apart from Safari.</p>
        </Steps>
      )}
    </Section>
  );
}
