"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list-row";
import { named } from "@/components/ui/name";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { ScreenBar } from "@/components/shell/screen-bar";
import { SyncChip } from "@/components/shell/sync-chip";
import { useProfile, useSyncStatus } from "@/lib/local";
import { syncNow } from "@/lib/local/sync";
import type { Unit } from "@/lib/domain/types";
import type { SessionPlanItem } from "@/lib/engine";
import { Figure, Notice } from "./bits";
import {
  countLabel,
  dayDisplayClass,
  formatDate,
  formatDateLong,
  formatNumber,
  formatPrescription,
  formatTime,
} from "./format";
import { buildPlan, itemNote, resolveEquipment, useTodayData, type TodayData } from "./queries";
import { startWorkout } from "./session-actions";
import { ScreenSkeleton } from "./skeletons";
import { useNow } from "./use-now";
import { usesLoad } from "./workout-model";

export function TodayScreen() {
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const today = useTodayData(pickedDay);
  const profile = useProfile();
  const sync = useSyncStatus();

  if (today === undefined || profile === undefined) return <ScreenSkeleton rows={6} label="Loading today's workout" />;

  if (today === null) {
    // Until the first full pull lands, a missing program may just not have arrived yet, and
    // building one now would make a second active program.
    if (!sync.hydrated) return <ScreenSkeleton rows={4} label="Loading your data" />;
    if (!profile?.onboarded_at) {
      return (
        <EmptyState
          title="Finish setting up"
          action={
            <ButtonLink href="/onboarding" variant="primary" className="bleed">
              Set up FORGE
            </ButtonLink>
          }
        >
          Tell FORGE where you train and what you are working toward, and it builds your first program.
        </EmptyState>
      );
    }
    return (
      <EmptyState
        title="No active program"
        action={
          <ButtonLink href="/program" variant="primary" className="bleed">
            Build a program
          </ButtonLink>
        }
      >
        Your workouts come from a program. Build one and the next session shows up here.
      </EmptyState>
    );
  }

  return <TodayContent data={today} pickedDay={pickedDay} onPickDay={setPickedDay} />;
}

