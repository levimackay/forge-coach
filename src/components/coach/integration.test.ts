import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exerciseSeries } from "@/lib/analytics";
import { buildCoachPrompt } from "@/lib/reports";
import { exerciseOptions, headlineMeasure, seriesToLine, sinceText } from "@/app/progress/derive";
import { loadTrainedKeys } from "@/app/progress/use-progress-data";
import { getDb } from "@/lib/local/db";
import { seedDevFixture } from "@/lib/local/dev-fixture";
import {
  loadBodyMeasurements,
  loadExerciseLibrary,
  loadProfile,
  loadProposals,
  loadSetsForExercise,
  loadWorkouts,
} from "@/lib/local/hooks";
import { freshLocalState } from "@/lib/local/test-support";
import { describeAudit } from "./activity-log";
import { reportFilename } from "./browser-actions";
import { changeLines, describeChanges } from "./diff";
import { generateReport } from "./report-data";
import { buildCoachContext, loadProgramRows } from "./use-diff-context";

vi.mock("@/lib/supabase/client", async () => {
  const { fakeServer } = await import("@/lib/local/test-support");
  return { getSupabase: () => fakeServer.client };
});

// A Thursday, so the current week holds the Monday and Wednesday sessions only.
const NOW = new Date(2026, 9, 15, 12, 0, 0);

beforeEach(async () => {
  await freshLocalState();
  vi.stubEnv("NODE_ENV", "development");
  await seedDevFixture(NOW);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("reports from the local database", () => {
  it("builds session, week and month reports from real rows", async () => {
    for (const kind of ["session", "week", "month"] as const) {
      const report = await generateReport(kind, "lb", NOW);
      expect(report.json.kind).toBe(kind);
      expect(report.markdown.length).toBeGreaterThan(200);
      expect(report.title).toBeTruthy();
      expect(reportFilename(report, "md")).toMatch(/^forge-(session|week|month)-\d{4}-\d{2}-\d{2}\.md$/);
      expect(JSON.parse(JSON.stringify(report.json)).format).toBe("forge-coach-report");
    }
  });

  it("the Claude prompt carries the report as labelled data", async () => {
    const report = await generateReport("week", "lb", NOW);
    const prompt = buildCoachPrompt(report);
    expect(prompt).toContain("<forge_report>");
    expect(prompt).toContain("</forge_report>");
    expect(prompt).toContain(report.markdown.trim().split("\n")[0]);
  });

  it("the week report sees this week's sessions", async () => {
    const report = await generateReport("week", "lb", NOW);
    expect(report.json.sessions.length).toBeGreaterThan(0);
    expect(report.json.consistency.completed).toBeGreaterThan(0);
  });
});

describe("progress screen data", () => {
  it("lists trained exercises, newest first, and charts a barbell lift", async () => {
    const [library, keys] = await Promise.all([loadExerciseLibrary(), loadTrainedKeys()]);
    const options = exerciseOptions(keys, library);
    expect(options.length).toBeGreaterThan(10);
    expect(options.map((o) => o.lastAt)).toEqual([...options.map((o) => o.lastAt)].sort().reverse());

    const bench = library.find((e) => e.slug === "barbell-bench-press") ?? library.find((e) => e.load_type === "external");
    expect(bench).toBeDefined();
    const profile = await loadProfile();
    const [workouts, sets, measurements] = await Promise.all([
      loadWorkouts({ status: "completed", limit: 1000 }),
      loadSetsForExercise((bench as { id: string }).id, 1500),
      loadBodyMeasurements(),
    ]);
    expect(measurements.length).toBeGreaterThan(1);
    const series = exerciseSeries({ exercise: bench!, workouts, sets, bodyweight: profile?.bodyweight ?? null, timeZone: profile!.timezone });
    expect(series.length).toBeGreaterThanOrEqual(3);

    expect(headlineMeasure(bench!, series)).toBe("e1rm");
    const points = seriesToLine(series, "e1rm");
    expect(points.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < points.length; i++) expect(points[i].x).toBeGreaterThan(points[i - 1].x);
    expect(sinceText(points, "e1rm", "lb")).toMatch(/^(Up|Down) \d+ lb since [A-Z][a-z]{2} \d+$|^No change since /);
  });

  it("tells a bodyweight exercise in reps instead of an estimated max", async () => {
    const library = await loadExerciseLibrary();
    const chin = library.find((e) => e.slug === "chin-up");
    expect(chin).toBeDefined();
    const profile = await loadProfile();
    const [workouts, sets] = await Promise.all([loadWorkouts({ status: "completed", limit: 1000 }), loadSetsForExercise(chin!.id, 1500)]);
    const series = exerciseSeries({ exercise: chin!, workouts, sets, bodyweight: profile!.bodyweight, timeZone: profile!.timezone });
    expect(series.length).toBeGreaterThan(0);
    expect(headlineMeasure(chin!, series)).toBe("reps");
    expect(seriesToLine(series, "reps")).toHaveLength(series.length);
  });
});

describe("coach screen data", () => {
  it("diffs the pending proposal against the current program", async () => {
    const db = getDb();
    const [pending] = await loadProposals("pending");
    expect(pending.title).toMatch(/lateral raises/);

    const [profile, library, equipment, rows] = await Promise.all([
      loadProfile(),
      loadExerciseLibrary(),
      db.equipment_profiles.toArray(),
      loadProgramRows(),
    ]);
    const context = buildCoachContext(profile!.unit, library, equipment, rows);
    const blocks = describeChanges(pending.changes, context.diff, "pending");

    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.title)).toEqual(["Dumbbell lateral raise", "Face pull"]);
    expect(blocks.map(changeLines)).toEqual([["3 → 4 sets"], ["3 → 4 sets"]]);
    expect(blocks[0].place).toBe("Push");
    for (const b of blocks) {
      expect(b.warning).toBeNull();
      expect(b.rows).toEqual([{ label: "Sets", before: "3", after: "4" }]);
    }

    const program = context.programs.get(pending.program_id)!;
    expect(program.version).toBe(pending.base_program_version);
  });

  it("shows an applied proposal's earlier values from its stored inverse", async () => {
    const db = getDb();
    const applied = (await loadProposals("applied"))[0];
    const [profile, library, equipment, rows] = await Promise.all([
      loadProfile(),
      loadExerciseLibrary(),
      db.equipment_profiles.toArray(),
      loadProgramRows(),
    ]);
    const { diff, programs } = buildCoachContext(profile!.unit, library, equipment, rows);
    const [block] = describeChanges(applied.changes, diff, "applied", applied.inverse_changes);
    expect(block.title).toBe("Standing calf raise");
    // The fixture's calf raises were already planned at 4 sets, so the inverse rebuilds the earlier 3.
    expect(block.rows).toEqual([{ label: "Sets", before: "3", after: "4" }]);
    // This proposal was written for version 1 and the program is at 2: the card would warn.
    expect(programs.get(applied.program_id)!.version).not.toBe(applied.base_program_version);
  });

  it("describes the activity log rows in plain words", async () => {
    const entries = await getDb().audit_log.toArray();
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      const { text } = describeAudit(e);
      expect(text).not.toMatch(/[._]/);
      expect(text.length).toBeGreaterThan(5);
    }
  });
});
