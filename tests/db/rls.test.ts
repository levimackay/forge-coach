import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedFixtures, type Fixtures, type UserFixture } from "./fixtures";
import {
  A,
  ALL_TABLES,
  B,
  CLIENT_WRITABLE,
  OAUTH_CLIENT,
  asAdmin,
  asAnon,
  asUser,
  createDb,
  firstParty,
  oauthClient,
  type TableName,
} from "./harness";

let db: PGlite;
let fx: Fixtures;

beforeAll(async () => {
  db = await createDb();
  fx = await seedFixtures(db);
});

afterAll(async () => {
  await db.close();
});

/** Rows in a table that belong to somebody other than the current user (global exercises excluded). */
const foreignRows = (table: string, me: string) =>
  `select count(*)::int as n from public.${table} where user_id is not null and user_id <> '${me}'`;

describe("row level security is really enforced", () => {
  it("the leak check finds other users' rows as the superuser and none as an API user", async () => {
    // If this test passed vacuously (for example the role switch silently did nothing), the
    // superuser count below would also be zero or the API user's count would not be.
    const asSuper = await asAdmin(db, async (s) => (await s.one(foreignRows("programs", A))).n);
    expect(asSuper).toBeGreaterThan(0);

    await asUser(db, firstParty(A), async (s) => {
      const who = await s.one(
        "select current_user as cu, (select rolbypassrls from pg_roles where rolname = current_user) as bypass",
      );
      expect(who.cu).toBe("authenticated");
      expect(who.bypass).toBe(false);
      expect((await s.one(foreignRows("programs", A))).n).toBe(0);
    });
  });

  it("fails loudly if the policies were missing (RLS off would expose both users)", async () => {
    const rls = await asAdmin(db, (s) =>
      s.rows("select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'"),
    );
    expect(rls.map((r) => r.relname).sort()).toEqual([...ALL_TABLES].sort());
    for (const r of rls) expect(r.relrowsecurity, `${r.relname} must have RLS enabled`).toBe(true);
  });
});

describe.each(ALL_TABLES)("%s", (table) => {
  it("lets a user read their own rows and nobody else's", async () => {
    for (const [who, other] of [
      [A, B],
      [B, A],
    ] as const) {
      await asUser(db, firstParty(who), async (s) => {
        const own = await s.one(`select count(*)::int as n from public.${table} where user_id = $1`, [who]);
        expect(own.n, `${who} should see their own ${table} rows`).toBeGreaterThanOrEqual(1);
        const foreign = await s.one(`select count(*)::int as n from public.${table} where user_id = $1`, [other]);
        expect(foreign.n).toBe(0);
        const total = await s.one(`select count(*)::int as n from public.${table} where user_id is distinct from $1 and user_id is not null`, [who]);
        expect(total.n).toBe(0);
      });
    }
  });

  it("stops another user from updating or deleting a user's rows", async () => {
    const before = await asAdmin(db, (s) => s.one(`select md5(string_agg(t::text, '|' order by t::text)) as h from public.${table} t where user_id = $1`, [A]));
    await asUser(db, firstParty(B), async (s) => {
      if (table === "audit_log" || table === "coach_proposals") {
        // No UPDATE or DELETE privilege exists for these at all.
        expect((await s.denied(`update public.${table} set user_id = user_id where user_id = $1`, [A])).code).toBe("42501");
        expect((await s.denied(`delete from public.${table} where user_id = $1`, [A])).code).toBe("42501");
        return;
      }
      const column = table === "profiles" ? "display_name" : "updated_at";
      const value = table === "profiles" ? "'hacked'" : "updated_at + interval '1 hour'";
      expect(await s.exec(`update public.${table} set ${column} = ${value} where user_id = $1`, [A])).toBe(0);
      expect(await s.exec(`delete from public.${table} where user_id = $1`, [A])).toBe(0);
    });
    const after = await asAdmin(db, (s) => s.one(`select md5(string_agg(t::text, '|' order by t::text)) as h from public.${table} t where user_id = $1`, [A]));
    expect(after.h).toBe(before.h);
  });
});

