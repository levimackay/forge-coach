import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { Exercise } from "@/lib/domain/types";
import { getDb } from "@/lib/local/db";
import { loadActiveProgram, loadBodyMeasurements, loadEquipmentProfiles, loadExerciseLibrary, loadProfile, loadRecoveryLogs, loadWorkoutSets, loadWorkouts } from "@/lib/local/hooks";
import { freshLocalState } from "@/lib/local/test-support";
import { loadHistory, loadSessionData, loadToday, loadWorkoutData } from "./queries";
import { emptyDraft, stepsFor } from "./onboarding-model";
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

import { HistoryScreen } from "./history-screen";
import { LogScreen } from "./log-screen";
import { EndSheet } from "./end-sheet";
import { MoreSheet } from "./more-sheet";
import { OnboardingFlow, Question } from "./onboarding-flow";
import { ProgramScreen } from "./program-screen";
import { RestScreen } from "./rest-screen";
import type { Slot } from "./set-entry";
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
  it("opens on one question with a named control for everything", async () => {
    mock.profile = null;
    mock.library = library;
    const out = html(<OnboardingFlow />);
    const words = text(out);
    expect(words).toContain("What should we call you?");
    expect(words).toContain("Name");
    expect(words).toContain("Continue");
    expect(words).not.toContain("Back");
    expect(words).not.toMatch(/Step \d of/);
    expect(out.match(/<h1/g)).toHaveLength(1);
    expectNamedButtons(out);
  });

  it("does not show the form again once the account is set up", async () => {
    mock.profile = { user_id: "u", onboarded_at: "2026-10-01T00:00:00Z", unit: "lb", display_name: "Levi", bodyweight: 180, timezone: "UTC" };
    mock.library = library;
    const out = html(<OnboardingFlow />);
    expect(out).toContain('aria-label="Opening Today"');
    expect(text(out)).not.toContain("What should we call you?");
  });

  it("puts each question on its own step, with the control that answers it", () => {
    const draft = { ...emptyDraft(null), name: "Levi", bodyweight: 180 };
    const step = (id: Parameters<typeof Question>[0]["step"]) =>
      html(<Question step={id} draft={draft} errors={{}} patch={() => {}} library={library} offline={false} syncing={false} />);
    expect(step("unit")).toContain('name="unit"');
    expect(text(step("unit"))).toContain("Kilograms");
    expect(step("bodyweight")).toContain('aria-label="Increase Weight"');
    expect(text(step("places"))).toContain("At home");
    expect(step("equipment")).toContain('role="switch"');
    expect(text(step("goal"))).toContain("Build muscle");
    expect(text(step("days"))).toContain("6 days a week");
    expect(step("focus")).toContain('aria-pressed="false"');
    for (const id of stepsFor(draft)) expectNamedButtons(step(id));
  });

  it("ends on the program it will build, in plain words", () => {
    const draft = { ...emptyDraft(null), name: "Levi", bodyweight: 180, atGym: true, main: "gym" as const };
    const words = text(
      html(<Question step="program" draft={draft} errors={{}} patch={() => {}} library={library} offline={false} syncing={false} />),
    );
    expect(words).toContain("Push.");
    expect(words).toContain("Barbell bench press");
    expect(words).toContain("You pick your weights on the first workout.");
    expect(words).not.toContain("RIR");
  });
});

