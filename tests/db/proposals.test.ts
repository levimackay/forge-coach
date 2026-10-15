import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exerciseId, idFor, seedFixtures, type Fixtures } from "./fixtures";
import { A, B, asUser, createDb, firstParty, oauthClient, withRole, type Session } from "./harness";

let db: PGlite;
let fx: Fixtures;

beforeAll(async () => {
  db = await createDb();
  fx = await seedFixtures(db);
});

afterAll(async () => {
  await db.close();
});

const INSERT = `insert into public.coach_proposals (program_id, base_program_version, title, rationale, changes)
                values ($1, $2, 'Proposal', 'Because.', $3::jsonb) returning *`;

const propose = (s: Session, changes: unknown, version = 1, program = fx.a.program) =>
  s.one(INSERT, [program, version, typeof changes === "string" ? changes : JSON.stringify(changes)]);

const rejectedWith = async (changes: unknown, expected: RegExp, version = 1, program = fx.a.program) => {
  await asUser(db, firstParty(A), async (s) => {
    const err = await s.denied(INSERT, [program, version, typeof changes === "string" ? changes : JSON.stringify(changes)]);
    expect(err.code).toBe("22023");
    expect(err.message).toMatch(expected);
  });
};

const pe = (id: string) => ({ planned_exercise_id: id });

