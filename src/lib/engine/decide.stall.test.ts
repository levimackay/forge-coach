import { describe, expect, it } from "vitest";
import { decideNext } from "./decide";
import { ASSISTED, BENCH, DB_CURL, GYM, SQUAT, makeEquipment, makeInput, makeSets, session } from "./testkit";

const at = (days: number, reps: number[], load = 100, rir: number | null = 2, exercise = BENCH.id) =>
  session(days, makeSets(reps, { load, rir, exercise }));

describe("missing the bottom of the range", () => {
  it("holds after a single miss and says how far off the set was", () => {
    const d = decideNext(makeInput({ history: [session(3, makeSets([8, 6, 5], { load: 100, rir: [2, 1, 0] }))] }));
    expect(d.action).toBe("hold");
    expect(d.after.load).toBe(100);
    expect(d.reason).toBe("Your lowest set was 5 reps at 0 RIR against a minimum of 6, so 100 lb stays the same until every set reaches 6.");
  });

  it("omits the RIR note when it was not logged", () => {
    const d = decideNext(makeInput({ history: [at(3, [8, 6, 5], 100, null)] }));
    expect(d.reason).toBe("Your lowest set was 5 reps against a minimum of 6, so 100 lb stays the same until every set reaches 6.");
  });

  it("states the real deload when the equipment step makes it bigger than 10%", () => {
    const dumbbells = makeEquipment({ equipment: ["dumbbells"], dumbbell_increment: 5 });
    const curls = (days: number) => at(days, [11, 11, 11], 15, 2, DB_CURL.id);
    const d = decideNext(
      makeInput({ exercise: DB_CURL, equipment: dumbbells, prescription: { load: 15 }, history: [curls(3), curls(7), curls(11)] }),
    );
    expect(d.action).toBe("deload");
    expect(d.after.load).toBe(10);
    expect(d.reason).toBe("You made no progress for 2 sessions in a row at 15 lb, so the load drops 33% to 10 lb to rebuild.");
    expect(d.inputs).toMatchObject({ cut_pct: 0.1, actual_cut_pct: 0.33 });
  });

  it("deloads after two missed sessions in a row", () => {
    const d = decideNext(makeInput({ history: [at(3, [6, 5, 5]), at(7, [6, 6, 5])] }));
    expect(d.action).toBe("deload");
    expect(d.after.load).toBe(90);
    expect(d.reason).toBe("You finished under 6 reps for 2 sessions in a row at 100 lb, so the load drops 10% to 90 lb to rebuild.");
  });

  it("rounds a deload down to a load the equipment can make", () => {
    const squat = decideNext(
      makeInput({ exercise: SQUAT, prescription: { load: 205 }, history: [at(3, [5, 5, 5], 205, 2, SQUAT.id), at(7, [5, 5, 5], 205, 2, SQUAT.id)] }),
    );
    expect(squat.after.load).toBe(180);
    const curl = decideNext(
      makeInput({ exercise: DB_CURL, prescription: { rep_min: 8, rep_max: 12, load: 25 }, history: [at(3, [6, 6, 6], 25, 2, DB_CURL.id), at(7, [6, 6, 6], 25, 2, DB_CURL.id)] }),
    );
    expect(curl.action).toBe("deload");
    expect(curl.after.load).toBe(20);
  });

  it("deloads in kilograms", () => {
    const d = decideNext(makeInput({ unit: "kg", prescription: { load: 80 }, history: [at(3, [5, 5, 5], 80), at(7, [5, 5, 5], 80)] }));
    expect(d.after.load).toBe(70);
    expect(d.reason).toContain("70 kg");
  });

  it("will not deload a load down to nothing", () => {
    const d = decideNext(
      makeInput({ exercise: DB_CURL, prescription: { load: 5 }, history: [at(3, [4, 4, 4], 5, 2, DB_CURL.id), at(7, [4, 4, 4], 5, 2, DB_CURL.id)] }),
    );
    expect(d.action).toBe("hold");
    expect(d.after.load).toBe(5);
  });

  it("gives assisted work more help instead of less", () => {
    const d = decideNext(
      makeInput({
        exercise: ASSISTED,
        equipment: GYM,
        prescription: { load: 40 },
        history: [at(3, [4, 4, 4], 40, 2, ASSISTED.id), at(7, [4, 4, 4], 40, 2, ASSISTED.id)],
      }),
    );
    expect(d.action).toBe("deload");
    expect(d.after.load).toBe(45);
    expect(d.reason).toContain("the assistance rises 13% to 45 lb");
  });
});

