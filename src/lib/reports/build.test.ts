import { describe, expect, it } from "vitest";
import { buildReport } from "./build";
import { emptyData, NOW, scenario } from "./fixtures";
import { exercise, set, workout } from "../analytics/testkit";
import { REPORT_FORMAT_VERSION } from "./types";

const run = (kind: "session" | "week" | "month", data = scenario().data, extra: { workoutId?: string } = {}) =>
  buildReport({ kind, data, now: NOW, unit: "lb", ...extra });

describe("week report", () => {
  const { json, markdown, title } = run("week");

  it("covers the 7 local days ending today", () => {
    expect(title).toBe("Week report: Oct 9 to Oct 15, 2026");
    expect(json.period).toEqual({ from: "2026-10-09", to: "2026-10-15", days: 7 });
    expect(json.session_detail).toBeNull();
  });

  it("lists completed sessions in local time, not the abandoned one", () => {
    expect(json.sessions.map((s) => s.date)).toEqual(["2026-10-12", "2026-10-14"]);
    expect(json.sessions.map((s) => s.work_sets)).toEqual([2, 5]);
    expect(json.sessions.map((s) => s.exercises)).toEqual([1, 2]);
    expect(json.sessions.map((s) => s.duration_minutes)).toEqual([50, 55]);
    expect(json.sessions.map((s) => s.session_rpe)).toEqual([7, 8]);
    expect(json.sessions[0].day_name).toBe("Push A");
  });

  it("computes consistency against 3 sessions a week", () => {
    expect(json.consistency).toMatchObject({
      completed: 2,
      planned: 3,
      adherence: 0.67,
      abandoned: 1,
      training_days: 2,
      longest_gap_days: 2,
      days_since_last: 1,
    });
  });

  it("bench: e1RM 133 -> 139.33, a new best over 126.67 from last week", () => {
    const bench = json.exercises[0];
    expect(bench.name).toBe("Bench Press");
    expect(bench.sessions.map((p) => p.top_e1rm)).toEqual([133, 139.33]);
    expect(bench.first_to_last).toMatchObject({ e1rm: 6.33, e1rm_pct: 4.76, volume_load: -35, total_reps: -1 });
    expect(bench.period_best_e1rm).toBe(139.33);
    expect(bench.previous_best_e1rm).toBe(126.67);
    expect(bench.is_pr).toBe(true);
  });

  it("push-up uses the latest bodyweight: 182 * (1 + 12/30) = 254.8, no PR without history", () => {
    const pushup = json.exercises[1];
    expect(pushup.name).toBe("Push-up");
    expect(pushup.sessions[0].top_e1rm).toBe(254.8);
    expect(pushup.sessions[0].volume_load).toBe(6734); // 182 * 37
    expect(pushup.previous_best_e1rm).toBeNull();
    expect(pushup.is_pr).toBe(false);
    expect(pushup.first_to_last).toBeNull();
  });

  it("weekly hard sets: chest 4 bench + 3 push-up, secondary muscles at half", () => {
    expect(json.weekly_volume.weeks).toHaveLength(1);
    const muscles = json.weekly_volume.weeks[0].muscles;
    expect(muscles.find((m) => m.muscle === "chest")).toEqual({ muscle: "chest", sets: 7, direct_sets: 7, indirect_sets: 0, sessions: 2 });
    expect(muscles.find((m) => m.muscle === "front_delts")!.sets).toBe(3.5);
    expect(json.weekly_volume).toMatchObject({ reference_min: 10, reference_max: 20 });
  });

  it("recovery, bodyweight, decisions and pain", () => {
    expect(json.recovery).toMatchObject({ days_logged: 3, avg_sleep_hours: 6.83, short_sleep_nights: 1, high_soreness_days: 1 });
    expect(json.bodyweight_trend).toMatchObject({ change: 2, per_week: 1, latest: { date: "2026-10-15", bodyweight: 182 } });
    expect(json.athlete.bodyweight).toEqual({ value: 182, source: "measurement", date: "2026-10-15" });
    expect(json.decisions.total).toBe(2);
    expect(json.decisions.by_action).toEqual({ hold: 1, pain_hold: 1 });
    expect(json.pain_flags).toEqual([
      { date: "2026-10-14", workout_id: expect.any(String), exercise: "Bench Press", load_type: "external", reps: 6, load: 110, is_warmup: false },
    ]);
  });

  it("states what is missing instead of inventing it", () => {
    expect(json.missing).toEqual(["RIR was not logged on 3 of 7 work sets. Sets without RIR count as hard sets."]);
  });

  it("markdown carries the headline numbers", () => {
    expect(markdown.startsWith("# Week report: Oct 9 to Oct 15, 2026\n")).toBe(true);
    expect(markdown).toContain("- Sessions completed: 2 of 3 planned (67%)");
    expect(markdown).toContain("- e1RM Oct 12 to Oct 14: 133 to 139.3 (+6.3, +4.8%)");
    expect(markdown).toContain("- New e1RM best: 139.3, up from 126.7.");
    expect(markdown).toContain("- chest: 7 (7 direct, 0 indirect), 2 sessions");
    expect(markdown).toContain("- No hard sets: side delts,");
    expect(markdown).toContain("- Oct 14, Bench Press: 110 x 6");
    expect(markdown).toContain("- Oct 14, Bench Press: Hold for pain. Reason: A set was flagged with pain, so the load stays at 110.");
    expect(markdown).toContain("- Bench Press: 3 x 6 to 10 reps, RIR 2, 110");
    expect(markdown).toContain("## Missing data");
  });
});

