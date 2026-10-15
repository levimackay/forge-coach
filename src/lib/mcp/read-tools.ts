import type { McpServer } from "@modelcontextprotocol/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  HARD_SET_MAX_RIR,
  SECONDARY_SET_WEIGHT,
  VOLUME_REFERENCE,
  addDays,
  bodyweightTrend,
  compareSessions,
  consistency,
  delta,
  exerciseSeries,
  localDate,
  prescribedThatDay,
  recoverySummary,
  sessionMinutes,
  summarizeSets,
  weekStart,
  weeklyHardSets,
  type SeriesPoint,
} from "@/lib/analytics";
import type {
  EquipmentProfile,
  Exercise,
  Goal,
  PlannedExercise,
  Profile,
  ProgressionDecision,
  Program,
  ProgramDay,
  RecoveryLog,
  Workout,
  WorkoutSet,
} from "@/lib/domain/types";
import {
  likePattern,
  loadAthlete,
  loadExercises,
  loadProgramDays,
  loadSets,
  loadWorkouts,
  pageAll,
  windowStartIso,
} from "./data";
import type { McpEnv } from "./env";
import { READ_ONLY, ToolError, defineTool, loadAll, loadOne } from "./kit";
import { DayFocusSchema, EquipmentSchema, MovementPatternSchema, MuscleSchema } from "./schemas";

const guid = z.guid();

const exerciseBrief = (e: Exercise) => ({
  id: e.id,
  name: e.name,
  primary_muscle: e.primary_muscle,
  secondary_muscles: e.secondary_muscles,
  movement_pattern: e.movement_pattern,
  equipment: e.equipment,
  load_type: e.load_type,
  progression_group: e.progression_group,
  ladder_level: e.ladder_level,
});

const pointView = (p: SeriesPoint) => ({
  workout_id: p.workout_id,
  date: p.date,
  work_sets: p.work_sets,
  total_reps: p.total_reps,
  best_set: p.best_set,
  top_load: p.top_load,
  reps_at_top_load: p.reps_at_top_load,
  volume_load: p.volume_load,
  avg_rir: p.avg_rir,
  pain: p.pain,
});

/** The sets of one exercise within a workout, as a coach reads them. */
function setsView(sets: WorkoutSet[]) {
  const work = sets.filter((s) => !s.is_warmup);
  return {
    warmup_sets: sets.length - work.length,
    work_sets: work.map((s) => ({ reps: s.reps, load: s.load, rir: s.rir, ...(s.pain ? { pain: true } : {}) })),
  };
}

function groupByExercise(sets: WorkoutSet[]): Map<string, WorkoutSet[]> {
  const ordered = [...sets].sort((a, b) => a.completed_at.localeCompare(b.completed_at) || a.set_index - b.set_index);
  const groups = new Map<string, WorkoutSet[]>();
  for (const set of ordered) groups.set(set.exercise_id, [...(groups.get(set.exercise_id) ?? []), set]);
  return groups;
}

async function findExercise(
  db: SupabaseClient,
  input: { exercise_id?: string; name?: string },
): Promise<{ exercise: Exercise } | { candidates: Exercise[] }> {
  if (input.exercise_id) {
    const found = await loadOne<Exercise>(db.from("exercises").select("*").eq("id", input.exercise_id).maybeSingle(), "the exercise");
    if (!found) throw new ToolError("No exercise with that id. Use search_exercises to find the right id.");
    return { exercise: found };
  }
  const name = (input.name ?? "").trim();
  let query = db.from("exercises").select("*").is("deleted_at", null);
  for (const word of name.split(/\s+/).filter(Boolean).slice(0, 6)) query = query.ilike("name", likePattern(word));
  const found = await loadAll<Exercise>(query.order("name").limit(10), "exercises");
  const exact = found.find((e) => e.name.toLowerCase() === name.toLowerCase());
  if (exact || found.length === 1) return { exercise: exact ?? found[0] };
  if (found.length === 0) throw new ToolError(`No exercise matches "${name}". Use search_exercises to browse the library.`);
  return { candidates: found };
}

