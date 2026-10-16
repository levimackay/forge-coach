"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { ListGroup, ListRow } from "@/components/ui/list-row";
import { parseNumber } from "@/components/ui/number-math";
import { NumberStepper } from "@/components/ui/number-stepper";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { ScreenBar } from "@/components/shell/screen-bar";
import { SyncChip } from "@/components/shell/sync-chip";
import { useBodyMeasurements, useLive, useProfile, useRecoveryLogs } from "@/lib/local";
import type { BodyMeasurement, IsoDate, RecoveryLog, Unit } from "@/lib/domain/types";
import { RatingRow, ScreenTitle, SectionTitle } from "./bits";
import { formatDay, formatNumber } from "./format";
import {
  EMPTY_MEASUREMENT,
  RATINGS,
  findMeasurement,
  findRecovery,
  measurementValuesOf,
  recoveryValuesOf,
  saveMeasurement,
  saveRecovery,
  validateMeasurement,
  validateRecovery,
  type MeasurementValues,
  type RecoveryValues,
} from "./log-model";
import { ScreenSkeleton } from "./skeletons";
import { useToday } from "./use-now";

type Tab = "recovery" | "body";

export function LogScreen() {
  const today = useToday();
  const profile = useProfile();
  const [tab, setTab] = useState<Tab>("recovery");
  const [picked, setPicked] = useState<IsoDate | null>(null);

  if (today === null || profile === undefined) return <ScreenSkeleton rows={4} label="Loading" />;
  const date = picked ?? today;
  const unit: Unit = profile?.unit ?? "lb";

  return (
    <div className="flex flex-col gap-6 pb-[var(--band-height)]">
      <div>
        <ScreenBar start={<SyncChip />} />
        <ScreenTitle title="Log" />
        <Segmented
          label="What to log"
          className="-ml-2.5"
          value={tab}
          onChange={setTab}
          options={[
            { value: "recovery", label: "Recovery" },
            { value: "body", label: "Body" },
          ]}
        />
      </div>
      <Field
        label="Date"
        type="date"
        value={date}
        max={today}
        onChange={(e) => {
          if (e.target.value) setPicked(e.target.value);
        }}
      />
      {tab === "recovery" ? (
        <RecoveryTab date={date} onPickDate={setPicked} />
      ) : (
        <BodyTab date={date} unit={unit} onPickDate={setPicked} />
      )}
    </div>
  );
}

function RecoveryTab({ date, onPickDate }: { date: IsoDate; onPickDate: (d: IsoDate) => void }) {
  const existing = useLive(() => findRecovery(date), [date]);
  const recent = useRecoveryLogs(30);

  if (existing === undefined) return <ScreenSkeleton rows={3} label="Loading check-in" />;
  return (
    <>
      <RecoveryForm key={`${date}:${existing?.id ?? "new"}`} date={date} existing={existing} />
      {recent && recent.length > 0 ? (
        <section>
          <SectionTitle>Recent check-ins</SectionTitle>
          <ListGroup label="Recent check-ins" className="border-t border-rule">
            {recent.slice(0, 10).map((log) => (
              <ListRow
                key={log.id}
                title={formatDay(log.date)}
                subtitle={recoverySummary(log)}
                trailing={log.date === date ? "Open" : undefined}
                onClick={() => onPickDate(log.date)}
                chevron
              />
            ))}
          </ListGroup>
        </section>
      ) : null}
    </>
  );
}

