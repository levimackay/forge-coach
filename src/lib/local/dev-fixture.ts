// Development preview data. This file is only reachable from the /dev route, which
// renders notFound() outside development. Nothing here is real training data: it is
// a made-up lifter so authenticated screens can be viewed without an account.
import type {
  AuditEntry,
  BodyMeasurement,
  CoachProposal,
  DayFocus,
  EquipmentCode,
  EquipmentProfile,
  Exercise,
  LoadType,
  MovementPattern,
  Muscle,
  PlannedExercise,
  ProgramDay,
  Program,
  RecoveryLog,
  Workout,
  WorkoutSet,
} from "@/lib/domain/types";
import { completeWorkout } from "./complete-workout";
import { clearLocalData } from "./data";
import { localDate } from "./dates";
import { getDb, setMeta } from "./db";
import { deterministicUuid } from "./ids";
import { DEV_FIXTURE_USER_ID, setActiveUserId, setDevFixtureActive } from "./session";

const HISTORY_DAYS = 35;
const SESSION_HOUR = 17.5;

const id = (kind: string, key: string | number) => deterministicUuid(`fixture:${kind}:${key}`);

// mulberry32: a small seeded generator so every load produces the same numbers.
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type ExerciseDef = [
  slug: string,
  name: string,
  primary: Muscle,
  secondary: Muscle[],
  pattern: MovementPattern,
  equipment: EquipmentCode[],
  load: LoadType,
  group: string | null,
  level: number | null,
  repMin: number,
  repMax: number,
  incrementLb: number | null,
];

// Same slugs, rep ranges and ladders as the seeded library, trimmed to what the fixture program uses.
const EXERCISES: ExerciseDef[] = [
  ["barbell-bench-press", "Barbell bench press", "chest", ["triceps", "front_delts"], "horizontal_push", ["barbell", "rack", "bench"], "external", null, null, 6, 10, 5],
  ["incline-dumbbell-press", "Incline dumbbell press", "chest", ["front_delts", "triceps"], "horizontal_push", ["dumbbells", "bench"], "external", null, null, 8, 12, 5],
  ["overhead-press", "Overhead press", "front_delts", ["triceps", "side_delts"], "vertical_push", ["barbell", "rack"], "external", null, null, 6, 10, 5],
  ["dumbbell-lateral-raise", "Dumbbell lateral raise", "side_delts", [], "shoulder_isolation", ["dumbbells"], "external", null, null, 12, 20, 5],
  ["cable-triceps-pushdown", "Cable triceps pushdown", "triceps", [], "elbow_extension", ["cable"], "external", null, null, 10, 15, 5],
  ["overhead-cable-triceps-extension", "Overhead cable triceps extension", "triceps", [], "elbow_extension", ["cable"], "external", null, null, 10, 15, 5],
  ["negative-pull-up", "Negative pull-up", "lats", ["biceps", "upper_back"], "vertical_pull", ["pullup_bar"], "bodyweight", "pull-up", 1, 3, 6, null],
  ["band-assisted-pull-up", "Band-assisted pull-up", "lats", ["biceps", "upper_back"], "vertical_pull", ["pullup_bar", "bands"], "assisted", "pull-up", 2, 6, 12, null],
  ["chin-up", "Chin-up", "lats", ["biceps", "upper_back"], "vertical_pull", ["pullup_bar"], "bodyweight", "pull-up", 3, 5, 12, null],
  ["pull-up", "Pull-up", "lats", ["biceps", "upper_back"], "vertical_pull", ["pullup_bar"], "bodyweight", "pull-up", 4, 5, 12, null],
  ["weighted-pull-up", "Weighted pull-up", "lats", ["biceps", "upper_back"], "vertical_pull", ["pullup_bar"], "external", "pull-up", 5, 5, 10, 5],
  ["barbell-row", "Barbell row", "upper_back", ["lats", "biceps", "rear_delts"], "horizontal_pull", ["barbell"], "external", null, null, 6, 10, 5],
  ["seated-cable-row", "Seated cable row", "upper_back", ["lats", "biceps", "rear_delts"], "horizontal_pull", ["cable"], "external", null, null, 8, 12, 10],
  ["face-pull", "Face pull", "rear_delts", ["upper_back"], "shoulder_isolation", ["cable"], "external", null, null, 12, 20, 5],
  ["dumbbell-curl", "Dumbbell curl", "biceps", ["forearms"], "elbow_flexion", ["dumbbells"], "external", null, null, 10, 15, 5],
  ["hammer-curl", "Hammer curl", "biceps", ["forearms"], "elbow_flexion", ["dumbbells"], "external", null, null, 10, 15, 5],
  ["barbell-back-squat", "Barbell back squat", "quads", ["glutes"], "squat", ["barbell", "rack"], "external", null, null, 6, 10, 10],
  ["romanian-deadlift", "Romanian deadlift", "hamstrings", ["glutes", "upper_back"], "hinge", ["barbell"], "external", null, null, 6, 10, 10],
  ["leg-press", "Leg press", "quads", ["glutes"], "squat", ["machines"], "external", null, null, 8, 12, 10],
  ["lying-leg-curl", "Lying leg curl", "hamstrings", [], "hinge", ["machines"], "external", null, null, 10, 15, 10],
  ["standing-calf-raise", "Standing calf raise", "calves", [], "calf", ["machines"], "external", null, null, 10, 20, 10],
  ["hanging-knee-raise", "Hanging knee raise", "abs", [], "core", ["pullup_bar"], "bodyweight", "hanging-core", 1, 8, 15, null],
  ["hanging-leg-raise", "Hanging leg raise", "abs", [], "core", ["pullup_bar"], "bodyweight", "hanging-core", 2, 6, 12, null],
];

