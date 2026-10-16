import type { Metadata } from "next";
import { OfflineActions } from "./offline-actions";

export const metadata: Metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="flex flex-1 flex-col justify-center gap-8 py-10">
      <div className="flex flex-col gap-3">
        <h1 className="text-head">You are offline.</h1>
        <p>This screen was not saved on your device yet, so it cannot open without a connection.</p>
        <p>
          Screens you have already opened still work. Workouts you log are stored on this device and sync when you
          are back online.
        </p>
      </div>
      <OfflineActions />
    </div>
  );
}
