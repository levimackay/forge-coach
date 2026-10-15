import type { ProgressionAction, Unit } from "@/lib/domain/types";
import { E1RM_REP_CAP, localDate } from "../analytics";
import {
  dateRange,
  equipmentText,
  fullDate,
  goalText,
  num,
  oneLine,
  plural,
  prescriptionText,
  programHeadline,
  setText,
  shortDate,
  signed,
  words,
} from "./format";
import type { ReportExercise, ReportJson, ReportSessionDetail, ReportSessionExercise } from "./types";

const ACTION_LABEL: Record<ProgressionAction, string> = {
  increase_load: "Increase load",
  increase_reps: "Increase reps",
  hold: "Hold",
  advance_variation: "Advance variation",
  regress_variation: "Regress variation",
  deload: "Deload",
  reduce_after_gap: "Reduce after a gap",
  pain_hold: "Hold for pain",
  substitute_equipment: "Substitute for equipment",
};

const recoveryText = (r: {
  sleep_hours: number | null;
  sleep_quality: number | null;
  soreness: number | null;
  energy: number | null;
  stress: number | null;
}): string => {
  const parts = [
    r.sleep_hours !== null ? `sleep ${num(r.sleep_hours)} h` : null,
    r.sleep_quality !== null ? `sleep quality ${num(r.sleep_quality)}` : null,
    r.soreness !== null ? `soreness ${num(r.soreness)}` : null,
    r.energy !== null ? `energy ${num(r.energy)}` : null,
    r.stress !== null ? `stress ${num(r.stress)}` : null,
  ].filter((x): x is string => x !== null);
  return parts.length ? parts.join(", ") : "nothing filled in";
};

function deltaText(d: NonNullable<ReportSessionExercise["vs_previous"]>): string {
  const parts = [
    d.e1rm !== null ? `e1RM ${signed(d.e1rm)}${d.e1rm_pct !== null ? ` (${signed(d.e1rm_pct)}%)` : ""}` : null,
    d.volume_load !== null ? `volume ${signed(d.volume_load)}` : null,
    `total reps ${signed(d.total_reps)}`,
    `work sets ${signed(d.work_sets)}`,
  ].filter((x): x is string => x !== null);
  return parts.join(", ");
}

function sessionSection(d: ReportSessionDetail): string[] {
  const out = ["", `## Session: ${oneLine(d.day_name ?? "Workout")}${d.focus ? ` (${d.focus})` : ""}, ${shortDate(d.date)}`];
  const facts = [
    `Status: ${words(d.status)}`,
    d.duration_minutes !== null ? `Duration: ${d.duration_minutes} min` : null,
    d.session_rpe !== null ? `Session RPE: ${d.session_rpe}` : null,
  ].filter((x): x is string => x !== null);
  out.push(`${facts.join(". ")}.`);
  if (d.notes) out.push(`Notes from the athlete: ${JSON.stringify(d.notes)}`);
  if (d.recovery_that_day) out.push(`Recovery that day: ${recoveryText(d.recovery_that_day)}.`);
  if (!d.exercises.length) out.push("", "No sets were logged in this workout.");

  for (const e of d.exercises) {
    out.push("", `### ${oneLine(e.name)}`);
    out.push(e.planned ? `Prescribed that day: ${prescriptionText(e.planned)}.` : "Prescribed that day: not recorded.");
    let work = 0;
    let warmup = 0;
    for (const s of e.sets) {
      const label = s.is_warmup ? `Warmup ${++warmup}` : `Set ${++work}`;
      out.push(`- ${label}: ${setText(s, e.load_type)}${s.rir !== null ? `, RIR ${s.rir}` : ""}${s.pain ? " (pain flagged)" : ""}`);
    }
    if (e.summary) {
      const best = e.summary.best_set;
      out.push(
        `Work sets: ${e.summary.work_sets}. Best set: ${setText(best, e.load_type)}${best.e1rm !== null ? ` (e1RM ${num(best.e1rm)})` : ""}.` +
          `${e.summary.volume_load !== null ? ` Volume: ${num(e.summary.volume_load)}.` : ""}`,
      );
    } else {
      out.push("No work sets logged.");
    }
    if (e.previous && e.vs_previous) out.push(`Versus ${shortDate(e.previous.date)}: ${deltaText(e.vs_previous)}.`);
    else out.push("No earlier session of this exercise to compare with.");
    if (e.recent_same_day.length >= 2) {
      out.push(
        `Last ${e.recent_same_day.length} sessions of this day, best set each: ${e.recent_same_day.map((p) => setText(p.best_set, e.load_type)).join(", ")}.`,
      );
    }
  }
  return out;
}

