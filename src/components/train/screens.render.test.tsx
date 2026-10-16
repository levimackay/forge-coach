import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { Exercise } from "@/lib/domain/types";
import { getDb } from "@/lib/local/db";
import { loadActiveProgram, loadBodyMeasurements, loadEquipmentProfiles, loadExerciseLibrary, loadProfile, loadRecoveryLogs, loadWorkoutSets, loadWorkouts } from "@/lib/local/hooks";
import { freshLocalState } from "@/lib/local/test-support";
import { loadHistory, loadSessionData, loadToday, loadWorkoutData } from "./queries";
import { startWorkout } from "./session-actions";
import { NOW, clock, finish, onboard, trainDay } from "./test-flow";
import { seededLibrary } from "./test-library";

const mock = vi.hoisted(() => ({
  params: new URLSearchParams(),
  profile: undefined as unknown,
  sync: { pending: 0, failed: 0, lastSyncedAt: null, online: true, syncing: false, error: null, hydrated: true, } as Record<string, unknown>,
  today: undefined as unknown,
  workoutData: undefined as unknown,
  sets: undefined as unknown,
  session: undefined as unknown,
  history: undefined as unknown,
  last: null as unknown,
  active: undefined as unknown,
  library: undefined as unknown,
  equipment: undefined as unknown,
  workouts: undefined as unknown,
  recovery: undefined as unknown,
  measurements: undefined as unknown,
  live: undefined as unknown,
  now: null as number | null,
  date: null as string | null,
}));

vi.mock("@/lib/supabase/client", async () => {
  const { fakeServer } = await import("@/lib/local/test-support");
  return { getSupabase: () => fakeServer.client };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useSearchParams: () => mock.params,
  usePathname: () => "/",
}));

vi.mock("@/lib/local", async () => {
  const actual = await vi.importActual<typeof import("@/lib/local")>("@/lib/local");
  return {
    ...actual,
    useProfile: () => mock.profile,
    useSyncStatus: () => mock.sync,
    useExerciseLibrary: () => mock.library,
    useActiveProgram: () => mock.active,
    useEquipmentProfiles: () => mock.equipment,
    useWorkouts: () => mock.workouts,
    useWorkoutSets: () => mock.sets,
    useRecoveryLogs: () => mock.recovery,
    useBodyMeasurements: () => mock.measurements,
    useLive: () => mock.live,
  };
});

vi.mock("./queries", async () => {
  const actual = await vi.importActual<typeof import("./queries")>("./queries");
  return {
    ...actual,
    useTodayData: () => mock.today,
    useWorkoutData: () => mock.workoutData,
    useSessionData: () => mock.session,
    useHistory: () => mock.history,
    useLastSession: () => mock.last,
  };
});

vi.mock("./use-now", () => ({
  useNow: () => mock.now,
  useNowSeconds: () => mock.now,
  useToday: () => mock.date,
}));

import { RestClock, RestControls } from "./rest-bar";
import { HistoryScreen } from "./history-screen";
import { LogScreen } from "./log-screen";
import { OnboardingFlow } from "./onboarding-flow";
import { ProgramScreen } from "./program-screen";
import { SessionScreen } from "./session-screen";
import { TodayScreen } from "./today-screen";
import { WorkoutScreen } from "./workout-screen";

const html = (node: ReactElement) => renderToStaticMarkup(<ToastProvider>{node}</ToastProvider>);
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/** Every button needs a name a screen reader can announce. */
function expectNamedButtons(markup: string) {
  for (const match of markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const named = /aria-label="[^"]+"/.test(match[1]) || text(match[2]).trim() !== "";
    expect(named, match[0].slice(0, 160)).toBe(true);
  }
}

let library: Exercise[];
beforeAll(async () => {
  library = await seededLibrary();
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  clock(NOW);
  await freshLocalState();
  await getDb().exercises.bulkPut(library);
  mock.params = new URLSearchParams();
  mock.sync = { pending: 0, failed: 0, lastSyncedAt: null, online: true, syncing: false, error: null, hydrated: true };
  mock.now = NOW.getTime() + 3_600_000;
  mock.date = "2026-10-15";
  mock.last = null;
  mock.live = null;
});

