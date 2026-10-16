"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconChevronDown } from "@/components/ui/icons";
import { ListGroup, ListRow } from "@/components/ui/list-row";
import { named } from "@/components/ui/name";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { ScreenBar } from "@/components/shell/screen-bar";
import { useProfile, useSyncStatus } from "@/lib/local";
import type { Unit } from "@/lib/domain/types";
import type { SessionPlanItem } from "@/lib/engine";
import { Figure } from "./bits";
import { changeLabel, dayDisplayClass, formatNumber, plainReason } from "./format";
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
        />
      );
    }
    return (
      <EmptyState
        title="No program yet"
        action={
          <ButtonLink href="/program" variant="primary" className="bleed">
            Build a program
          </ButtonLink>
        }
      />
    );
  }

  return <TodayContent data={today} pickedDay={pickedDay} onPickDay={setPickedDay} />;
}

interface Why {
  name: string;
  text: string;
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
  const [profileId, setProfileId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  const [why, setWhy] = useState<Why | null>(null);
  // The router keeps this screen alive but hidden after navigating to the workout. Hiding runs this
  // cleanup, so coming back (back gesture, the Done link, the tab bar) never finds Start stuck loading.
  useLayoutEffect(() => () => setStarting(false), []);

  const { ctx, inProgress } = data;
  const equipment = resolveEquipment(ctx, profileId);
  const nowIso = now === null ? null : new Date(now).toISOString();

  const plan = useMemo(() => (nowIso === null ? null : buildPlan(ctx, equipment, nowIso)), [ctx, equipment, nowIso]);

  // With two places the one word flips between them; with more it goes round.
  const places = ctx.equipmentProfiles;
  const here = places.findIndex((p) => p.id === equipment?.id);
  const other = places.length > 1 && here !== -1 ? places[(here + 1) % places.length] : null;
  const manyDays = ctx.days.length > 1;

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

  const title = named(ctx.day.name);

  return (
    <div className="flex flex-col pb-[var(--band-height)]">
      {/* Above the day name: its 120px glyph boxes reach up into this row and would take the taps. */}
      <div className="relative z-10">
        <ScreenBar
          start={
            equipment && other ? (
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2"
                aria-label={`${equipment.name}. Switch to ${other.name}.`}
                onClick={() => setProfileId(other.id)}
              >
                {equipment.name}
              </Button>
            ) : undefined
          }
          end={
            <ButtonLink href="/more" variant="ghost" size="sm" className="-mr-2">
              Program and settings
            </ButtonLink>
          }
        />
      </div>

      <h1 className={`-ml-[5px] break-words ${dayDisplayClass(ctx.day.name)}`}>
        {manyDays ? (
          <button
            type="button"
            aria-label={`${title} Choose a different day.`}
            aria-haspopup="dialog"
            onClick={() => setDayOpen(true)}
            className="inline-flex items-end gap-2 text-left active:underline"
          >
            {title}
            <IconChevronDown size={24} className="mb-3 shrink-0" />
          </button>
        ) : (
          title
        )}
      </h1>

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
        />
      ) : (
        <ul aria-label="Today's lifts" className="mt-[38px] border-b border-rule">
          {plan.map((item) => (
            <LiftRow key={item.planned.id} item={item} unit={ctx.unit} data={data} onWhy={setWhy} />
          ))}
        </ul>
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

      <Sheet open={why !== null} onClose={() => setWhy(null)} title={why?.name ?? ""}>
        <p className="text-why">{why ? plainReason(why.text) : null}</p>
      </Sheet>

      <Sheet open={dayOpen} onClose={() => setDayOpen(false)} title="Choose a day">
        <ListGroup label="Program days" className="border-t border-rule">
          {ctx.days.map((d) => (
            <ListRow
              key={d.id}
              title={named(d.name)}
              name
              trailing={d.id === data.nextDayId ? "Up next" : undefined}
              onClick={() => {
                onPickDay(d.id === data.nextDayId ? null : d.id);
                setDayOpen(false);
              }}
            />
          ))}
        </ListGroup>
        {pickedDay === null ? null : <p className="pt-3 text-small">Your order of days does not change.</p>}
      </Sheet>
    </div>
  );
}

function LiftRow({
  item,
  unit,
  data,
  onWhy,
}: {
  item: SessionPlanItem;
  unit: Unit;
  data: TodayData;
  onWhy: (why: Why) => void;
}) {
  const { exercise, prescription, planned } = item;
  const note = itemNote(item, data.ctx.lastDecisions[planned.id]);
  const label = note ? changeLabel(note.action, exercise.load_type === "assisted") : null;
  const value = usesLoad(exercise) ? (
    prescription.load !== null ? (
      <Figure value={formatNumber(prescription.load)} unit={unit} />
    ) : (
      <span className="text-control font-light">Pick a weight</span>
    )
  ) : (
    <span className="text-control font-light">Bodyweight</span>
  );

  return (
    <li className="border-t border-rule py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 break-words text-name">{named(exercise.name)}</h2>
        <p className="shrink-0">{value}</p>
      </div>
      {label && note ? (
        <div className="mt-0.5 flex items-center justify-between gap-3 text-why">
          <span>{label}</span>
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2 -my-3 font-normal"
            aria-label={`Why, ${exercise.name}`}
            onClick={() => onWhy({ name: exercise.name, text: note.text })}
          >
            Why?
          </Button>
        </div>
      ) : null}
    </li>
  );
}