describe("proposal validation", () => {
  it("accepts one valid proposal of every operation type", async () => {
    await asUser(db, firstParty(A), async (s) => {
      const row = await propose(s, [
        { op: "update_prescription", ...pe(fx.a.pe1), set: { sets: 4, rep_min: 5, rep_max: 8, target_rir: 1, load: 140, rest_seconds: 150, notes: "Heavy" } },
        { op: "update_prescription", ...pe(fx.a.pe2), set: { load: null, rest_seconds: null, notes: null } },
        { op: "swap_exercise", ...pe(fx.a.pe3), exercise_id: fx.ex["dumbbell-curl"] },
        { op: "swap_exercise", ...pe(fx.a.pe2), exercise_id: fx.a.customExercise },
        { op: "add_exercise", program_day_id: fx.a.day, exercise_id: fx.ex["cable-fly"], position: 3, sets: 3, rep_min: 10, rep_max: 15, target_rir: 1, load: null },
        { op: "remove_exercise", ...pe(fx.a.pe2) },
        { op: "update_day", program_day_id: fx.a.day, set: { name: "Heavy push", focus: "upper", equipment_profile_id: fx.a.equipment } },
      ]);
      expect(row.status).toBe("pending");
      expect(row.source).toBe("user");
      expect(row.client_id).toBeNull();
    });
  });

  it("accepts whole numbers written with a decimal point", async () => {
    await asUser(db, firstParty(A), async (s) => {
      const raw = `[{"op":"update_prescription","planned_exercise_id":"${fx.a.pe1}","set":{"sets":4.0,"rep_max":9.0,"load":142.5}}]`;
      const row = await propose(s, raw);
      expect(row.status).toBe("pending");
      await s.switch("postgres");
      await s.exec("update public.coach_proposals set status = 'approved', decided_at = now() where id = $1", [row.id]);
      await s.switch("authenticated", firstParty(A));
      await s.one("select public.apply_proposal($1)", [row.id]);
      const after = await s.one("select sets, rep_max, load from public.planned_exercises where id = $1", [fx.a.pe1]);
      expect([after.sets, after.rep_max, Number(after.load)]).toEqual([4, 9, 142.5]);
    });
  });

  it.each([
    ["not an array", { op: "remove_exercise", ...pe("x") }, /JSON array/],
    ["an empty array", [], /between 1 and 30/],
    ["31 operations", Array.from({ length: 31 }, () => ({ op: "remove_exercise", ...pe("00000000-0000-4000-8000-000000000001") })), /between 1 and 30/],
    ["an operation that is not an object", ["remove_exercise"], /must be an object/],
    ["a missing op", [{ ...pe(idFor("a", "pe1")) }], /unknown op "null"/],
    ["an op that is not a string", [{ op: 7 }], /unknown op "null"/],
    ["an unknown op", [{ op: "drop_table", ...pe(idFor("a", "pe1")) }], /unknown op "drop_table"/],
    ["restore_exercise (only valid when undoing)", [{ op: "restore_exercise", ...pe(idFor("a", "pe1")) }], /unknown op "restore_exercise"/],
    ["an extra field", [{ op: "remove_exercise", ...pe(idFor("a", "pe1")), user_id: A }], /unexpected field "user_id"/],
    ["a missing field", [{ op: "swap_exercise", ...pe(idFor("a", "pe1")) }], /missing field "exercise_id"/],
    ["an empty set", [{ op: "update_prescription", ...pe(idFor("a", "pe1")), set: {} }], /non-empty object/],
    ["set as an array", [{ op: "update_prescription", ...pe(idFor("a", "pe1")), set: [] }], /non-empty object/],
    ["an unknown key in set", [{ op: "update_prescription", ...pe(idFor("a", "pe1")), set: { is_active: false } }], /unexpected field "is_active"/],
    ["sets above 20", [{ op: "update_prescription", ...pe(idFor("a", "pe1")), set: { sets: 21 } }], /invalid value for "sets"/],
    ["sets as text", [{ op: "update_prescription", ...pe(idFor("a", "pe1")), set: { sets: "3" } }], /invalid value for "sets"/],
    ["a fractional rep count", [{ op: "update_prescription", ...pe(idFor("a", "pe1")), set: { rep_min: 5.5 } }], /invalid value for "rep_min"/],
    ["rep_min of zero", [{ op: "update_prescription", ...pe(idFor("a", "pe1")), set: { rep_min: 0 } }], /invalid value for "rep_min"/],
    ["rir above 10", [{ op: "update_prescription", ...pe(idFor("a", "pe1")), set: { target_rir: 11 } }], /invalid value for "target_rir"/],
    ["a negative load", [{ op: "update_prescription", ...pe(idFor("a", "pe1")), set: { load: -5 } }], /invalid value for "load"/],
    ["a load that is text", [{ op: "update_prescription", ...pe(idFor("a", "pe1")), set: { load: "heavy" } }], /invalid value for "load"/],
    ["rest above an hour", [{ op: "update_prescription", ...pe(idFor("a", "pe1")), set: { rest_seconds: 3601 } }], /invalid value for "rest_seconds"/],
    ["notes that are too long", [{ op: "update_prescription", ...pe(idFor("a", "pe1")), set: { notes: "x".repeat(1001) } }], /invalid value for "notes"/],
    ["rep_min above rep_max inside set", [{ op: "update_prescription", ...pe(idFor("a", "pe1")), set: { rep_min: 12, rep_max: 8 } }], /rep_min \(12\) is above rep_max \(8\)/],
    ["rep_min above the stored rep_max", [{ op: "update_prescription", ...pe(idFor("a", "pe1")), set: { rep_min: 12 } }], /rep_min \(12\) is above rep_max \(10\)/],
    ["a planned exercise id that is not a uuid", [{ op: "remove_exercise", planned_exercise_id: "nope" }], /not an exercise in this program/],
    ["a planned exercise id that is not text", [{ op: "remove_exercise", planned_exercise_id: 5 }], /not an exercise in this program/],
    ["an unknown planned exercise", [{ op: "remove_exercise", planned_exercise_id: "99999999-9999-4999-8999-999999999999" }], /not an exercise in this program/],
    ["an unknown exercise", [{ op: "swap_exercise", ...pe(idFor("a", "pe1")), exercise_id: "99999999-9999-4999-8999-999999999999" }], /not an available exercise/],
    ["add_exercise with a missing number", [{ op: "add_exercise", program_day_id: idFor("a", "day"), exercise_id: exerciseId("cable-fly"), position: 1, sets: 3, rep_min: 8, rep_max: 12, target_rir: 2 }], /missing field "load"/],
    ["add_exercise with sets of zero", [{ op: "add_exercise", program_day_id: idFor("a", "day"), exercise_id: exerciseId("cable-fly"), position: 1, sets: 0, rep_min: 8, rep_max: 12, target_rir: 2, load: null }], /out of range/],
    ["add_exercise with rep_min above rep_max", [{ op: "add_exercise", program_day_id: idFor("a", "day"), exercise_id: exerciseId("cable-fly"), position: 1, sets: 3, rep_min: 13, rep_max: 12, target_rir: 2, load: null }], /rep_min is above rep_max/],
    ["update_day with an empty name", [{ op: "update_day", program_day_id: idFor("a", "day"), set: { name: "" } }], /invalid value for "name"/],
    ["update_day with a bad focus", [{ op: "update_day", program_day_id: idFor("a", "day"), set: { focus: "arms" } }], /invalid value for "focus"/],
    ["update_day with an unknown key", [{ op: "update_day", program_day_id: idFor("a", "day"), set: { position: 4 } }], /unexpected field "position"/],
  ])("rejects %s", async (_name, changes, expected) => {
    await rejectedWith(changes, expected);
  });

  it("rejects ids that belong to another user", async () => {
    await rejectedWith([{ op: "remove_exercise", ...pe(fx.b.pe1) }], /not an exercise in this program/);
    await rejectedWith([{ op: "update_prescription", ...pe(fx.b.pe1), set: { sets: 5 } }], /not an exercise in this program/);
    await rejectedWith([{ op: "swap_exercise", ...pe(fx.a.pe1), exercise_id: fx.b.customExercise }], /not an available exercise/);
    await rejectedWith(
      [{ op: "add_exercise", program_day_id: fx.b.day, exercise_id: fx.ex["cable-fly"], position: 1, sets: 3, rep_min: 8, rep_max: 12, target_rir: 2, load: null }],
      /not a day of this program/,
    );
    await rejectedWith(
      [{ op: "add_exercise", program_day_id: fx.a.day, exercise_id: fx.b.customExercise, position: 1, sets: 3, rep_min: 8, rep_max: 12, target_rir: 2, load: null }],
      /not an available exercise/,
    );
    await rejectedWith([{ op: "update_day", program_day_id: fx.b.day, set: { name: "Mine now" } }], /not a day of this program/);
    await rejectedWith([{ op: "update_day", program_day_id: fx.a.day, set: { equipment_profile_id: fx.b.equipment } }], /invalid value for "equipment_profile_id"/);
  });

  it("rejects a program that belongs to another user", async () => {
    await rejectedWith([{ op: "remove_exercise", ...pe(fx.b.pe1) }], /one of your programs/, 1, fx.b.program);
  });

  it("rejects rows from a different program of the same user", async () => {
    await withRole(db, "postgres", null, async (s) => {
      await s.exec("insert into public.programs (id, user_id, name, split, days_per_week) values ('aaaaaaaa-0000-4000-8000-000000000101', $1, 'Other', 'custom', 2)", [A]);
      await s.exec("insert into public.program_days (id, user_id, program_id, position, name, focus) values ('aaaaaaaa-0000-4000-8000-000000000102', $1, 'aaaaaaaa-0000-4000-8000-000000000101', 0, 'Other day', 'pull')", [A]);
      await s.exec(
        `insert into public.planned_exercises (id, user_id, program_day_id, position, exercise_id, sets, rep_min, rep_max, target_rir)
         values ('aaaaaaaa-0000-4000-8000-000000000103', $1, 'aaaaaaaa-0000-4000-8000-000000000102', 0, $2, 3, 8, 12, 2)`,
        [A, fx.ex["pull-up"]],
      );
      await s.switch("authenticated", firstParty(A));
      for (const change of [
        { op: "remove_exercise", ...pe("aaaaaaaa-0000-4000-8000-000000000103") },
        { op: "update_day", program_day_id: "aaaaaaaa-0000-4000-8000-000000000102", set: { name: "x" } },
      ]) {
        const err = await s.denied(INSERT, [fx.a.program, 1, JSON.stringify([change])]);
        expect(err.code).toBe("22023");
        expect(err.message).toMatch(/not (an exercise in|a day of) this program/);
      }
    });
  });

  it("ignores rows another user attached to this user's program or day", async () => {
    // Foreign keys do not check who owns the parent, so a row owned by B can point at A's program.
    await withRole(db, "postgres", null, async (s) => {
      await s.exec(
        "insert into public.program_days (id, user_id, program_id, position, name, focus) values ('bbbbbbbb-0000-4000-8000-000000000201', $1, $2, 9, 'Planted', 'push')",
        [B, fx.a.program],
      );
      await s.exec(
        `insert into public.planned_exercises (id, user_id, program_day_id, position, exercise_id, sets, rep_min, rep_max, target_rir)
         values ('bbbbbbbb-0000-4000-8000-000000000202', $1, $2, 9, $3, 3, 8, 12, 2)`,
        [B, fx.a.day, fx.ex["push-up"]],
      );
      await s.switch("authenticated", firstParty(A));
      for (const [change, expected] of [
        [{ op: "update_day", program_day_id: "bbbbbbbb-0000-4000-8000-000000000201", set: { name: "Hijacked" } }, /not a day of this program/],
        [{ op: "remove_exercise", ...pe("bbbbbbbb-0000-4000-8000-000000000202") }, /not an exercise in this program/],
        [{ op: "update_prescription", ...pe("bbbbbbbb-0000-4000-8000-000000000202"), set: { sets: 9 } }, /not an exercise in this program/],
      ] as const) {
        const err = await s.denied(INSERT, [fx.a.program, 1, JSON.stringify([change])]);
        expect(err.code).toBe("22023");
        expect(err.message).toMatch(expected);
      }
    });
  });

  it("rejects soft-deleted rows", async () => {
    await withRole(db, "postgres", null, async (s) => {
      await s.exec("update public.planned_exercises set deleted_at = now() where id = $1", [fx.a.pe2]);
      await s.switch("authenticated", firstParty(A));
      const err = await s.denied(INSERT, [fx.a.program, 1, JSON.stringify([{ op: "remove_exercise", ...pe(fx.a.pe2) }])]);
      expect(err.message).toMatch(/not an exercise in this program/);
    });
  });

  it("requires the base version to match the program", async () => {
    await rejectedWith([{ op: "remove_exercise", ...pe(fx.a.pe2) }], /current version \(1\)/, 2);
  });

  it("will not let a caller choose another user_id", async () => {
    await asUser(db, firstParty(A), async (s) => {
      const err = await s.denied(
        `insert into public.coach_proposals (user_id, program_id, base_program_version, title, rationale, changes)
         values ($1, $2, 1, 't', 'r', $3::jsonb)`,
        [B, fx.a.program, JSON.stringify([{ op: "remove_exercise", ...pe(fx.a.pe2) }])],
      );
      expect(err.code).toBe("42501");
    });
  });
});

