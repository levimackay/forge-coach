"use client";

import { useState, type FormEvent } from "react";
import type { EquipmentCode, EquipmentProfile, Unit } from "@/lib/domain/types";
import { Button, Field, IconPlus, ListGroup, ListRow, Sheet, Skeleton, useToast } from "@/components/ui";
import { putRow, putRows, softDelete, useEquipmentProfiles, useProfile } from "@/lib/local";
import { getDb } from "@/lib/local/db";
import {
  EQUIPMENT_CODES,
  EQUIPMENT_OPTIONS,
  draftFromProfile,
  parseDraft,
  type EquipmentDraft,
} from "./equipment-form";
import { CheckField } from "./check-field";

function summary(p: EquipmentProfile): string {
  const kit = p.equipment.filter((c): c is Exclude<EquipmentCode, "bodyweight"> => c in EQUIPMENT_OPTIONS).map((c) => EQUIPMENT_OPTIONS[c]);
  return kit.length > 0 ? kit.join(", ") : "Bodyweight only";
}

export function EquipmentPanel() {
  const profiles = useEquipmentProfiles();
  const profile = useProfile();
  // `new` opens a blank form; a profile opens that profile.
  const [editing, setEditing] = useState<EquipmentProfile | "new" | null>(null);

  return (
    <>
      {profiles === undefined ? <Skeleton rows={2} /> : null}
      <ListGroup label="Equipment profiles" className="border-t border-rule">
        {profiles?.map((p) => (
          <ListRow
            key={p.id}
            title={p.name}
            subtitle={summary(p)}
            trailing={p.is_default ? "Default" : undefined}
            chevron
            onClick={() => setEditing(p)}
          />
        ))}
        <ListRow title="Add equipment profile" trailing={<IconPlus size={20} />} disabled={profiles === undefined} onClick={() => setEditing("new")} />
      </ListGroup>

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
    </>
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
    <form onSubmit={save} className="flex flex-col gap-5" noValidate>
      <Field label="Name" value={draft.name} error={errors.name} maxLength={60} onChange={(e) => set("name", e.target.value)} />

      <fieldset className="flex flex-col">
        <legend className="mb-1">What you have</legend>
        {EQUIPMENT_CODES.map((code) => (
          <CheckField key={code} checked={draft.equipment.includes(code)} onChange={() => toggle(code)}>
            {EQUIPMENT_OPTIONS[code]}
          </CheckField>
        ))}
        <p className="mt-1 text-small">Bodyweight exercises are always available.</p>
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

      <CheckField
        checked={draft.isDefault}
        disabled={mustBeDefault}
        onChange={(on) => set("isDefault", on)}
        hint={mustBeDefault ? (others.length === 0 ? "This is your only profile." : "Make another profile the default to change this.") : undefined}
      >
        Use by default
      </CheckField>

      <Button type="submit" variant="primary" className="bleed" loading={busy}>
        Save
      </Button>

      {existing ? (
        confirmDelete ? (
          <div className="flex flex-col gap-3 border-t border-rule pt-3">
            <p className="text-why">Days that use this profile go back to any equipment. Past workouts keep their history.</p>
            <div className="bleed flex items-stretch">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
              <Button variant="primary" className="flex-1" disabled={busy} onClick={() => void remove()}>
                Delete
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Button variant="secondary" disabled={existing.is_default || busy} onClick={() => setConfirmDelete(true)}>
              Delete profile
            </Button>
            {existing.is_default ? <p className="-mt-3 text-why">Make another profile the default before you delete this one.</p> : null}
          </>
        )
      ) : null}
    </form>
  );
}
