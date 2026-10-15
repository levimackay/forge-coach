"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list-row";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useProfile, useSyncStatus } from "@/lib/local";
import { syncNow } from "@/lib/local/sync";
import type { Unit } from "@/lib/domain/types";
import type { SessionPlanItem } from "@/lib/engine";
import { Notice, ScreenTitle, SectionTitle } from "./bits";
import { PROGRESS_ACTIONS, countLabel, formatDate, formatDateLong, formatLoad, formatPrescription, formatTime } from "./format";
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
            <ButtonLink href="/onboarding" variant="primary" size="lg">
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
          <ButtonLink href="/program" variant="primary" size="lg">
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
    <div className="flex flex-col gap-6 pb-4">
      <ScreenTitle title={ctx.day.name}>
        <p className="text-[15px]">{now === null ? " " : formatDateLong(new Date(now).toISOString())}</p>
        <p className="text-[15px]">
          {isNextDay ? "Next in " : "From "}
          {ctx.program.name}
          {lastCompleted
            ? `. Last workout: ${dayOf(lastCompleted.program_day_id)}, ${formatDate(lastCompleted.started_at)}.`
            : ". You have not finished a workout yet."}
        </p>
      </ScreenTitle>

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
        <section aria-label="Workout in progress" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <div>
            <h2 className="title">{dayOf(inProgress.program_day_id)} is in progress</h2>
            <p className="text-[15px] text-ink-dim">
              Started {formatDate(inProgress.started_at)} at {formatTime(inProgress.started_at)}. Everything you logged is
              saved.
            </p>
          </div>
          <ButtonLink href={`/workout?id=${inProgress.id}`} variant="primary" size="lg" fullWidth>
            Resume workout
          </ButtonLink>
        </section>
      ) : null}

      <RecoveryPrompt logged={recoveryToday !== null} sleep={recoveryToday?.sleep_hours ?? null} soreness={recoveryToday?.soreness ?? null} />

      {ctx.equipmentProfiles.length > 1 ? (
        <div className="flex flex-col gap-2">
          <SectionTitle>Training at</SectionTitle>
          <Segmented
            label="Training at"
            value={equipment?.id ?? ""}
            onChange={setProfileId}
            options={ctx.equipmentProfiles.map((e) => ({ value: e.id, label: e.name }))}
          />
          {swapped > 0 ? (
            <p className="px-1 text-[15px] text-ink-dim">
              {countLabel(swapped, "exercise")} swapped for similar ones that fit {equipment?.name}.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <SectionTitle>Exercises</SectionTitle>
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
      </div>

      {!inProgress && plan && plan.length > 0 ? (
        <Button variant="primary" size="lg" fullWidth loading={starting} onClick={() => void start()}>
          Start workout
        </Button>
      ) : null}

      <ListGroup label="More">
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
        <ListGroup label="Program days">
          {ctx.days.map((d) => (
            <ListRow
              key={d.id}
              title={d.name}
              subtitle={d.id === data.nextDayId ? "Next in your rotation" : undefined}
              trailing={d.id === ctx.day.id ? "Showing" : undefined}
              onClick={() => {
                onPickDay(d.id === data.nextDayId ? null : d.id);
                setDayOpen(false);
              }}
            />
          ))}
        </ListGroup>
        {pickedDay === null ? null : (
          <p className="pt-3 text-[15px] text-ink-dim">Training a different day does not change your rotation order.</p>
        )}
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
      <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface py-1 pl-4 pr-1">
        <p className="py-2 text-[15px] text-ink-dim">Check-in logged{parts.length ? `: ${parts.join(", ")}` : ""}.</p>
        <ButtonLink href="/log" variant="ghost" size="sm">
          Edit
        </ButtonLink>
      </div>
    );
  }
  return (
    <section aria-label="Recovery check-in" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <div>
        <h2 className="text-[17px] font-semibold">How did you recover?</h2>
        <p className="text-[15px] text-ink-dim">
          Sleep and soreness take a few taps. Poor recovery makes FORGE hold your weights instead of adding more.
        </p>
      </div>
      <ButtonLink href="/log" variant="secondary" fullWidth>
        Log a check-in
      </ButtonLink>
    </section>
  );
}

function PlanRow({ item, unit, data }: { item: SessionPlanItem; unit: Unit; data: TodayData }) {
  const { exercise, prescription, planned } = item;
  const note = itemNote(item, data.ctx.lastDecisions[planned.id]);
  const load = usesLoad(exercise)
    ? prescription.load !== null
      ? formatLoad(prescription.load, unit)
      : "Pick a weight"
    : "Bodyweight";

  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-[17px] font-medium">{exercise.name}</p>
        <p className="shrink-0 text-[17px] text-ink-dim">{load}</p>
      </div>
      <p className="text-[15px] text-ink-dim">{formatPrescription(prescription)}</p>
      {note ? (
        <p className="flex gap-2 pt-0.5 text-[15px] text-ink">
          {PROGRESS_ACTIONS.has(note.action) ? (
            <span aria-hidden="true" className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-ember" />
          ) : null}
          <span>{note.text}</span>
        </p>
      ) : null}
    </div>
  );
}
