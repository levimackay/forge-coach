import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAdmin, createDb } from "./harness";

const here = path.dirname(fileURLToPath(import.meta.url));
let db: PGlite;

beforeAll(async () => {
  db = await createDb();
});

afterAll(async () => {
  await db.close();
});

// The script that is run against the hosted project must keep passing here, so
// it cannot drift away from the migrations it checks.
describe("hosted isolation script", () => {
  it("passes against the migrated test database and leaves nothing behind", async () => {
    const sql = fs.readFileSync(path.join(here, "hosted/isolation_check.sql"), "utf8");
    const err = await db.exec(sql).then(
      () => null,
      (e: Error) => e,
    );
    expect(err?.message).toMatch(/^ISOLATION_OK: /);

    const left = await asAdmin(db, (s) =>
      s.one("select (select count(*)::int from auth.users) as users, (select count(*)::int from public.programs) as programs, (select count(*)::int from public.audit_log) as audit"),
    );
    expect(left).toEqual({ users: 0, programs: 0, audit: 0 });
  });
});
