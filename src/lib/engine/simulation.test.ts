import { describe, expect, it } from "vitest";
import type { ProgressionAction } from "@/lib/domain/types";
import { decideNext } from "./decide";
import { decisionToWrites } from "./plan";
import { BENCH, DB_CURL, LIBRARY, PU_DECLINE, PU_STD, makeEquipment, makeInput, makeSets } from "./testkit";
import type { EngineInput, PlannedPrescription, SessionHistoryEntry } from "./types";

const START = Date.parse("2026-06-01T10:00:00.000Z");
const DAY = 86_400_000;

interface Run {
  actions: ProgressionAction[];
  loads: (number | null)[];
  exercises: string[];
}

// Trains twice a week. `perform` says what the lifter manages given the current plan.
// After each session the engine's decision is written back the way the app will write it,
// and a second call before the next session checks the same session is never counted twice.
function simulate(
  equipment: EngineInput["equipment"],
  start: PlannedPrescription,
  sessions: number,
  perform: (planned: PlannedPrescription) => { reps: number[]; rir: number | null },
): Run {
  let planned = { ...start };
  const history: SessionHistoryEntry[] = [];
  const out: Run = { actions: [], loads: [], exercises: [] };
  const consistency = (gap: number) => ({ days_since_last_session: gap, sessions_last_28d: 8, planned_last_28d: 8 });
  for (let i = 0; i < sessions; i++) {
    const at = new Date(START + i * 3.5 * DAY).toISOString();
    const { reps, rir } = perform(planned);
    history.unshift({
      workout_id: `w${i}`,
      completed_at: at,
      sets: makeSets(reps, { load: planned.load, rir, exercise: planned.exercise_id }),
    });
    const exercise = LIBRARY.find((e) => e.id === planned.exercise_id)!;
    const decision = decideNext(makeInput({ exercise, planned, equipment, history, now: at, consistency: consistency(0) }));
    const { plannedPatch } = decisionToWrites(decision, { planned_exercise_id: "pe", workout_id: `w${i}`, decided_at: at });
    planned = { ...planned, ...plannedPatch, updated_at: new Date(Date.parse(at) + 1000).toISOString() };

    const later = new Date(Date.parse(at) + 3 * DAY).toISOString();
    const nextExercise = LIBRARY.find((e) => e.id === planned.exercise_id)!;
    const again = decideNext(makeInput({ exercise: nextExercise, planned, equipment, history, now: later, consistency: consistency(3) }));
    expect(again.after).toEqual(decision.after);
    expect(again.action).toBe("hold");

    out.actions.push(decision.action);
    out.loads.push(planned.load);
    out.exercises.push(planned.exercise_id);
  }
  return out;
}

const benchStart: PlannedPrescription = { exercise_id: BENCH.id, sets: 3, rep_min: 6, rep_max: 10, target_rir: 2, load: 100 };

describe("progression over many sessions", () => {
  it("climbs reps then load on the bench press without ever going backwards", () => {
    let lastLoad = 100;
    let reps = 6;
    const run = simulate(null, benchStart, 14, (p) => {
      if (p.load !== lastLoad) {
        lastLoad = p.load as number;
        reps = 7;
      }
      const r = Math.min(10, reps++);
      return { reps: [r, r, r], rir: 2 };
    });
    expect(run.actions.slice(0, 5)).toEqual(["increase_reps", "increase_reps", "increase_reps", "increase_reps", "increase_load"]);
    expect(run.loads.slice(0, 5)).toEqual([100, 100, 100, 100, 105]);
    expect(run.loads[run.loads.length - 1]).toBe(115);
    for (let i = 1; i < run.loads.length; i++) expect(run.loads[i] as number).toBeGreaterThanOrEqual(run.loads[i - 1] as number);
    expect(run.actions).not.toContain("deload");
  });

  it("walks a dumbbell curl up through the stretched rep ceiling before each jump", () => {
    const equipment = makeEquipment({ equipment: ["dumbbells"], dumbbell_increment: 5, dumbbell_max: 40 });
    const start: PlannedPrescription = { exercise_id: DB_CURL.id, sets: 3, rep_min: 8, rep_max: 12, target_rir: 2, load: 25 };
    let lastLoad = 25;
    let reps = 12;
    const run = simulate(equipment, start, 10, (p) => {
      if (p.load !== lastLoad) {
        lastLoad = p.load as number;
        reps = 12;
      }
      const r = reps++;
      return { reps: [r, r, r], rir: 3 };
    });
    expect(run.loads.slice(0, 8)).toEqual(Array(8).fill(25));
    expect(run.actions[8]).toBe("increase_load");
    expect(run.loads[8]).toBe(30);
  });

  it("moves a push-up up the ladder once the top of the range is reached", () => {
    const start: PlannedPrescription = { exercise_id: PU_STD.id, sets: 3, rep_min: 8, rep_max: 20, target_rir: 2, load: null };
    let reps = 14;
    const run = simulate(null, start, 9, (p) => {
      const r = p.exercise_id === PU_STD.id ? reps++ : 8;
      return { reps: [r, r, r], rir: null };
    });
    const advancedAt = run.actions.indexOf("advance_variation");
    expect(advancedAt).toBe(6);
    expect(run.exercises[advancedAt]).toBe(PU_DECLINE.id);
    expect(run.exercises.slice(0, advancedAt).every((e) => e === PU_STD.id)).toBe(true);
  });

  it("deloads a stuck lifter once and then lets them build back", () => {
    let sessions = 0;
    let reps = 8;
    const run = simulate(null, benchStart, 8, (p) => {
      sessions++;
      if (sessions <= 2) return { reps: [5, 5, 5], rir: 0 };
      if (p.load !== 100) return { reps: [Math.min(10, reps++)].flatMap((r) => [r, r, r]), rir: 2 };
      return { reps: [8, 8, 8], rir: 2 };
    });
    expect(run.actions.slice(0, 3)).toEqual(["hold", "deload", "increase_reps"]);
    expect(run.loads[1]).toBe(90);
    expect(run.actions.filter((a) => a === "deload")).toHaveLength(1);
    expect(run.loads[run.loads.length - 1]).toBeGreaterThanOrEqual(90);
  });
});