describe("no improvement at the same load", () => {
  it("deloads after two sessions that did not beat their predecessor", () => {
    const d = decideNext(makeInput({ history: [at(3, [8, 7, 7]), at(7, [8, 7, 7]), at(11, [8, 7, 7])] }));
    expect(d.action).toBe("deload");
    expect(d.after.load).toBe(90);
    expect(d.reason).toBe("You made no progress for 2 sessions in a row at 100 lb, so the load drops 10% to 90 lb to rebuild.");
  });

  it("keeps pushing for reps after one flat session", () => {
    const d = decideNext(makeInput({ history: [at(3, [8, 7, 7]), at(7, [8, 7, 7])] }));
    expect(d.action).toBe("increase_reps");
    expect(d.inputs.stall_streak).toBe(1);
  });

  it("restarts the count when a session improves", () => {
    const d = decideNext(makeInput({ history: [at(3, [8, 8, 7]), at(7, [8, 7, 7]), at(11, [8, 7, 7])] }));
    expect(d.action).toBe("increase_reps");
    expect(d.inputs.stall_streak).toBe(0);
  });

  it("counts a heavier load as progress even with fewer reps", () => {
    const d = decideNext(makeInput({ history: [at(3, [6, 6, 6], 105), at(7, [8, 8, 8], 100), at(11, [8, 8, 8], 100)] }));
    expect(d.action).toBe("increase_reps");
  });

  it("does not call a lighter load a stall", () => {
    const d = decideNext(makeInput({ history: [at(3, [8, 7, 7], 90), at(7, [8, 7, 7], 100), at(11, [8, 7, 7], 100)] }));
    expect(d.action).toBe("increase_reps");
    expect(d.inputs.stall_streak).toBe(0);
  });

  it("does not stack stalls onto a session that reached the ceiling", () => {
    const d = decideNext(makeInput({ history: [at(3, [10, 10, 10]), at(7, [10, 10, 10]), at(11, [10, 10, 10])] }));
    expect(d.action).toBe("increase_load");
  });

  it("does not compare against sessions of a different exercise", () => {
    const d = decideNext(
      makeInput({ history: [at(3, [8, 7, 7]), at(7, [8, 7, 7], 100, 2, "ex-db-press"), at(11, [8, 7, 7], 100, 2, "ex-db-press")] }),
    );
    expect(d.action).toBe("increase_reps");
  });

  it("does not treat an unfinished session as evidence", () => {
    const d = decideNext(makeInput({ history: [at(3, [8, 7]), at(7, [8, 7, 7]), at(11, [8, 7, 7])] }));
    expect(d.action).toBe("hold");
    expect(d.inputs.rule).toBe("incomplete_session");
  });
});

describe("stalls while recovery is poor", () => {
  it("repeats the load instead of cutting it", () => {
    const d = decideNext(
      makeInput({
        history: [at(3, [6, 5, 5]), at(7, [6, 6, 5])],
        recovery: [
          { date: "2026-10-15", sleep_hours: 5, soreness: 2 },
          { date: "2026-10-14", sleep_hours: 8, soreness: 4 },
        ],
      }),
    );
    expect(d.action).toBe("hold");
    expect(d.inputs.rule).toBe("stall_poor_recovery");
    expect(d.after.load).toBe(100);
    expect(d.reason).toBe("You finished under 6 reps for 2 sessions in a row but your recovery has been poor (2 poor days), so 100 lb stays the same while you recover.");
  });
});
