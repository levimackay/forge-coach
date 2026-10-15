"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { IconCheck } from "@/components/ui/icons";
import { ListGroup } from "@/components/ui/list-row";
import { NumberStepper } from "@/components/ui/number-stepper";
import { Segmented } from "@/components/ui/segmented";
import { useExerciseLibrary, useProfile, useSyncStatus } from "@/lib/local";
import { syncNow } from "@/lib/local/sync";
import type { Exercise, Profile } from "@/lib/domain/types";
import type { PplVariant } from "@/lib/templates/ppl";
import { Chip, Notice, SectionTitle, SwitchRow } from "./bits";
import { EQUIPMENT_NAME, MUSCLES, MUSCLE_LABEL } from "./format";
import {
  GOAL_KINDS,
  GOAL_LABEL,
  GYM_EQUIPMENT,
  HOME_CHOICES,
  STEP_COUNT,
  buildEquipmentInputs,
  emptyDraft,
  mainPlace,
  previewProgram,
  resolvedIncrement,
  resolvedMax,
  saveOnboarding,
  unitDefaults,
  validateStep,
  type OnboardingDraft,
  type Place,
  type StepErrors,
} from "./onboarding-model";
import { ScreenSkeleton } from "./skeletons";

const TITLES = ["About you", "Where you train", "Your goal", "Your program"];

export function OnboardingFlow() {
  const profile = useProfile();
  const library = useExerciseLibrary();

  if (profile === undefined || library === undefined) return <ScreenSkeleton rows={3} label="Loading setup" />;
  if (profile?.onboarded_at) return <AlreadySetUp />;
  return <Wizard profile={profile} library={library} />;
}

/** Finishing setup makes the profile onboarded, which lands here a moment before Today opens. */
function AlreadySetUp() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/today");
  }, [router]);
  return <ScreenSkeleton rows={3} label="Opening Today" />;
}