afterEach(() => vi.useRealTimers());

async function loadShared() {
  mock.profile = await loadProfile();
  mock.library = await loadExerciseLibrary();
  mock.active = await loadActiveProgram();
  mock.equipment = await loadEquipmentProfiles();
  mock.workouts = await loadWorkouts({ limit: 40, status: "completed" });
  mock.recovery = await loadRecoveryLogs(30);
  mock.measurements = await loadBodyMeasurements();
}

describe("static shells", () => {
  it("every screen renders a loading state on the server without touching the clock or storage", () => {
    for (const node of [<TodayScreen key="t" />, <HistoryScreen key="h" />, <ProgramScreen key="p" />, <OnboardingFlow key="o" />]) {
      const out = html(node);
      expect(out).toContain('role="status"');
    }
    mock.params = new URLSearchParams("id=abc");
    expect(html(<WorkoutScreen />)).toContain('role="status"');
    expect(html(<SessionScreen />)).toContain('role="status"');
    mock.date = null;
    expect(html(<LogScreen />)).toContain('role="status"');
  });
});

describe("onboarding", () => {
  it("shows the first step with the progress and a named control for everything", async () => {
    mock.profile = null;
    mock.library = library;
    const out = html(<OnboardingFlow />);
    const words = text(out);
    expect(words).toContain("Step 1 of 4");
    expect(words).toContain("About you");
    expect(words).toContain("Your name");
    expect(words).toContain("Body weight");
    expect(out).toContain('aria-label="Decrease Body weight"');
    expectNamedButtons(out);
  });

  it("does not show the form again once the account is set up", async () => {
    mock.profile = { user_id: "u", onboarded_at: "2026-10-01T00:00:00Z", unit: "lb", display_name: "Levi", bodyweight: 180, timezone: "UTC" };
    mock.library = library;
    const out = html(<OnboardingFlow />);
    expect(out).toContain('aria-label="Opening Today"');
    expect(text(out)).not.toContain("Step 1 of 4");
  });
});

describe("today", () => {
  it("shows the next workout, its exercises, the equipment choice and a start button", async () => {
    await onboard(library);
    await loadShared();
    mock.today = await loadToday(null);
    const out = html(<TodayScreen />);
    const words = text(out);
    expect(words).toContain("Push");
    expect(words).toContain("Thursday, October 15");
    expect(words).toContain("Barbell bench press");
    expect(words).toContain("Pick a weight");
    expect(words).toContain("4 sets of 6 to 10 at 2 RIR");
    expect(out).toContain('aria-label="Training at"');
    expect(words).toContain("Gym");
    expect(words).toContain("Home");
    expect(words).toContain("How did you recover?");
    expect(words).toContain("Start workout");
    expect(words).toContain("Workout history");
    expect(out).toContain('href="/log"');
    expectNamedButtons(out);
  });

  it("resumes a workout in progress instead of offering a second start", async () => {
    await onboard(library);
    await loadShared();
    const today = (await loadToday(null))!;
    const workout = await startWorkout({ programDayId: today.ctx.day.id, equipmentProfileId: null, now: NOW });
    mock.today = await loadToday(null);
    const out = html(<TodayScreen />);
    expect(text(out)).toContain("Push is in progress");
    expect(out).toContain(`href="/workout?id=${workout.id}"`);
    expect(text(out)).not.toContain("Start workout");
  });

  it("explains each change after a finished session and moves on to the next day", async () => {
    await onboard(library);
    const first = (await loadToday(null))!;
    const w = await trainDay(first.ctx.day.id, 10, NOW);
    await finish(w.id, new Date(NOW.getTime() + 3_000_000));
    clock(new Date(NOW.getTime() + 2 * 86_400_000));
    await loadShared();
    mock.now = NOW.getTime() + 2 * 86_400_000;
    mock.today = await loadToday(first.ctx.day.id);
    const words = text(html(<TodayScreen />));
    expect(words).toContain("From Push / Pull / Legs (3 day)");
    expect(words).toContain("after Push on");
    expect(words).toMatch(/so the (weight|bar|dumbbells|assistance)|aim for/i);
  });

  it("shows unsynced work", async () => {
    await onboard(library);
    await loadShared();
    mock.today = await loadToday(null);
    mock.sync = { ...mock.sync, pending: 4 };
    expect(text(html(<TodayScreen />))).toContain("4 changes saved on this device, waiting to sync.");
    mock.sync = { ...mock.sync, pending: 0, failed: 1 };
    expect(text(html(<TodayScreen />))).toContain("1 change could not be saved to your account");
  });

  it("tells an offline lifter that logging still works", async () => {
    await onboard(library);
    await loadShared();
    mock.today = await loadToday(null);
    mock.sync = { ...mock.sync, online: false };
    expect(text(html(<TodayScreen />))).toContain("You are offline. Everything you log is saved on this device");
    mock.sync = { ...mock.sync, online: false, pending: 2 };
    const words = text(html(<TodayScreen />));
    expect(words).toContain("2 changes saved on this device, waiting to sync.");
    expect(words).not.toContain("You are offline");
  });

  it("sends a new account to setup and an onboarded one without a program to Program", async () => {
    mock.today = null;
    mock.profile = null;
    expect(text(html(<TodayScreen />))).toContain("Finish setting up");
    mock.profile = { onboarded_at: "2026-10-01T00:00:00Z" };
    expect(text(html(<TodayScreen />))).toContain("No active program");
    mock.profile = null;
    mock.sync = { ...mock.sync, hydrated: false };
    expect(text(html(<TodayScreen />))).not.toContain("Finish setting up");
  });

  it("waits for the first full pull before offering to build a program", () => {
    mock.today = null;
    mock.profile = { onboarded_at: "2026-10-01T00:00:00Z" };
    mock.sync = { ...mock.sync, hydrated: false };
    const out = text(html(<TodayScreen />));
    expect(out).not.toContain("No active program");
    expect(out).toContain("Loading your data");
  });
});

