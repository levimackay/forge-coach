import type { Exercise, PlannedExercise, Uuid, Workout, WorkoutSet } from "@/lib/domain/types";
import {
  addDays,
  bodyweightTrend,
  compareSessions,
  consistency,
  decisionDigest,
  delta,
  exerciseSeries,
  inRange,
  localDate,
  loggedWorkSets,
  prescribedThatDay,
  recoverySummary,
  resolveBodyweight,
  sessionMinutes,
  summarizeSets,
  time,
  VOLUME_REFERENCE,
  weeklyHardSets,
  type SeriesPoint,
} from "../analytics";
import { dateRange, fullDate } from "./format";
import { renderMarkdown } from "./markdown";
import {
  REPORT_FORMAT_VERSION,
  type Report,
  type ReportExercise,
  type ReportInput,
  type ReportJson,
  type ReportPainFlag,
  type ReportProgram,
  type ReportSessionDetail,
  type ReportSessionExercise,
  type ReportSessionSummary,
} from "./types";

const WEEK_DAYS = 7;
const MONTH_DAYS = 28;
const BODYWEIGHT_WINDOW_DAYS = 28;
const RECENT_SAME_DAY_SESSIONS = 4;
const NOTES_MAX_CHARS = 500;

const live = <T extends { deleted_at: string | null }>(rows: T[]): T[] => rows.filter((r) => !r.deleted_at);
const byStart = (a: Workout, b: Workout) => time(a.started_at) - time(b.started_at);
const bySetOrder = (a: WorkoutSet, b: WorkoutSet) => time(a.completed_at) - time(b.completed_at) || a.set_index - b.set_index;

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) out.set(key(item), [...(out.get(key(item)) ?? []), item]);
  return out;
}

function pickWorkout(workouts: Workout[], id?: Uuid): Workout | null {
  if (id) return workouts.find((w) => w.id === id) ?? null;
  const newestFirst = [...workouts].sort((a, b) => byStart(b, a));
  return newestFirst.find((w) => w.status === "completed") ?? newestFirst[0] ?? null;
}

