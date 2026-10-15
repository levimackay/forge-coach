import type { Exercise, PrescriptionSnapshot, ProgressionAction, Unit, Uuid } from "@/lib/domain/types";
import { ENGINE_CONFIG as C } from "./config";
import { recoveryStatus, type RecoveryStatus } from "./history";
import { equipmentLabel, ladderStep, loadIncrement, loadKind, missingEquipment, substituteForEquipment } from "./ladder";
import type { EngineDecision, EngineInput, EngineSet, EquipmentLike, SessionHistoryEntry } from "./types";
import { ceilToStep, daysBetween, floorToStep, fmtLoad, isPositive, plural, round2, sameLoad, sum } from "./util";

interface Summary {
  at: string;
  exerciseId: Uuid;
  // The first `sets` work sets, in set order. Warmups never appear here.
  considered: EngineSet[];
  complete: boolean;
  minReps: number;
  total: number;
  // Heaviest load of the session (lightest assistance for assisted work).
  workLoad: number | null;
  uniform: boolean;
}

interface LoadProfile {
  loaded: boolean;
  dir: 1 | -1;
  base: number | null;
  increment: number | null;
  nextLoad: number | null;
  canRaise: boolean;
  jumpPct: number;
  ceiling: number;
  rungUp: Exercise | null;
  rungDown: Exercise | null;
}

interface Ctx {
  input: EngineInput;
  before: PrescriptionSnapshot;
  exercise: Exercise;
  unit: Unit;
  newest: Summary | null;
  run: Summary[];
  recovery: RecoveryStatus;
  gapDays: number | null;
  // Pain-flagged sets, warmups included, in the newest session with work sets and any
  // later session that had only warmups (which summarize drops).
  painCount: number;
  lp: LoadProfile;
}

function summarize(entry: SessionHistoryEntry, prescribedSets: number, assisted: boolean): Summary | null {
  const work = entry.sets.filter((s) => !s.is_warmup).sort((a, b) => a.set_index - b.set_index);
  if (work.length === 0) return null;
  const counts = new Map<Uuid, number>();
  for (const s of work) counts.set(s.exercise_id, (counts.get(s.exercise_id) ?? 0) + 1);
  let exerciseId = work[0].exercise_id;
  for (const [id, n] of counts) if (n > (counts.get(exerciseId) ?? 0)) exerciseId = id;
  const wanted = Math.max(1, prescribedSets);
  const mine = work.filter((s) => s.exercise_id === exerciseId);
  const considered = mine.slice(0, wanted);
  const loads = considered.map((s) => s.load).filter((l): l is number => l !== null);
  const workLoad = loads.length ? (assisted ? Math.min(...loads) : Math.max(...loads)) : null;
  const reps = considered.map((s) => s.reps);
  return {
    at: entry.completed_at,
    exerciseId,
    considered,
    complete: mine.length >= wanted,
    minReps: Math.min(...reps),
    total: sum(reps),
    workLoad,
    uniform: loads.every((l) => sameLoad(l, workLoad)),
  };
}

// What the athlete really moves at `base`: bodyweight minus the assistance on assisted
// work, bodyweight plus the added weight on a weighted ladder rung, the load otherwise.
// Null when that depends on a bodyweight nobody recorded.
function movedLoad(exercise: Exercise, base: number, bodyweight: number | null | undefined): number | null {
  if (exercise.load_type === "assisted") return isPositive(bodyweight) && bodyweight > base ? bodyweight - base : null;
  if (exercise.progression_group !== null) return isPositive(bodyweight) ? bodyweight + base : null;
  return base > 0 ? base : null;
}