export function registerReadTools(server: McpServer, env: McpEnv): void {
  // get_athlete_profile
  defineTool(
    server,
    env,
    {
      name: "get_athlete_profile",
      title: "Get athlete profile",
      description:
        "Read the athlete's profile: display name, preferred unit (lb or kg) that every load uses, bodyweight, timezone, active goals, equipment profiles (with dumbbell increments) and recent body measurements with the bodyweight trend. Read-only.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    async (_args, { db }) => {
      const athlete = await loadAthlete(db, new Date());
      const [goals, equipment] = await Promise.all([
        loadAll<Goal>(db.from("goals").select("*").is("deleted_at", null).eq("active", true).order("created_at"), "goals"),
        loadAll<EquipmentProfile>(
          db.from("equipment_profiles").select("*").is("deleted_at", null).order("is_default", { ascending: false }),
          "equipment profiles",
        ),
      ]);
      const profile = athlete.profile;
      return {
        summary: profile
          ? `Athlete profile${profile.display_name ? ` for ${profile.display_name}` : ""}; loads are in ${profile.unit}.`
          : "No profile exists yet; the athlete has not finished onboarding in FORGE.",
        data: {
          profile: profile && {
            display_name: profile.display_name,
            unit: profile.unit,
            bodyweight: athlete.bodyweight,
            timezone: profile.timezone,
            onboarded_at: profile.onboarded_at,
          },
          goals: goals.map((g) => ({
            id: g.id,
            kind: g.kind,
            description: g.description,
            focus_muscles: g.focus_muscles,
            target_date: g.target_date,
          })),
          equipment_profiles: equipment.map((e) => ({
            id: e.id,
            name: e.name,
            is_default: e.is_default,
            equipment: e.equipment,
            dumbbell_increment: e.dumbbell_increment,
            dumbbell_max: e.dumbbell_max,
            barbell_increment: e.barbell_increment,
          })),
          body_measurements: athlete.measurements.slice(0, 12).map((m) => ({
            date: m.measured_on,
            bodyweight: m.bodyweight,
            waist: m.waist,
            chest: m.chest,
            arm: m.arm,
            thigh: m.thigh,
            body_fat_pct: m.body_fat_pct,
          })),
          bodyweight_trend: bodyweightTrend({
            measurements: athlete.measurements,
            range: { from: addDays(athlete.today, -90), to: athlete.today },
          }),
        },
      };
    },
  );

  // get_training_plan
  defineTool(
    server,
    env,
    {
      name: "get_training_plan",
      title: "Get training plan",
      description:
        "Read the athlete's active program: split, version, each training day and its active exercises with sets, rep range, target reps in reserve (RIR), load and rest. Every day and planned exercise carries the ids that propose_program_change needs. Read-only.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    async (_args, { db }) => {
      const [program, profile] = await Promise.all([
        loadOne<Program>(db.from("programs").select("*").eq("is_active", true).is("deleted_at", null).maybeSingle(), "the active program"),
        loadOne<Pick<Profile, "unit">>(db.from("profiles").select("unit").maybeSingle(), "the profile"),
      ]);
      if (!program) {
        return { summary: "The athlete has no active program yet.", data: { program: null, days: [] } };
      }
      const days = await loadAll<ProgramDay>(
        db.from("program_days").select("*").eq("program_id", program.id).is("deleted_at", null).order("position"),
        "program days",
      );
      const planned = days.length
        ? await loadAll<PlannedExercise>(
            db
              .from("planned_exercises")
              .select("*")
              .in(
                "program_day_id",
                days.map((d) => d.id),
              )
              .eq("is_active", true)
              .is("deleted_at", null)
              .order("position"),
            "planned exercises",
          )
        : [];
      const library = new Map((await loadExercises(db, planned.map((p) => p.exercise_id))).map((e) => [e.id, e]));
      return {
        summary: `${program.name}: ${program.split} split, ${program.days_per_week} days per week, version ${program.version}. Loads are in ${profile?.unit ?? "the athlete's unit"}.`,
        data: {
          unit: profile?.unit ?? null,
          program: {
            id: program.id,
            name: program.name,
            split: program.split,
            days_per_week: program.days_per_week,
            version: program.version,
            notes: program.notes,
          },
          days: days.map((d) => ({
            id: d.id,
            position: d.position,
            name: d.name,
            focus: d.focus,
            equipment_profile_id: d.equipment_profile_id,
            exercises: planned
              .filter((p) => p.program_day_id === d.id)
              .map((p) => ({
                planned_exercise_id: p.id,
                position: p.position,
                exercise: library.has(p.exercise_id) ? exerciseBrief(library.get(p.exercise_id) as Exercise) : { id: p.exercise_id },
                sets: p.sets,
                rep_min: p.rep_min,
                rep_max: p.rep_max,
                target_rir: p.target_rir,
                load: p.load,
                rest_seconds: p.rest_seconds,
                notes: p.notes,
              })),
          })),
        },
      };
    },
  );

  // get_recent_workouts
  defineTool(
    server,
    env,
    {
      name: "get_recent_workouts",
      title: "Get recent workouts",
      description:
        "List the athlete's most recent workouts, newest first, each with its day, duration, session RPE and, per exercise, the work sets logged (reps, load, reps in reserve, pain flag) with the top estimated 1RM and volume load. Notes are free text written by the athlete. Read-only.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(15).default(8).describe("How many workouts to return"),
        status: z.enum(["completed", "in_progress", "abandoned"]).default("completed"),
      }),
      annotations: READ_ONLY,
    },
    async ({ limit, status }, { db }) => {
      const workouts = await loadAll<Workout>(
        db
          .from("workouts")
          .select("*")
          .is("deleted_at", null)
          .eq("status", status)
          .order("started_at", { ascending: false })
          .limit(limit),
        "workouts",
      );
      if (workouts.length === 0) return { summary: `No ${status} workouts are logged yet.`, data: { workouts: [] } };

      const athlete = await loadAthlete(db, new Date());
      const sets = await loadSets(db, workouts.map((w) => w.id));
      const [exercises, days] = await Promise.all([
        loadExercises(db, sets.map((s) => s.exercise_id)),
        loadProgramDays(db, workouts.flatMap((w) => (w.program_day_id ? [w.program_day_id] : []))),
      ]);
      const library = new Map(exercises.map((e) => [e.id, e]));
      const dayById = new Map(days.map((d) => [d.id, d]));

      const items = workouts.map((w) => {
        const day = w.program_day_id ? dayById.get(w.program_day_id) : undefined;
        const bySet = groupByExercise(sets.filter((s) => s.workout_id === w.id));
        return {
          id: w.id,
          date: localDate(w.started_at, athlete.timeZone),
          started_at: w.started_at,
          completed_at: w.completed_at,
          duration_minutes: sessionMinutes(w),
          session_rpe: w.session_rpe,
          notes: w.notes,
          day: day ? { id: day.id, name: day.name, focus: day.focus } : null,
          exercises: [...bySet].map(([exerciseId, rows]) => {
            const exercise = library.get(exerciseId);
            const summary = exercise ? summarizeSets(exercise, rows, athlete.bodyweight) : null;
            return {
              exercise_id: exerciseId,
              name: exercise?.name ?? "Unknown exercise",
              ...setsView(rows),
              top_e1rm: summary?.top_e1rm ?? null,
              volume_load: summary?.volume_load ?? null,
              avg_rir: summary?.avg_rir ?? null,
            };
          }),
        };
      });
      return {
        summary: `${items.length} ${status} workout${items.length === 1 ? "" : "s"}, newest first. Loads are in ${athlete.unit ?? "the athlete's unit"}.`,
        data: { unit: athlete.unit, workouts: items },
      };
    },
  );

  // get_workout_details
  defineTool(
    server,
    env,
    {
      name: "get_workout_details",
      title: "Get workout details",
      description:
        "Read one workout in full: every set including warmups and notes, the prescription the athlete was following (taken from the progression decision made after the workout) and what the progression engine decided next for each exercise. Read-only.",
      inputSchema: z.object({ workout_id: guid.describe("Workout id from get_recent_workouts") }),
      annotations: READ_ONLY,
    },
    async ({ workout_id }, { db }) => {
      const workout = await loadOne<Workout>(
        db.from("workouts").select("*").eq("id", workout_id).is("deleted_at", null).maybeSingle(),
        "the workout",
      );
      if (!workout) throw new ToolError("No workout with that id.");

      const [athlete, sets, decisions, days] = await Promise.all([
        loadAthlete(db, new Date()),
        loadSets(db, [workout.id]),
        loadAll<ProgressionDecision>(
          db.from("progression_decisions").select("*").eq("workout_id", workout.id).is("deleted_at", null),
          "progression decisions",
        ),
        workout.program_day_id ? loadProgramDays(db, [workout.program_day_id]) : Promise.resolve([]),
      ]);
      const exercises = await loadExercises(db, sets.map((s) => s.exercise_id));
      const library = new Map(exercises.map((e) => [e.id, e]));
      const decisionFor = new Map(decisions.map((d) => [d.planned_exercise_id, d]));
      const day = days[0];

      return {
        summary: `Workout on ${localDate(workout.started_at, athlete.timeZone)} (${workout.status}). Loads are in ${athlete.unit ?? "the athlete's unit"}.`,
        data: {
          unit: athlete.unit,
          workout: {
            id: workout.id,
            date: localDate(workout.started_at, athlete.timeZone),
            started_at: workout.started_at,
            completed_at: workout.completed_at,
            duration_minutes: sessionMinutes(workout),
            status: workout.status,
            session_rpe: workout.session_rpe,
            notes: workout.notes,
            day: day ? { id: day.id, name: day.name, focus: day.focus } : null,
          },
          exercises: [...groupByExercise(sets)].map(([exerciseId, rows]) => {
            const exercise = library.get(exerciseId);
            const plannedId = rows.find((r) => r.planned_exercise_id)?.planned_exercise_id ?? null;
            const decision = plannedId ? decisionFor.get(plannedId) : undefined;
            const summary = exercise ? summarizeSets(exercise, rows, athlete.bodyweight) : null;
            return {
              exercise_id: exerciseId,
              name: exercise?.name ?? "Unknown exercise",
              planned_exercise_id: plannedId,
              prescribed: decision ? prescribedThatDay(decision, exerciseId) : null,
              sets: rows.map((s) => ({
                set_index: s.set_index,
                reps: s.reps,
                load: s.load,
                rir: s.rir,
                is_warmup: s.is_warmup,
                pain: s.pain,
                notes: s.notes,
              })),
              top_e1rm: summary?.top_e1rm ?? null,
              volume_load: summary?.volume_load ?? null,
              avg_rir: summary?.avg_rir ?? null,
              engine_decision: decision
                ? { action: decision.action, reason: decision.reason, next: decision.after }
                : null,
            };
          }),
        },
      };
    },
  );

  // get_exercise_performance
  defineTool(
    server,
    env,
    {
      name: "get_exercise_performance",
      title: "Get exercise performance",
      description:
        "Performance history for one exercise over the last N weeks, one point per completed session: best set, top estimated 1RM (Epley, reps capped at 12), reps at the top load, volume load and average reps in reserve, plus the change from the previous and from the first session. Give exercise_id (preferred) or a name; an ambiguous name returns candidates to choose from. Read-only.",
      inputSchema: z
        .object({
          exercise_id: guid.optional(),
          name: z.string().trim().min(2).max(80).optional().describe("Exercise name or part of it, e.g. 'bench press'"),
          weeks: z.number().int().min(1).max(52).default(12),
        })
        .refine((v) => v.exercise_id || v.name, "Provide exercise_id or name"),
      annotations: READ_ONLY,
    },
    async ({ exercise_id, name, weeks }, { db }) => {
      const found = await findExercise(db, { exercise_id, name });
      if ("candidates" in found) {
        return {
          summary: `"${name}" matches several exercises. Call again with one of these exercise_id values.`,
          data: { candidates: found.candidates.map(exerciseBrief) },
        };
      }
      const { exercise } = found;
      const athlete = await loadAthlete(db, new Date());
      const from = addDays(athlete.today, -7 * weeks);
      const sets = await pageAll<WorkoutSet>("sets", (a, b) =>
        db
          .from("workout_sets")
          .select("*")
          .eq("exercise_id", exercise.id)
          .is("deleted_at", null)
          .gte("completed_at", windowStartIso(from))
          .order("id")
          .range(a, b),
      );
      const workouts = await loadWorkouts(db, sets.map((s) => s.workout_id));
      const points = exerciseSeries({
        exercise,
        workouts,
        sets,
        bodyweight: athlete.bodyweight,
        timeZone: athlete.timeZone,
      });
      const last = points[points.length - 1];
      return {
        summary: points.length
          ? `${exercise.name}: ${points.length} completed session${points.length === 1 ? "" : "s"} in the last ${weeks} weeks. Loads are in ${athlete.unit ?? "the athlete's unit"}.`
          : `${exercise.name}: no completed sessions in the last ${weeks} weeks.`,
        data: {
          unit: athlete.unit,
          exercise: exerciseBrief(exercise),
          window: { from, to: athlete.today },
          sessions: points.slice(-40).map(pointView),
          latest_vs_previous: points.length >= 2 ? delta(points[points.length - 2], last) : null,
          latest_vs_first: points.length >= 2 ? delta(points[0], last) : null,
        },
      };
    },
  );

  // compare_sessions
  defineTool(
    server,
    env,
    {
      name: "compare_sessions",
      title: "Compare sessions",
      description:
        "Compare the last N completed sessions of the same kind side by side, exercise by exercise, with the change from the previous and from the first session. Choose the sessions by day focus (push, pull, legs, upper, lower, full), by a program day id, or by listing 2 to 8 workout ids. Read-only.",
      inputSchema: z
        .object({
          focus: DayFocusSchema.optional(),
          program_day_id: guid.optional(),
          workout_ids: z.array(guid).min(2).max(8).optional(),
          last_n: z.number().int().min(2).max(6).default(3).describe("How many recent sessions to compare"),
        })
        .refine(
          (v) => [v.focus, v.program_day_id, v.workout_ids].filter((x) => x !== undefined).length === 1,
          "Provide exactly one of focus, program_day_id or workout_ids",
        ),
      annotations: READ_ONLY,
    },
    async ({ focus, program_day_id, workout_ids, last_n }, { db }) => {
      let workouts: Workout[];
      if (workout_ids) {
        workouts = await loadWorkouts(db, workout_ids);
      } else {
        let dayIds: string[] = program_day_id ? [program_day_id] : [];
        if (focus) {
          const matching = await loadAll<ProgramDay>(
            db.from("program_days").select("*").eq("focus", focus).is("deleted_at", null),
            "program days",
          );
          dayIds = matching.map((d) => d.id);
        }
        workouts = dayIds.length
          ? await loadAll<Workout>(
              db
                .from("workouts")
                .select("*")
                .in("program_day_id", dayIds)
                .eq("status", "completed")
                .is("deleted_at", null)
                .order("started_at", { ascending: false })
                .limit(last_n),
              "workouts",
            )
          : [];
      }
      const done = workouts.filter((w) => w.status === "completed");
      if (done.length < 2) {
        return {
          summary: "Fewer than two matching completed sessions exist, so there is nothing to compare yet.",
          data: { sessions: done.length, comparison: null },
        };
      }
      const [athlete, sets, days] = await Promise.all([
        loadAthlete(db, new Date()),
        loadSets(db, done.map((w) => w.id)),
        loadProgramDays(db, done.flatMap((w) => (w.program_day_id ? [w.program_day_id] : []))),
      ]);
      const exercises = await loadExercises(db, sets.map((s) => s.exercise_id));
      const comparison = compareSessions({
        workouts: done,
        sets,
        program_days: days,
        exercises,
        bodyweight: athlete.bodyweight,
        timeZone: athlete.timeZone,
        select: { workoutIds: done.map((w) => w.id) },
        // Listed workouts are all compared; last_n only trims a search by focus or day.
        limit: workout_ids ? done.length : last_n,
      });
      return {
        summary: `Compared ${comparison.sessions.length} sessions, oldest first. Loads are in ${athlete.unit ?? "the athlete's unit"}.`,
        data: {
          unit: athlete.unit,
          sessions: comparison.sessions,
          exercises: comparison.exercises.map((e) => ({
            exercise_id: e.exercise_id,
            name: e.name,
            points: e.points.map(pointView),
            latest_vs_previous: e.latest_vs_previous,
            latest_vs_first: e.latest_vs_first,
          })),
        },
      };
    },
  );

  // get_weekly_progress
  defineTool(
    server,
    env,
    {
      name: "get_weekly_progress",
      title: "Get weekly progress",
      description: `Week by week (Monday start) for the last N weeks: workouts completed against the plan, and hard sets per muscle. A hard set is a work set with ${HARD_SET_MAX_RIR} or fewer reps in reserve, or no RIR logged; sets for a secondary muscle count ${SECONDARY_SET_WEIGHT}. The reference range is ${VOLUME_REFERENCE.min} to ${VOLUME_REFERENCE.max} hard sets per muscle per week. Includes the bodyweight trend. Read-only.`,
      inputSchema: z.object({ weeks: z.number().int().min(1).max(12).default(4) }),
      annotations: READ_ONLY,
    },
    async ({ weeks }, { db }) => {
      const athlete = await loadAthlete(db, new Date());
      const firstWeek = addDays(weekStart(athlete.today), -7 * (weeks - 1));
      const [workouts, program] = await Promise.all([
        pageAll<Workout>("workouts", (a, b) =>
          db
            .from("workouts")
            .select("*")
            .is("deleted_at", null)
            .gte("started_at", windowStartIso(firstWeek))
            .order("started_at")
            .order("id")
            .range(a, b),
        ),
        loadOne<Program>(db.from("programs").select("*").eq("is_active", true).is("deleted_at", null).maybeSingle(), "the active program"),
      ]);
      const sets = await loadSets(db, workouts.filter((w) => w.status === "completed").map((w) => w.id));
      const exercises = await loadExercises(db, sets.map((s) => s.exercise_id));

      const rows = Array.from({ length: weeks }, (_, i) => {
        const start = addDays(firstWeek, 7 * i);
        const end = addDays(start, 6);
        const through = end < athlete.today ? end : athlete.today;
        return {
          week_start: start,
          through,
          in_progress: end >= athlete.today,
          consistency: consistency({
            workouts,
            daysPerWeek: program?.days_per_week ?? null,
            from: start,
            to: through,
            timeZone: athlete.timeZone,
          }),
          muscles: weeklyHardSets({ workouts, sets, exercises, weekStart: start, timeZone: athlete.timeZone }).filter(
            (m) => m.sets > 0,
          ),
        };
      });
      return {
        summary: `Last ${weeks} week${weeks === 1 ? "" : "s"}, oldest first; the final week is still in progress.`,
        data: {
          unit: athlete.unit,
          volume_reference: VOLUME_REFERENCE,
          weeks: rows,
          bodyweight_trend: bodyweightTrend({
            measurements: athlete.measurements,
            range: { from: firstWeek, to: athlete.today },
          }),
        },
      };
    },
  );

  // get_recovery_history
  defineTool(
    server,
    env,
    {
      name: "get_recovery_history",
      title: "Get recovery history",
      description:
        "Daily recovery logs for the last N days (sleep hours and quality, soreness, energy, stress, each 1 to 5 where logged) with averages, short-sleep nights and high-soreness days. Read-only.",
      inputSchema: z.object({ days: z.number().int().min(1).max(90).default(14) }),
      annotations: READ_ONLY,
    },
    async ({ days }, { db }) => {
      const athlete = await loadAthlete(db, new Date());
      const from = addDays(athlete.today, -(days - 1));
      const logs = await loadAll<RecoveryLog>(
        db
          .from("recovery_logs")
          .select("*")
          .is("deleted_at", null)
          .gte("date", from)
          .lte("date", athlete.today)
          .order("date", { ascending: false })
          .limit(days),
        "recovery logs",
      );
      return {
        summary: `${logs.length} recovery log${logs.length === 1 ? "" : "s"} in the last ${days} days.`,
        data: {
          summary: recoverySummary({ logs, from, to: athlete.today }),
          logs: logs.map((l) => ({
            date: l.date,
            sleep_hours: l.sleep_hours,
            sleep_quality: l.sleep_quality,
            soreness: l.soreness,
            energy: l.energy,
            stress: l.stress,
            notes: l.notes,
          })),
        },
      };
    },
  );

  // get_progression_decisions
  defineTool(
    server,
    env,
    {
      name: "get_progression_decisions",
      title: "Get progression decisions",
      description:
        "What the app's progression engine decided after recent workouts: the action (increase_load, increase_reps, hold, deload, pain_hold and so on), the plain-language reason, the prescription before and after, and the inputs that drove it. Newest first. Read-only.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(15),
        planned_exercise_id: guid.optional(),
        workout_id: guid.optional(),
      }),
      annotations: READ_ONLY,
    },
    async ({ limit, planned_exercise_id, workout_id }, { db }) => {
      let query = db.from("progression_decisions").select("*").is("deleted_at", null);
      if (planned_exercise_id) query = query.eq("planned_exercise_id", planned_exercise_id);
      if (workout_id) query = query.eq("workout_id", workout_id);
      const decisions = await loadAll<ProgressionDecision>(
        query.order("decided_at", { ascending: false }).limit(limit),
        "progression decisions",
      );
      const exercises = await loadExercises(db, decisions.map((d) => d.after.exercise_id));
      const names = new Map(exercises.map((e) => [e.id, e.name]));
      const byAction: Record<string, number> = {};
      for (const d of decisions) byAction[d.action] = (byAction[d.action] ?? 0) + 1;
      return {
        summary: `${decisions.length} progression decision${decisions.length === 1 ? "" : "s"}, newest first.`,
        data: {
          by_action: byAction,
          decisions: decisions.map((d) => ({
            decided_at: d.decided_at,
            workout_id: d.workout_id,
            planned_exercise_id: d.planned_exercise_id,
            exercise_id: d.after.exercise_id,
            exercise: names.get(d.after.exercise_id) ?? "Unknown exercise",
            action: d.action,
            reason: d.reason,
            before: d.before,
            after: d.after,
            inputs: d.inputs,
            engine_version: d.engine_version,
          })),
        },
      };
    },
  );

  // search_exercises
  defineTool(
    server,
    env,
    {
      name: "search_exercises",
      title: "Search exercises",
      description:
        "Search the exercise library (built-in and the athlete's own). Filter by words in the name, primary muscle, movement pattern, and the equipment the athlete has: pass available_equipment to keep only exercises whose required equipment is all on that list (bodyweight is always allowed). Results carry the exercise ids and, for progressions, progression_group and ladder_level (higher is harder). Read-only.",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(80).optional().describe("Words in the exercise name"),
        muscle: MuscleSchema.optional(),
        movement_pattern: MovementPatternSchema.optional(),
        available_equipment: z.array(EquipmentSchema).max(12).optional(),
        progression_group: z.string().trim().min(1).max(80).optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      annotations: READ_ONLY,
    },
    async ({ query, muscle, movement_pattern, available_equipment, progression_group, limit }, { db }) => {
      let q = db.from("exercises").select("*").is("deleted_at", null);
      for (const word of (query ?? "").split(/\s+/).filter(Boolean).slice(0, 6)) q = q.ilike("name", likePattern(word));
      if (muscle) q = q.eq("primary_muscle", muscle);
      if (movement_pattern) q = q.eq("movement_pattern", movement_pattern);
      if (progression_group) q = q.eq("progression_group", progression_group);
      if (available_equipment) q = q.containedBy("equipment", [...new Set([...available_equipment, "bodyweight"])]);
      const found = await loadAll<Exercise>(
        q.order("progression_group", { nullsFirst: false }).order("ladder_level", { nullsFirst: false }).order("name").limit(limit),
        "exercises",
      );
      return {
        summary: `${found.length} exercise${found.length === 1 ? "" : "s"} found${found.length === limit ? " (limit reached; narrow the search for more)" : ""}.`,
        data: {
          exercises: found.map((e) => ({
            ...exerciseBrief(e),
            default_rep_min: e.default_rep_min,
            default_rep_max: e.default_rep_max,
            default_increment: e.default_increment,
            custom: e.user_id !== null,
          })),
        },
      };
    },
  );
}
