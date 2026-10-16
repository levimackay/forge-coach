"use client";

import { useSyncExternalStore } from "react";
import type { IsoDateTime } from "@/lib/domain/types";

// Rounded to the minute and cached so repeated reads in one render agree, which useSyncExternalStore requires.
let cached: { bucket: number; iso: IsoDateTime } | null = null;

function snapshot(): IsoDateTime {
  const bucket = Math.floor(Date.now() / 60_000);
  if (!cached || cached.bucket !== bucket) cached = { bucket, iso: new Date(bucket * 60_000).toISOString() };
  return cached.iso;
}

function subscribe(onChange: () => void): () => void {
  const timer = setInterval(onChange, 30_000);
  return () => clearInterval(timer);
}

// These screens only render after sign-in on the device, so the server value is never shown.
const SERVER_NOW: IsoDateTime = "1970-01-01T00:00:00.000Z";

/** The current time to the minute. Reading it this way keeps clock access out of render. */
export function useNowIso(): IsoDateTime {
  return useSyncExternalStore(subscribe, snapshot, () => SERVER_NOW);
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}