describe("workout logger", () => {
  async function inProgress(sets = 0) {
    await onboard(library);
    const today = (await loadToday(null))!;
    const workout = await startWorkout({ programDayId: today.ctx.day.id, equipmentProfileId: today.ctx.equipmentProfiles[0].id, now: NOW });
    if (sets > 0) {
      const { logSet } = await import("./session-actions");
      const planned = today.ctx.planned[0];
      const exercise = library.find((e) => e.id === planned.exercise_id)!;
      for (let i = 0; i < sets; i++) {
        await logSet({ workoutId: workout.id, plannedExerciseId: planned.id, exercise, draft: { reps: 8, load: 135, rir: 2, warmup: i === 0, pain: false, note: "" }, now: new Date(NOW.getTime() + (i + 1) * 60_000) });
      }
    }
    mock.params = new URLSearchParams(`id=${workout.id}`);
    mock.workoutData = await loadWorkoutData(workout.id);
    mock.sets = await loadWorkoutSets(workout.id);
    return workout;
  }

  it("opens the first exercise with the entry form prefilled from the plan", async () => {
    await inProgress();
    const out = html(<WorkoutScreen />);
    const words = text(out);
    expect(words).toContain("Push");
    expect(words).toContain("Barbell bench press");
    expect(words).toContain("Set 1 of 4");
    expect(words).toContain("4 sets of 6 to 10 at 2 RIR");
    expect(words).toContain("Log set 1");
    expect(out).toContain('aria-label="Increase Reps"');
    expect(out).toContain('aria-label="Increase Weight"');
    expect(out).toContain('aria-label="Increase RIR"');
    expect(words).toContain("Warmup");
    expect(words).toContain("Pain");
    expect(words).toContain("Swap exercise");
    expect(words).toContain("Log at least one set to finish.");
    expect(words).toContain("Discard workout");
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Log set 1/);
    // One collapsed Next row names the next exercise and counts the rest.
    expect(words).toMatch(/Next Seated dumbbell shoulder press\. 4 more/);
    expect(out).toMatch(/aria-expanded="false"[^>]*>\s*<span>Next</);
    // With no rest running the clock shows the session, and there is no rest strip.
    expect(words).toContain("Elapsed");
    expect(out).not.toContain('aria-label="Rest timer controls"');
    expectNamedButtons(out);
  });

  it("lists logged sets, counts only work sets, and enables finishing", async () => {
    await inProgress(3);
    const out = html(<WorkoutScreen />);
    const words = text(out);
    expect(words).toContain("Set 3 of 4");
    expect(words).toContain("Warmup");
    expect(words).toContain("Set 1");
    expect(words).toContain("135 lb × 8 at 2 RIR");
    // The Log set band is red and carries the values being logged.
    expect(out).toMatch(/<button[^>]*bg-red[^>]*>[\s\S]*?Log set 3[\s\S]*?135 × 8, 2 RIR/);
    expect(out).toContain('aria-label="Edit warmup: 8 reps at 135 lb"');
    expect(out).toContain('aria-label="Edit set 1: 8 reps at 135 lb, 2 RIR"');
    expect(words).toContain("Log set 3");
    expect(words).not.toContain("Log at least one set to finish.");
    expectNamedButtons(out);
  });

  it("shows the finished workout with what the engine changed", async () => {
    await onboard(library);
    const today = (await loadToday(null))!;
    const workout = await trainDay(today.ctx.day.id, 10, NOW);
    await finish(workout.id, new Date(NOW.getTime() + 3_000_000), { session_rpe: 8 });
    mock.params = new URLSearchParams(`id=${workout.id}`);
    mock.workoutData = await loadWorkoutData(workout.id);
    mock.sets = await loadWorkoutSets(workout.id);
    mock.session = await loadSessionData(workout.id);
    const out = html(<WorkoutScreen />);
    const words = text(out);
    expect(words).toContain("Workout complete");
    expect(words).toContain("What changes next time");
    expect(words).toContain("What you did");
    expect(words).toContain("Effort 8 of 10");
    expect(words).toContain("Barbell bench press");
    expect(out).toContain('href="/today"');
    expectNamedButtons(out);
  });

  it("handles an unknown, discarded or program-less workout", async () => {
    mock.params = new URLSearchParams("id=zzz");
    mock.workoutData = null;
    mock.sets = [];
    expect(text(html(<WorkoutScreen />))).toContain("Workout not found");
    mock.params = new URLSearchParams();
    expect(text(html(<WorkoutScreen />))).toContain("No workout selected");
    await inProgress();
    mock.workoutData = { ...(mock.workoutData as object), workout: { ...(mock.workoutData as { workout: object }).workout, status: "abandoned" } };
    expect(text(html(<WorkoutScreen />))).toContain("This workout was discarded");
    mock.workoutData = { ...(mock.workoutData as object), workout: { ...(mock.workoutData as { workout: object }).workout, status: "in_progress" }, ctx: null };
    expect(text(html(<WorkoutScreen />))).toContain("This workout has no program day");
  });
});