function Wizard({ profile, library }: { profile: Profile | null; library: Exercise[] }) {
  const router = useRouter();
  const sync = useSyncStatus();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<OnboardingDraft>(() => emptyDraft(profile));
  const [errors, setErrors] = useState<StepErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  const patch = (change: Partial<OnboardingDraft>) => {
    setDraft((d) => ({ ...d, ...change }));
    setErrors({});
  };

  useEffect(() => {
    // Move focus to the new step's heading so a screen reader starts reading there.
    if (moved.current) heading.current?.focus();
    moved.current = true;
  }, [step]);

  const last = step === STEP_COUNT - 1;
  const libraryReady = library.length > 0;

  const next = async () => {
    const found = validateStep(step, draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (!last) {
      setStep(step + 1);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await saveOnboarding(draft, library);
      router.replace("/today");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save your setup. Try again.");
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-6 pt-3">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <p className="text-[15px] text-ink-dim">
            Step {step + 1} of {STEP_COUNT}
          </p>
          <div className="flex flex-1 gap-1.5" aria-hidden="true">
            {TITLES.map((title, i) => (
              <span key={title} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-ember" : "bg-raised"}`} />
            ))}
          </div>
        </div>
        <h1 ref={heading} tabIndex={-1} className="title-large outline-none">
          {TITLES[step]}
        </h1>
      </header>

      <div className="flex flex-1 flex-col gap-6">
        {step === 0 ? <AboutStep draft={draft} errors={errors} patch={patch} /> : null}
        {step === 1 ? <EquipmentStep draft={draft} errors={errors} patch={patch} /> : null}
        {step === 2 ? <GoalStep draft={draft} patch={patch} /> : null}
        {step === 3 ? (
          <ProgramStep
            draft={draft}
            library={library}
            patch={patch}
            offline={!sync.online}
            syncing={sync.syncing}
          />
        ) : null}
        {saveError ? (
          <p role="alert" className="text-[15px] text-danger">
            {saveError}
          </p>
        ) : null}
      </div>

      <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-line bg-ground px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        {step > 0 ? (
          <Button variant="secondary" size="lg" disabled={saving} onClick={() => setStep(step - 1)}>
            Back
          </Button>
        ) : null}
        <Button
          variant="primary"
          size="lg"
          className="flex-1"
          loading={saving}
          disabled={last && !libraryReady}
          onClick={() => void next()}
        >
          {last ? "Create my program" : "Continue"}
        </Button>
      </div>
    </div>
  );
}

interface StepProps {
  draft: OnboardingDraft;
  patch: (change: Partial<OnboardingDraft>) => void;
}

function FieldError({ children }: { children?: string }) {
  return children ? (
    <p role="alert" className="text-[15px] text-danger">
      {children}
    </p>
  ) : null;
}

function AboutStep({ draft, errors, patch }: StepProps & { errors: StepErrors }) {
  const range = unitDefaults(draft.unit).bodyweight;

  const changeUnit = (unit: OnboardingDraft["unit"]) => {
    if (unit === draft.unit) return;
    // Convert what was typed so 180 lb does not silently become 180 kg.
    const converted =
      draft.bodyweight === null
        ? null
        : Math.round(draft.bodyweight * (unit === "kg" ? 0.45359237 : 2.20462262) * 10) / 10;
    patch({ unit, bodyweight: converted, dumbbellIncrement: null, dumbbellMax: null });
  };

  return (
    <>
      <Field
        label="Your name"
        value={draft.name}
        maxLength={80}
        autoComplete="given-name"
        autoCapitalize="words"
        error={errors.name}
        onChange={(e) => patch({ name: e.target.value })}
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-[15px] font-medium text-ink-dim">
          Weight unit
        </span>
        <Segmented
          label="Weight unit"
          value={draft.unit}
          onChange={changeUnit}
          options={[
            { value: "lb", label: "Pounds (lb)" },
            { value: "kg", label: "Kilograms (kg)" },
          ]}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <NumberStepper
          label="Bodyweight"
          unit={draft.unit}
          value={draft.bodyweight}
          step={0.5}
          min={range.min}
          max={range.max}
          hint="Used to estimate strength on pull-ups, push-ups and dips."
          onChange={(bodyweight) => patch({ bodyweight })}
        />
        <FieldError>{errors.bodyweight}</FieldError>
      </div>
    </>
  );
}

function EquipmentStep({ draft, errors, patch }: StepProps & { errors: StepErrors }) {
  const toggleHome = (code: (typeof HOME_CHOICES)[number], on: boolean) =>
    patch({
      homeEquipment: on ? [...draft.homeEquipment, code] : draft.homeEquipment.filter((c) => c !== code),
    });
  const dumbbells = draft.homeEquipment.includes("dumbbells");
  const both = draft.atHome && draft.atGym;

  return (
    <>
      <div className="flex flex-col gap-2">
        <SectionTitle>Where do you train?</SectionTitle>
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <SwitchRow label="At home" checked={draft.atHome} onChange={(atHome) => patch({ atHome })} />
          <div className="border-t border-line" />
          <SwitchRow label="At a gym" checked={draft.atGym} onChange={(atGym) => patch({ atGym })} />
        </div>
        <FieldError>{errors.places}</FieldError>
      </div>

      {draft.atHome ? (
        <div className="flex flex-col gap-2">
          <SectionTitle>What you have at home</SectionTitle>
          <p className="px-1 text-[15px] text-ink-dim">Bodyweight is always included. Turn on anything else you own.</p>
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            {HOME_CHOICES.map((code, i) => (
              <div key={code} className={i > 0 ? "border-t border-line" : ""}>
                <SwitchRow
                  label={EQUIPMENT_NAME[code]}
                  checked={draft.homeEquipment.includes(code)}
                  onChange={(on) => toggleHome(code, on)}
                />
              </div>
            ))}
          </div>
          {dumbbells ? (
            <div className="mt-2 flex flex-col gap-5 rounded-card border border-line bg-surface p-4">
              <div className="flex flex-col gap-1.5">
                <NumberStepper
                  label="Smallest jump between dumbbells"
                  unit={draft.unit}
                  value={resolvedIncrement(draft)}
                  step={draft.unit === "lb" ? 0.5 : 0.25}
                  min={0.25}
                  max={50}
                  hint="Adjustable dumbbells usually go up by 5 lb or 2.5 kg."
                  onChange={(dumbbellIncrement) => patch({ dumbbellIncrement })}
                />
                <FieldError>{errors.dumbbell_increment}</FieldError>
              </div>
              <div className="flex flex-col gap-1.5">
                <NumberStepper
                  label="Heaviest dumbbell"
                  unit={draft.unit}
                  value={resolvedMax(draft)}
                  step={draft.unit === "lb" ? 5 : 2.5}
                  min={1}
                  max={400}
                  hint="Once you reach it, progress comes from reps and harder variations."
                  onChange={(dumbbellMax) => patch({ dumbbellMax })}
                />
                <FieldError>{errors.dumbbell_max}</FieldError>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {draft.atGym ? (
        <p className="rounded-card border border-line bg-surface p-4 text-[15px] text-ink-dim">
          Gym includes {GYM_EQUIPMENT.filter((c) => c !== "bodyweight")
            .map((c) => EQUIPMENT_NAME[c].toLowerCase())
            .join(", ")}
          .
        </p>
      ) : null}

      {both ? (
        <div className="flex flex-col gap-2">
          <SectionTitle>Build my program around</SectionTitle>
          <Segmented
            label="Build my program around"
            value={draft.main}
            onChange={(main: Place) => patch({ main })}
            options={[
              { value: "home", label: "Home" },
              { value: "gym", label: "Gym" },
            ]}
          />
          <p className="px-1 text-[15px] text-ink-dim">
            The program is built from the equipment at this place. At the other place, exercises that need equipment
            you lack are swapped for similar ones.
          </p>
        </div>
      ) : null}
    </>
  );
}

function GoalStep({ draft, patch }: StepProps) {
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="px-1 text-[15px] font-semibold text-ink-dim">What are you training for?</legend>
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          {GOAL_KINDS.map((kind) => (
            <label
              key={kind}
              className="flex min-h-14 cursor-pointer items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0 has-[:checked]:bg-raised has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-ink"
            >
              <span className="text-[17px]">{GOAL_LABEL[kind]}</span>
              <input
                type="radio"
                name="goal"
                value={kind}
                checked={draft.goalKind === kind}
                onChange={() => patch({ goalKind: kind })}
                className="peer sr-only"
              />
              <IconCheck className="hidden text-ink peer-checked:block" />
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        label="Anything specific? (optional)"
        multiline
        rows={2}
        maxLength={1000}
        value={draft.goalNote}
        placeholder="For example: first strict pull-up"
        onChange={(e) => patch({ goalNote: e.target.value })}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="px-1 text-[15px] font-semibold text-ink-dim">Muscles to bring up (optional)</legend>
        <div className="flex flex-wrap gap-2">
          {MUSCLES.map((muscle) => (
            <Chip
              key={muscle}
              selected={draft.focus.includes(muscle)}
              onClick={() =>
                patch({
                  focus: draft.focus.includes(muscle)
                    ? draft.focus.filter((m) => m !== muscle)
                    : [...draft.focus, muscle],
                })
              }
            >
              {MUSCLE_LABEL[muscle]}
            </Chip>
          ))}
        </div>
      </fieldset>
    </>
  );
}

function ProgramStep({
  draft,
  library,
  patch,
  offline,
  syncing,
}: StepProps & { library: Exercise[]; offline: boolean; syncing: boolean }) {
  const main = buildEquipmentInputs(draft).find((e) => e.is_default);
  const owned = main?.equipment ?? ["bodyweight"];
  const preview = previewProgram(draft.variant, owned, library);
  const place = mainPlace(draft) === "gym" ? "the gym" : "home";

  return (
    <>
      <div className="flex flex-col gap-2">
        <SectionTitle>Push, pull, legs</SectionTitle>
        <Segmented
          label="Training days per week"
          value={draft.variant}
          onChange={(variant: PplVariant) => patch({ variant })}
          options={[
            { value: "3day", label: "3 days a week" },
            { value: "6day", label: "6 days a week" },
          ]}
        />
        <p className="px-1 text-[15px] text-ink-dim">
          {draft.variant === "3day"
            ? "Each muscle is trained once a week, with extra sets on the main lifts."
            : "Each muscle is trained twice a week, once on an A day and once on a B day."}
        </p>
      </div>

      {library.length === 0 ? (
        <Notice
          action={
            <Button variant="ghost" size="sm" loading={syncing} onClick={() => void syncNow()}>
              Try again
            </Button>
          }
        >
          {offline
            ? "The exercise library has not downloaded yet. Connect to the internet once, then try again."
            : "The exercise library has not downloaded yet."}
        </Notice>
      ) : (
        <div className="flex flex-col gap-2">
          <SectionTitle>What you will train at {place}</SectionTitle>
          <ListGroup label="Program preview">
            {preview.days.map((day) => (
              <div key={day.name} className="flex flex-col gap-1 px-4 py-3">
                <p className="text-[17px] font-medium">{day.name}</p>
                <p className="text-[15px] text-ink-dim">
                  {day.exercises
                    .map((e) => e.name + (e.swapped ? " (closest match)" : ""))
                    .join(", ")}
                </p>
              </div>
            ))}
          </ListGroup>
          {preview.skipped > 0 ? (
            <p className="px-1 text-[15px] text-ink-dim">
              {preview.skipped} {preview.skipped === 1 ? "exercise has" : "exercises have"} no match for your equipment
              and {preview.skipped === 1 ? "is" : "are"} left out. You can add your own later in Program.
            </p>
          ) : null}
          <p className="px-1 text-[15px] text-ink-dim">
            Starting weights are blank. Pick them on your first workout and FORGE adjusts from there. Next to each
            exercise, RIR means reps in reserve: how many more reps you could have done.
          </p>
        </div>
      )}
    </>
  );
}