function TodayContent({
  data,
  pickedDay,
  onPickDay,
}: {
  data: TodayData;
  pickedDay: string | null;
  onPickDay: (id: string | null) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const now = useNow();
  const sync = useSyncStatus();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  // The router keeps this screen alive but hidden after navigating to the workout. Hiding runs this
  // cleanup, so coming back (back gesture, the Done link, the tab bar) never finds Start stuck loading.
  useLayoutEffect(() => () => setStarting(false), []);

  const { ctx, inProgress, lastCompleted, recoveryToday } = data;
  const equipment = resolveEquipment(ctx, profileId);
  const nowIso = now === null ? null : new Date(now).toISOString();

  const plan = useMemo(() => (nowIso === null ? null : buildPlan(ctx, equipment, nowIso)), [ctx, equipment, nowIso]);
  const swapped = plan?.filter((i) => i.decision.action === "substitute_equipment").length ?? 0;
  const isNextDay = ctx.day.id === data.nextDayId;
  const dayOf = (id: string | null) => ctx.days.find((d) => d.id === id)?.name ?? "Workout";

  const start = async () => {
    setStarting(true);
    try {
      const workout = await startWorkout({ programDayId: ctx.day.id, equipmentProfileId: equipment?.id ?? null });
      router.push(`/workout?id=${workout.id}`);
    } catch {
      toast("Could not start the workout. Try again.", { tone: "error" });
      setStarting(false);
    }
  };

  const unsynced = sync.pending + sync.failed;

  return (
    <div className="flex flex-col pb-[var(--band-height)]">
      <ScreenBar
        start={<SyncChip />}
        end={
          ctx.equipmentProfiles.length > 1 ? (
            <Segmented
              slash
              label="Training at"
              className="-mr-2.5"
              value={equipment?.id ?? ""}
              onChange={setProfileId}
              options={ctx.equipmentProfiles.map((e) => ({ value: e.id, label: e.name }))}
            />
          ) : undefined
        }
      />

      <header>
        <h1 className={`-ml-[5px] break-words ${dayDisplayClass(ctx.day.name)}`}>{named(ctx.day.name)}</h1>
        <p className="pt-[22px]">{now === null ? " " : formatDateLong(new Date(now).toISOString())}</p>
        <p>
          {isNextDay ? "Next in " : "From "}
          {ctx.program.name}
          {lastCompleted
            ? `, after ${dayOf(lastCompleted.program_day_id)} on ${formatDate(lastCompleted.started_at)}`
            : ", nothing finished yet"}
        </p>
      </header>

      <div className="flex flex-col gap-3 pt-3">
        {unsynced === 0 && !sync.online ? (
          <Notice>You are offline. Everything you log is saved on this device and syncs when you are back online.</Notice>
        ) : null}

        {unsynced > 0 ? (
          <Notice
            action={
              <Button variant="ghost" size="sm" className="shrink-0 whitespace-nowrap" loading={sync.syncing} onClick={() => void syncNow()}>
                {sync.online ? "Sync now" : "Offline"}
              </Button>
            }
          >
            {sync.failed > 0
              ? `${countLabel(sync.failed, "change")} could not be saved to your account and stays on this device.`
              : `${countLabel(sync.pending, "change")} saved on this device, waiting to sync.`}
          </Notice>
        ) : null}

        {inProgress ? (
          <section aria-label="Workout in progress">
            <h2 className="text-name">{dayOf(inProgress.program_day_id)} is in progress</h2>
            <p>
              Started {formatDate(inProgress.started_at)} at {formatTime(inProgress.started_at)}. Everything you logged is
              saved.
            </p>
          </section>
        ) : null}

        {swapped > 0 ? (
          <p>
            {countLabel(swapped, "exercise")} swapped for similar ones that fit {equipment?.name}.
          </p>
        ) : null}

        <RecoveryPrompt logged={recoveryToday !== null} sleep={recoveryToday?.sleep_hours ?? null} soreness={recoveryToday?.soreness ?? null} />
      </div>

      {plan === null ? (
        <ScreenSkeleton rows={ctx.planned.length || 4} label="Planning your session" />
      ) : plan.length === 0 ? (
        <EmptyState
          title="Nothing planned for this day"
          action={
            <ButtonLink href="/program" variant="secondary">
              Add exercises
            </ButtonLink>
          }
        >
          This day has no exercises yet. Add some in Program.
        </EmptyState>
      ) : (
        <ListGroup label="Today's exercises">
          {plan.map((item) => (
            <PlanRow key={item.planned.id} item={item} unit={ctx.unit} data={data} />
          ))}
        </ListGroup>
      )}

      {inProgress ? (
        <ButtonLink href={`/workout?id=${inProgress.id}`} variant="primary" pinned="tabs">
          Resume workout
        </ButtonLink>
      ) : plan && plan.length > 0 ? (
        <Button variant="primary" pinned="tabs" loading={starting} onClick={() => void start()}>
          Start workout
        </Button>
      ) : null}

      <ListGroup label="More" className="mt-8">
        {ctx.days.length > 1 ? (
          <ListRow
            title="Train a different day"
            subtitle={isNextDay ? undefined : `Showing ${ctx.day.name}, your next is ${dayOf(data.nextDayId)}`}
            onClick={() => setDayOpen(true)}
            chevron
          />
        ) : null}
        <ListRow title="Recovery and body measurements" href="/log" />
        <ListRow title="Workout history" href="/history" />
      </ListGroup>

      <Sheet open={dayOpen} onClose={() => setDayOpen(false)} title="Choose a day">
        <ListGroup label="Program days" className="border-t border-rule">
          {ctx.days.map((d) => (
            <ListRow
              key={d.id}
              title={named(d.name)}
              name
              subtitle={d.id === data.nextDayId ? "Next in your rotation" : undefined}
              trailing={d.id === ctx.day.id ? "Showing" : undefined}
              onClick={() => {
                onPickDay(d.id === data.nextDayId ? null : d.id);
                setDayOpen(false);
              }}
            />
          ))}
        </ListGroup>
        {pickedDay === null ? null : <p className="pt-3">Training a different day does not change your rotation order.</p>}
      </Sheet>
    </div>
  );
}

function RecoveryPrompt({ logged, sleep, soreness }: { logged: boolean; sleep: number | null; soreness: number | null }) {
  if (logged) {
    const parts = [
      sleep !== null ? `${sleep} h sleep` : null,
      soreness !== null ? `soreness ${soreness} of 5` : null,
    ].filter(Boolean);
    return (
      <div className="flex min-h-11 items-center justify-between gap-3 border-y border-rule">
        <p>Check-in{parts.length ? `: ${parts.join(", ")}` : " logged"}</p>
        <ButtonLink href="/log" variant="ghost" size="sm" className="-mr-2 min-w-11" aria-label="Edit check-in">
          Edit
        </ButtonLink>
      </div>
    );
  }
  return (
    <section aria-label="Recovery check-in" className="border-t border-rule pt-3">
      <h2 className="text-name">How did you recover?</h2>
      <p className="pb-1 pt-1">
        Sleep and soreness take a few taps. Poor recovery makes FORGE hold your weights instead of adding more.
      </p>
      <ListRow title="Log a check-in" href="/log" />
    </section>
  );
}

function PlanRow({ item, unit, data }: { item: SessionPlanItem; unit: Unit; data: TodayData }) {
  const { exercise, prescription, planned } = item;
  const note = itemNote(item, data.ctx.lastDecisions[planned.id]);
  const value = usesLoad(exercise) ? (
    prescription.load !== null ? (
      <Figure value={formatNumber(prescription.load)} unit={unit} />
    ) : (
      "Pick a weight"
    )
  ) : (
    "Bodyweight"
  );

  return (
    <div className="border-b border-rule py-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 break-words text-name">{named(exercise.name)}</h2>
        <p className="shrink-0">{value}</p>
      </div>
      <p>{formatPrescription(prescription)}</p>
      {note ? <p className="pt-1 text-why">{note.text}</p> : null}
    </div>
  );
}