describe("rest clock", () => {
  const onChange = () => {};

  it("counts down in a red depletion bar, names the next set and offers the rest controls", () => {
    const rest = { endsAt: (mock.now as number) + 176_000, total: 180 };
    const clock = html(<RestClock rest={rest} onChange={onChange} next="Set 2 next" />);
    expect(clock).toContain('role="timer"');
    expect(clock).toContain("2:56");
    expect(clock).toContain("Set 2 next");
    expect(clock).toMatch(/bg-red[^>]*style="width:97\.\d+%"/);
    const strip = html(<RestControls rest={rest} onChange={onChange} />);
    expect(strip).toContain('aria-label="Take 15 seconds off the rest"');
    expect(strip).toContain('aria-label="Add 15 seconds to the rest"');
    expect(text(strip)).toContain("Skip");
  });

  it("says when the rest is over and offers to dismiss it", () => {
    const rest = { endsAt: (mock.now as number) - 5_000, total: 90 };
    expect(text(html(<RestClock rest={rest} onChange={onChange} next="Set 3 next" />))).toContain("Go Rest over");
    expect(text(html(<RestControls rest={rest} onChange={onChange} />))).toContain("Dismiss");
  });
});

describe("history", () => {
  it("lists workouts by month and links to the detail page", async () => {
    await onboard(library);
    const today = (await loadToday(null))!;
    const w = await trainDay(today.ctx.day.id, 9, NOW);
    await finish(w.id, new Date(NOW.getTime() + 3_000_000));
    mock.history = await loadHistory(30);
    const out = html(<HistoryScreen />);
    const words = text(out);
    expect(words).toContain("October 2026");
    expect(words).toContain("1 finished workout");
    expect(words).toContain("Push");
    expect(out).toContain(`href="/history/session?id=${w.id}"`);
    expect(words).not.toContain("Show older workouts");
  });

  it("offers older workouts only when there are more", async () => {
    mock.history = { total: 40, rows: [] };
    mock.history = { total: 40, rows: [{ workout: { id: "w", started_at: "2026-10-15T17:00:00Z", completed_at: "2026-10-15T18:00:00Z" }, dayName: "Push", workSets: 12 }] };
    expect(text(html(<HistoryScreen />))).toContain("Show older workouts");
  });

  it("explains an empty history", () => {
    mock.history = { total: 0, rows: [] };
    expect(text(html(<HistoryScreen />))).toContain("No finished workouts yet");
  });

  it("shows a session from history with a delete option", async () => {
    await onboard(library);
    const today = (await loadToday(null))!;
    const w = await trainDay(today.ctx.day.id, 9, NOW);
    await finish(w.id, new Date(NOW.getTime() + 3_000_000));
    mock.params = new URLSearchParams(`id=${w.id}`);
    mock.session = await loadSessionData(w.id);
    const out = html(<SessionScreen />);
    const words = text(out);
    expect(words).toContain("History");
    expect(words).toContain("Delete workout");
    expect(words).not.toContain("Workout complete");
    expect(words).toContain("Set 1");
    expectNamedButtons(out);
    mock.session = null;
    expect(text(html(<SessionScreen />))).toContain("This workout is not on this device.");
  });
});