function recoverySummary(log: RecoveryLog): string {
  const parts = [
    log.sleep_hours !== null ? `${formatNumber(log.sleep_hours)} h sleep` : null,
    log.soreness !== null ? `soreness ${log.soreness}` : null,
    log.energy !== null ? `energy ${log.energy}` : null,
    log.stress !== null ? `stress ${log.stress}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Note only";
}

function RecoveryForm({ date, existing }: { date: IsoDate; existing: RecoveryLog | null }) {
  const { toast } = useToast();
  const [values, setValues] = useState<RecoveryValues>(() => recoveryValuesOf(existing));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const problem = validateRecovery(values);
    setError(problem);
    if (problem) return;
    setBusy(true);
    try {
      await saveRecovery(date, values);
      toast(existing ? "Check-in updated" : "Check-in saved");
    } catch {
      toast("The check-in was not saved. Try again.", { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Recovery check-in" className="flex flex-col gap-5">
      <div>
        <NumberStepper
          label="Sleep last night"
          unit="h"
          value={values.sleep_hours}
          step={0.5}
          min={0}
          max={24}
          onChange={(sleep_hours) => setValues({ ...values, sleep_hours })}
        />
        {RATINGS.map(({ key, label, low, high }) => (
          <RatingRow
            key={key}
            label={label}
            low={low}
            high={high}
            value={values[key]}
            onChange={(next) => setValues({ ...values, [key]: next })}
          />
        ))}
        <div className="border-t border-rule" />
      </div>
      <Field
        label="Note (optional)"
        multiline
        rows={2}
        maxLength={1000}
        value={values.notes}
        onChange={(e) => setValues({ ...values, notes: e.target.value })}
      />
      {error ? (
        <p role="alert" className="font-medium">
          {error}
        </p>
      ) : null}
      <Button variant="primary" pinned="tabs" loading={busy} onClick={() => void save()}>
        {existing ? "Update check-in" : "Save check-in"}
      </Button>
    </section>
  );
}

function BodyTab({ date, unit, onPickDate }: { date: IsoDate; unit: Unit; onPickDate: (d: IsoDate) => void }) {
  const existing = useLive(() => findMeasurement(date), [date]);
  const all = useBodyMeasurements();

  if (existing === undefined || all === undefined) return <ScreenSkeleton rows={3} label="Loading measurements" />;
  const latest = all.find((m) => m.measured_on !== date) ?? null;
  return (
    <>
      <BodyForm key={`${date}:${existing?.id ?? "new"}`} date={date} unit={unit} existing={existing} latest={latest} />
      {all.length > 0 ? (
        <section>
          <SectionTitle>Recent measurements</SectionTitle>
          <ListGroup label="Recent measurements" className="border-t border-rule">
            {all.slice(0, 8).map((m) => (
              <ListRow
                key={m.id}
                title={formatDay(m.measured_on)}
                subtitle={bodySummary(m, unit)}
                trailing={m.measured_on === date ? "Open" : undefined}
                onClick={() => onPickDate(m.measured_on)}
                chevron
              />
            ))}
          </ListGroup>
        </section>
      ) : (
        <EmptyState title="No measurements yet">Your first entry shows up here and feeds your bodyweight trend.</EmptyState>
      )}
    </>
  );
}

function bodySummary(m: BodyMeasurement, unit: Unit): string {
  const length = unit === "lb" ? "in" : "cm";
  const parts = [
    m.bodyweight !== null ? `${formatNumber(m.bodyweight)} ${unit}` : null,
    m.waist !== null ? `waist ${formatNumber(m.waist)} ${length}` : null,
    m.body_fat_pct !== null ? `${formatNumber(m.body_fat_pct)}% body fat` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Note only";
}

type TextValues = Record<Exclude<keyof MeasurementValues, "notes">, string> & { notes: string };

const FIELDS: { key: Exclude<keyof MeasurementValues, "notes">; label: string; kind: "weight" | "length" | "percent" }[] = [
  { key: "bodyweight", label: "Bodyweight", kind: "weight" },
  { key: "waist", label: "Waist", kind: "length" },
  { key: "chest", label: "Chest", kind: "length" },
  { key: "arm", label: "Arm", kind: "length" },
  { key: "thigh", label: "Thigh", kind: "length" },
  { key: "body_fat_pct", label: "Body fat", kind: "percent" },
];

const toText = (n: number | null): string => (n === null ? "" : formatNumber(n));

function BodyForm({
  date,
  unit,
  existing,
  latest,
}: {
  date: IsoDate;
  unit: Unit;
  existing: BodyMeasurement | null;
  latest: BodyMeasurement | null;
}) {
  const { toast } = useToast();
  const [text, setText] = useState<TextValues>(() => {
    const v = measurementValuesOf(existing);
    return {
      bodyweight: toText(v.bodyweight),
      waist: toText(v.waist),
      chest: toText(v.chest),
      arm: toText(v.arm),
      thigh: toText(v.thigh),
      body_fat_pct: toText(v.body_fat_pct),
      notes: v.notes,
    };
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const length = unit === "lb" ? "in" : "cm";

  const save = async () => {
    const values: MeasurementValues = { ...EMPTY_MEASUREMENT, notes: text.notes };
    for (const { key, label } of FIELDS) {
      const raw = text[key].trim();
      if (raw === "") continue;
      const n = parseNumber(raw);
      if (n === null) {
        setError(`${label} has to be a number.`);
        return;
      }
      values[key] = n;
    }
    const problem = validateMeasurement(values);
    setError(problem);
    if (problem) return;
    setBusy(true);
    try {
      await saveMeasurement(date, values);
      toast(existing ? "Measurements updated" : "Measurements saved");
    } catch {
      toast("The measurements were not saved. Try again.", { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Body measurements" className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        {FIELDS.map(({ key, label, kind }) => {
          const before = latest?.[key] ?? null;
          return (
            <Field
              key={key}
              label={label}
              inputMode="decimal"
              autoComplete="off"
              suffix={kind === "weight" ? unit : kind === "length" ? length : "%"}
              placeholder={before !== null ? formatNumber(before) : undefined}
              value={text[key]}
              onChange={(e) => setText({ ...text, [key]: e.target.value })}
            />
          );
        })}
      </div>
      {latest ? (
        <p>The grey numbers are from your entry on {formatDay(latest.measured_on)}.</p>
      ) : null}
      <Field
        label="Note (optional)"
        multiline
        rows={2}
        maxLength={1000}
        value={text.notes}
        onChange={(e) => setText({ ...text, notes: e.target.value })}
      />
      {error ? (
        <p role="alert" className="font-medium">
          {error}
        </p>
      ) : null}
      <Button variant="primary" pinned="tabs" loading={busy} onClick={() => void save()}>
        {existing ? "Update measurements" : "Save measurements"}
      </Button>
    </section>
  );
}
