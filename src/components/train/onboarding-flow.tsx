"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { IconCheck } from "@/components/ui/icons";
import { ListGroup } from "@/components/ui/list-row";
import { named } from "@/components/ui/name";
import { NumberStepper } from "@/components/ui/number-stepper";
import { ScreenBar } from "@/components/shell/screen-bar";
import { useExerciseLibrary, useProfile, useSyncStatus } from "@/lib/local";
import { syncNow } from "@/lib/local/sync";
import type { Exercise, Profile } from "@/lib/domain/types";
import type { PplVariant } from "@/lib/templates/ppl";
import { BottomBand, Chip, Notice, SwitchRow } from "./bits";
import { EQUIPMENT_NAME, MUSCLES, MUSCLE_LABEL } from "./format";
import {
  GOAL_KINDS,
  GOAL_LABEL,
  HOME_CHOICES,
  buildEquipmentInputs,
  emptyDraft,
  previewProgram,
  resolvedIncrement,
  resolvedMax,
  saveOnboarding,
  stepsFor,
  unitDefaults,
  validateStep,
  type OnboardingDraft,
  type Place,
  type StepErrors,
  type StepId,
} from "./onboarding-model";
import { ScreenSkeleton } from "./skeletons";

const QUESTION: Record<StepId, string> = {
  name: "What should we call you?",
  unit: "Pounds or kilograms?",
  bodyweight: "How much do you weigh?",
  places: "Where do you train?",
  equipment: "What do you have at home?",
  jump: "How much do your dumbbells go up by?",
  heaviest: "What is your heaviest dumbbell?",
  main: "Which place do you use most?",
  goal: "What are you training for?",
  note: "Anything specific?",
  focus: "Any muscles to bring up?",
  days: "How many days a week?",
  program: "Your program",
};

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
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<OnboardingDraft>(() => emptyDraft(profile));
  const [errors, setErrors] = useState<StepErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  const steps = stepsFor(draft);
  const step = steps[Math.min(index, steps.length - 1)];
  const last = step === "program";

  const patch = (change: Partial<OnboardingDraft>) => {
    setDraft((d) => ({ ...d, ...change }));
    setErrors({});
  };

  useEffect(() => {
    // Move focus to the new question so a screen reader starts reading there.
    if (moved.current) heading.current?.focus();
    moved.current = true;
  }, [step]);

  const next = async () => {
    const found = validateStep(step, draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (!last) {
      setIndex(index + 1);
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
    <div className="flex flex-1 flex-col pb-[var(--band-height)]">
      <ScreenBar
        start={
          index > 0 ? (
            <Button variant="ghost" size="sm" className="-ml-2" disabled={saving} onClick={() => setIndex(index - 1)}>
              Back
            </Button>
          ) : undefined
        }
      />
      <h1 ref={heading} tabIndex={-1} className="pb-6 pt-6 text-head outline-none">
        {named(QUESTION[step])}
      </h1>

      <div className="flex flex-1 flex-col gap-6">
        <Question
          step={step}
          draft={draft}
          errors={errors}
          patch={patch}
          library={library}
          offline={!sync.online}
          syncing={sync.syncing}
        />
        {saveError ? (
          <p role="alert" className="font-medium">
            {saveError}
          </p>
        ) : null}
      </div>

      <BottomBand>
        <Button variant="primary" loading={saving} disabled={last && library.length === 0} onClick={() => void next()}>
          {last ? "Create my program" : "Continue"}
        </Button>
      </BottomBand>
    </div>
  );
}

function FieldError({ children }: { children?: string }) {
  return children ? (
    <p role="alert" className="font-medium">
      {children}
    </p>
  ) : null;
}

/** One answer out of a short list, as 56px rows with the chosen one underlined and ticked. */
function ChoiceList<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="border-t border-rule">
        {options.map((option) => (
          <label
            key={option.value}
            className="group flex min-h-14 cursor-pointer items-center justify-between gap-3 border-b border-rule py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-ink"
          >
            <span className="group-has-[:checked]:underline group-has-[:checked]:decoration-2 group-has-[:checked]:underline-offset-[7px]">
              {option.label}
            </span>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <IconCheck className="hidden text-ink peer-checked:block" />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type Places = "home" | "gym" | "both";

/** The control for one step. Exported so the steps can be rendered one at a time in tests. */
export function Question({
  step,
  draft,
  errors,
  patch,
  library,
  offline,
  syncing,
}: {
  step: StepId;
  draft: OnboardingDraft;
  errors: StepErrors;
  patch: (change: Partial<OnboardingDraft>) => void;
  library: Exercise[];
  offline: boolean;
  syncing: boolean;
}): ReactNode {
  switch (step) {
    case "name":
      return (
        <Field
          label="Name"
          value={draft.name}
          maxLength={80}
          autoComplete="given-name"
          autoCapitalize="words"
          error={errors.name}
          onChange={(e) => patch({ name: e.target.value })}
        />
      );

    case "unit":
      return (
        <ChoiceList
          name="unit"
          legend="Weight unit"
          value={draft.unit}
          options={[
            { value: "lb", label: "Pounds" },
            { value: "kg", label: "Kilograms" },
          ]}
          onChange={(unit) => {
            if (unit === draft.unit) return;
            // Convert what was typed so 180 lb does not silently become 180 kg.
            const converted =
              draft.bodyweight === null
                ? null
                : Math.round(draft.bodyweight * (unit === "kg" ? 0.45359237 : 2.20462262) * 10) / 10;
            patch({ unit, bodyweight: converted, dumbbellIncrement: null, dumbbellMax: null });
          }}
        />
      );

    case "bodyweight": {
      const range = unitDefaults(draft.unit).bodyweight;
      return (
        <div className="flex flex-col gap-2">
          <div>
            <NumberStepper
              large
              label="Weight"
              unit={draft.unit}
              value={draft.bodyweight}
              step={0.5}
              min={range.min}
              max={range.max}
              onChange={(bodyweight) => patch({ bodyweight })}
            />
            <div className="border-t border-rule" />
          </div>
          <FieldError>{errors.bodyweight}</FieldError>
        </div>
      );
    }

    case "places": {
      const places: Places = draft.atHome && draft.atGym ? "both" : draft.atGym ? "gym" : "home";
      return (
        <div className="flex flex-col gap-2">
          <ChoiceList
            name="places"
            legend="Where you train"
            value={places}
            options={[
              { value: "home", label: "At home" },
              { value: "gym", label: "At a gym" },
              { value: "both", label: "Both" },
            ]}
            onChange={(value: Places) => patch({ atHome: value !== "gym", atGym: value !== "home" })}
          />
          <FieldError>{errors.places}</FieldError>
        </div>
      );
    }

    case "equipment":
      return (
        <div className="border-t border-rule">
          {HOME_CHOICES.map((code) => (
            <SwitchRow
              key={code}
              label={EQUIPMENT_NAME[code]}
              checked={draft.homeEquipment.includes(code)}
              onChange={(on) =>
                patch({
                  homeEquipment: on ? [...draft.homeEquipment, code] : draft.homeEquipment.filter((c) => c !== code),
                })
              }
            />
          ))}
        </div>
      );

    case "jump":
      return (
        <div className="flex flex-col gap-2">
          <div>
            <NumberStepper
              large
              label="Jump"
              unit={draft.unit}
              value={resolvedIncrement(draft)}
              step={draft.unit === "lb" ? 0.5 : 0.25}
              min={0.25}
              max={50}
              onChange={(dumbbellIncrement) => patch({ dumbbellIncrement })}
            />
            <div className="border-t border-rule" />
          </div>
          <FieldError>{errors.dumbbell_increment}</FieldError>
        </div>
      );

    case "heaviest":
      return (
        <div className="flex flex-col gap-2">
          <div>
            <NumberStepper
              large
              label="Heaviest"
              unit={draft.unit}
              value={resolvedMax(draft)}
              step={draft.unit === "lb" ? 5 : 2.5}
              min={1}
              max={400}
              onChange={(dumbbellMax) => patch({ dumbbellMax })}
            />
            <div className="border-t border-rule" />
          </div>
          <FieldError>{errors.dumbbell_max}</FieldError>
        </div>
      );

    case "main":
      return (
        <ChoiceList
          name="main"
          legend="Where you train most"
          value={draft.main}
          options={[
            { value: "home", label: "Home" },
            { value: "gym", label: "Gym" },
          ]}
          onChange={(main: Place) => patch({ main })}
        />
      );

    case "goal":
      return (
        <ChoiceList
          name="goal"
          legend="What you are training for"
          value={draft.goalKind}
          options={GOAL_KINDS.map((kind) => ({ value: kind, label: GOAL_LABEL[kind] }))}
          onChange={(goalKind) => patch({ goalKind })}
        />
      );

    case "note":
      return (
        <Field
          label="Optional"
          multiline
          rows={3}
          maxLength={1000}
          value={draft.goalNote}
          placeholder="For example: first strict pull-up"
          onChange={(e) => patch({ goalNote: e.target.value })}
        />
      );

    case "focus":
      return (
        <div role="group" aria-label="Muscles to bring up" className="-mx-2.5 flex flex-wrap">
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
      );

    case "days":
      return (
        <ChoiceList
          name="days"
          legend="Training days per week"
          value={draft.variant}
          options={[
            { value: "3day", label: "3 days a week" },
            { value: "6day", label: "6 days a week" },
          ]}
          onChange={(variant: PplVariant) => patch({ variant })}
        />
      );

    case "program": {
      if (library.length === 0) {
        return (
          <Notice
            action={
              <Button variant="ghost" size="sm" loading={syncing} onClick={() => void syncNow()}>
                Try again
              </Button>
            }
          >
            {offline
              ? "The exercise library has not downloaded yet. Connect once, then try again."
              : "The exercise library has not downloaded yet."}
          </Notice>
        );
      }
      const main = buildEquipmentInputs(draft).find((e) => e.is_default);
      const preview = previewProgram(draft.variant, main?.equipment ?? ["bodyweight"], library);
      return (
        <div>
          <ListGroup label="Program" className="border-t border-rule">
            {preview.days.map((day) => (
              <div key={day.name} className="border-b border-rule py-3">
                <p className="text-name">{named(day.name)}</p>
                <p className="font-light">{day.exercises.map((e) => e.name).join(", ")}</p>
              </div>
            ))}
          </ListGroup>
          {preview.skipped > 0 ? (
            <p className="pt-3 font-light">
              {preview.skipped} {preview.skipped === 1 ? "exercise does" : "exercises do"} not fit your equipment and
              {preview.skipped === 1 ? " is" : " are"} left out.
            </p>
          ) : null}
          <p className="pt-3 font-light">You pick your weights on the first workout.</p>
        </div>
      );
    }
  }
}