function profileFor(
  exercise: Exercise,
  library: Exercise[],
  equipment: EquipmentLike | null,
  unit: Unit,
  base: number | null,
  repMax: number,
  bodyweight: number | null | undefined,
): LoadProfile {
  const dir = exercise.load_type === "assisted" ? -1 : 1;
  const rungUp = ladderStep(exercise, library, equipment, 1);
  const rungDown = ladderStep(exercise, library, equipment, -1);
  const loaded = base !== null;

  let increment: number | null = null;
  let nextLoad: number | null = null;
  let canRaise = false;
  let jumpPct = 0;
  if (base !== null) {
    increment = loadIncrement(exercise, equipment, unit);
    nextLoad = dir === 1 ? round2(base + increment) : round2(Math.max(0, base - increment));
    const heaviest = loadKind(exercise) === "dumbbell" ? equipment?.dumbbell_max : null;
    canRaise = dir === 1 ? !(isPositive(heaviest) && nextLoad > heaviest + 1e-9) : base > 0;
    const moved = movedLoad(exercise, base, bodyweight);
    jumpPct = moved ? (Math.abs(nextLoad - base) * 100) / moved : 0;
  }

  // Too big a jump is not taken: the rep ceiling stretches instead, then the jump is made.
  const headroom = canRaise && jumpPct > C.maxJumpPct + 1e-9 ? Math.ceil(jumpPct / C.jumpPctPerRep - 1e-9) : 0;
  let ceiling: number;
  if (loaded && canRaise) ceiling = Math.max(repMax, Math.min(repMax + headroom, C.repCap));
  else if (rungUp) ceiling = Math.min(repMax, C.repCap);
  else ceiling = Math.max(repMax, C.repCap);

  return { loaded, dir, base, increment, nextLoad, canRaise, jumpPct, ceiling, rungUp, rungDown };
}

// A logged weight far from the planned one is more likely a typo than a real change.
const implausible = (logged: number | null, planned: number | null): boolean =>
  logged !== null &&
  planned !== null &&
  logged > 0 &&
  planned > 0 &&
  Math.max(logged, planned) / Math.min(logged, planned) > C.loadMismatchRatio;

function buildLoadProfile(input: EngineInput, before: PrescriptionSnapshot, newest: Summary | null): LoadProfile {
  const { exercise, equipment, unit, library } = input;
  const logged = newest && newest.exerciseId === before.exercise_id ? newest.workLoad : null;
  const performed = implausible(logged, before.load) ? null : logged;
  const base = exercise.load_type === "bodyweight" ? null : (performed ?? before.load);
  return profileFor(exercise, library, equipment, unit, base, before.rep_max, input.bodyweight);
}

function makeCtx(input: EngineInput): Ctx {
  const { planned, exercise, unit, now } = input;
  if (!Number.isFinite(Date.parse(now))) throw new Error(`decideNext: now must be an ISO date-time, got "${now}"`);
  const before: PrescriptionSnapshot = {
    exercise_id: planned.exercise_id,
    sets: planned.sets,
    rep_min: planned.rep_min,
    rep_max: planned.rep_max,
    target_rir: planned.target_rir,
    load: planned.load,
  };
  const assisted = exercise.load_type === "assisted";
  const summaries = input.history
    .map((e) => summarize(e, planned.sets, assisted))
    .filter((s): s is Summary => s !== null)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, C.historyLimit);
  const newest = summaries[0] ?? null;
  const run = newest ? takeWhileSame(summaries, newest.exerciseId) : [];
  const exerciseGap = newest ? daysBetween(newest.at, now) : null;
  const dayGap = input.consistency.days_since_last_session;
  const gapDays = exerciseGap === null && dayGap === null ? null : Math.max(exerciseGap ?? 0, dayGap ?? 0);
  const sinceWork = newest ? Date.parse(newest.at) : Number.NEGATIVE_INFINITY;
  const painCount = input.history
    .filter((e) => Date.parse(e.completed_at) >= sinceWork)
    .reduce((n, e) => n + e.sets.filter((s) => s.pain).length, 0);
  return {
    input,
    before,
    exercise,
    unit,
    newest,
    run,
    recovery: recoveryStatus(input.recovery, now),
    gapDays,
    painCount,
    lp: buildLoadProfile(input, before, newest),
  };
}