export function buildReport(input: ReportInput): Report {
  const { kind, unit, data } = input;
  const timeZone = data.profile?.timezone || "UTC";
  const workouts = live(data.workouts);
  const sets = live(data.workout_sets);
  const programDays = live(data.program_days);
  const library = new Map(data.exercises.map((e) => [e.id, e]));
  const dayById = new Map(programDays.map((d) => [d.id, d]));
  const dateOf = (w: Pick<Workout, "started_at">) => localDate(w.started_at, timeZone);
  const nameOf = (id: Uuid) => library.get(id)?.name ?? "Unknown exercise";

  const focus = kind === "session" ? pickWorkout(workouts, input.workoutId) : null;
  const to = focus ? dateOf(focus) : localDate(input.now, timeZone);
  const length = kind === "month" ? MONTH_DAYS : WEEK_DAYS;
  const from = addDays(to, 1 - length);

  const resolvedBodyweight = resolveBodyweight({ profile: data.profile, measurements: data.body_measurements, asOf: to });
  const bodyweight = resolvedBodyweight?.value ?? null;

  const logged = loggedWorkSets(workouts, sets, timeZone);
  const inPeriod = logged.filter((l) => inRange(l.date, from, to));
  const periodWorkouts = workouts.filter((w) => w.status === "completed" && inRange(dateOf(w), from, to)).sort(byStart);
  const setsByWorkout = groupBy(inPeriod, (l) => l.workout.id);

  const sessions = periodWorkouts.map((w): ReportSessionSummary => {
    const own = setsByWorkout.get(w.id) ?? [];
    const day = w.program_day_id ? dayById.get(w.program_day_id) : undefined;
    return {
      workout_id: w.id,
      date: dateOf(w),
      day_name: day?.name ?? null,
      focus: day?.focus ?? null,
      duration_minutes: sessionMinutes(w),
      exercises: new Set(own.map((l) => l.set.exercise_id)).size,
      work_sets: own.length,
      session_rpe: w.session_rpe,
    };
  });

  const periodExercise = (exercise: Exercise): ReportExercise => {
    const all = exerciseSeries({ exercise, workouts, sets, bodyweight, timeZone });
    const inside = all.filter((p) => inRange(p.date, from, to));
    const best = (points: SeriesPoint[]) => {
      const values = points.map((p) => p.top_e1rm).filter((v): v is number => v !== null);
      return values.length ? Math.max(...values) : null;
    };
    const periodBest = best(inside);
    const previousBest = best(all.filter((p) => p.date < from));
    return {
      exercise_id: exercise.id,
      name: exercise.name,
      load_type: exercise.load_type,
      primary_muscle: exercise.primary_muscle,
      sessions: inside,
      first_to_last: inside.length >= 2 ? delta(inside[0], inside[inside.length - 1]) : null,
      period_best_e1rm: periodBest,
      previous_best_e1rm: previousBest,
      is_pr: periodBest !== null && previousBest !== null && periodBest > previousBest,
    };
  };

  const exercises: ReportExercise[] =
    kind === "session"
      ? []
      : [...new Set(inPeriod.map((l) => l.set.exercise_id))]
          .flatMap((id) => {
            const exercise = library.get(id);
            return exercise ? [periodExercise(exercise)] : [];
          })
          .sort((a, b) => b.sessions.length - a.sessions.length || a.name.localeCompare(b.name));

  const sessionDetail = (w: Workout): ReportSessionDetail => {
    const date = dateOf(w);
    const day = w.program_day_id ? dayById.get(w.program_day_id) : undefined;
    const earlier = workouts.filter((x) => time(x.started_at) < time(w.started_at));
    const upToNow = workouts.filter((x) => time(x.started_at) <= time(w.started_at));
    const recent = day
      ? compareSessions({
          workouts: upToNow,
          sets,
          program_days: programDays,
          exercises: data.exercises,
          bodyweight,
          timeZone,
          select: { focus: day.focus },
          limit: RECENT_SAME_DAY_SESSIONS,
        })
      : null;
    const planned = new Map<Uuid, PlannedExercise>(live(data.planned_exercises).map((p) => [p.id, p]));
    const decisions = live(data.progression_decisions).filter((d) => d.workout_id === w.id);

    const own = sets.filter((s) => s.workout_id === w.id).sort(bySetOrder);
    const exerciseDetails: ReportSessionExercise[] = [];
    for (const [exerciseId, exSets] of groupBy(own, (s) => s.exercise_id)) {
      const exercise = library.get(exerciseId);
      if (!exercise) continue;
      const summary = summarizeSets(exercise, exSets, bodyweight);
      const current: SeriesPoint | null = summary && { workout_id: w.id, date, started_at: w.started_at, ...summary };
      const history = exerciseSeries({ exercise, workouts: earlier, sets, bodyweight, timeZone });
      const previous = history[history.length - 1] ?? null;

      // planned_exercises rows already hold the NEXT prescription once a workout is completed, so
      // the engine's "before" snapshot is the only record of what was prescribed that day.
      const plannedId = exSets.find((s) => s.planned_exercise_id)?.planned_exercise_id ?? null;
      const decision = decisions.find((d) => d.planned_exercise_id === plannedId);
      const row = plannedId ? planned.get(plannedId) : undefined;
      const prescribed = decision
        ? prescribedThatDay(decision, exerciseId)
        : w.status === "in_progress" && row?.exercise_id === exerciseId
          ? row
          : null;

      exerciseDetails.push({
        exercise_id: exerciseId,
        name: exercise.name,
        load_type: exercise.load_type,
        planned: prescribed && {
          sets: prescribed.sets,
          rep_min: prescribed.rep_min,
          rep_max: prescribed.rep_max,
          target_rir: prescribed.target_rir,
          load: prescribed.load,
        },
        sets: exSets
          .sort((a, b) => a.set_index - b.set_index || time(a.completed_at) - time(b.completed_at))
          .map((s) => ({ set_index: s.set_index, reps: s.reps, load: s.load, rir: s.rir, is_warmup: s.is_warmup, pain: s.pain })),
        summary: current,
        previous,
        vs_previous: previous && current ? delta(previous, current) : null,
        recent_same_day: recent?.exercises.find((e) => e.exercise_id === exerciseId)?.points ?? [],
      });
    }

    const log = live(data.recovery_logs).find((l) => l.date === date);
    return {
      workout_id: w.id,
      date,
      status: w.status,
      day_name: day?.name ?? null,
      focus: day?.focus ?? null,
      duration_minutes: sessionMinutes(w),
      session_rpe: w.session_rpe,
      notes: w.notes ? w.notes.slice(0, NOTES_MAX_CHARS) : null,
      recovery_that_day: log
        ? {
            date: log.date,
            sleep_hours: log.sleep_hours,
            sleep_quality: log.sleep_quality,
            soreness: log.soreness,
            energy: log.energy,
            stress: log.stress,
          }
        : null,
      exercises: exerciseDetails,
    };
  };

  const program: ReportProgram | null = data.program
    ? {
        name: data.program.name,
        split: data.program.split,
        days_per_week: data.program.days_per_week,
        version: data.program.version,
        days: programDays
          .filter((d) => d.program_id === data.program?.id)
          .sort((a, b) => a.position - b.position)
          .map((d) => ({
            name: d.name,
            focus: d.focus,
            exercises: live(data.planned_exercises)
              .filter((p) => p.program_day_id === d.id && p.is_active)
              .sort((a, b) => a.position - b.position)
              .map((p) => ({
                name: nameOf(p.exercise_id),
                sets: p.sets,
                rep_min: p.rep_min,
                rep_max: p.rep_max,
                target_rir: p.target_rir,
                load: p.load,
              })),
          })),
      }
    : null;

  const volumeWeeks = Array.from({ length: length / WEEK_DAYS }, (_, i) => addDays(from, i * WEEK_DAYS)).map((weekStart) => ({
    from: weekStart,
    to: addDays(weekStart, 6),
    muscles: weeklyHardSets({ workouts, sets, exercises: data.exercises, weekStart, timeZone }),
  }));

  const scopeIds = new Set(kind === "session" ? (focus ? [focus.id] : []) : periodWorkouts.map((w) => w.id));
  const scopeSets = sets.filter((s) => scopeIds.has(s.workout_id));
  const dates = new Map(workouts.map((w) => [w.id, dateOf(w)]));
  const pain_flags: ReportPainFlag[] = scopeSets
    .filter((s) => s.pain)
    .sort((a, b) => (dates.get(a.workout_id) ?? "").localeCompare(dates.get(b.workout_id) ?? "") || bySetOrder(a, b))
    .map((s) => ({
      date: dates.get(s.workout_id) ?? to,
      workout_id: s.workout_id,
      exercise: nameOf(s.exercise_id),
      load_type: library.get(s.exercise_id)?.load_type ?? "external",
      reps: s.reps,
      load: s.load,
      is_warmup: s.is_warmup,
    }));

  const recovery = recoverySummary({ logs: data.recovery_logs, from, to });
  const trend = bodyweightTrend({
    measurements: data.body_measurements,
    range: { from: addDays(to, 1 - BODYWEIGHT_WINDOW_DAYS), to },
  });

  const workSets = scopeSets.filter((s) => !s.is_warmup && s.reps > 0);
  const unrated = workSets.filter((s) => s.rir === null).length;
  const needsBodyweight = [...new Set(workSets.map((s) => s.exercise_id))]
    .map((id) => library.get(id))
    .filter((e): e is Exercise => !!e && e.load_type !== "external")
    .map((e) => e.name);

  const missing: string[] = [];
  if (!data.profile) missing.push("No profile is saved, so dates use UTC and bodyweight is unknown.");
  if (!program) missing.push("There is no active program.");
  if (!live(data.goals).some((g) => g.active)) missing.push("No active goals are set.");
  if (!live(data.equipment_profiles).length) missing.push("No equipment profile is set.");
  if (kind === "session" && !focus) {
    missing.push(input.workoutId ? "The requested workout was not found." : "No workouts are logged yet.");
  } else if (kind !== "session" && !periodWorkouts.length) {
    missing.push("No completed workouts in this period.");
  }
  if (!recovery.days_logged) missing.push("No recovery logs in this period.");
  if (unrated) missing.push(`RIR was not logged on ${unrated} of ${workSets.length} work sets. Sets without RIR count as hard sets.`);
  if (bodyweight === null && needsBodyweight.length) {
    missing.push(`No bodyweight is recorded, so ${needsBodyweight.join(", ")} show reps only (no e1RM or volume load).`);
  }
  if (!trend.points.length) missing.push(`No bodyweight measurements in the last ${BODYWEIGHT_WINDOW_DAYS} days, so there is no bodyweight trend.`);

  const detail = focus ? sessionDetail(focus) : null;
  const title =
    kind === "session"
      ? detail
        ? `Session report: ${detail.day_name ?? "Workout"}, ${fullDate(detail.date)}`
        : "Session report: no workout found"
      : `${kind === "week" ? "Week" : "Month"} report: ${dateRange(from, to)}`;

  const goals = live(data.goals).filter((g) => g.active);
  const json: ReportJson = {
    format: "forge-coach-report",
    version: REPORT_FORMAT_VERSION,
    kind,
    title,
    generated_at: input.now,
    unit,
    timezone: timeZone,
    period: { from, to, days: length },
    athlete: {
      display_name: data.profile?.display_name ?? null,
      bodyweight: resolvedBodyweight,
      goals: goals.map((g) => ({ kind: g.kind, description: g.description, focus_muscles: g.focus_muscles, target_date: g.target_date })),
      equipment: live(data.equipment_profiles)
        .sort((a, b) => Number(b.is_default) - Number(a.is_default))
        .map((e) => ({
          name: e.name,
          is_default: e.is_default,
          equipment: e.equipment,
          dumbbell_increment: e.dumbbell_increment,
          dumbbell_max: e.dumbbell_max,
          barbell_increment: e.barbell_increment,
        })),
    },
    program,
    sessions,
    session_detail: detail,
    consistency: consistency({ workouts, daysPerWeek: data.program?.days_per_week ?? null, from, to, timeZone }),
    exercises,
    weekly_volume: { reference_min: VOLUME_REFERENCE.min, reference_max: VOLUME_REFERENCE.max, weeks: volumeWeeks },
    recovery,
    bodyweight_trend: trend,
    decisions: decisionDigest({
      decisions: data.progression_decisions,
      exercises: data.exercises,
      timeZone,
      ...(focus ? { workoutId: focus.id } : { from, to }),
    }),
    pain_flags,
    missing,
  };

  // Two decimals everywhere keeps the JSON stable and short; JSON.stringify also turns NaN into null.
  const rounded = JSON.parse(JSON.stringify(json), (_key, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)) as ReportJson;
  return { title, markdown: renderMarkdown(rounded), json: rounded };
}

