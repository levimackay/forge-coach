import { describe, expect, it } from "vitest";
import { describeSync, syncProblem } from "./sync-chip";
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

describe("syncProblem", () => {
  it("says nothing while everything is fine, including right after a write and while syncing", () => {
    expect(syncProblem(base)).toBeNull();
    expect(syncProblem({ ...base, pending: 3 })).toBeNull();
    expect(syncProblem({ ...base, pending: 3, syncing: true })).toBeNull();
    expect(syncProblem({ ...base, hydrated: false })).toBeNull();
  });

  it("says nothing for an offline lifter with nothing to send, and never says Synced", () => {
    expect(syncProblem({ ...base, online: false })).toBeNull();
    for (const s of [base, { ...base, pending: 1 }, { ...base, online: false, pending: 2 }, { ...base, failed: 1 }]) {
      expect(syncProblem(s) ?? "").not.toMatch(/synced/i);
    }
  });

  it("speaks when work is stuck", () => {
    expect(syncProblem({ ...base, online: false, pending: 1 })).toBe("Offline. 1 change will sync later.");
    expect(syncProblem({ ...base, online: false, pending: 4 })).toBe("Offline. 4 changes will sync later.");
    expect(syncProblem({ ...base, error: "x", pending: 2 })).toBe("Could not sync. Trying again.");
    expect(syncProblem({ ...base, failed: 2 })).toBe("2 changes could not be saved.");
  });

  it("reports a refused write ahead of everything else", () => {
    expect(syncProblem({ ...base, failed: 1, online: false, pending: 4 })).toBe("1 change could not be saved.");
  });
});