function takeWhileSame(list: Summary[], exerciseId: Uuid): Summary[] {
  const out: Summary[] = [];
  for (const s of list) {
    if (s.exerciseId !== exerciseId) break;
    out.push(s);
  }
  return out;
}

function decide(
  ctx: Ctx,
  action: ProgressionAction,
  rule: string,
  patch: Partial<PrescriptionSnapshot>,
  reason: string,
  extra: Record<string, unknown> = {},
): EngineDecision {
  const { input, lp, newest, recovery } = ctx;
  return {
    action,
    before: ctx.before,
    after: { ...ctx.before, ...patch },
    reason,
    inputs: {
      rule,
      unit: ctx.unit,
      exercise_slug: ctx.exercise.slug,
      last_session_at: newest?.at ?? null,
      baseline_load: lp.base,
      effective_rep_max: lp.ceiling,
      gap_days: ctx.gapDays,
      recovery_poor_days: recovery.poor_days,
      recovery_logs_considered: recovery.considered,
      sessions_last_28d: input.consistency.sessions_last_28d,
      planned_last_28d: input.consistency.planned_last_28d,
      target_reps: null,
      ...extra,
    },
  };
}

const holdLoad = (ctx: Ctx): Partial<PrescriptionSnapshot> => (ctx.lp.loaded ? { load: ctx.lp.base } : {});

// "25 lb stays the same" for loaded work, the exercise name otherwise.
const stays = (ctx: Ctx, load: number | null): string =>
  load !== null && ctx.exercise.load_type !== "bodyweight"
    ? `${fmtLoad(load, ctx.unit)} stays the same`
    : `${ctx.exercise.name} stays the same`;

const planText = (p: PrescriptionSnapshot, unit: Unit): string =>
  `${p.load !== null ? `${fmtLoad(p.load, unit)} for ` : ""}${p.sets} sets of ${p.rep_min} to ${p.rep_max}`;

const repsList = (s: Summary): string => s.considered.map((x) => x.reps).join(", ");
const repsPhrase = (s: Summary): string =>
  s.considered.every((x) => x.reps === s.considered[0].reps) ? `${s.considered[0].reps} reps` : `${s.minReps} or more reps`;

function rirPhrase(s: Summary): string {
  const rirs = s.considered.map((x) => x.rir);
  if (rirs.some((r) => r === null)) return "";
  const known = rirs as number[];
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  return lo === hi ? ` at ${lo} RIR` : ` at ${lo} to ${hi} RIR`;
}

function equipmentRule(ctx: Ctx): EngineDecision | null {
  const { input, exercise } = ctx;
  const missing = missingEquipment(exercise, input.equipment);
  if (missing.length === 0 || !input.equipment) return null;
  const lacks = missing.map(equipmentLabel).join(" and ");
  const sub = substituteForEquipment(exercise, input.library, input.equipment);
  const facts = { missing_equipment: missing, equipment_profile: input.equipment.name };
  if (!sub) {
    return decide(
      ctx,
      "hold",
      "equipment_no_substitute",
      {},
      `${exercise.name} needs ${lacks}, which ${input.equipment.name} does not have, and nothing in your library matches it, so the plan stays as it is.`,
      { ...facts, substitute_exercise_id: null },
    );
  }
  return decide(
    ctx,
    "substitute_equipment",
    "equipment_substitute",
    { exercise_id: sub.id, rep_min: sub.default_rep_min, rep_max: sub.default_rep_max, load: null },
    `${exercise.name} needs ${lacks}, which ${input.equipment.name} does not have, so use ${sub.name} instead.`,
    { ...facts, substitute_exercise_id: sub.id, substitute_slug: sub.slug },
  );
}

// A bodyweight or assisted rung has its own rep range (harder rungs have lower ones). A weighted
// rung keeps the current range, the same way programs are built (templates/ppl.ts).
const rungRange = (rung: Exercise): Partial<Pick<PrescriptionSnapshot, "rep_min" | "rep_max">> =>
  rung.load_type === "external" ? {} : { rep_min: rung.default_rep_min, rep_max: rung.default_rep_max };

