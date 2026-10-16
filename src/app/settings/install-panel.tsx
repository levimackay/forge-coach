"use client";

import { useSyncExternalStore } from "react";
import { Steps } from "@/components/coach/steps";

const noopSubscribe = () => () => {};

function installed(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallPanel() {
  const isInstalled = useSyncExternalStore(noopSubscribe, installed, () => false);

  if (isInstalled) return <p>You are using the installed app.</p>;
  return (
    <Steps>
      <p>Open this page in Safari. Other browsers on iPhone cannot add it to the Home Screen.</p>
      <p>Tap the Share button, the square with an arrow, in the toolbar.</p>
      <p>Scroll the sheet and tap Add to Home Screen, then Add.</p>
      <p>Open FORGE from the Home Screen and sign in there. The installed app keeps its own storage, apart from Safari.</p>
    </Steps>
  );
}
