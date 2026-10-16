import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedFixtures, type Fixtures } from "./fixtures";
import { A, B, SYNCED_TABLES, asAdmin, asUser, createDb, firstParty } from "./harness";

let db: PGlite;
let fx: Fixtures;

beforeAll(async () => {
  db = await createDb();
  fx = await seedFixtures(db);
});

afterAll(async () => {
  await db.close();
});

const T1 = "2026-10-10T10:00:00Z";
const T0 = "2026-10-10T09:00:00Z";
const T2 = "2026-10-10T11:00:00Z";

describe("last write wins", () => {
  const GOAL = "aaaaaaaa-0000-4000-8000-0000000000f1";

  const newGoal = (s: Awaited<Parameters<Parameters<typeof asUser>[2]>[0]>) =>
    s.exec(
      "insert into public.goals (id, user_id, kind, description, updated_at) values ($1, $2, 'other', 'first', $3)",
      [GOAL, A, T1],
    );

  it("drops an older update without an error and keeps the stored row", async () => {
    await asUser(db, firstParty(A), async (s) => {
      await newGoal(s);
      expect(await s.exec("update public.goals set description = 'stale', updated_at = $2 where id = $1", [GOAL, T0])).toBe(0);
      const row = await s.one("select description, updated_at from public.goals where id = $1", [GOAL]);
      expect(row.description).toBe("first");
      expect(new Date(row.updated_at).toISOString()).toBe("2026-10-10T10:00:00.000Z");
    });
  });

  it("applies a newer update and an update with the same timestamp but different data", async () => {
    await asUser(db, firstParty(A), async (s) => {
      await newGoal(s);
      expect(await s.exec("update public.goals set description = 'newer', updated_at = $2 where id = $1", [GOAL, T2])).toBe(1);
      expect((await s.one("select description from public.goals where id = $1", [GOAL])).description).toBe("newer");
      expect(await s.exec("update public.goals set description = 'tie', updated_at = $2 where id = $1", [GOAL, T2])).toBe(1);
      expect((await s.one("select description from public.goals where id = $1", [GOAL])).description).toBe("tie");
    });
  });

  it("ignores an identical retry so other devices do not pull it again", async () => {
    await asUser(db, firstParty(A), async (s) => {
      await newGoal(s);
      const before = await s.one("select server_updated_at from public.goals where id = $1", [GOAL]);
      expect(await s.exec("update public.goals set description = 'first', updated_at = $2 where id = $1", [GOAL, T1])).toBe(0);
      const after = await s.one("select server_updated_at from public.goals where id = $1", [GOAL]);
      expect(after.server_updated_at).toEqual(before.server_updated_at);
    });
  });

  it("works through the upsert the client uses", async () => {
    await asUser(db, firstParty(A), async (s) => {
      await newGoal(s);
      const upsert = `insert into public.goals (id, user_id, kind, description, updated_at) values ($1, $2, 'other', $3, $4)
                      on conflict (id) do update set description = excluded.description, updated_at = excluded.updated_at, user_id = excluded.user_id
                      returning description`;
      expect(await s.rows(upsert, [GOAL, A, "stale", T0])).toEqual([]);
      expect(await s.rows(upsert, [GOAL, A, "fresh", T2])).toEqual([{ description: "fresh" }]);
      expect((await s.one("select description from public.goals where id = $1", [GOAL])).description).toBe("fresh");
    });
  });

  it("applies to every synced table", async () => {
    const triggers = await asAdmin(db, (s) =>
      s.rows("select c.relname as t from pg_trigger g join pg_class c on c.oid = g.tgrelid where g.tgname = 'sync_stamp' and not g.tgisinternal order by 1"),
    );
    expect(triggers.map((r) => r.t).sort()).toEqual([...SYNCED_TABLES].sort());

    await asUser(db, firstParty(A), async (s) => {
      for (const table of SYNCED_TABLES) {
        const stale = await s.exec(`update public.${table} set updated_at = updated_at - interval '1 day' where user_id = $1`, [A]);
        expect(stale, `${table} stale update`).toBe(0);
        const fresh = await s.exec(`update public.${table} set updated_at = updated_at + interval '1 minute' where user_id = $1`, [A]);
        expect(fresh, `${table} fresh update`).toBeGreaterThanOrEqual(1);
      }
    });
  });
});

