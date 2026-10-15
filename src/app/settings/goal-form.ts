import type { Goal, Muscle } from "@/lib/domain/types";
import { sentence } from "@/components/coach/format";

export const GOAL_KINDS: { value: Goal["kind"]; label: string }[] = [
  { value: "hypertrophy", label: "Build muscle" },
  { value: "strength", label: "Get stronger" },
  { value: "skill", label: "Learn a skill" },
  { value: "body_composition", label: "Change body composition" },
  { value: "other", label: "Something else" },
];

export const goalKindLabel = (kind: Goal["kind"]): string => GOAL_KINDS.find((k) => k.value === kind)?.label ?? sentence(kind);

export interface GoalDraft {
  kind: Goal["kind"];
  description: string;
  focusMuscles: Muscle[];
  targetDate: string;
  active: boolean;
}

export const blankGoal = (): GoalDraft => ({ kind: "hypertrophy", description: "", focusMuscles: [], targetDate: "", active: true });

export function draftFromGoal(goal: Goal): GoalDraft {
  return {
    kind: goal.kind,
    description: goal.description,
    focusMuscles: goal.focus_muscles,
    targetDate: goal.target_date ?? "",
    active: goal.active,
  };
}

export type GoalResult =
  | { ok: true; value: Pick<Goal, "kind" | "description" | "focus_muscles" | "target_date" | "active"> }
  | { ok: false; errors: { description?: string; targetDate?: string } };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseGoal(draft: GoalDraft): GoalResult {
  const errors: { description?: string; targetDate?: string } = {};
  const description = draft.description.trim();
  if (description === "") errors.description = "Describe the goal in a few words.";
  else if (description.length > 200) errors.description = "Keep it under 200 characters.";
  if (draft.targetDate !== "" && (!DATE.test(draft.targetDate) || Number.isNaN(Date.parse(`${draft.targetDate}T00:00:00Z`)))) {
    errors.targetDate = "Pick a real date.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      kind: draft.kind,
      description,
      focus_muscles: draft.focusMuscles,
      target_date: draft.targetDate === "" ? null : draft.targetDate,
      active: draft.active,
    },
  };
}

export function goalSubtitle(goal: Goal): string {
  const parts = [goalKindLabel(goal.kind)];
  if (goal.focus_muscles.length > 0) parts.push(goal.focus_muscles.map(sentence).join(", "));
  if (goal.target_date) parts.push(`by ${goal.target_date}`);
  if (!goal.active) parts.push("paused");
  return parts.join(", ");
}
