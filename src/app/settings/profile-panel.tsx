"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { Profile, Unit } from "@/lib/domain/types";
import { NativeSelect } from "@/components/coach/native-select";
import { Button, ButtonLink, EmptyState, Field, Segmented, Sheet, Skeleton, useToast } from "@/components/ui";
import { putRow, useProfile, useWorkouts } from "@/lib/local";
import { parseOptionalNumber } from "./equipment-form";

export function ProfilePanel({ onDone }: { onDone: () => void }) {
  const profile = useProfile();
  if (profile === undefined) return <Skeleton rows={5} />;
  if (profile === null) {
    return (
      <EmptyState
        title="Finish setup first"
        action={
          <ButtonLink href="/onboarding" variant="primary" className="bleed">
            Set up FORGE
          </ButtonLink>
        }
      />
    );
  }
  // Keyed on the saved version so the form restarts from what was stored.
  return <ProfileForm key={profile.updated_at} profile={profile} onDone={onDone} />;
}

function zoneOptions(current: string): { value: string; label: string }[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    // older browsers: fall back to the two zones we know about
  }
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return [...new Set([current, device, ...zones])]
    .filter(Boolean)
    .sort()
    .map((z) => ({ value: z, label: z.replace(/_/g, " ") }));
}

function ProfileForm({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const { toast } = useToast();
  const history = useWorkouts({ limit: 1 });
  const [name, setName] = useState(profile.display_name ?? "");
  const [unit, setUnit] = useState<Unit>(profile.unit);
  const [bodyweight, setBodyweight] = useState(profile.bodyweight === null ? "" : String(profile.bodyweight));
  const [zone, setZone] = useState(profile.timezone);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmUnit, setConfirmUnit] = useState(false);

  const zones = useMemo(() => zoneOptions(profile.timezone), [profile.timezone]);

  const parsedWeight = parseOptionalNumber(bodyweight);
  const dirty =
    name.trim() !== (profile.display_name ?? "") ||
    unit !== profile.unit ||
    zone !== profile.timezone ||
    (parsedWeight.ok && parsedWeight.value !== profile.bodyweight);

  const commit = async () => {
    if (!parsedWeight.ok) return;
    setSaving(true);
    try {
      await putRow("profiles", {
        display_name: name.trim() === "" ? null : name.trim(),
        unit,
        bodyweight: parsedWeight.value,
        timezone: zone,
        onboarded_at: profile.onboarded_at,
      });
      toast("Profile saved.");
      onDone();
    } catch (err) {
      toast(`Could not save: ${err instanceof Error ? err.message : "unknown error"}`, { tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!parsedWeight.ok) {
      setError(parsedWeight.error);
      return;
    }
    setError(null);
    // Weights are stored as plain numbers, so a changed unit would silently relabel them.
    if (unit !== profile.unit && history && history.length > 0) setConfirmUnit(true);
    else void commit();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <Field label="Name" value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} />
      <div className="flex flex-col">
        <span>Weight unit</span>
        <Segmented
          label="Weight unit"
          className="-ml-2.5"
          slash
          value={unit}
          onChange={setUnit}
          options={[
            { value: "lb", label: "Pounds (lb)" },
            { value: "kg", label: "Kilograms (kg)" },
          ]}
        />
      </div>
      <Field
        label="Bodyweight"
        suffix={unit}
        inputMode="decimal"
        value={bodyweight}
        error={error}
        onChange={(e) => setBodyweight(e.target.value)}
      />
      <NativeSelect label="Time zone" value={zone} onChange={setZone} options={zones} />
      <Button type="submit" variant="primary" className="bleed" loading={saving} disabled={!dirty}>
        Save profile
      </Button>

      <Sheet
        open={confirmUnit}
        onClose={() => setConfirmUnit(false)}
        title={`Switch to ${unit}?`}
        footer={
          <div className="flex items-stretch">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmUnit(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => {
                setConfirmUnit(false);
                void commit();
              }}
            >
              Switch anyway
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p>
            FORGE does not convert the weights you have already logged or planned. A set you logged as 135 will read as 135 {unit} from
            now on.
          </p>
          <p className="text-why">If your gym changed units, switch and re-enter your planned loads. If it did not, leave the unit as it is.</p>
        </div>
      </Sheet>
    </form>
  );
}