describe("month report", () => {
  const { json, markdown } = run("month");

  it("covers 28 days and shows four weekly volume windows", () => {
    expect(json.period).toEqual({ from: "2026-09-18", to: "2026-10-15", days: 28 });
    expect(json.weekly_volume.weeks.map((w) => w.from)).toEqual(["2026-09-18", "2026-09-25", "2026-10-02", "2026-10-09"]);
    expect(json.weekly_volume.weeks.map((w) => w.muscles.find((m) => m.muscle === "chest")!.sets)).toEqual([0, 0, 3, 7]);
    expect(markdown).toContain("- chest: 0, 0, 3, 7 (average 2.5)");
  });

  it("prorates the plan: 3 sessions of 12", () => {
    expect(json.consistency).toMatchObject({ completed: 3, planned: 12, adherence: 0.25 });
  });

  it("bench trend across three sessions, with nothing earlier to beat", () => {
    const bench = json.exercises[0];
    expect(bench.sessions).toHaveLength(3);
    expect(bench.first_to_last).toMatchObject({ e1rm: 12.67, e1rm_pct: 10 });
    expect(bench.previous_best_e1rm).toBeNull();
    expect(bench.is_pr).toBe(false);
    expect(markdown).toContain("- Best set each session: 100 x 8, 105 x 8, 110 x 8");
  });

  it("includes the older decision, with the prescription change spelled out", () => {
    expect(json.decisions.total).toBe(3);
    expect(markdown).toContain("Increase load. Was 3 x 6 to 10 reps, RIR 2, 100; now 3 x 6 to 10 reps, RIR 2, 105.");
  });

  it("counts RIR gaps across the month: 3 of 10 work sets", () => {
    expect(json.missing).toContain("RIR was not logged on 3 of 10 work sets. Sets without RIR count as hard sets.");
  });
});

describe("high-rep progress in a period report", () => {
  it("shows added reps that the capped e1RM cannot see", () => {
    const raise = exercise({ name: "Lateral Raise", primary_muscle: "side_delts" });
    const w1 = workout({ started_at: "2026-10-01T18:00:00.000Z", completed_at: "2026-10-01T19:00:00.000Z" });
    const w2 = workout({ started_at: "2026-10-14T18:00:00.000Z", completed_at: "2026-10-14T19:00:00.000Z" });
    const sets = [
      ...[12, 12, 12].map((reps, i) => set({ workout_id: w1.id, exercise_id: raise.id, set_index: i, load: 20, reps, rir: 2 })),
      ...[18, 17, 16].map((reps, i) => set({ workout_id: w2.id, exercise_id: raise.id, set_index: i, load: 20, reps, rir: 2 })),
    ];
    const { markdown } = run("month", { ...emptyData(), exercises: [raise], workouts: [w1, w2], workout_sets: sets });
    expect(markdown).toContain("- e1RM Oct 1 to Oct 14: 28 to 28 (0, 0%)");
    expect(markdown).toContain("- Most reps in a set Oct 1 to Oct 14: 12 to 18 (+6). Reps above 12 do not raise the e1RM.");
  });
});

