import type { IsoDate, RecoveryLog } from "@/lib/domain/types";
import { daysBetween, inRange } from "./dates";

// Under this many hours the engine freezes load increases (docs/plan/research.md, Craven 2022).
export const SHORT_SLEEP_HOURS = 6;
// On the 1 to 5 soreness scale, 4 and above means still sore.
export const HIGH_SORENESS = 4;

export interface RecoverySummary {
  from: IsoDate;
  to: IsoDate;
  days_in_period: number;
  days_logged: number;
  avg_sleep_hours: number | null;
  avg_sleep_quality: number | null;
  avg_soreness: number | null;
  avg_energy: number | null;
  avg_stress: number | null;
  short_sleep_nights: number;
  high_soreness_days: number;
  latest: Pick<RecoveryLog, "date" | "sleep_hours" | "sleep_quality" | "soreness" | "energy" | "stress"> | null;
}

const mean = (values: Array<number | null>): number | null => {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export function recoverySummary(input: { logs: RecoveryLog[]; from: IsoDate; to: IsoDate }): RecoverySummary {
  const logs = input.logs
    .filter((l) => !l.deleted_at && inRange(l.date, input.from, input.to))
    .sort((a, b) => a.date.localeCompare(b.date));
  const last = logs[logs.length - 1];
  return {
    from: input.from,
    to: input.to,
    days_in_period: daysBetween(input.from, input.to) + 1,
    days_logged: new Set(logs.map((l) => l.date)).size,
    avg_sleep_hours: mean(logs.map((l) => l.sleep_hours)),
    avg_sleep_quality: mean(logs.map((l) => l.sleep_quality)),
    avg_soreness: mean(logs.map((l) => l.soreness)),
    avg_energy: mean(logs.map((l) => l.energy)),
    avg_stress: mean(logs.map((l) => l.stress)),
    short_sleep_nights: logs.filter((l) => l.sleep_hours !== null && l.sleep_hours < SHORT_SLEEP_HOURS).length,
    high_soreness_days: logs.filter((l) => l.soreness !== null && l.soreness >= HIGH_SORENESS).length,
    latest: last
      ? {
          date: last.date,
          sleep_hours: last.sleep_hours,
          sleep_quality: last.sleep_quality,
          soreness: last.soreness,
          energy: last.energy,
          stress: last.stress,
        }
      : null,
  };
}
