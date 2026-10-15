import type { Metadata } from "next";
import { Suspense } from "react";
import { ScreenSkeleton } from "@/components/train/skeletons";
import { WorkoutScreen } from "@/components/train/workout-screen";

export const metadata: Metadata = { title: "Workout" };

// The workout id is a query parameter, not a path segment, so this page stays static and works offline.
export default function WorkoutPage() {
  return (
    <Suspense fallback={<ScreenSkeleton rows={5} label="Loading workout" />}>
      <WorkoutScreen />
    </Suspense>
  );
}