describe("session report", () => {
  const s = scenario();
  const { json, markdown, title } = run("session", s.data);
  const detail = json.session_detail!;

  it("defaults to the newest completed workout and uses the 7 days ending that day", () => {
    expect(title).toBe("Session report: Push A, Oct 14, 2026");
    expect(json.period).toEqual({ from: "2026-10-08", to: "2026-10-14", days: 7 });
    expect(detail.workout_id).toBe(s.w2.id);
    expect(detail).toMatchObject({ status: "completed", day_name: "Push A", focus: "push", duration_minutes: 55, session_rpe: 8 });
    expect(detail.notes).toBe("Left shoulder tight on the last rep");
    expect(detail.recovery_that_day).toMatchObject({ date: "2026-10-14", sleep_hours: 8, soreness: 3 });
    expect(json.exercises).toEqual([]);
  });

  it("bench: prescribed values come from the engine's before snapshot, not the updated plan", () => {
    const bench = detail.exercises[0];
    expect(bench.name).toBe("Bench Press");
    expect(bench.planned).toEqual({ sets: 3, rep_min: 6, rep_max: 10, target_rir: 2, load: 110 });
    expect(bench.sets.map((x) => [x.reps, x.load, x.rir, x.pain])).toEqual([
      [8, 110, 3, false],
      [6, 110, 0, true],
    ]);
    expect(bench.summary!.top_e1rm).toBe(139.33);
  });

  it("bench: compared with the previous session and the last sessions of the same day", () => {
    const bench = detail.exercises[0];
    expect(bench.previous!.workout_id).toBe(s.w1.id);
    expect(bench.vs_previous).toMatchObject({ e1rm: 6.33, e1rm_pct: 4.76, volume_load: -35 });
    expect(bench.recent_same_day.map((p) => p.top_e1rm)).toEqual([126.67, 133, 139.33]);
  });

  it("push-up: bodyweight as of the session day (181, the Oct 8 reading), no plan, no history", () => {
    const pushup = detail.exercises[1];
    expect(pushup.planned).toBeNull();
    expect(pushup.summary!.top_e1rm).toBe(253.4); // 181 * 1.4
    expect(pushup.previous).toBeNull();
    expect(pushup.vs_previous).toBeNull();
    expect(pushup.recent_same_day).toHaveLength(1);
  });

  it("only this workout's decision and pain flag", () => {
    expect(json.decisions.total).toBe(1);
    expect(json.decisions.items[0].action).toBe("pain_hold");
    expect(json.pain_flags).toHaveLength(1);
    expect(json.missing).toEqual(["RIR was not logged on 3 of 5 work sets. Sets without RIR count as hard sets."]);
  });

  it("markdown walks through the session", () => {
    expect(markdown).toContain("## Session: Push A (push), Oct 14");
    expect(markdown).toContain('Notes from the athlete: "Left shoulder tight on the last rep"');
    expect(markdown).toContain("Prescribed that day: 3 x 6 to 10 reps, RIR 2, 110.");
    expect(markdown).toContain("- Set 2: 110 x 6, RIR 0 (pain flagged)");
    expect(markdown).toContain("Work sets: 2. Best set: 110 x 8 (e1RM 139.3). Volume: 1540.");
    expect(markdown).toContain("Versus Oct 12: e1RM +6.3 (+4.8%), volume -35, total reps -1, work sets 0.");
    expect(markdown).toContain("Last 3 sessions of this day, best set each: 100 x 8, 105 x 8, 110 x 8.");
    expect(markdown).toContain("Prescribed that day: not recorded.");
  });

  it("an older workout by id only sees what came before it", () => {
    const r = run("session", s.data, { workoutId: s.w1.id });
    const d = r.json.session_detail!;
    expect(r.title).toBe("Session report: Push A, Oct 12, 2026");
    expect(d.exercises).toHaveLength(1);
    expect(d.exercises[0].planned).toMatchObject({ load: 105 });
    expect(d.exercises[0].previous!.workout_id).toBe(s.wPrev.id);
    expect(d.exercises[0].vs_previous).toMatchObject({ e1rm: 6.33 });
    expect(d.exercises[0].recent_same_day.map((p) => p.top_e1rm)).toEqual([126.67, 133]);
    expect(d.exercises[0].sets.map((x) => x.is_warmup)).toEqual([true, false, false]);
    expect(d.exercises[0].summary!.work_sets).toBe(2);
    expect(r.json.period.to).toBe("2026-10-12");
  });

  it("never attaches the planned exercise's prescription to an exercise swapped in for it", () => {
    const db = exercise({ name: "Dumbbell Press", primary_muscle: "chest" });
    const data = {
      ...s.data,
      exercises: [...s.data.exercises, db],
      workout_sets: [
        ...s.data.workout_sets,
        set({ workout_id: s.w2.id, exercise_id: db.id, planned_exercise_id: s.peBench.id, set_index: 5, load: 40, reps: 10, rir: 2 }),
      ],
    };
    const d = run("session", data).json.session_detail!;
    expect(d.exercises.find((e) => e.exercise_id === s.bench.id)!.planned).toMatchObject({ load: 110 });
    expect(d.exercises.find((e) => e.exercise_id === db.id)!.planned).toBeNull();
  });

  it("uses the substitute's prescription when the engine swapped the exercise for the equipment", () => {
    const db = exercise({ name: "Dumbbell Press", primary_muscle: "chest" });
    const sub = { exercise_id: db.id, sets: 3, rep_min: 8, rep_max: 12, target_rir: 2, load: null };
    const data = {
      ...s.data,
      exercises: [...s.data.exercises, db],
      workout_sets: s.data.workout_sets.map((x) => (x.workout_id === s.w2.id && x.exercise_id === s.bench.id ? { ...x, exercise_id: db.id, load: 40 } : x)),
      progression_decisions: s.data.progression_decisions.map((x) =>
        x.workout_id === s.w2.id ? { ...x, action: "substitute_equipment" as const, after: sub } : x,
      ),
    };
    const d = run("session", data).json.session_detail!;
    expect(d.exercises.find((e) => e.exercise_id === db.id)!.planned).toEqual({ sets: 3, rep_min: 8, rep_max: 12, target_rir: 2, load: null });
  });

  it("an in-progress workout falls back to the plan row, since no decision exists yet", () => {
    const live = workout({ program_day_id: s.push.id, started_at: "2026-10-15T14:00:00.000Z", status: "in_progress" });
    const data = {
      ...s.data,
      workouts: [...s.data.workouts, live],
      workout_sets: [...s.data.workout_sets, set({ workout_id: live.id, exercise_id: s.bench.id, planned_exercise_id: s.peBench.id, load: 110, reps: 8, rir: 2 })],
    };
    const r = run("session", data, { workoutId: live.id });
    expect(r.json.session_detail!.status).toBe("in_progress");
    expect(r.json.session_detail!.exercises[0].planned).toMatchObject({ load: 110 });
    expect(r.json.session_detail!.exercises[0].summary!.work_sets).toBe(1);
  });

  it("an unknown workout id says so", () => {
    const r = run("session", s.data, { workoutId: "nope" });
    expect(r.title).toBe("Session report: no workout found");
    expect(r.json.session_detail).toBeNull();
    expect(r.json.missing).toContain("The requested workout was not found.");
  });
});