// The share of the load actually removed (or assistance added), which rounding to the
// equipment's step can make larger than the nominal cut.
const actualCut = (base: number, next: number): number => (base > 0 ? Math.abs(next - base) / base : 0);

// Load after taking `pct` off, rounded to a step the equipment can make (assisted work gets more help instead).
function easierLoad(base: number, pct: number, step: number, dir: 1 | -1): number {
  return dir === 1 ? Math.max(0, floorToStep(base * (1 - pct), step)) : ceilToStep(base * (1 + pct), step);
}

function gapRule(ctx: Ctx): EngineDecision | null {
  const days = ctx.gapDays;
  const { lp, exercise, before, unit } = ctx;
  if (days === null || days <= C.gap.normalMaxDays) return null;

  // Never raise above what was actually lifted last time, then cut from there.
  const logged = ctx.newest && ctx.newest.exerciseId === before.exercise_id ? ctx.newest.workLoad : null;
  const performed = implausible(logged, before.load) ? null : logged;
  let base: number | null = null;
  if (exercise.load_type !== "bodyweight") {
    const known = [performed, before.load].filter((l): l is number => l !== null);
    base = known.length ? (lp.dir === 1 ? Math.min(...known) : Math.max(...known)) : null;
  }
  // Nothing logged and no weight planned: there is nothing to adjust yet.
  if (base === null && !ctx.newest) return null;
  const lead = `It has been ${plural(days, "day")} since your last session`;
  const facts = { gap_days: days, gap_base_load: base };

  if (base === null) {
    if (days > C.gap.regressAfterDays && lp.rungDown) {
      return decide(ctx, "regress_variation", "gap_regress", { exercise_id: lp.rungDown.id, ...rungRange(lp.rungDown) }, `${lead}, so step back to ${lp.rungDown.name}.`, facts);
    }
    if (days <= C.gap.repeatMaxDays) return null;
    return decide(ctx, "hold", "gap_repeat_reps", {}, `${lead}, so repeat your last reps on ${exercise.name} and stay a rep or two short of failure.`, facts);
  }

  const step = lp.increment ?? 0;
  if (days <= C.gap.repeatMaxDays) {
    if (sameLoad(before.load, base)) {
      return decide(ctx, "hold", "gap_repeat", {}, `${lead}, so repeat ${fmtLoad(base, unit)} with no increase.`, { ...facts, cut_pct: 0 });
    }
    return decide(ctx, "reduce_after_gap", "gap_cancel_increase", { load: base }, `${lead}, so the weight goes back to ${fmtLoad(base, unit)} instead of increasing.`, { ...facts, cut_pct: 0 });
  }
  const tier = C.gap.cuts.find((t) => days <= t.maxDays) ?? C.gap.cuts[C.gap.cuts.length - 1];
  const next = easierLoad(base, tier.cutPct, step, lp.dir);
  const cut = actualCut(base, next);
  const pct = Math.round(cut * 100);
  if (sameLoad(next, base)) {
    return decide(ctx, "hold", "gap_repeat", {}, `${lead}, so repeat ${fmtLoad(base, unit)} with no increase.`, { ...facts, cut_pct: 0 });
  }
  const verb = lp.dir === 1 ? `the load drops ${pct}% to` : `the assistance rises ${pct}% to`;
  return decide(ctx, "reduce_after_gap", "gap_reduce", { load: next }, `${lead}, so ${verb} ${fmtLoad(next, unit)} to ease back in.`, { ...facts, cut_pct: tier.cutPct, actual_cut_pct: round2(cut) });
}

function painRule(ctx: Ctx): EngineDecision | null {
  const { before, exercise, unit, painCount } = ctx;
  if (painCount === 0) return null;
  const where =
    before.load !== null && exercise.load_type !== "bodyweight" ? `stays at ${fmtLoad(before.load, unit)}` : "stays as planned";
  return decide(
    ctx,
    "pain_hold",
    "pain",
    {},
    `You flagged pain on ${plural(painCount, "set")} of ${exercise.name}, so it ${where} with no increase until a session is pain free.`,
    { pain_sets: painCount },
  );
}