describe("server_updated_at", () => {
  it("is set by the database on insert and cannot be chosen by the client", async () => {
    await asUser(db, firstParty(A), async (s) => {
      const row = await s.one(
        `insert into public.goals (user_id, kind, description, server_updated_at) values ($1, 'other', 'x', '2000-01-01T00:00:00Z')
         returning server_updated_at >= now() as recent, server_updated_at < now() + interval '1 minute' as not_future`,
        [A],
      );
      expect(row).toEqual({ recent: true, not_future: true });
    });
  });

  it("is moved forward by every real update and cannot be rewound or pushed ahead", async () => {
    await asUser(db, firstParty(A), async (s) => {
      const before = await s.one("select server_updated_at from public.goals where id = $1", [fx.a.goal]);
      for (const forged of ["2000-01-01T00:00:00Z", "2099-01-01T00:00:00Z"]) {
        const row = await s.one(
          `update public.goals set description = 'edit ' || $2::text, updated_at = updated_at + interval '1 minute', server_updated_at = $2::timestamptz
           where id = $1 returning server_updated_at > $3 as moved, server_updated_at < now() + interval '1 minute' as not_future`,
          [fx.a.goal, forged, before.server_updated_at],
        );
        expect(row).toEqual({ moved: true, not_future: true });
      }
    });
  });

  it("cannot be changed on a stale update either (the row simply stays as it was)", async () => {
    await asUser(db, firstParty(A), async (s) => {
      const before = await s.one("select server_updated_at from public.goals where id = $1", [fx.a.goal]);
      expect(
        await s.exec("update public.goals set updated_at = '2001-01-01', server_updated_at = '2099-01-01' where id = $1", [fx.a.goal]),
      ).toBe(0);
      const after = await s.one("select server_updated_at from public.goals where id = $1", [fx.a.goal]);
      expect(after.server_updated_at).toEqual(before.server_updated_at);
    });
  });
});

describe("client clocks", () => {
  it("a timestamp far in the future is capped so it cannot freeze later edits", async () => {
    await asUser(db, firstParty(A), async (s) => {
      const row = await s.one(
        `insert into public.goals (user_id, kind, description, updated_at) values ($1, 'other', 'x', '2099-01-01T00:00:00Z')
         returning updated_at <= clock_timestamp() + interval '5 minutes 1 second' as capped, updated_at > clock_timestamp() as ahead`,
        [A],
      );
      expect(row).toEqual({ capped: true, ahead: true });
      const upd = await s.one(
        `update public.goals set updated_at = '2099-01-01T00:00:00Z', description = 'y' where id = $1
         returning updated_at <= clock_timestamp() + interval '5 minutes 1 second' as capped`,
        [fx.a.goal],
      );
      expect(upd.capped).toBe(true);
    });
  });

  it("created_at and user_id do not change on update", async () => {
    await asUser(db, firstParty(A), async (s) => {
      const before = await s.one("select created_at from public.goals where id = $1", [fx.a.goal]);
      await s.exec(
        "update public.goals set created_at = '2001-01-01', updated_at = updated_at + interval '1 minute', description = 'z' where id = $1",
        [fx.a.goal],
      );
      expect((await s.one("select created_at from public.goals where id = $1", [fx.a.goal])).created_at).toEqual(before.created_at);
      const err = await s.denied("update public.goals set user_id = $2, updated_at = updated_at + interval '1 minute' where id = $1", [fx.a.goal, B]);
      expect(err.code).toBe("42501");
    });
  });
});

