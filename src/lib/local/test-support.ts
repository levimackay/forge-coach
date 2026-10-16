// Shared by the unit tests only: an in-memory stand-in for the Supabase tables
// that behaves like the real schema where sync depends on it (upsert by key,
// trigger-set server_updated_at, last-write-wins on updated_at).

type Row = Record<string, unknown>;

export interface UpsertFailure {
  status: number;
  code?: string;
  message?: string;
  /** Apply the write on the server, then report failure (a lost response). */
  applyFirst?: boolean;
  /** Only fail when the payload contains this row id. */
  rowId?: string;
}

const PK_OVERRIDES: Record<string, string> = { profiles: "user_id" };

export class FakeServer {
  tables = new Map<string, Map<string, Row>>();
  upsertCalls: { table: string; rows: Row[]; onConflict: string | undefined }[] = [];
  selectCalls: { table: string; filters: string[] }[] = [];
  rpcCalls: { name: string; args: unknown }[] = [];
  failures: UpsertFailure[] = [];
  /** Row ids the server always rejects with a data error (HTTP 400). */
  rejectIds = new Set<string>();
  /** Runs after the server applied a write but before the client sees the response. */
  beforeRespond: (() => Promise<void>) | null = null;
  /** While set, every select waits for it before reading, to hold a pull in flight. */
  selectGate: Promise<void> | null = null;
  rpcResult: { data: unknown; error: { message: string } | null; status: number } = {
    data: null,
    error: null,
    status: 200,
  };
  private clock = 0;

  reset(): void {
    this.tables.clear();
    this.upsertCalls = [];
    this.selectCalls = [];
    this.rpcCalls = [];
    this.failures = [];
    this.rejectIds.clear();
    this.beforeRespond = null;
    this.selectGate = null;
    this.clock = 0;
    this.rpcResult = { data: null, error: null, status: 200 };
  }

  table(name: string): Map<string, Row> {
    let t = this.tables.get(name);
    if (!t) {
      t = new Map();
      this.tables.set(name, t);
    }
    return t;
  }

  rows(name: string): Row[] {
    return [...this.table(name).values()];
  }

  pk(name: string): string {
    return PK_OVERRIDES[name] ?? "id";
  }

  /** Postgres-style timestamptz text, as PostgREST returns it. */
  stamp(): string {
    this.clock += 1;
    const ms = Date.UTC(2026, 9, 15, 12, 0, 0) + this.clock * 1000;
    return `${new Date(ms).toISOString().slice(0, 19)}.${String(this.clock).padStart(6, "0")}+00:00`;
  }

  /** What a trigger-backed insert or update does on the real database. */
  apply(name: string, incoming: Row): void {
    const key = incoming[this.pk(name)] as string;
    const table = this.table(name);
    const existing = table.get(key);
    if (existing && Date.parse(incoming.updated_at as string) < Date.parse(existing.updated_at as string)) {
      return;
    }
    table.set(key, { ...incoming, server_updated_at: this.stamp() });
  }

  async upsert(name: string, rows: Row[], onConflict: string | undefined): Promise<{ error: Row | null; status: number }> {
    this.upsertCalls.push({ table: name, rows, onConflict });
    const idx = this.failures.findIndex((f) => f.rowId === undefined || rows.some((r) => r[this.pk(name)] === f.rowId));
    if (idx >= 0) {
      const [failure] = this.failures.splice(idx, 1);
      if (failure.applyFirst) for (const r of rows) this.apply(name, r);
      return {
        error: { message: failure.message ?? "failed", code: failure.code ?? "" },
        status: failure.status,
      };
    }
    if (rows.some((r) => this.rejectIds.has(r[this.pk(name)] as string))) {
      return { error: { message: "violates check constraint", code: "23514" }, status: 400 };
    }
    for (const r of rows) {
      if ("server_updated_at" in r) {
        return { error: { message: "server_updated_at must not be sent", code: "42501" }, status: 403 };
      }
    }
    if (name === "programs" && this.tooManyActive(rows)) {
      return { error: { message: "conflicting key value violates exclusion constraint \"programs_one_active_per_user\"", code: "23P01" }, status: 409 };
    }
    for (const r of rows) this.apply(name, r);
    if (this.beforeRespond) await this.beforeRespond();
    return { error: null, status: 201 };
  }

