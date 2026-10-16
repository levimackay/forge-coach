"use client";

import { useSearchParams } from "next/navigation";
import { SessionDetail } from "./session-detail";

/** /history/session?id=... reads the workout id from the query so the page stays static. */
export function SessionScreen() {
  return <SessionDetail workoutId={useSearchParams().get("id")} variant="history" />;
}
