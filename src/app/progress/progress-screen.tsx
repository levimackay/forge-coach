"use client";

import { ButtonLink, EmptyState, Skeleton } from "@/components/ui";
import { BodyweightSection } from "./bodyweight-section";
import { ConsistencySection } from "./consistency-section";
import { DecisionsSection } from "./decisions-section";
import { LiftSection } from "./lift-section";
import { useAthlete } from "./use-progress-data";
import { VolumeSection } from "./volume-section";

export function ProgressScreen() {
  const athlete = useAthlete();

  return (
    <div className="flex flex-col gap-10 py-4">
      <h1 className="title-large">Progress</h1>
      {athlete === undefined ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : athlete === null ? (
        <EmptyState
          title="Finish setup first"
          action={
            <ButtonLink href="/onboarding" variant="primary">
              Set up FORGE
            </ButtonLink>
          }
        >
          Progress needs your unit and time zone, which you choose during setup.
        </EmptyState>
      ) : (
        <>
          <LiftSection athlete={athlete} />
          <VolumeSection athlete={athlete} />
          <ConsistencySection athlete={athlete} />
          <BodyweightSection athlete={athlete} />
          <DecisionsSection athlete={athlete} />
        </>
      )}
    </div>
  );
}