describe("programs", () => {
  it("version only moves through the proposal functions", async () => {
    await asUser(db, firstParty(A), async (s) => {
      expect(await s.exec("update public.programs set version = 99, name = 'Renamed', updated_at = updated_at + interval '1 minute' where id = $1", [fx.a.program])).toBe(1);
      const row = await s.one("select version, name from public.programs where id = $1", [fx.a.program]);
      expect(row).toEqual({ version: 1, name: "Renamed" });
      const created = await s.one(
        "insert into public.programs (user_id, name, split, days_per_week, version) values ($1, 'Fresh', 'custom', 2, 7) returning version",
        [A],
      );
      expect(created.version).toBe(1);
    });
  });

  it("allows one active program, checked when the transaction ends", async () => {
    await asUser(db, firstParty(A), async (s) => {
      await s.exec("insert into public.programs (user_id, name, split, days_per_week, is_active) values ($1, 'Second', 'custom', 2, true)", [A]);
      const err = await s.denied("set constraints programs_one_active_per_user immediate");
      expect(err.code).toBe("23P01");
    });
  });

  it("lets a sync batch switch the active program with the rows in either order", async () => {
    await asUser(db, firstParty(A), async (s) => {
      const NEW = "aaaaaaaa-0000-4000-8000-0000000000f2";
      await s.rows(
        `insert into public.programs (id, user_id, name, split, days_per_week, is_active, updated_at) values
           ($1, $2, 'Next', 'ppl', 6, true, now()),
           ($3, $2, 'Base program', 'ppl', 3, false, now())
         on conflict (id) do update set is_active = excluded.is_active, updated_at = excluded.updated_at
         returning id`,
        [NEW, A, fx.a.program],
      );
      await s.exec("set constraints programs_one_active_per_user immediate");
      const active = await s.rows("select id from public.programs where user_id = $1 and is_active and deleted_at is null", [A]);
      expect(active).toEqual([{ id: NEW }]);
    });
  });

  it("ignores deleted programs and other users when counting active ones", async () => {
    await asUser(db, firstParty(A), async (s) => {
      await s.exec("update public.programs set deleted_at = now(), updated_at = updated_at + interval '1 minute' where id = $1", [fx.a.program]);
      await s.exec("insert into public.programs (user_id, name, split, days_per_week, is_active) values ($1, 'Replacement', 'custom', 2, true)", [A]);
      await s.exec("set constraints programs_one_active_per_user immediate");
    });
  });
});

describe("uniqueness", () => {
  it("allows one recovery log per user per day among live rows", async () => {
    await asUser(db, firstParty(A), async (s) => {
      const err = await s.denied("insert into public.recovery_logs (user_id, date) values ($1, '2026-10-01')", [A]);
      expect(err.code).toBe("23505");
      await s.exec("update public.recovery_logs set deleted_at = now(), updated_at = updated_at + interval '1 minute' where id = $1", [fx.a.recovery]);
      expect(await s.exec("insert into public.recovery_logs (user_id, date) values ($1, '2026-10-01')", [A])).toBe(1);
    });
    await asUser(db, firstParty(B), async (s) => {
      const err = await s.denied("insert into public.recovery_logs (user_id, date) values ($1, '2026-10-01')", [B]);
      expect(err.code).toBe("23505");
    });
  });

  it("keeps global slugs unique and custom slugs unique per user", async () => {
    await asAdmin(db, async (s) => {
      const dup = await s.denied(
        `insert into public.exercises (user_id, slug, name, primary_muscle, movement_pattern, load_type, default_rep_min, default_rep_max)
         values (null, 'push-up', 'Duplicate', 'chest', 'horizontal_push', 'bodyweight', 8, 12)`,
      );
      expect(dup.code).toBe("23505");
    });
    await asUser(db, firstParty(A), async (s) => {
      const dup = await s.denied(
        `insert into public.exercises (user_id, slug, name, primary_muscle, movement_pattern, load_type, default_rep_min, default_rep_max)
         values ($1, 'custom-curl', 'Again', 'biceps', 'elbow_flexion', 'external', 8, 12)`,
        [A],
      );
      expect(dup.code).toBe("23505");
      const sameAsGlobal = await s.exec(
        `insert into public.exercises (user_id, slug, name, primary_muscle, movement_pattern, load_type, default_rep_min, default_rep_max)
         values ($1, 'push-up', 'My push-up', 'chest', 'horizontal_push', 'bodyweight', 8, 12)`,
        [A],
      );
      expect(sameAsGlobal).toBe(1);
    });
  });

  it("keeps ladder levels unique within a global family", async () => {
    await asAdmin(db, async (s) => {
      const dup = await s.denied(
        `insert into public.exercises (user_id, slug, name, primary_muscle, movement_pattern, load_type, progression_group, ladder_level, default_rep_min, default_rep_max)
         values (null, 'extra-pull-up', 'Extra', 'lats', 'vertical_pull', 'bodyweight', 'pull-up', 4, 5, 10)`,
      );
      expect(dup.code).toBe("23505");
    });
  });
});

