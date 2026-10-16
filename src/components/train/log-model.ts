import type { BodyMeasurement, IsoDate, RecoveryLog } from "@/lib/domain/types";
import { getDb } from "@/lib/local/db";
import { recoveryLogId } from "@/lib/local/ids";
import { requireUserId } from "@/lib/local/session";
import { putRow } from "@/lib/local/write";

const NOTES_MAX = 1000;
const alive = <T extends { deleted_at?: string | null }>(row: T): boolean => !row.deleted_at;

export interface RecoveryValues {
  sleep_hours: number | null;
  sleep_quality: number | null;
  soreness: number | null;
  energy: number | null;
  stress: number | null;
  notes: string;
}

export const EMPTY_RECOVERY: RecoveryValues = {
  sleep_hours: null,
  sleep_quality: null,
  soreness: null,
  energy: null,
  stress: null,
  notes: "",
};

/** 1 to 5 scales where the high end is not always the good end, so each says what it means. */
export const RATINGS: {
  key: "sleep_quality" | "soreness" | "energy" | "stress";
  label: string;
  low: string;
  high: string;
}[] = [
  { key: "sleep_quality", label: "Sleep quality", low: "Poor", high: "Great" },
  { key: "soreness", label: "Soreness", low: "None", high: "Very sore" },
  { key: "energy", label: "Energy", low: "Drained", high: "High" },
  { key: "stress", label: "Stress", low: "Calm", high: "High" },
];

export function recoveryValuesOf(log: RecoveryLog | null): RecoveryValues {
  if (!log) return EMPTY_RECOVERY;
  return {
    sleep_hours: log.sleep_hours,
    sleep_quality: log.sleep_quality,
    soreness: log.soreness,
    energy: log.energy,
    stress: log.stress,
    notes: log.notes ?? "",
  };
}

export function validateRecovery(v: RecoveryValues): string | null {
  const anything =
    v.sleep_hours !== null ||
    v.sleep_quality !== null ||
    v.soreness !== null ||
    v.energy !== null ||
    v.stress !== null ||
    v.notes.trim() !== "";
  if (!anything) return "Enter at least one thing to save.";
  if (v.sleep_hours !== null && (v.sleep_hours < 0 || v.sleep_hours > 24)) {
    return "Sleep has to be between 0 and 24 hours.";
  }
  if (v.notes.length > NOTES_MAX) return `Keep the note under ${NOTES_MAX} characters.`;
  return null;
}

export async function findRecovery(date: IsoDate): Promise<RecoveryLog | null> {
  return (await getDb().recovery_logs.where("date").equals(date).filter(alive).first()) ?? null;
}

/**
 * One check-in per day: saving again on the same date edits the existing log. A new log's id comes
 * from the account and the date, so two devices that log the same day offline write the same row
 * (the server allows one live log per day) and last write wins instead of one being rejected.
 */
export async function saveRecovery(date: IsoDate, v: RecoveryValues): Promise<RecoveryLog> {
  const db = getDb();
  return db.transaction("rw", db.recovery_logs, db.outbox, async () => {
    const existing = await findRecovery(date);
    const note = v.notes.trim();
    return putRow("recovery_logs", {
      ...(existing ?? { id: recoveryLogId(requireUserId(), date) }),
      date,
      sleep_hours: v.sleep_hours,
      sleep_quality: v.sleep_quality,
      soreness: v.soreness,
      energy: v.energy,
      stress: v.stress,
      notes: note === "" ? null : note,
    });
  });
}

export interface MeasurementValues {
  bodyweight: number | null;
  waist: number | null;
  chest: number | null;
  arm: number | null;
  thigh: number | null;
  body_fat_pct: number | null;
  notes: string;
}

export const EMPTY_MEASUREMENT: MeasurementValues = {
  bodyweight: null,
  waist: null,
  chest: null,
  arm: null,
  thigh: null,
  body_fat_pct: null,
  notes: "",
};

type MeasuredKey = "bodyweight" | "waist" | "chest" | "arm" | "thigh" | "body_fat_pct";

/** Limits match the database, so a bad number is caught here instead of being parked after a failed sync. */
const LIMITS: Record<MeasuredKey, { label: string; max: number; exclusiveMax?: boolean }> = {
  bodyweight: { label: "Bodyweight", max: 1000 },
  waist: { label: "Waist", max: 500 },
  chest: { label: "Chest", max: 500 },
  arm: { label: "Arm", max: 500 },
  thigh: { label: "Thigh", max: 500 },
  body_fat_pct: { label: "Body fat", max: 100, exclusiveMax: true },
};

export const MEASURED_KEYS = Object.keys(LIMITS) as MeasuredKey[];

export function measurementValuesOf(m: BodyMeasurement | null): MeasurementValues {
  if (!m) return EMPTY_MEASUREMENT;
  return {
    bodyweight: m.bodyweight,
    waist: m.waist,
    chest: m.chest,
    arm: m.arm,
    thigh: m.thigh,
    body_fat_pct: m.body_fat_pct,
    notes: m.notes ?? "",
  };
}

export function validateMeasurement(v: MeasurementValues): string | null {
  if (MEASURED_KEYS.every((k) => v[k] === null) && v.notes.trim() === "") return "Enter at least one measurement to save.";
  for (const key of MEASURED_KEYS) {
    const value = v[key];
    if (value === null) continue;
    const { label, max, exclusiveMax } = LIMITS[key];
    if (!(value > 0) || value > max || (exclusiveMax && value >= max)) {
      return `${label} has to be more than 0 and ${exclusiveMax ? "under" : "at most"} ${max}.`;
    }
  }
  if (v.notes.length > NOTES_MAX) return `Keep the note under ${NOTES_MAX} characters.`;
  return null;
}

export async function findMeasurement(date: IsoDate): Promise<BodyMeasurement | null> {
  return (await getDb().body_measurements.where("measured_on").equals(date).filter(alive).first()) ?? null;
}

export async function saveMeasurement(date: IsoDate, v: MeasurementValues): Promise<BodyMeasurement> {
  const db = getDb();
  return db.transaction("rw", db.body_measurements, db.outbox, async () => {
    const existing = await findMeasurement(date);
    const note = v.notes.trim();
    return putRow("body_measurements", {
      ...(existing ?? {}),
      measured_on: date,
      bodyweight: v.bodyweight,
      waist: v.waist,
      chest: v.chest,
      arm: v.arm,
      thigh: v.thigh,
      body_fat_pct: v.body_fat_pct,
      notes: note === "" ? null : note,
    });
  });
}