/** An INSERT that is valid for the table except for who it claims to belong to. */
function insertFor(table: TableName, uid: string, f: UserFixture, ex: Record<string, string>): [string, unknown[]] {
  const id = randomUUID();
  switch (table) {
    case "profiles":
      return ["insert into public.profiles (user_id) values ($1)", [uid]];
    case "goals":
      return ["insert into public.goals (id, user_id, kind, description) values ($1, $2, 'other', 'x')", [id, uid]];
    case "equipment_profiles":
      return ["insert into public.equipment_profiles (id, user_id, name) values ($1, $2, 'Gym')", [id, uid]];
    case "exercises":
      return [
        "insert into public.exercises (id, user_id, slug, name, primary_muscle, movement_pattern, load_type, default_rep_min, default_rep_max) values ($1, $2, $3, 'X', 'chest', 'horizontal_push', 'bodyweight', 8, 12)",
        [id, uid, `slug-${id}`],
      ];
    case "programs":
      return ["insert into public.programs (id, user_id, name, split, days_per_week) values ($1, $2, 'P', 'custom', 3)", [id, uid]];
    case "program_days":
      return ["insert into public.program_days (id, user_id, program_id, position, name, focus) values ($1, $2, $3, 5, 'D', 'push')", [id, uid, f.program]];
    case "planned_exercises":
      return [
        "insert into public.planned_exercises (id, user_id, program_day_id, position, exercise_id, sets, rep_min, rep_max, target_rir) values ($1, $2, $3, 9, $4, 3, 8, 12, 2)",
        [id, uid, f.day, ex["push-up"]],
      ];
    case "workouts":
      return ["insert into public.workouts (id, user_id, started_at) values ($1, $2, now())", [id, uid]];
    case "workout_sets":
      return [
        "insert into public.workout_sets (id, user_id, workout_id, exercise_id, set_index, reps) values ($1, $2, $3, $4, 9, 5)",
        [id, uid, f.workout, ex["push-up"]],
      ];
    case "recovery_logs":
      return ["insert into public.recovery_logs (id, user_id, date) values ($1, $2, '2026-11-01')", [id, uid]];
    case "body_measurements":
      return ["insert into public.body_measurements (id, user_id, measured_on) values ($1, $2, '2026-11-01')", [id, uid]];
    case "progression_decisions": {
      const snap = JSON.stringify({ exercise_id: ex["push-up"], sets: 3, rep_min: 8, rep_max: 12, target_rir: 2, load: null });
      return [
        "insert into public.progression_decisions (id, user_id, planned_exercise_id, engine_version, action, before, after, reason) values ($1, $2, $3, 'v', 'hold', $4::jsonb, $4::jsonb, 'r')",
        [id, uid, f.pe1, snap],
      ];
    }
    case "coach_proposals":
      return [
        "insert into public.coach_proposals (id, user_id, program_id, base_program_version, title, rationale, changes) values ($1, $2, $3, 1, 't', 'r', $4::jsonb)",
        [id, uid, f.program, JSON.stringify([{ op: "remove_exercise", planned_exercise_id: f.pe2 }])],
      ];
    case "audit_log":
      return ["insert into public.audit_log (user_id, actor, action, entity) values ($1, 'user', 'x', 'y')", [uid]];
  }
}

describe("inserts for another user are refused", () => {
  it.each(ALL_TABLES)("%s", async (table) => {
    await asUser(db, firstParty(B), async (s) => {
      const [sql, params] = insertFor(table, A, fx.b, fx.ex);
      const err = await s.denied(sql, params);
      expect(err.code).toBe("42501");
    });
  });

  it("a user can insert for themselves, which makes the refusals above meaningful", async () => {
    await asUser(db, firstParty(B), async (s) => {
      for (const table of CLIENT_WRITABLE) {
        if (table === "profiles") continue;
        const [sql, params] = insertFor(table, B, fx.b, fx.ex);
        expect(await s.exec(sql, params), `${table} insert as owner`).toBe(1);
      }
      const [sql, params] = insertFor("coach_proposals", B, fx.b, fx.ex);
      expect(await s.exec(sql, params)).toBe(1);
    });
  });

  it("upserting over another user's row id is refused instead of overwriting it", async () => {
    await asUser(db, firstParty(B), async (s) => {
      const err = await s.denied(
        `insert into public.goals (id, user_id, kind, description) values ($1, $2, 'other', 'stolen')
         on conflict (id) do update set description = excluded.description, user_id = excluded.user_id`,
        [fx.a.goal, B],
      );
      expect(err.code).toBe("42501");
    });
    const row = await asAdmin(db, (s) => s.one("select description, user_id from public.goals where id = $1", [fx.a.goal]));
    expect(row.description).toBe("Add size");
    expect(row.user_id).toBe(A);
  });
});