  /** programs_one_active_per_user, checked on the state the whole request would leave. */
  private tooManyActive(rows: Row[]): boolean {
    const after = new Map(this.table("programs"));
    for (const r of rows) {
      const existing = after.get(r.id as string);
      if (!existing || Date.parse(r.updated_at as string) >= Date.parse(existing.updated_at as string)) after.set(r.id as string, r);
    }
    const active = new Map<unknown, number>();
    for (const p of after.values()) if (p.is_active && !p.deleted_at) active.set(p.user_id, (active.get(p.user_id) ?? 0) + 1);
    return [...active.values()].some((n) => n > 1);
  }

  from(name: string) {
    return {
      upsert: (rows: Row[], opts?: { onConflict?: string }) => this.upsert(name, rows, opts?.onConflict),
      select: () => new FakeQuery(this, name),
    };
  }

  client = {
    from: (name: string) => this.from(name),
    rpc: (name: string, args: unknown) => {
      this.rpcCalls.push({ name, args });
      return Promise.resolve(this.rpcResult);
    },
    auth: { getSession: () => Promise.resolve({ data: { session: null }, error: null }) },
  };
}

const ts = (v: unknown): number | string => {
  const ms = Date.parse(String(v));
  return Number.isNaN(ms) ? String(v) : ms;
};

class FakeQuery implements PromiseLike<{ data: Row[]; error: null; status: number }> {
  private filters: ((r: Row) => boolean)[] = [];
  private described: string[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private max = Infinity;

  constructor(
    private server: FakeServer,
    private name: string,
  ) {}

  gte(col: string, value: string) {
    this.described.push(`gte ${col} ${value}`);
    this.filters.push((r) => ts(r[col]) >= ts(value));
    return this;
  }

  or(expr: string) {
    this.described.push(`or ${expr}`);
    const m = /^(\w+)\.gt\.(.+?),and\((\w+)\.eq\.(.+?),(\w+)\.gt\.(.+)\)$/.exec(expr);
    if (!m) throw new Error(`unsupported or(): ${expr}`);
    const [, col, at, , , pkCol, afterPk] = m;
    this.filters.push(
      (r) =>
        ts(r[col]) > ts(at) || (ts(r[col]) === ts(at) && String(r[pkCol]) > afterPk),
    );
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending !== false });
    return this;
  }

  limit(n: number) {
    this.max = n;
    return this;
  }

  then<T1, T2>(
    onfulfilled?: ((v: { data: Row[]; error: null; status: number }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    this.server.selectCalls.push({ table: this.name, filters: this.described });
    return Promise.resolve(this.server.selectGate)
      .then(() => this.read())
      .then(onfulfilled, onrejected);
  }

  private read(): { data: Row[]; error: null; status: number } {
    let rows = this.server.rows(this.name).filter((r) => this.filters.every((f) => f(r)));
    rows = rows.sort((a, b) => {
      for (const { col, asc } of this.orders) {
        const x = ts(a[col]);
        const y = ts(b[col]);
        if (x === y) continue;
        return (x < y ? -1 : 1) * (asc ? 1 : -1);
      }
      return 0;
    });
    const data = rows.slice(0, this.max).map((r) => ({ ...r }));
    return { data, error: null, status: 200 };
  }
}

export const fakeServer = new FakeServer();

export const TEST_USER = "11111111-1111-4111-8111-111111111111";

/** Brand-new database, sync state and server, signed in as TEST_USER. */
export async function freshLocalState(): Promise<void> {
  const [{ getDb, resetDbForTests }, { configureSync, resetSyncForTests }, { setActiveUserId }] = await Promise.all([
    import("./db"),
    import("./sync"),
    import("./session"),
  ]);
  await getDb().delete();
  resetDbForTests();
  fakeServer.reset();
  resetSyncForTests();
  configureSync({ autoFlush: false });
  setActiveUserId(TEST_USER);
  (globalThis as { window?: unknown }).window = globalThis;
}