// slug, sets, rep min, rep max, load in lb (null for bodyweight), rest seconds
type Slot = [slug: string, sets: number, repMin: number, repMax: number, load: number | null, rest: number];

const DAYS: { name: string; focus: DayFocus; weekday: number; slots: Slot[] }[] = [
  {
    name: "Push",
    focus: "push",
    weekday: 1,
    slots: [
      ["barbell-bench-press", 3, 6, 10, 135, 150],
      ["incline-dumbbell-press", 3, 8, 12, 50, 120],
      ["overhead-press", 3, 6, 10, 85, 120],
      ["dumbbell-lateral-raise", 3, 12, 20, 15, 60],
      ["cable-triceps-pushdown", 3, 10, 15, 50, 75],
      ["overhead-cable-triceps-extension", 2, 10, 15, 40, 75],
    ],
  },
  {
    name: "Pull",
    focus: "pull",
    weekday: 3,
    slots: [
      ["chin-up", 3, 5, 12, null, 150],
      ["barbell-row", 3, 6, 10, 115, 150],
      ["seated-cable-row", 3, 8, 12, 100, 90],
      ["face-pull", 3, 12, 20, 40, 60],
      ["dumbbell-curl", 3, 10, 15, 25, 75],
      ["hammer-curl", 2, 10, 15, 25, 75],
    ],
  },
  {
    name: "Legs",
    focus: "legs",
    weekday: 5,
    slots: [
      ["barbell-back-squat", 3, 6, 10, 155, 180],
      ["romanian-deadlift", 3, 6, 10, 135, 150],
      ["leg-press", 3, 8, 12, 270, 120],
      ["lying-leg-curl", 3, 10, 15, 80, 90],
      ["standing-calf-raise", 4, 10, 20, 110, 60],
      ["hanging-leg-raise", 3, 6, 12, null, 75],
    ],
  },
];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function atHour(date: Date, hour: number): Date {
  const d = new Date(date);
  d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  return d;
}