describe("today", () => {
  it("shows the day, each lift with its weight, and one way to start", async () => {
    await onboard(library);
    await loadShared();
    mock.today = await loadToday(null);
    const out = html(<TodayScreen />);
    const words = text(out);
    expect(words).toContain("Push.");
    expect(words).toContain("Barbell bench press.");
    expect(words).toContain("Pick a weight");
    expect(words).toContain("Start workout");
    // The only way to the rest of the app is one link, and the place is one word.
    expect(words).toContain("Program and settings");
    expect(out).toContain('href="/more"');
    expect(out).toContain('aria-label="Gym. Switch to Home."');
    // Nothing the rough cut took off the screen.
    for (const gone of ["Thursday, October 15", "Next in", "How did you recover", "Workout history", "Check-in", "RIR", "sets of", "Train a different day"]) {
      expect(words).not.toContain(gone);
    }
    // A fresh program has nothing the engine changed, so no Why? either.
    expect(words).not.toContain("Why?");
    expectNamedButtons(out);
  });

  it("offers the other days from the day name", async () => {
    await onboard(library);
    await loadShared();
    mock.today = await loadToday(null);
    expect(html(<TodayScreen />)).toContain('aria-label="Push. Choose a different day."');
  });

  it("resumes a workout in progress instead of offering a second start", async () => {
    await onboard(library);
    await loadShared();
    const today = (await loadToday(null))!;
    const workout = await startWorkout({ programDayId: today.ctx.day.id, equipmentProfileId: null, now: NOW });
    mock.today = await loadToday(null);
    const out = html(<TodayScreen />);
    expect(text(out)).toContain("Resume workout");
    expect(out).toContain(`href="/workout?id=${workout.id}"`);
    expect(text(out)).not.toContain("Start workout");
  });

  it("says what the engine changed after a finished session, with a Why? only on those lifts", async () => {
    await onboard(library);
    const first = (await loadToday(null))!;
    const w = await trainDay(first.ctx.day.id, 10, NOW);
    await finish(w.id, new Date(NOW.getTime() + 3_000_000));
    clock(new Date(NOW.getTime() + 2 * 86_400_000));
    await loadShared();
    mock.now = NOW.getTime() + 2 * 86_400_000;
    mock.today = await loadToday(first.ctx.day.id);
    const out = html(<TodayScreen />);
    const words = text(out);
    expect(words).toMatch(/Up from last time|More reps than last time/);
    expect(words).toContain("Why?");
    expect(out).toMatch(/aria-label="Why, [^"]+"/);
    // The reason itself waits behind the link.
    expect(words).not.toMatch(/so the (weight|bar|dumbbells|assistance)|aim for/i);
  });

  it("keeps sync noise off the screen", async () => {
    await onboard(library);
    await loadShared();
    mock.today = await loadToday(null);
    mock.sync = { ...mock.sync, pending: 4, online: false };
    const words = text(html(<TodayScreen />));
    expect(words).not.toMatch(/sync|offline|saved on this device/i);
  });

  it("sends a new account to setup and an onboarded one without a program to Program", async () => {
    mock.today = null;
    mock.profile = null;
    expect(text(html(<TodayScreen />))).toContain("Finish setting up");
    mock.profile = { onboarded_at: "2026-10-01T00:00:00Z" };
    expect(text(html(<TodayScreen />))).toContain("No program yet");
    mock.profile = null;
    mock.sync = { ...mock.sync, hydrated: false };
    expect(text(html(<TodayScreen />))).not.toContain("Finish setting up");
  });

  it("waits for the first full pull before offering to build a program", () => {
    mock.today = null;
    mock.profile = { onboarded_at: "2026-10-01T00:00:00Z" };
    mock.sync = { ...mock.sync, hydrated: false };
    const out = text(html(<TodayScreen />));
    expect(out).not.toContain("No program yet");
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

  it("opens the first exercise on one set, with the numbers prefilled from the plan", async () => {
    await inProgress();
    const out = html(<WorkoutScreen />);
    const words = text(out);
    expect(words).toContain("Barbell bench press.");
    expect(words).toContain("Set 1 of 4");
    expect(out).toContain('aria-label="Reps, 6 reps. Change."');
    // A first time on a lift has no weight yet, so Done waits for one.
    expect(out).toContain('aria-label="Weight, not set. Change."');
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Done/);
    // The two top links, and nothing else that is not the set.
    expect(words).toContain("More");
    expect(words).toContain("End workout");
    for (const gone of ["RIR", "Warmup", "Pain", "Swap exercise", "Discard workout", "Elapsed", "Next Seated", "Log set"]) {
      expect(words).not.toContain(gone);
    }
    expectNamedButtons(out);
  });

  it("asks how it felt with Good already chosen", async () => {
    await inProgress();
    const out = html(<WorkoutScreen />);
    expect(text(out)).toContain("How did it feel?");
    const group = out.match(/<div role="group" aria-label="How did it feel"[\s\S]*?<\/div>/)![0];
    expect(group.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(group).toMatch(/aria-pressed="true"[^>]*>\s*<span[^>]*>Good</);
    for (const word of ["Easy", "Good", "Hard"]) expect(group).toContain(word);
  });

  it("carries the weight and reps of the last set into the next one, and Done is a red band", async () => {
    await inProgress(3);
    const out = html(<WorkoutScreen />);
    const words = text(out);
    expect(words).toContain("Set 3 of 4");
    expect(out).toContain('aria-label="Weight, 135 lb. Change."');
    expect(out).toContain('aria-label="Reps, 8 reps. Change."');
    expect(out).toMatch(/<button[^>]*bg-red[^>]*>[\s\S]*?Done/);
    expect(out).not.toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Done/);
  });

  it("shows the finished workout with what changes next time", async () => {
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
    expect(words).toContain("Workout done.");
    expect(words).toContain("Next time.");
    expect(words).toContain("Barbell bench press.");
    expect(words).toMatch(/Up from last time|More reps than last time/);
    expect(out).toMatch(/aria-label="Why, [^"]+"/);
    expect(out).toContain('href="/today"');
    expect(words).not.toMatch(/Effort 8|What you did|RIR/);
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

describe("more sheet", () => {
  const slot = (id: string, name: string, workSets: number) =>
    ({ item: { planned: { id }, prescription: { sets: 3 } }, exercise: { name }, logged: [], workSets }) as unknown as Slot;
  const sets = [
    { set: { id: "s1", reps: 8, load: 95, is_warmup: true, pain: false }, number: 0 },
    { set: { id: "s2", reps: 6, load: 135, is_warmup: false, pain: true }, number: 1 },
  ] as unknown as { set: import("@/lib/domain/types").WorkoutSet; number: number }[];
  const base = {
    open: true,
    onClose: () => {},
    unit: "lb" as const,
    sets,
    slots: [slot("a", "Bench press", 2), slot("b", "Row", 0)],
    currentId: "a",
    canAddSet: false,
    onEditSet: () => {},
    onSwap: () => {},
    onPickExercise: () => {},
    onAddSet: () => {},
  };

  it("keeps the warmup and hurt switches, the swap, the sets so far and the other exercises", () => {
    const out = html(<MoreSheet {...base} flags={{ draft: { warmup: false, pain: false, note: "" }, onChange: () => {} }} />);
    const words = text(out);
    expect(out.match(/role="switch"/g)).toHaveLength(2);
    for (const label of ["Warmup set", "Something hurt", "Note", "Swap exercise", "Sets so far.", "Exercises."]) expect(words).toContain(label);
    expect(words).toContain("Warmup 95 lb × 8");
    expect(words).toContain("Set 1 135 lb × 6 Hurt");
    expect(words).toContain("Bench press. Now");
    expect(words).toContain("Row. 0 of 3");
    expect(out).toContain('href="/today"');
    expect(words).toContain("Back to Today");
    expect(words).not.toContain("Add a set");
    expect(words).not.toContain("RIR");
    expectNamedButtons(out);
  });

  it("offers one more set only for an exercise that is done, and says why a hurt set matters", () => {
    const words = text(html(<MoreSheet {...base} canAddSet flags={{ draft: { warmup: false, pain: true, note: "" }, onChange: () => {} }} />));
    expect(words).toContain("Add a set");
    expect(words).toContain("This lift stays at its weight next time.");
  });

  it("has no switches when there is no set being entered", () => {
    const out = html(<MoreSheet {...base} currentId={null} flags={null} />);
    expect(out).not.toContain('role="switch"');
    expect(text(out)).not.toContain("Swap exercise");
  });
});

describe("end sheet", () => {
  const props = { open: true, onClose: () => {}, untrained: [] as string[], onFinish: async () => {}, onDiscard: async () => {} };

  it("asks how it felt in three words and offers one way to finish", () => {
    const out = html(<EndSheet {...props} workSets={5} untrained={["Face pull"]} />);
    const words = text(out);
    expect(words).toContain("How was the workout?");
    for (const word of ["Easy", "Good", "Hard"]) expect(words).toContain(word);
    expect(out.match(/aria-pressed="true"/g)).toBeNull();
    expect(words).toContain("Finish workout");
    expect(words).toContain("Not done: Face pull.");
    expect(words).toContain("Discard workout");
    expect(words).not.toMatch(/RPE|Finish and update/);
    expectNamedButtons(out);
  });

  it("has nothing to finish when no set was logged", () => {
    const words = text(html(<EndSheet {...props} workSets={0} />));
    expect(words).toContain("Nothing has been logged yet.");
    expect(words).toContain("Keep going");
    expect(words).not.toContain("How was the workout?");
  });
});

describe("rest screen", () => {
  const onDone = () => {};
  const next = { name: "Barbell back squat", set: "Set 2 of 3" };

  it("counts down in big figures under a red bar that empties, and names what is next", () => {
    const rest = { endsAt: (mock.now as number) + 151_000, total: 180 };
    const out = html(<RestScreen rest={rest} next={next} onDone={onDone} />);
    const words = text(out);
    expect(out).toContain('role="timer"');
    expect(out).toContain('aria-label="2 minutes 31 seconds left"');
    expect(words).toContain("Rest.");
    expect(words).toContain("2:31");
    expect(words).toContain("Next up");
    expect(words).toContain("Barbell back squat.");
    expect(words).toContain("Set 2 of 3");
    expect(out).toMatch(/bg-red[^>]*style="width:83\.\d+%"/);
    expect(words).toContain("Skip rest");
    expect(words).not.toMatch(/15s|−15|\+15/);
    expectNamedButtons(out);
  });

  it("has Skip rest as its one control", () => {
    const rest = { endsAt: (mock.now as number) + 60_000, total: 90 };
    const out = html(<RestScreen rest={rest} next={null} onDone={onDone} />);
    expect(out.match(/<button/g)).toHaveLength(1);
    expect(out).toMatch(/<button[^>]*bg-red[^>]*>[\s\S]*?Skip rest/);
    expect(text(out)).not.toContain("Next up");
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
    expect(words).toContain("October 2026.");
    expect(words).toContain("Push.");
    expect(out).toContain('href="/more"');
    expect(words).not.toMatch(/finished workout|sets/);
    expect(out).toContain(`href="/history/session?id=${w.id}"`);
    expect(words).not.toContain("Show older");
  });

  it("offers older workouts only when there are more", async () => {
    mock.history = { total: 40, rows: [] };
    mock.history = { total: 40, rows: [{ workout: { id: "w", started_at: "2026-10-15T17:00:00Z", completed_at: "2026-10-15T18:00:00Z" }, dayName: "Push", workSets: 12 }] };
    expect(text(html(<HistoryScreen />))).toContain("Show older");
  });

  it("explains an empty history", () => {
    mock.history = { total: 0, rows: [] };
    expect(text(html(<HistoryScreen />))).toContain("No workouts yet");
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
    expect(words).toContain("What changed");
    expect(words).toContain("Delete workout");
    expect(words).not.toContain("Workout done.");
    expect(words).toContain("Set 1");
    expect(words).not.toMatch(/RIR|Duration|Work sets/);
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
    expect(words).toContain("Program.");
    expect(out).toContain('aria-label="Program days"');
    expect(out.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(words).toContain("Barbell bench press.");
    expect(words).toContain("4 sets of 6 to 10");
    expect(words).toContain("Add an exercise");
    expect(words).not.toMatch(/RIR|days a week|Changes save/);
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
    expect(words).toContain("Sleep and body.");
    expect(words).toContain("Save");
    // Today is the default, so the date field waits behind one small question.
    expect(out).toContain('aria-label="Not today? Change the date."');
    expect(out).not.toContain('type="date"');
    expectNamedButtons(out);
  });

  it("shows a saved check-in as an update", () => {
    mock.profile = { unit: "kg" };
    mock.live = { id: "r", date: "2026-10-15", sleep_hours: 7.5, sleep_quality: 4, soreness: 2, energy: 4, stress: 1, notes: null };
    mock.recovery = [mock.live];
    const words = text(html(<LogScreen />));
    expect(words).toContain("Earlier");
    expect(words).toContain("7.5 h sleep, soreness 2, energy 4, stress 1");
  });
});
