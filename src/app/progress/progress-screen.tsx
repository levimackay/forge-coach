"use client";

import { ScreenBar } from "@/components/shell/screen-bar";
import { SyncChip } from "@/components/shell/sync-chip";
import { ButtonLink, EmptyState, Skeleton, named } from "@/components/ui";
import { BodyweightSection } from "./bodyweight-section";
import { ConsistencySection } from "./consistency-section";
import { DecisionsSection } from "./decisions-section";
import { LiftPicker, LiftSection, useLiftChoice } from "./lift-section";
import { useAthlete } from "./use-progress-data";
import { VolumeSection } from "./volume-section";

export function ProgressScreen() {
  const athlete = useAthlete();
  const lift = useLiftChoice();
  const picker = athlete && lift.options && lift.options.length > 0 && lift.id ? { options: lift.options, id: lift.id } : null;

  return (
    <div className="flex flex-col gap-10 pb-6">
      <div>
        <ScreenBar
          tall
          start={
            picker ? (
              <>
                <h1 className="sr-only">Progress</h1>
                <LiftPicker options={picker.options} value={picker.id} onChange={lift.pick} />
              </>
            ) : (
              <h1 className="text-head">{named("Progress")}</h1>
            )
          }
          end={<SyncChip align="end" />}
        />
        {athlete === undefined ? (
          <div aria-busy="true">
            <Skeleton rows={4} />
          </div>
        ) : athlete === null ? (
          <EmptyState
            title="Finish setup first"
            action={
              <ButtonLink href="/onboarding" variant="primary" className="bleed">
                Set up FORGE
              </ButtonLink>
            }
          >
            Progress needs your unit and time zone, which you choose during setup.
          </EmptyState>
        ) : (
          <LiftSection athlete={athlete} lift={lift} />
        )}
      </div>
      {athlete ? (
        <>
          <VolumeSection athlete={athlete} />
          <ConsistencySection athlete={athlete} />
          <BodyweightSection athlete={athlete} />
          <DecisionsSection athlete={athlete} />
        </>
      ) : null}
    </div>
  );
}
