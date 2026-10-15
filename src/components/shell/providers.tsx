"use client";

import { useEffect, type ReactNode } from "react";
import { SerwistProvider } from "@serwist/next/react";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/ui/toast";
import { AppShell } from "./app-shell";

const PRODUCTION = process.env.NODE_ENV === "production";

/** A worker left over from a production build would serve stale pages to the dev server. */
function useClearWorkersInDev() {
  useEffect(() => {
    if (PRODUCTION) return;
    void navigator.serviceWorker?.getRegistrations().then((all) => all.forEach((r) => void r.unregister()));
  }, []);
}

export function Providers({ children }: { children: ReactNode }) {
  useClearWorkersInDev();
  return (
    // Every route is precached, so there is no need to re-fetch pages on navigation,
    // and a reload when the connection returns would throw away a half-logged set.
    <SerwistProvider swUrl="/sw.js" disable={!PRODUCTION} cacheOnNavigation={false} reloadOnOnline={false}>
      <AuthProvider>
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </AuthProvider>
    </SerwistProvider>
  );
}