function stallStreak(run: Summary[], repMin: number): number {
  let streak = 0;
  for (let i = 0; i < run.length; i++) {
    const s = run[i];
    if (!s.complete) break;
    const missed = s.considered.some((x) => x.reps < repMin);
    const older = run[i + 1];
    const plateau = !!older && older.complete && sameLoad(s.workLoad, older.workLoad) && s.total <= older.total;
    if (!missed && !plateau) break;
    streak++;
  }
  return streak;
}

function historyRule(ctx: Ctx): EngineDecision {
  const { input, before, exercise, unit, newest } = ctx;
  if (!newest) {
    return decide(
      ctx,
      "hold",
      "no_history",
      {},
      `No finished sessions are logged for ${exercise.name} yet, so it starts at ${planText(before, unit)}.`,
    );
  }
  const stamp = input.planned.updated_at;
  if (stamp && Date.parse(stamp) >= Date.parse(newest.at)) {
    return decide(
      ctx,
      "hold",
      "plan_already_updated",
      {},
      `Your last session is already reflected in the plan, so ${planText(before, unit)} stays the same.`,
    );
  }
  if (newest.exerciseId !== before.exercise_id) {
    const other = input.library.find((e) => e.id === newest.exerciseId);
    return decide(
      ctx,
      "hold",
      "different_exercise",
      {},
      `You trained ${other?.name ?? "a different exercise"} instead of ${exercise.name}, so ${exercise.name} stays the same.`,
    );
  }
  if (implausible(newest.workLoad, before.load)) {
    return decide(
      ctx,
      "hold",
      "load_mismatch",
      {},
      `You logged ${fmtLoad(newest.workLoad as number, unit)} but the plan says ${fmtLoad(before.load as number, unit)}, which looks like a mistake, so nothing changes until the log is fixed.`,
      { logged_load: newest.workLoad },
    );
  }
  return performance(ctx, newest);
}

