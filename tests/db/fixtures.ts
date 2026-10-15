import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { A, B, firstParty, type Row } from "./harness";

const KIND = {
  goal: 1,
  equipment: 2,
  customExercise: 3,
  program: 4,
  day: 5,
  pe1: 6,
  pe2: 7,
  pe3: 8,
  workout: 9,
  set1: 10,
  set2: 11,
  recovery: 12,
  body: 13,
  decision: 14,
  proposal: 15,
  audit: 16,
} as const;

type Kind = keyof typeof KIND;

/** Deterministic id: eight hex digits of the owner's letter, then the kind number. */
export function idFor(owner: "a" | "b", kind: Kind): string {
  const p = owner.repeat(8);
  return `${p}-0000-4000-8000-${String(KIND[kind]).padStart(12, "0")}`;
}

/** The id the seed migration gives a global exercise: md5 of the slug, shaped as a uuid. */
export function exerciseId(slug: string): string {
  const h = createHash("md5").update(`forge-coach:exercise:${slug}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export interface UserFixture {
  userId: string;
  goal: string;
  equipment: string;
  customExercise: string;
  program: string;
  day: string;
  pe1: string;
  pe2: string;
  pe3: string;
  workout: string;
  set1: string;
  set2: string;
  recovery: string;
  body: string;
  decision: string;
  proposal: string;
  audit: string;
}

export interface Fixtures {
  a: UserFixture;
  b: UserFixture;
  /** Global exercise ids by slug. */
  ex: Record<string, string>;
}

function fixtureFor(owner: "a" | "b", userId: string): UserFixture {
  const f = { userId } as UserFixture;
  for (const k of Object.keys(KIND) as Kind[]) f[k] = idFor(owner, k);
  return f;
}

async function seedUser(db: PGlite, f: UserFixture, ex: Record<string, string>, email: string) {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [f.userId, email]);
  await db.exec("begin");
  try {
    // Triggers read auth.uid(), so prepare rows as the owner but without dropping to the API role.
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(firstParty(f.userId))]);
    const u = f.userId;
    await db.query("insert into public.profiles (user_id, display_name, unit) values ($1, 'Lifter', 'lb')", [u]);
    await db.query("insert into public.goals (id, user_id, kind, description) values ($1, $2, 'hypertrophy', 'Add size')", [
      f.goal,
      u,
    ]);
    await db.query(
      `insert into public.equipment_profiles (id, user_id, name, equipment, dumbbell_increment, is_default)
       values ($1, $2, 'Home', '{bodyweight,dumbbells,pullup_bar}', 5, true)`,
      [f.equipment, u],
    );
    await db.query(
      `insert into public.exercises (id, user_id, slug, name, primary_muscle, movement_pattern, equipment, load_type, default_rep_min, default_rep_max)
       values ($1, $2, 'custom-curl', 'Custom curl', 'biceps', 'elbow_flexion', '{dumbbells}', 'external', 8, 12)`,
      [f.customExercise, u],
    );
    await db.query(
      `insert into public.programs (id, user_id, name, split, days_per_week, is_active)
       values ($1, $2, 'Base program', 'ppl', 3, true)`,
      [f.program, u],
    );
    await db.query(
      `insert into public.program_days (id, user_id, program_id, position, name, focus, equipment_profile_id)
       values ($1, $2, $3, 0, 'Push', 'push', $4)`,
      [f.day, u, f.program, f.equipment],
    );
    const pe = `insert into public.planned_exercises
      (id, user_id, program_day_id, position, exercise_id, sets, rep_min, rep_max, target_rir, load, rest_seconds, notes)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`;
    await db.query(pe, [f.pe1, u, f.day, 0, ex["barbell-bench-press"], 3, 6, 10, 2, "135.00", 120, "Pause the first rep"]);
    await db.query(pe, [f.pe2, u, f.day, 1, ex["push-up"], 3, 8, 20, 2, null, null, null]);
    await db.query(pe, [f.pe3, u, f.day, 2, f.customExercise, 3, 10, 15, 1, "25.50", 75, null]);
    await db.query(
      `insert into public.workouts (id, user_id, program_day_id, equipment_profile_id, started_at, completed_at, status, session_rpe)
       values ($1, $2, $3, $4, '2026-10-01T17:00:00Z', '2026-10-01T18:00:00Z', 'completed', 8)`,
      [f.workout, u, f.day, f.equipment],
    );
    const ws = `insert into public.workout_sets
      (id, user_id, workout_id, planned_exercise_id, exercise_id, set_index, reps, load, rir, completed_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, '2026-10-01T17:10:00Z')`;
    await db.query(ws, [f.set1, u, f.workout, f.pe1, ex["barbell-bench-press"], 0, 8, "135.00", 2]);
    await db.query(ws, [f.set2, u, f.workout, f.pe1, ex["barbell-bench-press"], 1, 7, "135.00", 1]);
    await db.query(
      `insert into public.recovery_logs (id, user_id, date, sleep_hours, sleep_quality, soreness, energy, stress)
       values ($1, $2, '2026-10-01', 7.5, 4, 2, 4, 2)`,
      [f.recovery, u],
    );
    await db.query(
      `insert into public.body_measurements (id, user_id, measured_on, bodyweight, waist)
       values ($1, $2, '2026-10-01', 180.5, 32)`,
      [f.body, u],
    );
    const snap = (load: number | null) =>
      JSON.stringify({ exercise_id: ex["barbell-bench-press"], sets: 3, rep_min: 6, rep_max: 10, target_rir: 2, load });
    await db.query(
      `insert into public.progression_decisions
         (id, user_id, planned_exercise_id, workout_id, engine_version, action, before, after, reason)
       values ($1, $2, $3, $4, 'test-1', 'increase_load', $5::jsonb, $6::jsonb, 'Every set hit the top of the range')`,
      [f.decision, u, f.pe1, f.workout, snap(135), snap(140)],
    );
    await db.query(
      `insert into public.coach_proposals (id, user_id, program_id, base_program_version, title, rationale, changes)
       values ($1, $2, $3, 1, 'More chest volume', 'Chest is behind the plan.', $4::jsonb)`,
      [
        f.proposal,
        u,
        f.program,
        JSON.stringify([{ op: "update_prescription", planned_exercise_id: f.pe1, set: { sets: 4, load: 140 } }]),
      ],
    );
    await db.query(
      `insert into public.audit_log (id, user_id, actor, action, entity, entity_id)
       values ($1, $2, 'system', 'fixture', 'programs', $3)`,
      [f.audit, u, f.program],
    );
    await db.exec("commit");
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}

/** Two users with one row in every table each. Committed, so tests roll back around them. */
export async function seedFixtures(db: PGlite): Promise<Fixtures> {
  const lib = await db.query<Row>("select id, slug from public.exercises where user_id is null");
  const ex = Object.fromEntries(lib.rows.map((r) => [r.slug as string, r.id as string]));
  const a = fixtureFor("a", A);
  const b = fixtureFor("b", B);
  await seedUser(db, a, ex, "a@example.test");
  await seedUser(db, b, ex, "b@example.test");
  return { a, b, ex };
}