function exerciseSection(e: ReportExercise): string[] {
  const out = ["", `${oneLine(e.name)} (${plural(e.sessions.length, "session")})`];
  out.push(`- Best set each session: ${e.sessions.slice(-8).map((p) => setText(p.best_set, e.load_type)).join(", ")}`);
  const d = e.first_to_last;
  if (!d) {
    out.push("- One session only, so no trend yet.");
  } else {
    const first = e.sessions[0];
    const last = e.sessions[e.sessions.length - 1];
    const reps = `- Most reps in a set ${shortDate(first.date)} to ${shortDate(last.date)}: ${first.max_reps} to ${last.max_reps} (${signed(d.max_reps)})`;
    if (d.e1rm !== null && first.top_e1rm !== null && last.top_e1rm !== null) {
      out.push(`- e1RM ${shortDate(first.date)} to ${shortDate(last.date)}: ${num(first.top_e1rm)} to ${num(last.top_e1rm)} (${signed(d.e1rm)}${d.e1rm_pct !== null ? `, ${signed(d.e1rm_pct)}%` : ""})`);
      // Reps past the cap do not move the e1RM, so show them too.
      if (Math.max(first.max_reps, last.max_reps) > E1RM_REP_CAP) out.push(`${reps}. Reps above ${E1RM_REP_CAP} do not raise the e1RM.`);
    } else {
      out.push(`${reps}. No e1RM for this exercise.`);
    }
  }
  if (e.is_pr && e.period_best_e1rm !== null && e.previous_best_e1rm !== null) {
    out.push(`- New e1RM best: ${num(e.period_best_e1rm)}, up from ${num(e.previous_best_e1rm)}.`);
  }
  return out;
}