const SNAPSHOT_SQL = `
  select 'pe' as kind, id, to_jsonb(t) - 'updated_at' - 'server_updated_at' as body
    from public.planned_exercises t where user_id = $1
  union all
  select 'day', id, to_jsonb(d) - 'updated_at' - 'server_updated_at' from public.program_days d where user_id = $1
  order by 1, 2`;

const all5 = () => [
  { op: "update_prescription", ...pe(fx.a.pe1), set: { sets: 4, rep_min: 5, rep_max: 8, target_rir: 1, load: 140, rest_seconds: 150, notes: "Heavy" } },
  { op: "swap_exercise", ...pe(fx.a.pe3), exercise_id: fx.ex["dumbbell-curl"] },
  { op: "add_exercise", program_day_id: fx.a.day, exercise_id: fx.ex["cable-fly"], position: 3, sets: 3, rep_min: 10, rep_max: 15, target_rir: 1, load: null },
  { op: "remove_exercise", ...pe(fx.a.pe2) },
  { op: "update_day", program_day_id: fx.a.day, set: { name: "Heavy push", focus: "upper", equipment_profile_id: null } },
];

describe("approve, apply and undo", () => {
  it("applies every operation, bumps the version and writes the audit trail", async () => {
    await asUser(db, firstParty(A), async (s) => {
      const created = await propose(s, all5());
      const before = await s.rows(SNAPSHOT_SQL, [A]);

      const done = await s.one("select * from public.approve_proposal($1, 'Looks right')", [created.id]);
      expect(done.status).toBe("applied");
      expect(done.decision_note).toBe("Looks right");
      expect(done.decided_at).not.toBeNull();
      expect(done.applied_at).not.toBeNull();
      expect(done.undone_at).toBeNull();
      expect(done.inverse_changes.length).toBeGreaterThanOrEqual(5);

      const p1 = await s.one("select * from public.planned_exercises where id = $1", [fx.a.pe1]);
      expect([p1.sets, p1.rep_min, p1.rep_max, p1.target_rir, Number(p1.load), p1.rest_seconds, p1.notes]).toEqual([4, 5, 8, 1, 140, 150, "Heavy"]);
      const p3 = await s.one("select * from public.planned_exercises where id = $1", [fx.a.pe3]);
      expect(p3.exercise_id).toBe(fx.ex["dumbbell-curl"]);
      expect(p3.load).toBeNull();
      const p2 = await s.one("select is_active from public.planned_exercises where id = $1", [fx.a.pe2]);
      expect(p2.is_active).toBe(false);
      const added = await s.rows("select * from public.planned_exercises where user_id = $1 and exercise_id = $2", [A, fx.ex["cable-fly"]]);
      expect(added).toHaveLength(1);
      expect([added[0].position, added[0].sets, added[0].is_active, added[0].program_day_id]).toEqual([3, 3, true, fx.a.day]);
      const day = await s.one("select name, focus, equipment_profile_id from public.program_days where id = $1", [fx.a.day]);
      expect(day).toMatchObject({ name: "Heavy push", focus: "upper", equipment_profile_id: null });
      const prog = await s.one("select version from public.programs where id = $1", [fx.a.program]);
      expect(prog.version).toBe(2);

      const changedRows = await s.one(
        "select count(*)::int as n from public.planned_exercises where user_id = $1 and server_updated_at > $2",
        [A, created.created_at],
      );
      expect(changedRows.n).toBe(4);

      const audit = await s.rows(
        "select action, actor, client_id from public.audit_log where entity_id = $1 order by at",
        [created.id],
      );
      expect(audit.map((r) => r.action)).toEqual(["proposal_created", "proposal_approved", "proposal_applied"]);
      for (const r of audit) expect([r.actor, r.client_id]).toEqual(["user", null]);
      expect(before.length).toBe(4);
    });
  });

  it("undo restores the exact previous values", async () => {
    await asUser(db, firstParty(A), async (s) => {
      const before = await s.rows(SNAPSHOT_SQL, [A]);
      const created = await propose(s, all5());
      await s.one("select * from public.approve_proposal($1)", [created.id]);

      const undone = await s.one("select * from public.undo_proposal($1)", [created.id]);
      expect(undone.status).toBe("undone");
      expect(undone.undone_at).not.toBeNull();

      const after = await s.rows(SNAPSHOT_SQL, [A]);
      const known = new Set(before.map((r) => r.id));
      expect(after.filter((r) => known.has(r.id))).toEqual(before);

      const extra = after.filter((r) => !known.has(r.id));
      expect(extra).toHaveLength(1);
      expect(extra[0].body.is_active).toBe(false);

      const p1 = await s.one("select load, notes, rest_seconds, sets from public.planned_exercises where id = $1", [fx.a.pe1]);
      expect([p1.load, p1.notes, p1.rest_seconds, p1.sets]).toEqual(["135.00", "Pause the first rep", 120, 3]);
      const p3 = await s.one("select load, exercise_id from public.planned_exercises where id = $1", [fx.a.pe3]);
      expect([p3.load, p3.exercise_id]).toEqual(["25.50", fx.a.customExercise]);

      expect((await s.one("select version from public.programs where id = $1", [fx.a.program])).version).toBe(3);
      const actions = await s.rows("select action from public.audit_log where entity_id = $1 order by at", [created.id]);
      expect(actions.map((r) => r.action)).toEqual(["proposal_created", "proposal_approved", "proposal_applied", "proposal_undone"]);
    });
  });

  it("undoes several operations on the same row in the right order", async () => {
    await asUser(db, firstParty(A), async (s) => {
      const before = await s.rows(SNAPSHOT_SQL, [A]);
      const created = await propose(s, [
        { op: "update_prescription", ...pe(fx.a.pe1), set: { sets: 4 } },
        { op: "update_prescription", ...pe(fx.a.pe1), set: { sets: 5, load: 150 } },
        { op: "swap_exercise", ...pe(fx.a.pe1), exercise_id: fx.ex["dumbbell-bench-press"] },
        { op: "update_prescription", ...pe(fx.a.pe1), set: { load: 60 } },
        { op: "remove_exercise", ...pe(fx.a.pe1) },
      ]);
      await s.one("select * from public.approve_proposal($1)", [created.id]);
      const mid = await s.one("select sets, load, exercise_id, is_active from public.planned_exercises where id = $1", [fx.a.pe1]);
      expect([mid.sets, mid.load, mid.exercise_id, mid.is_active]).toEqual([5, "60.00", fx.ex["dumbbell-bench-press"], false]);
      await s.one("select * from public.undo_proposal($1)", [created.id]);
      expect(await s.rows(SNAPSHOT_SQL, [A])).toEqual(before);
    });
  });

  it("does not reactivate an exercise that was already inactive", async () => {
    await withRole(db, "postgres", null, async (s) => {
      await s.exec("update public.planned_exercises set is_active = false where id = $1", [fx.a.pe2]);
      await s.switch("authenticated", firstParty(A));
      const created = await propose(s, [{ op: "remove_exercise", ...pe(fx.a.pe2) }]);
      const done = await s.one("select * from public.approve_proposal($1)", [created.id]);
      expect(done.inverse_changes).toEqual([]);
      await s.one("select * from public.undo_proposal($1)", [created.id]);
      expect((await s.one("select is_active from public.planned_exercises where id = $1", [fx.a.pe2])).is_active).toBe(false);
    });
  });

  it("swapping to the same exercise changes nothing", async () => {
    await asUser(db, firstParty(A), async (s) => {
      const created = await propose(s, [{ op: "swap_exercise", ...pe(fx.a.pe1), exercise_id: fx.ex["barbell-bench-press"] }]);
      const done = await s.one("select * from public.approve_proposal($1)", [created.id]);
      expect(done.inverse_changes).toEqual([]);
      expect((await s.one("select load from public.planned_exercises where id = $1", [fx.a.pe1])).load).toBe("135.00");
    });
  });

  it("cannot be approved, rejected or undone twice, or undone before it is applied", async () => {
    await asUser(db, firstParty(A), async (s) => {
      const created = await propose(s, [{ op: "remove_exercise", ...pe(fx.a.pe2) }]);
      expect((await s.denied("select public.undo_proposal($1)", [created.id])).code).toBe("55000");
      await s.one("select * from public.approve_proposal($1)", [created.id]);
      expect((await s.denied("select public.approve_proposal($1)", [created.id])).message).toContain("already applied");
      expect((await s.denied("select public.reject_proposal($1)", [created.id])).code).toBe("55000");
      await s.one("select * from public.undo_proposal($1)", [created.id]);
      expect((await s.denied("select public.undo_proposal($1)", [created.id])).code).toBe("55000");
      expect((await s.denied("select public.approve_proposal($1)", [created.id])).code).toBe("55000");
    });
  });

  it("rejecting records the decision and changes nothing else", async () => {
    await asUser(db, firstParty(A), async (s) => {
      const before = await s.rows(SNAPSHOT_SQL, [A]);
      const created = await propose(s, all5());
      const row = await s.one("select * from public.reject_proposal($1, 'Not now')", [created.id]);
      expect(row.status).toBe("rejected");
      expect(row.decision_note).toBe("Not now");
      expect(row.decided_at).not.toBeNull();
      expect(row.applied_at).toBeNull();
      expect(await s.rows(SNAPSHOT_SQL, [A])).toEqual(before);
      expect((await s.one("select version from public.programs where id = $1", [fx.a.program])).version).toBe(1);
      expect((await s.denied("select public.approve_proposal($1)", [created.id])).code).toBe("55000");
      expect((await s.denied("select public.apply_proposal($1)", [created.id])).code).toBe("55000");
    });
  });

  it("a first-party session can apply an approved proposal and is recorded as the user", async () => {
    await withRole(db, "postgres", null, async (s) => {
      await s.switch("authenticated", firstParty(A));
      const created = await propose(s, [{ op: "update_prescription", ...pe(fx.a.pe1), set: { sets: 6 } }]);
      expect((await s.denied("select public.apply_proposal($1)", [created.id])).code).toBe("55000");
      await s.switch("postgres");
      await s.exec("update public.coach_proposals set status = 'approved', decided_at = now() where id = $1", [created.id]);
      await s.switch("authenticated", firstParty(A));
      expect((await s.one("select * from public.apply_proposal($1)", [created.id])).status).toBe("applied");
      const audit = await s.one("select actor, client_id from public.audit_log where entity_id = $1 and action = 'proposal_applied'", [created.id]);
      expect(audit).toEqual({ actor: "user", client_id: null });
    });
  });

  it("applies nothing at all when one operation cannot be applied", async () => {
    await withRole(db, "postgres", null, async (s) => {
      await s.switch("authenticated", firstParty(A));
      const created = await propose(s, [
        { op: "update_prescription", ...pe(fx.a.pe1), set: { sets: 9 } },
        { op: "remove_exercise", ...pe(fx.a.pe2) },
      ]);
      // The second target disappears between proposing and approving.
      await s.switch("postgres");
      await s.exec("update public.planned_exercises set deleted_at = now() where id = $1", [fx.a.pe2]);
      await s.switch("authenticated", firstParty(A));
      const err = await s.denied("select public.approve_proposal($1)", [created.id]);
      expect(err.code).toBe("P0002");
      const state = await s.one(
        "select (select status from public.coach_proposals where id = $1) as status, (select sets from public.planned_exercises where id = $2) as sets, (select version from public.programs where id = $3) as version",
        [created.id, fx.a.pe1, fx.a.program],
      );
      expect(state).toEqual({ status: "pending", sets: 3, version: 1 });
    });
  });

  it("will not touch another user's proposals", async () => {
    await asUser(db, firstParty(B), async (s) => {
      for (const call of ["approve_proposal", "reject_proposal", "undo_proposal", "apply_proposal"]) {
        const err = await s.denied(`select public.${call}($1)`, [fx.a.proposal]);
        expect(err.code, call).toBe("P0002");
        expect(err.message).toContain("proposal not found");
      }
    });
    await asUser(db, firstParty(A), async (s) => {
      expect((await s.one("select status from public.coach_proposals where id = $1", [fx.a.proposal])).status).toBe("pending");
    });
  });

  it("an OAuth token cannot approve even a proposal it created itself", async () => {
    await asUser(db, oauthClient(A), async (s) => {
      const created = await propose(s, [{ op: "update_prescription", ...pe(fx.a.pe1), set: { sets: 5 } }]);
      expect((await s.denied("select public.approve_proposal($1)", [created.id])).code).toBe("42501");
      expect((await s.denied("select public.apply_proposal($1)", [created.id])).code).toBe("55000");
      expect((await s.one("select sets from public.planned_exercises where id = $1", [fx.a.pe1])).sets).toBe(3);
    });
  });
});

describe("export", () => {
  it("returns the caller's rows in the ForgeExport shape", async () => {
    await asUser(db, firstParty(A), async (s) => {
      const { export_my_data: out } = await s.one("select public.export_my_data()");
      expect(out.format).toBe("forge-coach-export");
      expect(out.version).toBe(1);
      expect(out.user_id).toBe(A);
      expect(new Date(out.exported_at).getTime()).not.toBeNaN();
      expect(Object.keys(out.tables).sort()).toEqual(
        [
          "audit_log", "body_measurements", "coach_proposals", "equipment_profiles", "exercises", "goals",
          "planned_exercises", "profiles", "program_days", "programs", "progression_decisions",
          "recovery_logs", "workout_sets", "workouts",
        ].sort(),
      );
      const t = out.tables;
      expect(t.profiles).toHaveLength(1);
      expect(t.planned_exercises).toHaveLength(3);
      expect(t.workout_sets).toHaveLength(2);
      expect(t.exercises.map((e: { slug: string }) => e.slug)).toEqual(["custom-curl"]);
      for (const rows of Object.values(t) as { user_id: string }[][]) for (const r of rows) expect(r.user_id).toBe(A);
      expect(t.planned_exercises[0].load).toBe(135);
    });
  });
});
