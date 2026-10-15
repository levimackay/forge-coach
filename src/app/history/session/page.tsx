import type { Metadata } from "next";
import { Suspense } from "react";
import { SessionScreen } from "@/components/train/session-screen";
import { ScreenSkeleton } from "@/components/train/skeletons";

export const metadata: Metadata = { title: "Workout details" };

export default function SessionPage() {
  return (
    <Suspense fallback={<ScreenSkeleton rows={4} label="Loading workout" />}>
      <SessionScreen />
    </Suspense>
  );
}