export async function seedDevFixture(now: Date = new Date()): Promise<{ workouts: number }> {
  if (process.env.NODE_ENV !== "development") throw new Error("The fixture only loads in development.");
  const db = getDb();
  const random = rng(20261015);
  const userId = DEV_FIXTURE_USER_ID;
  const iso = (d: Date) => d.toISOString();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAgo = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
  const stamp = (d: Date) => ({ created_at: iso(d), updated_at: iso(d), deleted_at: null, user_id: userId });

  await clearLocalData();
  await setMeta("owner", userId);
  setActiveUserId(userId);
  setDevFixtureActive(true);

  const start = daysAgo(HISTORY_DAYS + 2);
  await db.profiles.put({
    user_id: userId,
    display_name: "Fixture user",
    unit: "lb",
    bodyweight: 182,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    onboarded_at: iso(start),
    created_at: iso(start),
    updated_at: iso(start),
  });

  const gym: EquipmentProfile = {
    id: id("equipment", "gym"),
    ...stamp(start),
    name: "Full gym",
    equipment: ["bodyweight", "pullup_bar", "dip_bars", "dumbbells", "bands", "barbell", "rack", "bench", "cable", "machines"],
    dumbbell_increment: 5,
    dumbbell_max: 100,
    barbell_increment: 5,
    is_default: true,
  };
  const home: EquipmentProfile = {
    id: id("equipment", "home"),
    ...stamp(start),
    name: "Home",
    equipment: ["bodyweight", "pullup_bar", "dumbbells", "bands", "bench"],
    dumbbell_increment: 5,
    dumbbell_max: 50,
    barbell_increment: null,
    is_default: false,
  };
  await db.equipment_profiles.bulkPut([gym, home]);

  await db.goals.put({
    id: id("goal", 1),
    ...stamp(start),
    kind: "hypertrophy",
    description: "Add size to the upper body while keeping squat and deadlift moving up.",
    focus_muscles: ["chest", "lats", "side_delts"],
    target_date: null,
    active: true,
  });

  const exercises: Exercise[] = EXERCISES.map(
    ([slug, name, primary, secondary, pattern, equipment, load, group, level, repMin, repMax, inc]) => ({
      id: id("exercise", slug),
      user_id: null,
      slug,
      name,
      primary_muscle: primary,
      secondary_muscles: secondary,
      movement_pattern: pattern,
      equipment,
      load_type: load,
      progression_group: group,
      ladder_level: level,
      default_rep_min: repMin,
      default_rep_max: repMax,
      default_increment: inc,
      notes: null,
      created_at: iso(start),
      updated_at: iso(start),
      deleted_at: null,
    }),
  );
  await db.exercises.bulkPut(exercises);
  const exerciseId = (slug: string) => id("exercise", slug);

  const program: Program = {
    id: id("program", 1),
    ...stamp(start),
    name: "Push Pull Legs",
    split: "ppl",
    days_per_week: 3,
    is_active: true,
    version: 2,
    notes: null,
  };
  await db.programs.put(program);

  const days: ProgramDay[] = DAYS.map((d, i) => ({
    id: id("day", d.focus),
    ...stamp(start),
    program_id: program.id,
    position: i,
    name: d.name,
    focus: d.focus,
    equipment_profile_id: gym.id,
  }));
  await db.program_days.bulkPut(days);

  const planned: PlannedExercise[] = DAYS.flatMap((d) =>
    d.slots.map(([slug, sets, repMin, repMax, load, rest], position) => ({
      id: id("planned", `${d.focus}:${slug}`),
      ...stamp(start),
      program_day_id: id("day", d.focus),
      position,
      exercise_id: exerciseId(slug),
      sets,
      rep_min: repMin,
      rep_max: repMax,
      target_rir: 2,
      load,
      rest_seconds: rest,
      notes: null,
      is_active: true,
    })),
  );
  await db.planned_exercises.bulkPut(planned);

  // Replay five weeks of Monday, Wednesday and Friday sessions, oldest first, finishing
  // each through completeWorkout so the decisions and prescriptions come from the engine.
  const streak = new Map<string, { sig: string; sessions: number }>();
  let workoutCount = 0;
  let painLogged = false;

  for (let back = HISTORY_DAYS; back >= 1; back--) {
    const date = daysAgo(back);
    const spec = DAYS.find((d) => d.weekday === date.getDay());
    // A three day break in the middle gives the consistency numbers something to show.
    if (!spec || (back >= 17 && back <= 19)) continue;

    const dayId = id("day", spec.focus);
    const startedAt = atHour(date, SESSION_HOUR);
    workoutCount += 1;
    const workoutId = id("workout", workoutCount);
    const workout: Workout = {
      id: workoutId,
      ...stamp(startedAt),
      program_day_id: dayId,
      equipment_profile_id: gym.id,
      started_at: iso(startedAt),
      completed_at: null,
      status: "in_progress",
      session_rpe: null,
      notes: null,
    };
    await db.workouts.put(workout);

    const livePlan = await db.planned_exercises.where("program_day_id").equals(dayId).sortBy("position");
    const sets: WorkoutSet[] = [];
    let minute = 2;
    livePlan.forEach((pe, slot) => {
      let setIndex = 0;
      const sig = `${pe.exercise_id}|${pe.load}|${pe.sets}|${pe.rep_min}|${pe.rep_max}`;
      const prev = streak.get(pe.id);
      const sessions = prev && prev.sig === sig ? prev.sessions : 0;
      streak.set(pe.id, { sig, sessions: sessions + 1 });

      const external = pe.load !== null;
      if (slot === 0 && external) {
        const warm = Math.max(45, Math.round(((pe.load as number) * 0.6) / 5) * 5);
        sets.push(makeSet(workoutId, pe, sets.length, setIndex++, warm, 8, null, true, false, startedAt, minute));
        minute += 2;
      }
      const base = clamp(pe.rep_min + Math.round(sessions * 1.5), pe.rep_min, pe.rep_max);
      for (let s = 0; s < pe.sets; s++) {
        const last = s === pe.sets - 1;
        const reps = last && random() < 0.25 ? Math.max(1, base - 1) : base;
        const rir = last ? (random() < 0.3 ? 1 : 2) : random() < 0.2 ? 3 : 2;
        // One sore shoulder session, so the engine has a pain decision to show.
        const pain = !painLogged && spec.focus === "push" && back <= HISTORY_DAYS - 12 && slot === 2 && s === 2;
        if (pain) painLogged = true;
        sets.push(makeSet(workoutId, pe, sets.length, setIndex++, pe.load, reps, rir, false, pain, startedAt, minute));
        minute += 3;
      }
    });
    await db.workout_sets.bulkPut(sets);

    const finished = new Date(startedAt.getTime() + (minute + 4) * 60_000);
    await completeWorkout(workoutId, { now: finished, session_rpe: random() < 0.3 ? 9 : 8 });
  }

  const recovery: RecoveryLog[] = [];
  for (let back = 28; back >= 0; back--) {
    if (back % 9 === 4) continue;
    const date = daysAgo(back);
    const at = atHour(date, 7.5);
    recovery.push({
      id: id("recovery", back),
      ...stamp(at),
      date: localDate(date),
      sleep_hours: Math.round((6 + random() * 2.5) * 4) / 4,
      sleep_quality: 2 + Math.floor(random() * 4),
      soreness: 1 + Math.floor(random() * 4),
      energy: 2 + Math.floor(random() * 4),
      stress: 1 + Math.floor(random() * 4),
      notes: null,
    });
  }
  await db.recovery_logs.bulkPut(recovery);

  const measurements: BodyMeasurement[] = [];
  for (let w = 0; w < 6; w++) {
    const date = daysAgo((5 - w) * 7);
    measurements.push({
      id: id("measure", w),
      ...stamp(atHour(date, 7)),
      measured_on: localDate(date),
      bodyweight: Math.round((180.4 + w * 0.5 + random() * 0.4) * 10) / 10,
      waist: Math.round((33.6 - w * 0.1) * 10) / 10,
      chest: Math.round((41.5 + w * 0.1) * 10) / 10,
      arm: Math.round((14.9 + w * 0.06) * 100) / 100,
      thigh: Math.round((23.4 + w * 0.08) * 100) / 100,
      body_fat_pct: null,
      notes: null,
    });
  }
  await db.body_measurements.bulkPut(measurements);

  const lateral = id("planned", "push:dumbbell-lateral-raise");
  const facePull = id("planned", "pull:face-pull");
  const calves = id("planned", "legs:standing-calf-raise");
  const rows = id("planned", "pull:seated-cable-row");
  const made = (n: number) => atHour(daysAgo(n), 9);
  const claude = { source: "claude" as const, client_id: "fixture-client" };
  const proposals: CoachProposal[] = [
    {
      id: id("proposal", "pending"),
      ...claude,
      user_id: userId,
      created_at: iso(made(1)),
      updated_at: iso(made(1)),
      program_id: program.id,
      base_program_version: 2,
      title: "Add a set of lateral raises and face pulls",
      rationale:
        "Side delts and rear delts are each trained once a week with three sets. One extra set per session raises weekly volume without adding a new exercise or more time in the gym.",
      changes: [
        { op: "update_prescription", planned_exercise_id: lateral, set: { sets: 4 } },
        { op: "update_prescription", planned_exercise_id: facePull, set: { sets: 4 } },
      ],
      inverse_changes: null,
      status: "pending",
      decided_at: null,
      applied_at: null,
      undone_at: null,
      decision_note: null,
    },
    {
      id: id("proposal", "applied"),
      ...claude,
      user_id: userId,
      created_at: iso(made(14)),
      updated_at: iso(made(13)),
      program_id: program.id,
      base_program_version: 1,
      title: "Four sets of calf raises",
      rationale: "Calves were getting three sets once a week. A fourth set brings them in line with the other lower body work.",
      changes: [{ op: "update_prescription", planned_exercise_id: calves, set: { sets: 4 } }],
      inverse_changes: [{ op: "update_prescription", planned_exercise_id: calves, set: { sets: 3 } }],
      status: "applied",
      decided_at: iso(made(13)),
      applied_at: iso(made(13)),
      undone_at: null,
      decision_note: null,
    },
    {
      id: id("proposal", "rejected"),
      ...claude,
      user_id: userId,
      created_at: iso(made(9)),
      updated_at: iso(made(8)),
      program_id: program.id,
      base_program_version: 2,
      title: "Lower the rep range on cable rows",
      rationale: "Heavier rows at 6 to 8 reps would add load to the back, but cable rows are already progressing at 8 to 12.",
      changes: [{ op: "update_prescription", planned_exercise_id: rows, set: { rep_min: 6, rep_max: 8 } }],
      inverse_changes: null,
      status: "rejected",
      decided_at: iso(made(8)),
      applied_at: null,
      undone_at: null,
      decision_note: "Rows are moving fine at 8 to 12.",
    },
  ];
  await db.coach_proposals.bulkPut(proposals);

  const audit: AuditEntry[] = proposals.flatMap((p, i) => {
    const entry = (n: number, actor: AuditEntry["actor"], action: string, when: string): AuditEntry => ({
      id: id("audit", `${i}:${n}`),
      user_id: userId,
      at: when,
      actor,
      client_id: actor === "claude" ? "fixture-client" : null,
      action,
      entity: "coach_proposal",
      entity_id: p.id,
      details: { title: p.title },
    });
    const out = [entry(0, "claude", "proposal.created", p.created_at)];
    if (p.status === "applied") out.push(entry(1, "user", "proposal.approved", p.decided_at as string), entry(2, "user", "proposal.applied", p.applied_at as string));
    if (p.status === "rejected") out.push(entry(1, "user", "proposal.rejected", p.decided_at as string));
    return out;
  });
  await db.audit_log.bulkPut(audit);

  // Everything above is local-only; nothing should look queued for a server.
  await db.outbox.clear();
  await setMeta("hydrated", true);
  await setMeta("last_synced_at", iso(now));
  return { workouts: workoutCount };
}

function makeSet(
  workoutId: string,
  pe: PlannedExercise,
  key: number,
  setIndex: number,
  load: number | null,
  reps: number,
  rir: number | null,
  warmup: boolean,
  pain: boolean,
  startedAt: Date,
  minute: number,
): WorkoutSet {
  const at = new Date(startedAt.getTime() + minute * 60_000);
  return {
    id: id("set", `${workoutId}:${key}`),
    user_id: DEV_FIXTURE_USER_ID,
    created_at: at.toISOString(),
    updated_at: at.toISOString(),
    deleted_at: null,
    workout_id: workoutId,
    planned_exercise_id: pe.id,
    exercise_id: pe.exercise_id,
    set_index: setIndex,
    reps,
    load,
    rir,
    is_warmup: warmup,
    pain,
    completed_at: at.toISOString(),
    notes: null,
  };
}
