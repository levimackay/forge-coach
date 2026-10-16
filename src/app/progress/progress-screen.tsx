"use client";

import { ScreenBar } from "@/components/shell/screen-bar";
import { ButtonLink, EmptyState, Skeleton, named } from "@/components/ui";
import { LiftPicker, LiftSection, useLiftChoice } from "./lift-section";
import { useAthlete } from "./use-progress-data";

export function ProgressScreen() {
  const athlete = useAthlete();
  const lift = useLiftChoice();
  const picker = athlete && lift.options && lift.options.length > 0 && lift.id ? { options: lift.options, id: lift.id } : null;

  return (
    <div className="flex flex-col pb-6">
      <ScreenBar
        tall
        start={
          picker ? (
            <>
              <h1 className="sr-only">Progress</h1>
              <LiftPicker options={picker.options} value={picker.id} onChange={lift.pick} />
            </>
          ) : (
            <h1 className="text-head font-medium">{named("Progress")}</h1>
          )
        }
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
        />
      ) : (
        <LiftSection athlete={athlete} lift={lift} />
      )}
    </div>
  );
}
