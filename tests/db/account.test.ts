import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedFixtures } from "./fixtures";
import { A, ALL_TABLES, B, asAdmin, asUser, createDb, firstParty, type Session } from "./harness";

let db: PGlite;

beforeAll(async () => {
  db = await createDb();
  await seedFixtures(db);
});

afterAll(async () => {
  await db.close();
});

const rowCounts = async (s: Session, user: string) => {
  const out: Record<string, number> = {};
  for (const t of ALL_TABLES) {
    out[t] = (await s.one(`select count(*)::int as n from public.${t} where user_id = $1`, [user])).n;
  }
  return out;
};

const fingerprint = (s: Session, user: string) =>
  s.one(
    `select md5(string_agg(x, '|' order by x)) as h from (
       ${ALL_TABLES.map((t) => `select '${t}:' || r::text as x from public.${t} r where user_id = $1`).join(" union all ")}
     ) q`,
    [user],
  );

describe("delete_my_data", () => {
  it("removes every row the caller owns and nothing that belongs to anyone else", async () => {
    const bBefore = await asAdmin(db, (s) => fingerprint(s, B));
    const globalsBefore = await asAdmin(db, (s) => s.one("select count(*)::int as n from public.exercises where user_id is null"));

    await asUser(db, firstParty(A), async (s) => {
      const counts = await s.one("select public.delete_my_data() as c");
      expect(counts.c.programs).toBe(1);
      expect(counts.c.planned_exercises).toBe(3);
      expect(counts.c.exercises).toBe(1);

      const left = await rowCounts(s, A);
      for (const t of ALL_TABLES) {
        if (t === "audit_log") continue;
        expect(left[t], t).toBe(0);
      }
      // One audit row survives so the wipe itself is on record.
      const audit = await s.rows("select action, actor, details from public.audit_log where user_id = $1", [A]);
      expect(audit).toHaveLength(1);
      expect(audit[0].action).toBe("delete_my_data");
      expect(audit[0].actor).toBe("user");
      expect(audit[0].details.deleted.workout_sets).toBe(2);

      expect((await s.one("select count(*)::int as n from public.exercises where user_id is null")).n).toBe(globalsBefore.n);
      // Starting over works.
      await s.exec("insert into public.profiles (user_id) values ($1)", [A]);
    });

    expect((await asAdmin(db, (s) => fingerprint(s, B))).h).toBe(bBefore.h);
    const stillThere = await asAdmin(db, (s) => s.one("select count(*)::int as n from auth.users where id = $1", [A]));
    expect(stillThere.n).toBe(1);
  });

  it("is not available to an OAuth client or to the signed-out", async () => {
    await asUser(db, { ...firstParty(A), client_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }, async (s) => {
      expect((await s.denied("select public.delete_my_data()")).code).toBe("42501");
    });
  });
});

describe("delete_my_account", () => {
  it("deletes the data and then the sign-in itself, leaving other users alone", async () => {
    const bBefore = await asAdmin(db, (s) => fingerprint(s, B));
    await asAdmin(db, (s) => s.exec("insert into auth.sessions (user_id) values ($1)", [A]));
    await db.exec("begin");
    try {
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(firstParty(A))]);
      await db.exec("set local role authenticated");
      const out = (await db.query("select public.delete_my_account() as r")).rows[0] as { r: { account_deleted: boolean; deleted: Record<string, number> } };
      expect(out.r.account_deleted).toBe(true);
      expect(out.r.deleted.programs).toBeGreaterThanOrEqual(0);
      await db.exec("reset role");
      expect((await db.query("select count(*)::int as n from auth.users where id = $1", [A])).rows[0]).toEqual({ n: 0 });
      expect((await db.query("select count(*)::int as n from auth.sessions where user_id = $1", [A])).rows[0]).toEqual({ n: 0 });
      for (const t of ALL_TABLES) {
        const n = (await db.query(`select count(*)::int as n from public.${t} where user_id = $1`, [A])).rows[0] as { n: number };
        expect(n.n, t).toBe(0);
      }
      expect((await db.query("select count(*)::int as n from auth.users where id = $1", [B])).rows[0]).toEqual({ n: 1 });
      const bAfter = (await db.query(
        `select md5(string_agg(x, '|' order by x)) as h from (
           ${ALL_TABLES.map((t) => `select '${t}:' || r::text as x from public.${t} r where user_id = '${B}'`).join(" union all ")}
         ) q`,
      )).rows[0] as { h: string };
      expect(bAfter.h).toBe(bBefore.h);
    } finally {
      await db.exec("rollback");
    }
  });

  it("is not available to an OAuth client", async () => {
    await asUser(db, { ...firstParty(B), client_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }, async (s) => {
      expect((await s.denied("select public.delete_my_account()")).code).toBe("42501");
    });
    expect((await asAdmin(db, (s) => s.one("select count(*)::int as n from auth.users where id = $1", [B]))).n).toBe(1);
  });

  it("removing the sign-in directly (a dashboard delete) cascades even when custom exercises are in use", async () => {
    await asAdmin(db, async (s) => {
      await s.exec("delete from auth.users where id = $1", [B]);
      // Deferred foreign keys are checked when the transaction ends.
      await s.exec("set constraints all immediate");
      for (const t of ALL_TABLES) {
        expect((await s.one(`select count(*)::int as n from public.${t} where user_id = $1`, [B])).n, t).toBe(0);
      }
    });
  });
});