describe("check constraints", () => {
  it.each([
    ["an unknown goal kind", "insert into public.goals (user_id, kind, description) values ($1, 'cardio', 'x')"],
    ["an unknown muscle", "insert into public.goals (user_id, kind, description, focus_muscles) values ($1, 'other', 'x', '{neck}')"],
    ["an unknown equipment code", "insert into public.equipment_profiles (user_id, name, equipment) values ($1, 'x', '{jetpack}')"],
    ["a negative dumbbell increment", "insert into public.equipment_profiles (user_id, name, dumbbell_increment) values ($1, 'x', 0)"],
    ["sets above 20", `insert into public.planned_exercises (user_id, program_day_id, position, exercise_id, sets, rep_min, rep_max, target_rir) values ($1, '${"aaaaaaaa-0000-4000-8000-000000000005"}', 0, (select id from public.exercises where slug = 'push-up' and user_id is null), 21, 8, 12, 2)`],
    ["rep_min above rep_max", `insert into public.planned_exercises (user_id, program_day_id, position, exercise_id, sets, rep_min, rep_max, target_rir) values ($1, '${"aaaaaaaa-0000-4000-8000-000000000005"}', 0, (select id from public.exercises where slug = 'push-up' and user_id is null), 3, 12, 8, 2)`],
    ["target rir of 11", `insert into public.planned_exercises (user_id, program_day_id, position, exercise_id, sets, rep_min, rep_max, target_rir) values ($1, '${"aaaaaaaa-0000-4000-8000-000000000005"}', 0, (select id from public.exercises where slug = 'push-up' and user_id is null), 3, 8, 12, 11)`],
    ["a completed workout with no completion time", "insert into public.workouts (user_id, started_at, status) values ($1, now(), 'completed')"],
    ["session rpe of 11", "insert into public.workouts (user_id, started_at, session_rpe) values ($1, now(), 11)"],
    ["a set with 1001 reps", `insert into public.workout_sets (user_id, workout_id, exercise_id, set_index, reps) values ($1, '${"aaaaaaaa-0000-4000-8000-000000000009"}', (select id from public.exercises where slug = 'push-up' and user_id is null), 0, 1001)`],
    ["a set with rir 11", `insert into public.workout_sets (user_id, workout_id, exercise_id, set_index, reps, rir) values ($1, '${"aaaaaaaa-0000-4000-8000-000000000009"}', (select id from public.exercises where slug = 'push-up' and user_id is null), 0, 5, 11)`],
    ["a recovery rating of 6", "insert into public.recovery_logs (user_id, date, soreness) values ($1, '2026-11-02', 6)"],
    ["a recovery rating of 0", "insert into public.recovery_logs (user_id, date, energy) values ($1, '2026-11-02', 0)"],
    ["25 hours of sleep", "insert into public.recovery_logs (user_id, date, sleep_hours) values ($1, '2026-11-02', 25)"],
    ["body fat of 100", "insert into public.body_measurements (user_id, measured_on, body_fat_pct) values ($1, '2026-11-02', 100)"],
    ["a progression snapshot missing keys", `insert into public.progression_decisions (user_id, planned_exercise_id, engine_version, action, before, after, reason) values ($1, '${"aaaaaaaa-0000-4000-8000-000000000006"}', 'v', 'hold', '{}', '{}', 'r')`],
    ["an unknown progression action", `insert into public.progression_decisions (user_id, planned_exercise_id, engine_version, action, before, after, reason) values ($1, '${"aaaaaaaa-0000-4000-8000-000000000006"}', 'v', 'explode', '{"exercise_id":1,"sets":1,"rep_min":1,"rep_max":1,"target_rir":1,"load":1}', '{"exercise_id":1,"sets":1,"rep_min":1,"rep_max":1,"target_rir":1,"load":1}', 'r')`],
    ["a program with 8 days a week", "insert into public.programs (user_id, name, split, days_per_week) values ($1, 'x', 'ppl', 8)"],
    ["an unknown split", "insert into public.programs (user_id, name, split, days_per_week) values ($1, 'x', 'bro', 5)"],
    ["a day with an unknown focus", `insert into public.program_days (user_id, program_id, position, name, focus) values ($1, '${"aaaaaaaa-0000-4000-8000-000000000004"}', 3, 'x', 'cardio')`],
    ["a slug with capitals", "insert into public.exercises (user_id, slug, name, primary_muscle, movement_pattern, load_type, default_rep_min, default_rep_max) values ($1, 'Bad Slug', 'x', 'chest', 'horizontal_push', 'bodyweight', 8, 12)"],
    ["an exercise with only a ladder group", "insert into public.exercises (user_id, slug, name, primary_muscle, movement_pattern, load_type, progression_group, default_rep_min, default_rep_max) values ($1, 'half-ladder', 'x', 'chest', 'horizontal_push', 'bodyweight', 'push-up', 8, 12)"],
    ["an exercise rep range that is backwards", "insert into public.exercises (user_id, slug, name, primary_muscle, movement_pattern, load_type, default_rep_min, default_rep_max) values ($1, 'backwards', 'x', 'chest', 'horizontal_push', 'bodyweight', 12, 8)"],
    ["an unknown unit", "insert into public.profiles (user_id, unit) values ($1, 'stone')"],
  ])("rejects %s", async (_name, sql) => {
    await asUser(db, firstParty(A), async (s) => {
      const err = await s.denied(sql, [A]);
      expect(err.code).toBe("23514");
    });
  });
});

