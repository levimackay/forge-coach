import { describe, expect, it } from "vitest";
import { describeSync } from "./sync-chip";
import type { SyncStatus } from "@/lib/local/hooks";

const base: SyncStatus = {
  pending: 0,
  failed: 0,
  lastSyncedAt: null,
  online: true,
  syncing: false,
  error: null,
  hydrated: true,
};

describe("describeSync", () => {
  it("says Synced when nothing is waiting", () => {
    expect(describeSync(base)).toEqual({ text: "Synced", tone: "quiet" });
  });

  it("counts pending writes and flags offline", () => {
    expect(describeSync({ ...base, pending: 3 }).text).toBe("3 to sync");
    expect(describeSync({ ...base, online: false, pending: 2 }).text).toBe("Offline, 2 to sync");
    expect(describeSync({ ...base, online: false }).text).toBe("Offline");
  });

  it("reports rejected writes ahead of everything else", () => {
    expect(describeSync({ ...base, failed: 1, online: false, pending: 4 })).toEqual({
      text: "1 not saved",
      tone: "error",
    });
  });

  it("shows progress and retry states", () => {
    expect(describeSync({ ...base, syncing: true, pending: 1 }).text).toBe("Syncing");
    expect(describeSync({ ...base, error: "x", pending: 2 }).text).toBe("2 to sync, retrying");
    expect(describeSync({ ...base, hydrated: false }).text).toBe("Loading data");
  });
});