describe("anonymous callers get nothing", () => {
  it.each(ALL_TABLES)("%s", async (table) => {
    await asAnon(db, async (s) => {
      expect((await s.denied(`select * from public.${table}`)).code).toBe("42501");
    });
  });

  it("cannot call any API function", async () => {
    await asAnon(db, async (s) => {
      for (const call of [
        "public.approve_proposal(gen_random_uuid())",
        "public.reject_proposal(gen_random_uuid())",
        "public.apply_proposal(gen_random_uuid())",
        "public.undo_proposal(gen_random_uuid())",
        "public.export_my_data()",
        "public.delete_my_data()",
        "public.delete_my_account()",
      ]) {
        expect((await s.denied(`select ${call}`)).code, call).toBe("42501");
      }
    });
  });

  it("a signed-in token with no subject cannot read or write", async () => {
    await asUser(db, { role: "authenticated" } as never, async (s) => {
      for (const table of ALL_TABLES) {
        const n = await s.one(`select count(*)::int as n from public.${table} where user_id is not null`);
        expect(n.n, table).toBe(0);
      }
      expect((await s.denied("select public.export_my_data()")).code).toBe("28000");
    });
  });
});

describe("an OAuth client token (Claude)", () => {
  const claude = oauthClient(A);

  it.each(ALL_TABLES)("can read the user's %s", async (table) => {
    await asUser(db, claude, async (s) => {
      const n = await s.one(`select count(*)::int as n from public.${table} where user_id = $1`, [A]);
      expect(n.n).toBeGreaterThanOrEqual(1);
    });
  });

  it.each(CLIENT_WRITABLE)("cannot insert, update or delete %s", async (table) => {
    await asUser(db, claude, async (s) => {
      const [sql, params] = insertFor(table, A, fx.a, fx.ex);
      expect((await s.denied(sql, params)).code).toBe("42501");

      const before = await s.one(`select md5(string_agg(t::text, '|' order by t::text)) as h from public.${table} t where user_id = $1`, [A]);
      const column = table === "profiles" ? "display_name" : "updated_at";
      const value = table === "profiles" ? "'changed by claude'" : "updated_at + interval '1 hour'";
      expect(await s.exec(`update public.${table} set ${column} = ${value} where user_id = $1`, [A])).toBe(0);
      expect(await s.exec(`delete from public.${table} where user_id = $1`, [A])).toBe(0);
      const after = await s.one(`select md5(string_agg(t::text, '|' order by t::text)) as h from public.${table} t where user_id = $1`, [A]);
      expect(after.h).toBe(before.h);
    });
  });

  it("the same writes succeed for the first-party session, so the refusals come from client_id", async () => {
    await asUser(db, firstParty(A), async (s) => {
      for (const table of CLIENT_WRITABLE) {
        const column = table === "profiles" ? "display_name" : "updated_at";
        const value = table === "profiles" ? "'changed'" : "updated_at + interval '1 hour'";
        expect(await s.exec(`update public.${table} set ${column} = ${value} where user_id = $1`, [A]), table).toBeGreaterThanOrEqual(1);
      }
    });
  });

  it("cannot touch proposals or the audit log directly", async () => {
    await asUser(db, claude, async (s) => {
      expect((await s.denied("update public.coach_proposals set status = 'approved' where user_id = $1", [A])).code).toBe("42501");
      expect((await s.denied("delete from public.coach_proposals where user_id = $1", [A])).code).toBe("42501");
      expect((await s.denied("insert into public.audit_log (user_id, actor, action, entity) values ($1, 'user', 'x', 'y')", [A])).code).toBe("42501");
      expect((await s.denied("update public.audit_log set action = 'x' where user_id = $1", [A])).code).toBe("42501");
      expect((await s.denied("delete from public.audit_log where user_id = $1", [A])).code).toBe("42501");
    });
  });

  it("can insert a pending proposal, and client_id and source come from the token", async () => {
    await asUser(db, claude, async (s) => {
      const row = await s.one(
        `insert into public.coach_proposals (user_id, program_id, base_program_version, title, rationale, changes, client_id, source)
         values ($1, $2, 1, 'Add a fly', 'Chest volume is low', $3::jsonb, 'spoofed', 'user') returning *`,
        [A, fx.a.program, JSON.stringify([{ op: "remove_exercise", planned_exercise_id: fx.a.pe2 }])],
      );
      expect(row.status).toBe("pending");
      expect(row.client_id).toBe(OAUTH_CLIENT);
      expect(row.source).toBe("claude");
      const audit = await s.one(
        "select actor, client_id, action from public.audit_log where entity_id = $1 and action = 'proposal_created'",
        [row.id],
      );
      expect(audit).toMatchObject({ actor: "claude", client_id: OAUTH_CLIENT });
    });
  });

  it("cannot insert a proposal that is already decided or applied", async () => {
    await asUser(db, claude, async (s) => {
      const changes = JSON.stringify([{ op: "remove_exercise", planned_exercise_id: fx.a.pe2 }]);
      for (const [column, value] of [
        ["status", "'approved'"],
        ["status", "'applied'"],
        ["decided_at", "now()"],
        ["applied_at", "now()"],
        ["undone_at", "now()"],
        ["decision_note", "'approved'"],
        ["inverse_changes", "'[]'::jsonb"],
      ] as const) {
        const err = await s.denied(
          `insert into public.coach_proposals (user_id, program_id, base_program_version, title, rationale, changes, ${column})
           values ($1, $2, 1, 't', 'r', $3::jsonb, ${value})`,
          [A, fx.a.program, changes],
        );
        expect(err.code, column).toBe("42501");
      }
    });
  });

  it("cannot insert a proposal for another user", async () => {
    await asUser(db, claude, async (s) => {
      const err = await s.denied(
        `insert into public.coach_proposals (user_id, program_id, base_program_version, title, rationale, changes)
         values ($1, $2, 1, 't', 'r', $3::jsonb)`,
        [B, fx.b.program, JSON.stringify([{ op: "remove_exercise", planned_exercise_id: fx.b.pe2 }])],
      );
      expect(err.code).toBe("42501");
    });
  });

  it("cannot approve, reject or undo", async () => {
    await asUser(db, claude, async (s) => {
      for (const call of [
        `public.approve_proposal('${fx.a.proposal}')`,
        `public.reject_proposal('${fx.a.proposal}')`,
        `public.undo_proposal('${fx.a.proposal}')`,
        "public.export_my_data()",
        "public.delete_my_data()",
        "public.delete_my_account()",
      ]) {
        const err = await s.denied(`select ${call}`);
        expect(err.code, call).toBe("42501");
        expect(err.message).toContain("FORGE app");
      }
    });
    const status = await asAdmin(db, (s) => s.one("select status from public.coach_proposals where id = $1", [fx.a.proposal]));
    expect(status.status).toBe("pending");
  });

  it("cannot apply a proposal that is still pending", async () => {
    await asUser(db, claude, async (s) => {
      const err = await s.denied(`select public.apply_proposal('${fx.a.proposal}')`);
      expect(err.code).toBe("55000");
      expect(err.message).toContain("has not been approved");
    });
  });

  it("can apply a proposal the user already approved, and applying twice is harmless", async () => {
    // Approval is prepared as the superuser inside the same transaction as the OAuth calls.
    const { status, sets, version, audit } = await (async () => {
      await db.exec("begin");
      try {
        await db.exec("update public.coach_proposals set status = 'approved', decided_at = now() where id = '" + fx.a.proposal + "'");
        await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claude)]);
        await db.exec("set local role authenticated");
        const first = (await db.query(`select (public.apply_proposal('${fx.a.proposal}')).status as status`)).rows[0] as { status: string };
        const second = (await db.query(`select (public.apply_proposal('${fx.a.proposal}')).status as status`)).rows[0] as { status: string };
        expect(first.status).toBe("applied");
        expect(second.status).toBe("applied");
        const pe = (await db.query(`select sets from public.planned_exercises where id = '${fx.a.pe1}'`)).rows[0] as { sets: number };
        const prog = (await db.query(`select version from public.programs where id = '${fx.a.program}'`)).rows[0] as { version: number };
        const aud = (await db.query(`select actor, client_id from public.audit_log where action = 'proposal_applied' and entity_id = '${fx.a.proposal}'`)).rows as { actor: string; client_id: string }[];
        return { status: first.status, sets: pe.sets, version: prog.version, audit: aud };
      } finally {
        await db.exec("rollback");
      }
    })();
    expect(status).toBe("applied");
    expect(sets).toBe(4);
    expect(version).toBe(2);
    expect(audit).toEqual([{ actor: "claude", client_id: OAUTH_CLIENT }]);
  });

  it("cannot reach another user's proposal even when it is approved", async () => {
    await db.exec("begin");
    try {
      await db.exec("update public.coach_proposals set status = 'approved', decided_at = now() where id = '" + fx.b.proposal + "'");
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claude)]);
      await db.exec("set local role authenticated");
      const err = await db.query(`select public.apply_proposal('${fx.b.proposal}')`).then(
        () => null,
        (e: { code?: string; message: string }) => e,
      );
      expect(err?.code).toBe("P0002");
    } finally {
      await db.exec("rollback");
    }
  });
});