describe("deleting parents", () => {
  it("cascades from a workout to its sets, and from a program to everything under it", async () => {
    await asUser(db, firstParty(A), async (s) => {
      await s.exec("delete from public.workouts where id = $1", [fx.a.workout]);
      expect((await s.one("select count(*)::int as n from public.workout_sets where user_id = $1", [A])).n).toBe(0);
      expect((await s.one("select count(*)::int as n from public.progression_decisions where user_id = $1", [A])).n).toBe(1);
      await s.exec("delete from public.programs where id = $1", [fx.a.program]);
      for (const table of ["program_days", "planned_exercises", "coach_proposals", "progression_decisions"]) {
        expect((await s.one(`select count(*)::int as n from public.${table} where user_id = $1`, [A])).n, table).toBe(0);
      }
    });
  });

  it("keeps logged sets when the planned exercise or the day is removed", async () => {
    await asUser(db, firstParty(A), async (s) => {
      await s.exec("delete from public.planned_exercises where id = $1", [fx.a.pe1]);
      const sets = await s.rows("select planned_exercise_id from public.workout_sets where user_id = $1", [A]);
      expect(sets).toEqual([{ planned_exercise_id: null }, { planned_exercise_id: null }]);
      await s.exec("delete from public.program_days where id = $1", [fx.a.day]);
      expect((await s.one("select program_day_id from public.workouts where id = $1", [fx.a.workout])).program_day_id).toBeNull();
    });
  });

  it("clears the equipment profile reference instead of blocking its deletion", async () => {
    await asUser(db, firstParty(A), async (s) => {
      await s.exec("delete from public.equipment_profiles where id = $1", [fx.a.equipment]);
      expect((await s.one("select equipment_profile_id from public.program_days where id = $1", [fx.a.day])).equipment_profile_id).toBeNull();
    });
  });

  it("will not let an exercise that history uses disappear", async () => {
    await asUser(db, firstParty(A), async (s) => {
      await s.exec("delete from public.exercises where id = $1", [fx.a.customExercise]);
      const err = await s.denied("set constraints all immediate");
      expect(err.code).toBe("23503");
    });
  });
});
