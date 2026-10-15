import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as mcpRoute from "@/app/api/mcp/route";
import {
  PUBLISHABLE_KEY,
  type Json,
  USER_ID,
  createSigner,
  fakeRest,
  restCalls,
  rpc,
  setEnv,
  stubNetwork,
  type RecordedCall,
  type Signer,
  type Tables,
} from "./testkit";

const { connection } = vi.hoisted(() => ({ connection: vi.fn(async () => {}) }));
vi.mock("next/server", () => ({ connection }));

// Thursday 15 October 2026, mid-afternoon in Denver. The week starts on Monday the 12th.
const NOW = new Date("2026-10-15T21:00:00Z");

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const BENCH = id(1);
const ROW = id(2);
const PROGRAM = id(10);
const PUSH_DAY = id(11);
const PULL_DAY = id(12);
const PLANNED_BENCH = id(21);
const PLANNED_ROW = id(22);
const W1 = id(31);
const W2 = id(32);
const W3 = id(33);
const PROPOSAL = id(50);

const stamp = { user_id: USER_ID, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", deleted_at: null };

const exercise = (idValue: string, name: string, primary: string, secondary: string[], extra: Record<string, unknown> = {}) => ({
  id: idValue,
  user_id: null,
  slug: name.toLowerCase().replace(/ /g, "-"),
  name,
  primary_muscle: primary,
  secondary_muscles: secondary,
  movement_pattern: "horizontal_push",
  equipment: ["barbell", "bench"],
  load_type: "external",
  progression_group: null,
  ladder_level: null,
  default_rep_min: 6,
  default_rep_max: 10,
  default_increment: 5,
  notes: null,
  created_at: stamp.created_at,
  updated_at: stamp.updated_at,
  deleted_at: null,
  ...extra,
});

const workout = (idValue: string, dayId: string, startedAt: string, extra: Record<string, unknown> = {}) => ({
  id: idValue,
  ...stamp,
  program_day_id: dayId,
  equipment_profile_id: null,
  started_at: startedAt,
  completed_at: startedAt.replace(/:00Z$/, ":50:00Z").replace("T17", "T18"),
  status: "completed",
  session_rpe: 8,
  notes: null,
  ...extra,
});

let setCounter = 100;
const set = (workoutId: string, exerciseId: string, index: number, reps: number, load: number, rir: number | null, extra: Record<string, unknown> = {}) => ({
  id: id(setCounter++),
  ...stamp,
  workout_id: workoutId,
  planned_exercise_id: exerciseId === BENCH ? PLANNED_BENCH : PLANNED_ROW,
  exercise_id: exerciseId,
  set_index: index,
  reps,
  load,
  rir,
  is_warmup: false,
  pain: false,
  completed_at: `2026-10-06T17:${String(index).padStart(2, "0")}:00Z`,
  notes: null,
  ...extra,
});

function tables(): Tables {
  return {
    profiles: [{ user_id: USER_ID, display_name: "Test Athlete", unit: "lb", bodyweight: 180, timezone: "America/Denver", onboarded_at: "2026-09-01T00:00:00Z", created_at: stamp.created_at, updated_at: stamp.updated_at }],
    goals: [{ id: id(3), ...stamp, kind: "hypertrophy", description: "Bigger chest", focus_muscles: ["chest"], target_date: null, active: true }],
    equipment_profiles: [{ id: id(4), ...stamp, name: "Home", equipment: ["dumbbells", "bench"], dumbbell_increment: 5, dumbbell_max: 50, barbell_increment: null, is_default: true }],
    body_measurements: [
      { id: id(5), ...stamp, measured_on: "2026-10-01", bodyweight: 181, waist: null, chest: null, arm: null, thigh: null, body_fat_pct: null, notes: null },
      { id: id(6), ...stamp, measured_on: "2026-10-14", bodyweight: 182, waist: null, chest: null, arm: null, thigh: null, body_fat_pct: null, notes: null },
    ],
    exercises: [
      exercise(BENCH, "Barbell Bench Press", "chest", ["front_delts", "triceps"]),
      exercise(ROW, "Chest Supported Row", "upper_back", ["lats", "biceps"], { movement_pattern: "horizontal_pull", equipment: ["dumbbells", "bench"] }),
      exercise(id(7), "Push-up", "chest", ["triceps"], { equipment: ["bodyweight"], load_type: "bodyweight", progression_group: "push_up", ladder_level: 3 }),
    ],
    programs: [{ id: PROGRAM, ...stamp, name: "Push Pull Legs", split: "ppl", days_per_week: 3, is_active: true, version: 4, notes: null }],
    program_days: [
      { id: PUSH_DAY, ...stamp, program_id: PROGRAM, position: 0, name: "Push A", focus: "push", equipment_profile_id: null },
      { id: PULL_DAY, ...stamp, program_id: PROGRAM, position: 1, name: "Pull A", focus: "pull", equipment_profile_id: null },
    ],
    planned_exercises: [
      { id: PLANNED_BENCH, ...stamp, program_day_id: PUSH_DAY, position: 0, exercise_id: BENCH, sets: 3, rep_min: 6, rep_max: 10, target_rir: 2, load: 135, rest_seconds: 150, notes: null, is_active: true },
      { id: PLANNED_ROW, ...stamp, program_day_id: PULL_DAY, position: 0, exercise_id: ROW, sets: 3, rep_min: 8, rep_max: 12, target_rir: 2, load: 70, rest_seconds: 120, notes: null, is_active: true },
      { id: id(23), ...stamp, program_day_id: PUSH_DAY, position: 1, exercise_id: BENCH, sets: 3, rep_min: 6, rep_max: 10, target_rir: 2, load: 100, rest_seconds: null, notes: null, is_active: false },
    ],
    workouts: [
      workout(W1, PUSH_DAY, "2026-10-06T17:00:00Z"),
      workout(W2, PUSH_DAY, "2026-10-13T17:00:00Z", { notes: "Left shoulder felt tight" }),
      workout(W3, PULL_DAY, "2026-10-14T17:00:00Z"),
      workout(id(34), PUSH_DAY, "2026-10-15T17:00:00Z", { status: "in_progress", completed_at: null }),
    ],
    workout_sets: [
      set(W1, BENCH, 1, 8, 135, 2),
      set(W1, BENCH, 2, 8, 135, 2),
      set(W1, BENCH, 3, 8, 135, 1),
      set(W2, BENCH, 0, 5, 95, null, { is_warmup: true }),
      set(W2, BENCH, 1, 9, 135, 1),
      set(W2, BENCH, 2, 9, 135, 1),
      set(W2, BENCH, 3, 9, 135, 1, { pain: true }),
      set(W3, ROW, 1, 12, 70, 3),
    ],
    recovery_logs: [
      { id: id(60), ...stamp, date: "2026-10-14", sleep_hours: 5.5, sleep_quality: 2, soreness: 4, energy: 2, stress: 3, notes: null },
      { id: id(61), ...stamp, date: "2026-10-13", sleep_hours: 8, sleep_quality: 4, soreness: 2, energy: 4, stress: 2, notes: null },
    ],
    progression_decisions: [
      {
        id: id(70),
        ...stamp,
        planned_exercise_id: PLANNED_BENCH,
        workout_id: W2,
        decided_at: "2026-10-13T18:51:00Z",
        engine_version: "1.0.0",
        action: "pain_hold",
        before: { exercise_id: BENCH, sets: 3, rep_min: 6, rep_max: 10, target_rir: 2, load: 135 },
        after: { exercise_id: BENCH, sets: 3, rep_min: 6, rep_max: 10, target_rir: 2, load: 135 },
        reason: "Pain was logged on a set, so the load stays where it is.",
        inputs: { pain: true },
      },
    ],
    coach_proposals: [
      {
        id: PROPOSAL,
        created_at: "2026-10-14T12:00:00Z",
        source: "claude",
        program_id: PROGRAM,
        base_program_version: 4,
        title: "Add a lateral raise",
        rationale: "Side delts are under the reference range.",
        changes: [],
        status: "pending",
        decided_at: null,
        applied_at: null,
        undone_at: null,
        decision_note: null,
      },
    ],
  };
}

let signer: Signer;
let token: string;
let calls: RecordedCall[];
let data: Tables;
let writes: RecordedCall[];
let writeResponse: (call: RecordedCall) => Response | undefined;

beforeAll(async () => {
  signer = await createSigner();
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  setEnv();
  data = tables();
  writes = [];
  writeResponse = () => undefined;
  calls = stubNetwork(
    signer.jwks,
    fakeRest(data, (call) => {
      writes.push(call);
      return writeResponse(call);
    }),
  );
  token = await signer.sign();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function call(name: string, args: Record<string, unknown> = {}) {
  const { message } = await rpc(mcpRoute.POST, token, "tools/call", { name, arguments: args });
  const result = message?.result;
  return {
    isError: result?.isError === true,
    text: (result?.content?.[0]?.text ?? message?.error?.message ?? "") as string,
    data: result?.structuredContent as Json,
  };
}

describe("every tool runs as the signed-in user", () => {
  it("sends the caller's token and the publishable key to the database, never anything else", async () => {
    await call("get_athlete_profile");
    const rest = restCalls(calls);
    expect(rest.length).toBeGreaterThan(0);
    for (const request of rest) {
      expect(request.headers.get("authorization")).toBe(`Bearer ${token}`);
      expect(request.headers.get("apikey")).toBe(PUBLISHABLE_KEY);
    }
  });

  it("returns the data as text for older clients and as structuredContent", async () => {
    const result = await call("get_athlete_profile");
    expect(result.isError).toBe(false);
    expect(result.text).toContain(JSON.stringify(result.data));
  });

  it("reports a database failure as a tool error without leaking details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    delete (data as Partial<Tables>).goals;
    const result = await call("get_athlete_profile");
    expect(result.isError).toBe(true);
    expect(result.text).toBe("Could not read goals from FORGE.");
  });
});

describe("read tools", () => {
  it("get_athlete_profile", async () => {
    const { data: out } = await call("get_athlete_profile");
    expect(out.profile).toEqual({ display_name: "Test Athlete", unit: "lb", bodyweight: 182, timezone: "America/Denver", onboarded_at: "2026-09-01T00:00:00Z" });
    expect(out.goals).toHaveLength(1);
    expect(out.equipment_profiles[0]).toMatchObject({ name: "Home", dumbbell_increment: 5 });
    expect(out.body_measurements.map((m: Json) => m.date)).toEqual(["2026-10-14", "2026-10-01"]);
    expect(out.bodyweight_trend.change).toBe(1);
  });

  it("get_training_plan lists active exercises with the ids a proposal needs", async () => {
    const { data: out } = await call("get_training_plan");
    expect(out.unit).toBe("lb");
    expect(out.program).toMatchObject({ id: PROGRAM, version: 4, split: "ppl" });
    expect(out.days.map((d: Json) => d.name)).toEqual(["Push A", "Pull A"]);
    const push = out.days[0].exercises;
    expect(push).toHaveLength(1);
    expect(push[0]).toMatchObject({ planned_exercise_id: PLANNED_BENCH, sets: 3, rep_min: 6, rep_max: 10, load: 135 });
    expect(push[0].exercise).toMatchObject({ id: BENCH, name: "Barbell Bench Press" });
  });

  it("get_training_plan handles an athlete with no program", async () => {
    data.programs.length = 0;
    const { data: out, isError } = await call("get_training_plan");
    expect(isError).toBe(false);
    expect(out).toEqual({ program: null, days: [] });
  });

  it("get_recent_workouts summarises completed workouts newest first", async () => {
    const { data: out } = await call("get_recent_workouts", { limit: 5 });
    expect(out.workouts.map((w: Json) => w.id)).toEqual([W3, W2, W1]);
    const w2 = out.workouts[1];
    expect(w2).toMatchObject({ date: "2026-10-13", notes: "Left shoulder felt tight", day: { name: "Push A", focus: "push" } });
    const bench = w2.exercises[0];
    expect(bench.name).toBe("Barbell Bench Press");
    expect(bench.warmup_sets).toBe(1);
    expect(bench.work_sets).toEqual([
      { reps: 9, load: 135, rir: 1 },
      { reps: 9, load: 135, rir: 1 },
      { reps: 9, load: 135, rir: 1, pain: true },
    ]);
    expect(bench.volume_load).toBe(9 * 135 * 3);
  });

  it("get_recent_workouts can list in-progress workouts and says so when there are none", async () => {
    const running = await call("get_recent_workouts", { status: "in_progress" });
    expect(running.data.workouts).toHaveLength(1);
    const none = await call("get_recent_workouts", { status: "abandoned" });
    expect(none.data.workouts).toEqual([]);
  });

  it("get_workout_details includes warmups, notes and the engine's decision", async () => {
    const { data: out } = await call("get_workout_details", { workout_id: W2 });
    expect(out.workout).toMatchObject({ id: W2, status: "completed", day: { name: "Push A" } });
    const bench = out.exercises[0];
    expect(bench.sets).toHaveLength(4);
    expect(bench.sets[0]).toMatchObject({ is_warmup: true, reps: 5, load: 95 });
    expect(bench.prescribed).toMatchObject({ load: 135, rep_max: 10 });
    expect(bench.engine_decision).toMatchObject({ action: "pain_hold", reason: expect.stringContaining("Pain") });
  });

  it("get_workout_details gives an exercise swapped in mid-workout no prescription of its own", async () => {
    data.workout_sets.push(set(W2, ROW, 4, 10, 60, 2, { planned_exercise_id: PLANNED_BENCH }));
    const { data: out } = await call("get_workout_details", { workout_id: W2 });
    const row = out.exercises.find((e: Json) => e.exercise_id === ROW);
    expect(row.planned_exercise_id).toBe(PLANNED_BENCH);
    expect(row.prescribed).toBeNull();
    expect(out.exercises.find((e: Json) => e.exercise_id === BENCH).prescribed).toMatchObject({ load: 135 });
  });

  it("get_workout_details rejects an unknown id", async () => {
    const result = await call("get_workout_details", { workout_id: id(999) });
    expect(result).toMatchObject({ isError: true, text: "No workout with that id." });
  });

  it("get_exercise_performance builds the series and the deltas", async () => {
    const { data: out } = await call("get_exercise_performance", { exercise_id: BENCH, weeks: 8 });
    expect(out.sessions.map((s: Json) => s.workout_id)).toEqual([W1, W2]);
    expect(out.sessions[1]).toMatchObject({ work_sets: 3, total_reps: 27, volume_load: 3645, reps_at_top_load: 9 });
    expect(out.latest_vs_previous).toMatchObject({ volume_load: 405, total_reps: 3 });
    expect(out.window).toEqual({ from: "2026-08-20", to: "2026-10-15" });
  });

  it("get_exercise_performance resolves a name, and offers candidates when it is ambiguous", async () => {
    const exact = await call("get_exercise_performance", { name: "bench press" });
    expect(exact.data.exercise.id).toBe(BENCH);

    const many = await call("get_exercise_performance", { name: "es" });
    expect(many.data.candidates.map((c: Json) => c.id).sort()).toEqual([BENCH, ROW].sort());
    expect(many.text).toContain("matches several exercises");

    const none = await call("get_exercise_performance", { name: "zercher squat" });
    expect(none).toMatchObject({ isError: true });
    expect(none.text).toContain("search_exercises");
  });

  it("get_exercise_performance requires an id or a name", async () => {
    const result = await call("get_exercise_performance", { weeks: 4 });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Provide exercise_id or name");
  });

  it("compare_sessions compares the last sessions of a focus", async () => {
    const { data: out } = await call("compare_sessions", { focus: "push", last_n: 3 });
    expect(out.sessions.map((s: Json) => s.workout_id)).toEqual([W1, W2]);
    expect(out.exercises[0]).toMatchObject({ name: "Barbell Bench Press" });
    expect(out.exercises[0].latest_vs_previous).toMatchObject({ volume_load: 405 });
  });

  it("compare_sessions needs exactly one way to pick sessions and at least two sessions", async () => {
    const both = await call("compare_sessions", { focus: "push", program_day_id: PUSH_DAY });
    expect(both.isError).toBe(true);
    const lonely = await call("compare_sessions", { focus: "pull" });
    expect(lonely.data.comparison).toBeNull();
    const byIds = await call("compare_sessions", { workout_ids: [W1, W2] });
    expect(byIds.data.sessions).toHaveLength(2);
    const allListed = await call("compare_sessions", { workout_ids: [W1, W2, W3], last_n: 2 });
    expect(allListed.data.sessions).toHaveLength(3);
  });

  it("get_weekly_progress counts hard sets and consistency per week", async () => {
    const { data: out } = await call("get_weekly_progress", { weeks: 2 });
    expect(out.weeks.map((w: Json) => w.week_start)).toEqual(["2026-10-05", "2026-10-12"]);
    const [last, current] = out.weeks;
    expect(last.consistency).toMatchObject({ completed: 1 });
    expect(current.in_progress).toBe(true);
    expect(current.consistency).toMatchObject({ completed: 2, planned: 2 });
    const chest = current.muscles.find((m: Json) => m.muscle === "chest");
    expect(chest).toMatchObject({ direct_sets: 3, sessions: 1 });
    const triceps = current.muscles.find((m: Json) => m.muscle === "triceps");
    expect(triceps).toMatchObject({ indirect_sets: 3, sets: 1.5 });
    expect(out.volume_reference).toEqual({ min: 10, max: 20 });
  });

  it("get_recovery_history summarises the window", async () => {
    const { data: out } = await call("get_recovery_history", { days: 7 });
    expect(out.logs.map((l: Json) => l.date)).toEqual(["2026-10-14", "2026-10-13"]);
    expect(out.summary).toMatchObject({ days_logged: 2, short_sleep_nights: 1, high_soreness_days: 1, avg_sleep_hours: 6.75 });
  });

  it("get_progression_decisions names the exercise and counts actions", async () => {
    const { data: out } = await call("get_progression_decisions", { limit: 10 });
    expect(out.by_action).toEqual({ pain_hold: 1 });
    expect(out.decisions[0]).toMatchObject({ exercise: "Barbell Bench Press", planned_exercise_id: PLANNED_BENCH, action: "pain_hold" });
    const other = await call("get_progression_decisions", { planned_exercise_id: PLANNED_ROW });
    expect(other.data.decisions).toEqual([]);
  });

  it("search_exercises filters by words, muscle and available equipment", async () => {
    const byWord = await call("search_exercises", { query: "bench" });
    expect(byWord.data.exercises.map((e: Json) => e.name)).toEqual(["Barbell Bench Press"]);

    const byMuscle = await call("search_exercises", { muscle: "chest" });
    expect(byMuscle.data.exercises.map((e: Json) => e.name).sort()).toEqual(["Barbell Bench Press", "Push-up"]);

    const noBarbell = await call("search_exercises", { available_equipment: ["dumbbells", "bench"] });
    expect(noBarbell.data.exercises.map((e: Json) => e.name).sort()).toEqual(["Chest Supported Row", "Push-up"]);
  });

  it("search_exercises treats LIKE wildcards in the query as plain text", async () => {
    const result = await call("search_exercises", { query: "%" });
    expect(result.data.exercises).toEqual([]);
  });

  it("list_proposals filters by status", async () => {
    const pending = await call("list_proposals", { status: "pending" });
    expect(pending.data.proposals.map((p: Json) => p.id)).toEqual([PROPOSAL]);
    const applied = await call("list_proposals", { status: "applied" });
    expect(applied.data.proposals).toEqual([]);
  });
});

describe("propose_program_change", () => {
  const valid = {
    title: "Swap bench for push-ups",
    rationale: "Shoulder pain was logged on the last bench session.",
    changes: [
      { op: "update_prescription", planned_exercise_id: PLANNED_BENCH, set: { load: 125, target_rir: 3 } },
      { op: "swap_exercise", planned_exercise_id: PLANNED_ROW, exercise_id: BENCH },
    ],
  };

  it.each([
    ["no changes", { ...valid, changes: [] }],
    ["31 changes", { ...valid, changes: Array.from({ length: 31 }, () => valid.changes[0]) }],
    ["an unknown operation", { ...valid, changes: [{ op: "delete_program", program_id: PROGRAM }] }],
    ["a malformed id", { ...valid, changes: [{ op: "remove_exercise", planned_exercise_id: "12345" }] }],
    ["an empty set", { ...valid, changes: [{ op: "update_prescription", planned_exercise_id: PLANNED_BENCH, set: {} }] }],
    ["rep_min above rep_max", { ...valid, changes: [{ op: "update_prescription", planned_exercise_id: PLANNED_BENCH, set: { rep_min: 12, rep_max: 8 } }] }],
    ["an unknown field in set", { ...valid, changes: [{ op: "update_prescription", planned_exercise_id: PLANNED_BENCH, set: { sets: 3, user_id: USER_ID } }] }],
    ["an out of range RIR", { ...valid, changes: [{ op: "update_prescription", planned_exercise_id: PLANNED_BENCH, set: { target_rir: 11 } }] }],
    ["too many sets", { ...valid, changes: [{ op: "update_prescription", planned_exercise_id: PLANNED_BENCH, set: { sets: 21 } }] }],
    ["a negative load", { ...valid, changes: [{ op: "update_prescription", planned_exercise_id: PLANNED_BENCH, set: { load: -5 } }] }],
    ["an add without a prescription", { ...valid, changes: [{ op: "add_exercise", program_day_id: PUSH_DAY, exercise_id: BENCH, position: 2 }] }],
    ["a missing rationale", { title: valid.title, changes: valid.changes }],
    ["a one word rationale", { ...valid, rationale: "because" }],
    ["a non-array changes field", { ...valid, changes: "swap it" }],
  ])("rejects %s before touching the database", async (_name, args) => {
    const before = restCalls(calls).length;
    const result = await call("propose_program_change", args);
    expect(result.isError || result.text.includes("not found")).toBe(true);
    expect(result.text).toMatch(/validation|invalid|expected|required|too (small|big)/i);
    expect(restCalls(calls)).toHaveLength(before);
    expect(writes).toHaveLength(0);
  });

  it("saves a pending proposal against the active program version and nothing else", async () => {
    const inserted = { id: id(51), title: valid.title, status: "pending", created_at: NOW.toISOString(), program_id: PROGRAM, base_program_version: 4 };
    writeResponse = (request) =>
      request.url.pathname === "/rest/v1/coach_proposals" ? Response.json(inserted, { status: 201 }) : undefined;

    const result = await call("propose_program_change", valid);

    expect(result.isError).toBe(false);
    expect(result.data).toMatchObject({ applied: false, proposal: { id: id(51), status: "pending" } });
    expect(result.text).toContain("must approve it in the FORGE app");
    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe("POST");
    expect(JSON.parse(writes[0].body)).toEqual({
      program_id: PROGRAM,
      base_program_version: 4,
      title: valid.title,
      rationale: valid.rationale,
      changes: valid.changes,
      status: "pending",
    });
  });

  it("does not let the caller choose who owns the proposal or where it came from", async () => {
    writeResponse = () => Response.json({ id: id(51), status: "pending" }, { status: 201 });
    await call("propose_program_change", valid);
    const body = JSON.parse(writes[0].body);
    for (const field of ["user_id", "source", "client_id", "decided_at", "applied_at", "inverse_changes"]) {
      expect(body, field).not.toHaveProperty(field);
    }
  });

  it("relays the database's validation message when it refuses the changes", async () => {
    writeResponse = () =>
      Response.json({ code: "P0001", message: "changes[0]: planned_exercise_id does not belong to this program" }, { status: 400 });
    const result = await call("propose_program_change", valid);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("does not belong to this program");
  });

  it("explains a row level security refusal without exposing policy details", async () => {
    writeResponse = () =>
      Response.json({ code: "42501", message: 'new row violates row-level security policy for table "coach_proposals"' }, { status: 403 });
    const result = await call("propose_program_change", valid);
    expect(result.isError).toBe(true);
    expect(result.text).toBe("FORGE refused this request: the connector is not allowed to do that.");
  });

  it("stops when the athlete has no active program", async () => {
    data.programs.length = 0;
    const result = await call("propose_program_change", valid);
    expect(result).toMatchObject({ isError: true });
    expect(result.text).toContain("no active program");
    expect(writes).toHaveLength(0);
  });
});

describe("apply_approved_change", () => {
  const rpcCalls = () => writes.filter((w) => w.url.pathname === "/rest/v1/rpc/apply_proposal");
  const stateIs = (status: string) => {
    data.coach_proposals[0].status = status;
  };

  it("refuses a pending proposal and sends the athlete to the app", async () => {
    const result = await call("apply_approved_change", { proposal_id: PROPOSAL });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("still waiting for the athlete");
    expect(result.text).toContain("FORGE app");
    expect(rpcCalls()).toHaveLength(0);
  });

  it.each(["rejected", "undone"])("refuses a %s proposal", async (status) => {
    stateIs(status);
    const result = await call("apply_approved_change", { proposal_id: PROPOSAL });
    expect(result.isError).toBe(true);
    expect(result.text).toContain(`is ${status}`);
    expect(rpcCalls()).toHaveLength(0);
  });

  it("treats an already applied proposal as done without calling the database", async () => {
    stateIs("applied");
    const result = await call("apply_approved_change", { proposal_id: PROPOSAL });
    expect(result).toMatchObject({ isError: false, data: { applied: true } });
    expect(rpcCalls()).toHaveLength(0);
  });

  it("applies an approved proposal through apply_proposal", async () => {
    stateIs("approved");
    writeResponse = (request) => {
      if (request.url.pathname !== "/rest/v1/rpc/apply_proposal") return undefined;
      stateIs("applied");
      return Response.json({ id: PROPOSAL, status: "applied" });
    };
    const result = await call("apply_approved_change", { proposal_id: PROPOSAL });
    expect(result).toMatchObject({ isError: false, data: { applied: true, proposal: { status: "applied" } } });
    expect(rpcCalls()).toHaveLength(1);
    expect(JSON.parse(rpcCalls()[0].body)).toEqual({ p_id: PROPOSAL });
  });

  it("reports a database refusal", async () => {
    stateIs("approved");
    writeResponse = () => Response.json({ code: "P0001", message: "program changed since this proposal was made" }, { status: 400 });
    const result = await call("apply_approved_change", { proposal_id: PROPOSAL });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("program changed since this proposal was made");
  });

  it("rejects an unknown proposal id", async () => {
    const result = await call("apply_approved_change", { proposal_id: id(404) });
    expect(result).toMatchObject({ isError: true, text: "No proposal with that id." });
  });
});