describe("program", () => {
  it("shows the day chips and every exercise of the next day", async () => {
    await onboard(library);
    await loadShared();
    const out = html(<ProgramScreen />);
    const words = text(out);
    expect(words).toContain("Push / Pull / Legs (3 day), 3 days a week");
    expect(out).toContain('aria-label="Program days"');
    expect(out.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(words).toContain("Push. 6 exercises, Gym");
    expect(words).toContain("Barbell bench press");
    expect(words).toContain("Add an exercise");
    expectNamedButtons(out);
  });

  it("offers to build a program when none is active", async () => {
    await onboard(library);
    await loadShared();
    mock.active = null;
    const out = html(<ProgramScreen />);
    expect(text(out)).toContain("Create program");
    expect(text(out)).toContain("Build it for");
    mock.equipment = [];
    expect(text(html(<ProgramScreen />))).toContain("Set up FORGE");
  });

  it("does not offer to create a program before the first full pull", async () => {
    await onboard(library);
    await loadShared();
    mock.active = null;
    mock.sync = { ...mock.sync, hydrated: false };
    const out = text(html(<ProgramScreen />));
    expect(out).not.toContain("Create program");
    expect(out).toContain("Loading your data");
  });
});

describe("log", () => {
  it("shows the recovery check-in with every rating labelled", () => {
    mock.profile = { unit: "lb" };
    mock.recovery = [];
    const out = html(<LogScreen />);
    const words = text(out);
    expect(words).toContain("Sleep last night");
    for (const label of ["Sleep quality", "Soreness", "Energy", "Stress"]) expect(words).toContain(label);
    expect(out).toContain('aria-label="Soreness, 1 is none, 5 is very sore"');
    expect(words).toContain("Save check-in");
    expect(out).toContain('type="date"');
    expect(out).toContain('max="2026-10-15"');
    expectNamedButtons(out);
  });

  it("shows a saved check-in as an update", () => {
    mock.profile = { unit: "kg" };
    mock.live = { id: "r", date: "2026-10-15", sleep_hours: 7.5, sleep_quality: 4, soreness: 2, energy: 4, stress: 1, notes: null };
    mock.recovery = [mock.live];
    const words = text(html(<LogScreen />));
    expect(words).toContain("Update check-in");
    expect(words).toContain("Recent check-ins");
    expect(words).toContain("7.5 h sleep, soreness 2, energy 4, stress 1");
  });
});