export function renderMarkdown(r: ReportJson): string {
  const unit: Unit = r.unit;
  const out: string[] = [`# ${r.title}`, ""];
  out.push(`Weights are in ${unit}. Generated ${fullDate(localDate(r.generated_at, r.timezone))}. Timezone: ${r.timezone}.`);
  out.push("RIR means reps in reserve. e1RM is the estimated one-rep max (Epley formula, reps above 12 count as 12).");
  out.push(
    r.kind === "session"
      ? `Context window for the weekly figures: the 7 days ending ${fullDate(r.period.to)}.`
      : `Period: ${dateRange(r.period.from, r.period.to)} (${r.period.days} days).`,
  );

  if (r.kind === "session" && r.session_detail) out.push(...sessionSection(r.session_detail));

  const c = r.consistency;
  out.push("", r.kind === "session" ? "## Consistency in the context window" : "## Consistency");
  out.push(
    c.planned !== null
      ? `- Sessions completed: ${c.completed} of ${c.planned} planned${c.adherence !== null ? ` (${Math.round(c.adherence * 100)}%)` : ""}`
      : `- Sessions completed: ${c.completed}. No active program, so nothing to compare with.`,
  );
  out.push(`- Training days: ${c.training_days}${c.longest_gap_days !== null ? `. Longest gap between training days: ${plural(c.longest_gap_days, "day")}` : ""}`);
  if (c.abandoned) out.push(`- Abandoned workouts: ${c.abandoned}`);
  if (c.days_since_last === null) out.push("- No completed session on record.");
  else if (c.days_since_last === 0) out.push(`- Last completed session: ${shortDate(c.to)}`);
  else out.push(`- Last completed session: ${plural(c.days_since_last, "day")} before ${shortDate(c.to)}`);

  out.push("", r.kind === "session" ? "## Sessions in the context window" : "## Sessions");
  if (!r.sessions.length) out.push("No completed workouts in this period.");
  for (const s of r.sessions) {
    const bits = [
      s.duration_minutes !== null ? `${s.duration_minutes} min` : null,
      plural(s.exercises, "exercise"),
      plural(s.work_sets, "work set"),
      s.session_rpe !== null ? `session RPE ${s.session_rpe}` : null,
    ].filter((x): x is string => x !== null);
    out.push(`- ${shortDate(s.date)}, ${oneLine(s.day_name ?? "Workout")}: ${bits.join(", ")}`);
  }

  if (r.kind !== "session") {
    out.push("", "## Exercise progress");
    if (!r.exercises.length) out.push("No work sets logged in this period.");
    for (const e of r.exercises) out.push(...exerciseSection(e));
  }

  const v = r.weekly_volume;
  out.push("", "## Hard sets per muscle");
  out.push(
    `Hard sets are work sets with 4 or fewer reps in reserve, or with no RIR logged. Secondary muscles count half. FORGE's reference range is ${v.reference_min} to ${v.reference_max} per muscle per week.`,
  );
  out.push(v.weeks.length === 1 ? `Week of ${dateRange(v.weeks[0].from, v.weeks[0].to)}:` : `Per week, oldest first, starting ${shortDate(v.weeks[0].from)}:`);
  const idle: string[] = [];
  for (const [i, m] of v.weeks[0].muscles.entries()) {
    const weekly = v.weeks.map((w) => w.muscles[i]);
    const total = weekly.reduce((n, x) => n + x.sets, 0);
    if (!total) {
      idle.push(words(m.muscle));
    } else if (weekly.length === 1) {
      out.push(`- ${words(m.muscle)}: ${num(m.sets)} (${m.direct_sets} direct, ${m.indirect_sets} indirect), ${plural(m.sessions, "session")}`);
    } else {
      out.push(`- ${words(m.muscle)}: ${weekly.map((x) => num(x.sets)).join(", ")} (average ${num(total / weekly.length)})`);
    }
  }
  if (idle.length) out.push(`- No hard sets: ${idle.join(", ")}`);

  const rec = r.recovery;
  out.push("", "## Recovery");
  if (!rec.days_logged) {
    out.push("Nothing logged in this period.");
  } else {
    out.push(`- Logged ${rec.days_logged} of ${rec.days_in_period} days`);
    const avgs = [
      rec.avg_sleep_hours !== null ? `sleep ${num(rec.avg_sleep_hours)} h` : null,
      rec.avg_sleep_quality !== null ? `sleep quality ${num(rec.avg_sleep_quality)}` : null,
      rec.avg_soreness !== null ? `soreness ${num(rec.avg_soreness)}` : null,
      rec.avg_energy !== null ? `energy ${num(rec.avg_energy)}` : null,
      rec.avg_stress !== null ? `stress ${num(rec.avg_stress)}` : null,
    ].filter((x): x is string => x !== null);
    out.push(`- Averages: ${avgs.join(", ")}. Ratings run 1 to 5; for soreness and stress, higher is worse.`);
    out.push(`- Nights under 6 h: ${rec.short_sleep_nights}. Days with soreness 4 or more: ${rec.high_soreness_days}`);
  }

  const t = r.bodyweight_trend;
  out.push("", "## Bodyweight");
  if (!t.latest) {
    out.push(r.athlete.bodyweight ? `No readings in the last 28 days. Profile bodyweight: ${num(r.athlete.bodyweight.value)} ${unit}.` : "No readings in the last 28 days.");
  } else {
    out.push(`- ${plural(t.points.length, "reading")} in the last 28 days. Latest: ${num(t.latest.bodyweight)} ${unit} on ${shortDate(t.latest.date)}`);
    if (t.change !== null && t.first) {
      out.push(`- Change since ${shortDate(t.first.date)}: ${signed(t.change)} ${unit}${t.per_week !== null ? `, ${signed(t.per_week)} ${unit} per week` : ""}`);
    }
  }

  const dec = r.decisions;
  out.push("", "## Automatic progression decisions");
  out.push(r.kind === "session" ? "Made by FORGE's rules after this workout." : "Made by FORGE's rules after each workout.");
  if (!dec.total) out.push("None in this period.");
  else {
    out.push(`Totals: ${(Object.keys(ACTION_LABEL) as ProgressionAction[]).filter((a) => dec.by_action[a]).map((a) => `${ACTION_LABEL[a]} ${dec.by_action[a]}`).join(", ")}.`);
    for (const d of dec.items) {
      const date = shortDate(localDate(d.decided_at, r.timezone));
      const unchanged = d.action === "hold" || prescriptionText(d.before) === prescriptionText(d.after);
      const change = unchanged
        ? ""
        : ` ${d.from_exercise ? `Was ${oneLine(d.from_exercise)}, ` : "Was "}${prescriptionText(d.before)}; now ${prescriptionText(d.after)}.`;
      out.push(`- ${date}, ${oneLine(d.exercise)}: ${ACTION_LABEL[d.action]}.${change} Reason: ${oneLine(d.reason)}`);
    }
    if (dec.total > dec.items.length) out.push(`Showing the newest ${dec.items.length} of ${dec.total}.`);
  }

  out.push("", "## Pain flags");
  if (!r.pain_flags.length) out.push("None marked. (Sets the athlete marks as painful appear here. No diagnosis is implied.)");
  for (const p of r.pain_flags) out.push(`- ${shortDate(p.date)}, ${oneLine(p.exercise)}: ${setText(p, p.load_type)}${p.is_warmup ? " (warmup)" : ""}`);

  out.push("", "## Athlete");
  if (r.athlete.display_name) out.push(`- Name: ${oneLine(r.athlete.display_name)}`);
  out.push(r.athlete.bodyweight ? `- Bodyweight: ${num(r.athlete.bodyweight.value)} ${unit}${r.athlete.bodyweight.date ? ` (logged ${shortDate(r.athlete.bodyweight.date)})` : " (from profile)"}` : "- Bodyweight: unknown");
  if (!r.athlete.goals.length) out.push("- Goals: none set");
  for (const g of r.athlete.goals) out.push(`- Goal: ${goalText(g)}`);
  if (!r.athlete.equipment.length) out.push("- Equipment: none set");
  for (const e of r.athlete.equipment) out.push(`- Equipment: ${equipmentText(e)}`);

  out.push("", "## Program");
  if (!r.program) out.push("No active program.");
  else {
    out.push(`${programHeadline(r.program)}.`);
    for (const d of r.program.days) {
      out.push("", `${oneLine(d.name)} (${d.focus})`);
      for (const e of d.exercises) out.push(`- ${oneLine(e.name)}: ${prescriptionText(e)}`);
      if (!d.exercises.length) out.push("- No exercises");
    }
  }

  if (r.missing.length) {
    out.push("", "## Missing data");
    for (const m of r.missing) out.push(`- ${m}`);
  }
  return `${out.join("\n")}\n`;
}