function performance(ctx: Ctx, cur: Summary): EngineDecision {
  const { input, before, exercise, unit, lp, run, recovery } = ctx;
  const n = before.sets;
  const here = stays(ctx, lp.base);

  // RIR only counts on sets short enough for the rating to be trustworthy.
  const rated = cur.considered.filter((s) => s.reps <= C.rirIgnoredAboveReps);
  const rirFloor = before.target_rir - C.rirTolerance;
  const hard = rated.filter((s) => s.rir !== null && s.rir < rirFloor);
  const lowestRir = hard.length ? Math.min(...hard.map((s) => s.rir as number)) : null;
  const rirMissing = rated.some((s) => s.rir === null);

  const facts = {
    sets_logged: cur.considered.map((s) => ({ reps: s.reps, load: s.load, rir: s.rir })),
    increment: lp.increment,
    jump_pct: round2(lp.jumpPct),
    sets_too_hard: hard.length,
    rir_missing: rirMissing,
  };
  const keep = holdLoad(ctx);

  const atCeiling = cur.complete && (!lp.loaded || cur.uniform) && cur.minReps >= lp.ceiling;
  if (atCeiling) {
    const hit = `You hit ${repsPhrase(cur)} on all ${n} sets`;
    if (hard.length) {
      return decide(
        ctx, "hold", "ceiling_effort_high", keep,
        `${hit} but ${plural(hard.length, "set")} ended at ${lowestRir} RIR against a target of ${before.target_rir}, so ${here} until the effort comes down.`,
        { ...facts, target_reps: lp.ceiling },
      );
    }
    if (rirMissing) {
      const need = C.missingRirConfirmations;
      const recent = run.slice(0, need);
      const confirmed =
        recent.length === need &&
        recent.every((s) => s.complete && s.minReps >= lp.ceiling && sameLoad(s.workLoad, cur.workLoad));
      if (!confirmed) {
        return decide(
          ctx, "hold", "ceiling_rir_unconfirmed", keep,
          `${hit} but did not log RIR, so ${here} for one more session to confirm before moving up.`,
          { ...facts, target_reps: lp.ceiling },
        );
      }
    }
    if (recovery.poor) {
      return decide(
        ctx, "hold", "ceiling_poor_recovery", keep,
        `Your last ${plural(recovery.considered, "recovery log")} show ${plural(recovery.poor_days, "poor day")} (under ${C.recovery.poorSleepHours} hours of sleep or soreness of ${C.recovery.poorSoreness} or more), so ${here} instead of going up.`,
        { ...facts, target_reps: lp.ceiling },
      );
    }
    const planned28 = input.consistency.planned_last_28d;
    if (planned28 >= C.adherence.minPlannedSessions && input.consistency.sessions_last_28d / planned28 < C.adherence.minRatio) {
      return decide(
        ctx, "hold", "ceiling_low_adherence", keep,
        `You finished ${input.consistency.sessions_last_28d} of ${planned28} planned sessions in the last 28 days, so ${here} instead of going up.`,
        { ...facts, target_reps: lp.ceiling },
      );
    }
    if (lp.loaded && lp.canRaise && lp.nextLoad !== null) {
      const noun =
        lp.dir === -1 ? "the assistance drops to" : loadKind(exercise) === "dumbbell" ? "the dumbbells go up to" : loadKind(exercise) === "barbell" ? "the bar goes up to" : "the weight goes up to";
      return decide(
        ctx, "increase_load", "ceiling_hit", { load: lp.nextLoad },
        `${hit}${rirPhrase(cur)}, so ${noun} ${fmtLoad(lp.nextLoad, unit)}.`,
        { ...facts, target_reps: before.rep_min },
      );
    }
    if (lp.rungUp) {
      const range = rungRange(lp.rungUp);
      const from = range.rep_min ?? before.rep_min;
      return decide(
        ctx, "advance_variation", "ceiling_advance", { exercise_id: lp.rungUp.id, load: null, ...range },
        `${hit}${rirPhrase(cur)}, so move up to ${lp.rungUp.name} and start again from ${from} reps.`,
        { ...facts, from_exercise_id: before.exercise_id, to_exercise_id: lp.rungUp.id, target_reps: from },
      );
    }
    return decide(
      ctx, "hold", "top_of_ladder", keep,
      `${hit} and there is nothing heavier or harder left to move to, so ${here}.`,
      { ...facts, target_reps: lp.ceiling },
    );
  }

  if (!cur.complete) {
    return decide(ctx, "hold", "incomplete_session", keep, `You logged ${cur.considered.length} of ${n} sets, so ${here} until you finish them all.`, facts);
  }

  const missedFloor = cur.considered.some((s) => s.reps < before.rep_min);
  const streak = stallStreak(run, before.rep_min);
  if (streak >= C.stallSessions) return stallResponse(ctx, streak, facts);

  if (missedFloor) {
    const lowSet = cur.considered.reduce((a, b) => (b.reps < a.reps ? b : a));
    const at = lowSet.rir !== null && lowSet.reps <= C.rirIgnoredAboveReps ? ` at ${lowSet.rir} RIR` : "";
    return decide(
      ctx, "hold", "below_floor", keep,
      `Your lowest set was ${lowSet.reps} reps${at} against a minimum of ${before.rep_min}, so ${here} until every set reaches ${before.rep_min}.`,
      { ...facts, stall_streak: streak, target_reps: before.rep_min },
    );
  }
  if (lp.loaded && !cur.uniform) {
    return decide(ctx, "hold", "mixed_loads", keep, `You used different weights across your sets, so ${here} until every set uses the same weight.`, facts);
  }
  if (hard.length) {
    return decide(
      ctx, "hold", "effort_too_high", keep,
      `${plural(hard.length, "set")} ended at ${lowestRir} RIR against a target of ${before.target_rir}, so ${here} until the effort comes down.`,
      { ...facts, stall_streak: streak, target_reps: cur.minReps },
    );
  }

  const target = Math.min(lp.ceiling, cur.minReps + 1);
  const atLoad = lp.loaded && lp.base !== null ? ` at ${fmtLoad(lp.base, unit)}` : "";
  const tail = lp.loaded
    ? lp.canRaise
      ? " before the weight goes up"
      : ` because ${fmtLoad(lp.base as number, unit)} is as heavy as it goes`
    : lp.rungUp
      ? " before moving to a harder variation"
      : "";
  return decide(
    ctx, "increase_reps", "in_range", keep,
    `You did ${repsList(cur)} reps${atLoad}, so aim for ${target} reps on every set${tail}.`,
    { ...facts, stall_streak: streak, target_reps: target },
  );
}

