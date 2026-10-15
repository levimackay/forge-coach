import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/local/db";
import { freshLocalState } from "@/lib/local/test-support";
import {
  EMPTY_MEASUREMENT,
  EMPTY_RECOVERY,
  RATINGS,
  findMeasurement,
  findRecovery,
  measurementValuesOf,
  recoveryValuesOf,
  saveMeasurement,
  saveRecovery,
  validateMeasurement,
  validateRecovery,
} from "./log-model";

vi.mock("@/lib/supabase/client", async () => {
  const { fakeServer } = await import("@/lib/local/test-support");
  return { getSupabase: () => fakeServer.client };
});

beforeEach(async () => {
  await freshLocalState();
});

describe("validateRecovery", () => {
  it("needs something to save", () => {
    expect(validateRecovery(EMPTY_RECOVERY)).toMatch(/at least one/);
    expect(validateRecovery({ ...EMPTY_RECOVERY, soreness: 3 })).toBeNull();
    expect(validateRecovery({ ...EMPTY_RECOVERY, notes: "tweaked shoulder" })).toBeNull();
  });

  it("keeps sleep between 0 and 24 hours", () => {
    expect(validateRecovery({ ...EMPTY_RECOVERY, sleep_hours: 25 })).toMatch(/0 and 24/);
    expect(validateRecovery({ ...EMPTY_RECOVERY, sleep_hours: 0 })).toBeNull();
    expect(validateRecovery({ ...EMPTY_RECOVERY, sleep_hours: 7.5 })).toBeNull();
  });

  it("limits the note length to what the database accepts", () => {
    expect(validateRecovery({ ...EMPTY_RECOVERY, notes: "x".repeat(1001) })).toMatch(/1000/);
  });

  it("describes the direction of every rating", () => {
    expect(RATINGS.map((r) => r.key)).toEqual(["sleep_quality", "soreness", "energy", "stress"]);
    const soreness = RATINGS.find((r) => r.key === "soreness")!;
    expect(soreness.low).toBe("None");
    expect(soreness.high).toBe("Very sore");
  });
});

describe("saveRecovery", () => {
  const values = { ...EMPTY_RECOVERY, sleep_hours: 7.5, sleep_quality: 4, soreness: 2, energy: 4, stress: 2, notes: " ok " };

  it("creates a log for the date and queues it", async () => {
    const log = await saveRecovery("2026-10-15", values);
    expect(log).toMatchObject({ date: "2026-10-15", sleep_hours: 7.5, sleep_quality: 4, soreness: 2, energy: 4, stress: 2, notes: "ok" });
    expect(await getDb().outbox.get(`recovery_logs:${log.id}`)).toBeTruthy();
    expect((await findRecovery("2026-10-15"))?.id).toBe(log.id);
    expect(await findRecovery("2026-10-14")).toBeNull();
  });

  it("edits the existing log for the same date instead of adding a second", async () => {
    const first = await saveRecovery("2026-10-15", values);
    const second = await saveRecovery("2026-10-15", { ...values, soreness: 5 });
    expect(second.id).toBe(first.id);
    expect(second.soreness).toBe(5);
    expect(await getDb().recovery_logs.count()).toBe(1);
  });

  it("does not collide when two saves race", async () => {
    await Promise.all([saveRecovery("2026-10-15", values), saveRecovery("2026-10-15", { ...values, energy: 1 })]);
    expect(await getDb().recovery_logs.where("date").equals("2026-10-15").count()).toBe(1);
  });

  it("stores a blank note as null and round-trips the form values", async () => {
    const log = await saveRecovery("2026-10-15", { ...EMPTY_RECOVERY, soreness: 3 });
    expect(log.notes).toBeNull();
    expect(recoveryValuesOf(log)).toEqual({ ...EMPTY_RECOVERY, soreness: 3 });
    expect(recoveryValuesOf(null)).toEqual(EMPTY_RECOVERY);
  });

  it("brings back a deleted day's log as a new edit of the same row", async () => {
    const log = await saveRecovery("2026-10-15", values);
    await getDb().recovery_logs.put({ ...log, deleted_at: "2026-10-16T00:00:00Z" });
    expect(await findRecovery("2026-10-15")).toBeNull();
    const again = await saveRecovery("2026-10-15", values);
    expect(again.id).toBe(log.id);
    expect(again.deleted_at).toBeNull();
    expect(await getDb().recovery_logs.count()).toBe(1);
  });

  it("gives the same day the same row id on every device, so the server keeps one log", async () => {
    const phone = await saveRecovery("2026-10-15", values);
    await freshLocalState(); // another device, same account, nothing synced yet
    const laptop = await saveRecovery("2026-10-15", { ...values, soreness: 4 });
    expect(laptop.id).toBe(phone.id);
    expect((await saveRecovery("2026-10-16", values)).id).not.toBe(phone.id);
  });
});

describe("validateMeasurement", () => {
  it("needs a value and rejects impossible ones", () => {
    expect(validateMeasurement(EMPTY_MEASUREMENT)).toMatch(/at least one/);
    expect(validateMeasurement({ ...EMPTY_MEASUREMENT, bodyweight: 180 })).toBeNull();
    expect(validateMeasurement({ ...EMPTY_MEASUREMENT, bodyweight: 0 })).toMatch(/Bodyweight/);
    expect(validateMeasurement({ ...EMPTY_MEASUREMENT, bodyweight: 1001 })).toMatch(/1000/);
    expect(validateMeasurement({ ...EMPTY_MEASUREMENT, waist: 501 })).toMatch(/Waist/);
    expect(validateMeasurement({ ...EMPTY_MEASUREMENT, body_fat_pct: 100 })).toMatch(/under 100/);
    expect(validateMeasurement({ ...EMPTY_MEASUREMENT, body_fat_pct: 18.5 })).toBeNull();
  });
});

describe("saveMeasurement", () => {
  it("saves once per date and edits in place", async () => {
    const first = await saveMeasurement("2026-10-15", { ...EMPTY_MEASUREMENT, bodyweight: 181.4, waist: 33.5, notes: " am " });
    expect(first).toMatchObject({ measured_on: "2026-10-15", bodyweight: 181.4, waist: 33.5, chest: null, notes: "am" });
    const second = await saveMeasurement("2026-10-15", { ...EMPTY_MEASUREMENT, bodyweight: 181 });
    expect(second.id).toBe(first.id);
    expect(second.waist).toBeNull();
    expect(await getDb().body_measurements.count()).toBe(1);
    expect((await findMeasurement("2026-10-15"))?.bodyweight).toBe(181);
    expect(measurementValuesOf(second)).toEqual({ ...EMPTY_MEASUREMENT, bodyweight: 181 });
  });
});
