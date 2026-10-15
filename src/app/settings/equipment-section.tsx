"use client";

import { useState, type FormEvent } from "react";
import type { EquipmentCode, EquipmentProfile, Unit } from "@/lib/domain/types";
import { Section } from "@/components/coach/section";
import { WrapList } from "@/components/coach/wrap-row";
import { Button, EmptyState, Field, Sheet, Skeleton, useToast } from "@/components/ui";
import { putRow, putRows, softDelete, useEquipmentProfiles, useProfile } from "@/lib/local";
import { getDb } from "@/lib/local/db";
import {
  EQUIPMENT_CODES,
  EQUIPMENT_OPTIONS,
  draftFromProfile,
  parseDraft,
  type EquipmentDraft,
} from "./equipment-form";

function summary(p: EquipmentProfile): string {
  const kit = p.equipment.filter((c): c is Exclude<EquipmentCode, "bodyweight"> => c in EQUIPMENT_OPTIONS).map((c) => EQUIPMENT_OPTIONS[c]);
  return kit.length > 0 ? kit.join(", ") : "Bodyweight only";
}

export function EquipmentSection() {
  const profiles = useEquipmentProfiles();
  const profile = useProfile();
  // `new` opens a blank form; a profile opens that profile.
  const [editing, setEditing] = useState<EquipmentProfile | "new" | null>(null);

  return (
    <Section title="Equipment" description="What you can train with. Days can use a profile so a hotel gym swaps in the right exercises.">
      {profiles === undefined ? (
        <Skeleton className="h-32 w-full" />
      ) : profiles.length === 0 ? (
        <EmptyState title="No equipment profiles">Add one so your program only uses kit you have.</EmptyState>
      ) : (
        <WrapList
          label="Equipment profiles"
          rows={profiles.map((p) => ({
            key: p.id,
            title: p.name,
            subtitle: `${p.is_default ? "Default. " : ""}${summary(p)}`,
            onClick: () => setEditing(p),
          }))}
        />
      )}
      <Button variant="secondary" disabled={profiles === undefined} onClick={() => setEditing("new")}>
        Add equipment profile
      </Button>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New equipment profile" : "Edit equipment profile"}>
        {editing !== null && profiles ? (
          <EquipmentForm
            existing={editing === "new" ? null : editing}
            others={profiles.filter((p) => editing === "new" || p.id !== editing.id)}
            unit={profile?.unit ?? "lb"}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Sheet>
    </Section>
  );
}

function EquipmentForm({
  existing,
  others,
  unit,
  onDone,
}: {
  existing: EquipmentProfile | null;
  others: EquipmentProfile[];
  unit: Unit;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const mustBeDefault = others.length === 0 || existing?.is_default === true;
  const [draft, setDraft] = useState<EquipmentDraft>(() => draftFromProfile(existing, others.length === 0));
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof EquipmentDraft>(key: K, value: EquipmentDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const toggle = (code: EquipmentCode) =>
    set("equipment", draft.equipment.includes(code) ? draft.equipment.filter((c) => c !== code) : [...draft.equipment, code]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const result = parseDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (result.value.is_default) {
        const demote = others.filter((o) => o.is_default).map((o) => ({ ...o, is_default: false }));
        if (demote.length > 0) await putRows("equipment_profiles", demote);
      }
      await putRow("equipment_profiles", existing ? { ...existing, ...result.value } : result.value);
      toast(existing ? "Equipment profile saved." : "Equipment profile added.");
      onDone();
    } catch (err) {
      toast(`Could not save: ${err instanceof Error ? err.message : "unknown error"}`, { tone: "error" });
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    setBusy(true);
    try {
      // Days that used this profile go back to "any equipment" rather than pointing at a deleted row.
      const days = await getDb().program_days.filter((d) => !d.deleted_at && d.equipment_profile_id === existing.id).toArray();
      if (days.length > 0) await putRows("program_days", days.map((d) => ({ ...d, equipment_profile_id: null })));
      await softDelete("equipment_profiles", existing.id);
      toast("Equipment profile deleted.");
      onDone();
    } catch (err) {
      toast(`Could not delete: ${err instanceof Error ? err.message : "unknown error"}`, { tone: "error" });
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-5 pb-2" noValidate>
      <Field label="Name" value={draft.name} error={errors.name} maxLength={60} onChange={(e) => set("name", e.target.value)} />

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-[15px] font-medium text-ink-dim">What you have</legend>
        {EQUIPMENT_CODES.map((code) => (
          <label key={code} className="flex min-h-11 items-center gap-3 text-[17px]">
            <input
              type="checkbox"
              checked={draft.equipment.includes(code)}
              onChange={() => toggle(code)}
              className="h-6 w-6 shrink-0 accent-ember"
            />
            {EQUIPMENT_OPTIONS[code]}
          </label>
        ))}
        <p className="text-[15px] text-ink-faint">Bodyweight exercises are always available.</p>
      </fieldset>

      {draft.equipment.includes("dumbbells") ? (
        <>
          <Field
            label="Smallest dumbbell step"
            suffix={unit}
            inputMode="decimal"
            value={draft.dumbbellIncrement}
            error={errors.dumbbellIncrement}
            hint="The jump between your dumbbells, for example 5. Leave blank if it varies."
            onChange={(e) => set("dumbbellIncrement", e.target.value)}
          />
          <Field
            label="Heaviest dumbbell"
            suffix={unit}
            inputMode="decimal"
            value={draft.dumbbellMax}
            error={errors.dumbbellMax}
            hint="FORGE moves you to a harder exercise when you outgrow this."
            onChange={(e) => set("dumbbellMax", e.target.value)}
          />
        </>
      ) : null}
      {draft.equipment.includes("barbell") ? (
        <Field
          label="Smallest barbell step"
          suffix={unit}
          inputMode="decimal"
          value={draft.barbellIncrement}
          error={errors.barbellIncrement}
          hint="The smallest total jump your plates allow, for example 5."
          onChange={(e) => set("barbellIncrement", e.target.value)}
        />
      ) : null}

      <label className="flex min-h-11 items-start gap-3 text-[17px]">
        <input
          type="checkbox"
          checked={draft.isDefault}
          disabled={mustBeDefault}
          onChange={(e) => set("isDefault", e.target.checked)}
          className="mt-0.5 h-6 w-6 shrink-0 accent-ember"
        />
        <span className="flex flex-col">
          Use by default
          {mustBeDefault ? (
            <span className="text-[15px] text-ink-faint">
              {others.length === 0 ? "This is your only profile." : "Make another profile the default to change this."}
            </span>
          ) : null}
        </span>
      </label>

      <Button type="submit" variant="primary" size="lg" loading={busy}>
        Save
      </Button>

      {existing ? (
        confirmDelete ? (
          <div className="flex flex-col gap-3 rounded-control border border-line bg-raised p-3">
            <p className="text-[15px] text-ink-dim">
              Days that use this profile go back to any equipment. Past workouts keep their history.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
              <Button variant="danger" className="flex-1" disabled={busy} onClick={() => void remove()}>
                Delete
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Button variant="danger" disabled={existing.is_default || busy} onClick={() => setConfirmDelete(true)}>
              Delete profile
            </Button>
            {existing.is_default ? (
              <p className="-mt-3 text-[15px] text-ink-faint">Make another profile the default before you delete this one.</p>
            ) : null}
          </>
        )
      ) : null}
    </form>
  );
}