function stallResponse(ctx: Ctx, streak: number, facts: Record<string, unknown>): EngineDecision {
  const { before, unit, lp, recovery, run } = ctx;
  const allFloor = run.slice(0, streak).every((s) => s.considered.some((x) => x.reps < before.rep_min));
  const why = allFloor
    ? `finished under ${before.rep_min} reps for ${streak} sessions in a row`
    : `made no progress for ${streak} sessions in a row`;
  const extra = { ...facts, stall_streak: streak, target_reps: before.rep_min };
  const here = stays(ctx, lp.base);

  if (recovery.poor) {
    return decide(
      ctx, "hold", "stall_poor_recovery", holdLoad(ctx),
      `You ${why} but your recovery has been poor (${plural(recovery.poor_days, "poor day")}), so ${here} while you recover.`,
      extra,
    );
  }
  if (lp.loaded && lp.base !== null && lp.base > 0 && lp.increment !== null) {
    const next = easierLoad(lp.base, C.deloadPct, lp.increment, lp.dir);
    // A step that would remove the whole load is not a deload.
    if (!sameLoad(next, lp.base) && (lp.dir === -1 || next > 0)) {
      const cut = actualCut(lp.base, next);
      const pct = Math.round(cut * 100);
      const verb = lp.dir === 1 ? `the load drops ${pct}% to` : `the assistance rises ${pct}% to`;
      return decide(
        ctx, "deload", "stall_deload", { load: next },
        `You ${why} at ${fmtLoad(lp.base, unit)}, so ${verb} ${fmtLoad(next, unit)} to rebuild.`,
        { ...extra, cut_pct: C.deloadPct, actual_cut_pct: round2(cut) },
      );
    }
  }
  if (lp.rungDown) {
    return decide(
      ctx, "regress_variation", "stall_regress", { exercise_id: lp.rungDown.id, load: null, ...rungRange(lp.rungDown) },
      `You ${why}, so drop back to ${lp.rungDown.name} and build up again.`,
      { ...extra, from_exercise_id: before.exercise_id, to_exercise_id: lp.rungDown.id },
    );
  }
  return decide(
    ctx, "hold", "stall_no_easier_option", holdLoad(ctx),
    `You ${why} and there is no easier option, so ${here}.`,
    extra,
  );
}

export function decideNext(input: EngineInput): EngineDecision {
  const ctx = makeCtx(input);
  return equipmentRule(ctx) ?? gapRule(ctx) ?? painRule(ctx) ?? historyRule(ctx);
}

// The rep ceiling the athlete is actually working toward. It sits above the
// stored rep_max when the next load jump is too big to take directly.
export function repCeiling(args: {
  exercise: Exercise;
  library: Exercise[];
  equipment: EquipmentLike | null;
  unit: Unit;
  load: number | null;
  rep_max: number;
  bodyweight?: number | null;
}): number {
  const base = args.exercise.load_type === "bodyweight" ? null : args.load;
  return profileFor(args.exercise, args.library, args.equipment, args.unit, base, args.rep_max, args.bodyweight).ceiling;
}