describe("missing and odd data", () => {
  it("builds every kind from an empty account without inventing anything", () => {
    for (const kind of ["session", "week", "month"] as const) {
      const r = run(kind, emptyData());
      expect(r.json.format).toBe("forge-coach-report");
      expect(r.json.exercises).toEqual([]);
      expect(r.json.sessions).toEqual([]);
      expect(r.json.consistency).toMatchObject({ completed: 0, planned: null, adherence: null });
      expect(r.json.weekly_volume.weeks).toHaveLength(kind === "month" ? 4 : 1);
      expect(r.json.missing).toEqual(
        expect.arrayContaining([
          "No profile is saved, so dates use UTC and bodyweight is unknown.",
          "There is no active program.",
          "No active goals are set.",
          "No equipment profile is set.",
          "No recovery logs in this period.",
        ]),
      );
      expect(r.markdown).toContain("## Missing data");
    }
    expect(run("session", emptyData()).json.missing).toContain("No workouts are logged yet.");
    expect(run("week", emptyData()).json.missing).toContain("No completed workouts in this period.");
    expect(run("week", emptyData()).markdown).toContain("No completed workouts in this period.");
  });

  it("without any bodyweight, bodyweight exercises show reps only and the report says why", () => {
    const s = scenario();
    const earlier = set({ workout_id: s.w1.id, exercise_id: s.pushup.id, set_index: 9, reps: 12 });
    const data = { ...s.data, body_measurements: [], workout_sets: [...s.data.workout_sets, earlier] };
    const r = run("week", data);
    const pushup = r.json.exercises.find((e) => e.name === "Push-up")!;
    expect(pushup.sessions.map((p) => [p.top_e1rm, p.volume_load, p.max_reps])).toEqual([
      [null, null, 12],
      [null, null, 15],
    ]);
    expect(r.json.missing).toContain("No bodyweight is recorded, so Push-up show reps only (no e1RM or volume load).");
    expect(r.json.missing).toContain("No bodyweight measurements in the last 28 days, so there is no bodyweight trend.");
    expect(r.markdown).toContain("- Most reps in a set Oct 12 to Oct 14: 12 to 15 (+3). No e1RM for this exercise.");
    expect(r.markdown).toContain("- Bodyweight: unknown");
  });

  it("uses the profile bodyweight when there are no measurements", () => {
    const s = scenario();
    const data = { ...s.data, body_measurements: [], profile: { ...s.data.profile!, bodyweight: 170 } };
    const r = run("week", data);
    expect(r.json.athlete.bodyweight).toEqual({ value: 170, source: "profile", date: null });
    expect(r.json.exercises.find((e) => e.name === "Push-up")!.sessions[0].top_e1rm).toBe(238); // 170 * 1.4
    expect(r.markdown).toContain("No readings in the last 28 days. Profile bodyweight: 170 lb.");
  });

  it("ignores soft-deleted rows", () => {
    const s = scenario();
    const data = { ...s.data, workouts: s.data.workouts.map((w) => (w.id === s.w1.id ? { ...w, deleted_at: "2026-10-13T00:00:00Z" } : w)) };
    const r = run("week", data);
    expect(r.json.sessions).toHaveLength(1);
    expect(r.json.exercises[0].sessions).toHaveLength(1);
  });

  it("dates follow the profile timezone", () => {
    const s = scenario();
    const utc = run("session", { ...s.data, profile: { ...s.data.profile!, timezone: "UTC" } });
    expect(utc.title).toBe("Session report: Push A, Oct 15, 2026");
  });

  it("caps long workout notes", () => {
    const s = scenario();
    const data = { ...s.data, workouts: s.data.workouts.map((w) => (w.id === s.w2.id ? { ...w, notes: "x".repeat(900) } : w)) };
    expect(run("session", data).json.session_detail!.notes).toHaveLength(500);
  });

  it("skips sets of exercises that are not in the library instead of failing", () => {
    const s = scenario();
    const ghost = exercise({ name: "Ghost" });
    const data = { ...s.data, workout_sets: [...s.data.workout_sets, set({ workout_id: s.w2.id, exercise_id: ghost.id })] };
    const r = run("week", data);
    expect(r.json.exercises.map((e) => e.name)).toEqual(["Bench Press", "Push-up"]);
    expect(run("session", data).json.session_detail!.exercises.map((e) => e.name)).toEqual(["Bench Press", "Push-up"]);
  });
});

describe("report contract", () => {
  it("is versioned, serialisable and deterministic", () => {
    const data = scenario().data;
    for (const kind of ["session", "week", "month"] as const) {
      const a = run(kind, data);
      const b = run(kind, data);
      expect(a).toEqual(b);
      expect(a.json.version).toBe(REPORT_FORMAT_VERSION);
      expect(a.json.kind).toBe(kind);
      expect(a.json.generated_at).toBe(NOW);
      expect(a.json.title).toBe(a.title);
      expect(JSON.parse(JSON.stringify(a.json))).toEqual(a.json);
    }
  });

  it("does not modify its input", () => {
    const data = scenario().data;
    const before = structuredClone(data);
    for (const kind of ["session", "week", "month"] as const) run(kind, data);
    expect(data).toEqual(before);
  });

  it("copy has no em or en dashes", () => {
    for (const kind of ["session", "week", "month"] as const) {
      const r = run(kind);
      expect(r.markdown).not.toMatch(/[–—]/);
      expect(r.title).not.toMatch(/[–—]/);
    }
  });
});