describe("the global exercise library", () => {
  it("is readable by any signed-in user", async () => {
    const globals = await asAdmin(db, (s) => s.one("select count(*)::int as n from public.exercises where user_id is null"));
    expect(globals.n).toBeGreaterThanOrEqual(70);
    for (const who of [A, B]) {
      await asUser(db, firstParty(who), async (s) => {
        expect((await s.one("select count(*)::int as n from public.exercises where user_id is null")).n).toBe(globals.n);
      });
    }
    await asUser(db, oauthClient(A), async (s) => {
      expect((await s.one("select count(*)::int as n from public.exercises where user_id is null")).n).toBe(globals.n);
    });
  });

  it("is not writable by anyone through the API", async () => {
    const before = await asAdmin(db, (s) => s.one("select md5(string_agg(e::text, '|' order by slug)) as h from public.exercises e where user_id is null"));
    await asUser(db, firstParty(A), async (s) => {
      const newGlobal = `insert into public.exercises (user_id, slug, name, primary_muscle, movement_pattern, load_type, default_rep_min, default_rep_max)
                         values (null, 'sneaky', 'Sneaky', 'chest', 'horizontal_push', 'bodyweight', 8, 12)`;
      expect((await s.denied(newGlobal)).code).toBe("42501");
      expect(await s.exec("update public.exercises set name = 'Renamed' where user_id is null")).toBe(0);
      expect(await s.exec("delete from public.exercises where user_id is null")).toBe(0);
      // Turning an own exercise into a global one is refused by the trigger.
      expect((await s.denied("update public.exercises set user_id = null where user_id = $1", [A])).code).toBe("42501");
    });
    const after = await asAdmin(db, (s) => s.one("select md5(string_agg(e::text, '|' order by slug)) as h from public.exercises e where user_id is null"));
    expect(after.h).toBe(before.h);
  });

  it("refuses rows that point at another user's custom exercise, which would block that user's delete", async () => {
    await asUser(db, firstParty(B), async (s) => {
      const pe = await s.denied(
        `insert into public.planned_exercises (id, user_id, program_day_id, position, exercise_id, sets, rep_min, rep_max, target_rir)
         values ($1, $2, $3, 9, $4, 3, 8, 12, 2)`,
        [randomUUID(), B, fx.b.day, fx.a.customExercise],
      );
      expect(pe.code).toBe("42501");
      const set = await s.denied(
        "insert into public.workout_sets (id, user_id, workout_id, exercise_id, set_index, reps) values ($1, $2, $3, $4, 9, 5)",
        [randomUUID(), B, fx.b.workout, fx.a.customExercise],
      );
      expect(set.code).toBe("42501");
      const swap = await s.denied("update public.planned_exercises set exercise_id = $1 where id = $2", [fx.a.customExercise, fx.b.pe1]);
      expect(swap.code).toBe("42501");
      // Own custom exercises and the library stay usable.
      expect(await s.exec("update public.planned_exercises set exercise_id = $1 where id = $2", [fx.b.customExercise, fx.b.pe1])).toBe(1);
      expect(await s.exec("update public.planned_exercises set exercise_id = $1 where id = $2", [fx.ex["push-up"], fx.b.pe1])).toBe(1);
    });
    await asUser(db, firstParty(A), async (s) => {
      await s.one("select public.delete_my_data() as c");
      await s.exec("set constraints all immediate");
    });
  });

  it("keeps custom exercises private to their owner", async () => {
    await asUser(db, firstParty(A), async (s) => {
      expect((await s.rows("select id from public.exercises where slug = 'custom-curl'")).map((r) => r.id)).toEqual([fx.a.customExercise]);
    });
    await asUser(db, firstParty(B), async (s) => {
      expect((await s.rows("select id from public.exercises where slug = 'custom-curl'")).map((r) => r.id)).toEqual([fx.b.customExercise]);
    });
  });
});

describe("privileges", () => {
  it("gives anon nothing and authenticated only what the plan lists", async () => {
    const privs = await asAdmin(db, (s) =>
      s.rows(
        `select c.relname as t,
                has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger') as anon_any,
                has_table_privilege('anon', c.oid, 'select') as anon_select,
                has_table_privilege('authenticated', c.oid, 'select') as sel,
                has_table_privilege('authenticated', c.oid, 'insert') as ins,
                has_table_privilege('authenticated', c.oid, 'update') as upd,
                has_table_privilege('authenticated', c.oid, 'delete') as del,
                has_table_privilege('authenticated', c.oid, 'truncate') as trunc,
                has_table_privilege('authenticated', c.oid, 'references') as refs,
                has_table_privilege('authenticated', c.oid, 'trigger') as trg
           from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1`,
      ),
    );
    expect(privs).toHaveLength(ALL_TABLES.length);
    for (const p of privs) {
      expect(p.anon_any, `${p.t} anon`).toBe(false);
      expect([p.trunc, p.refs, p.trg], `${p.t} extra privileges`).toEqual([false, false, false]);
      if (p.t === "audit_log") expect([p.sel, p.ins, p.upd, p.del]).toEqual([true, false, false, false]);
      else if (p.t === "coach_proposals") expect([p.sel, p.ins, p.upd, p.del]).toEqual([true, true, false, false]);
      else expect([p.sel, p.ins, p.upd, p.del], p.t).toEqual([true, true, true, true]);
    }
  });

  it("exposes exactly the seven documented functions, to signed-in users only", async () => {
    const fns = await asAdmin(db, (s) =>
      s.rows(
        `select p.proname as name, n.nspname as schema,
                has_function_privilege('anon', p.oid, 'execute') as anon_x,
                has_function_privilege('authenticated', p.oid, 'execute') as auth_x,
                p.prosecdef as definer,
                p.proconfig as config
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname in ('public', 'private') order by 2, 1`,
      ),
    );
    const publicFns = fns.filter((f) => f.schema === "public");
    expect(publicFns.map((f) => f.name).sort()).toEqual([
      "apply_proposal",
      "approve_proposal",
      "delete_my_account",
      "delete_my_data",
      "export_my_data",
      "reject_proposal",
      "undo_proposal",
    ]);
    for (const f of publicFns) {
      expect([f.anon_x, f.auth_x], f.name).toEqual([false, true]);
      expect(f.definer, f.name).toBe(true);
    }
    for (const f of fns) {
      expect((f.config ?? []).some((c: string) => c.startsWith("search_path=")), `${f.schema}.${f.name} pins search_path`).toBe(true);
    }
    for (const f of fns.filter((x) => x.schema === "private")) expect([f.anon_x, f.auth_x], f.name).toEqual([false, false]);

    const usage = await asAdmin(db, (s) => s.one("select has_schema_privilege('authenticated', 'private', 'usage') as u"));
    expect(usage.u).toBe(false);
  });
});
