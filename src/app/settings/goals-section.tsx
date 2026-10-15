"use client";

import { useState, type FormEvent } from "react";
import { MUSCLES } from "@/lib/analytics";
import type { Goal } from "@/lib/domain/types";
import { sentence } from "@/components/coach/format";
import { NativeSelect } from "@/components/coach/native-select";
import { Section } from "@/components/coach/section";
import { WrapList } from "@/components/coach/wrap-row";
import { Button, EmptyState, Field, Sheet, Skeleton, useToast } from "@/components/ui";
import { putRow, softDelete, useLive } from "@/lib/local";
import { getDb } from "@/lib/local/db";
import { GOAL_KINDS, blankGoal, draftFromGoal, goalSubtitle, parseGoal, type GoalDraft } from "./goal-form";

export function GoalsSection() {
  const goals = useLive(async () => {
    const rows = await getDb().goals.filter((g) => !g.deleted_at).toArray();
    return rows.sort((a, b) => Number(b.active) - Number(a.active) || a.created_at.localeCompare(b.created_at));
  }, []);
  const [editing, setEditing] = useState<Goal | "new" | null>(null);

  return (
    <Section title="Goals" description="Reports and Claude read these, so say what you are actually after.">
      {goals === undefined ? (
        <Skeleton className="h-24 w-full" />
      ) : goals.length === 0 ? (
        <EmptyState title="No goals yet">Add one, such as “Bigger back by spring”, so advice has something to aim at.</EmptyState>
      ) : (
        <WrapList
          label="Goals"
          rows={goals.map((g) => ({ key: g.id, title: g.description, subtitle: goalSubtitle(g), onClick: () => setEditing(g) }))}
        />
      )}
      <Button variant="secondary" disabled={goals === undefined} onClick={() => setEditing("new")}>
        Add goal
      </Button>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New goal" : "Edit goal"}>
        {editing !== null ? <GoalForm existing={editing === "new" ? null : editing} onDone={() => setEditing(null)} /> : null}
      </Sheet>
    </Section>
  );
}

function GoalForm({ existing, onDone }: { existing: Goal | null; onDone: () => void }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<GoalDraft>(() => (existing ? draftFromGoal(existing) : blankGoal()));
  const [errors, setErrors] = useState<{ description?: string; targetDate?: string }>({});
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof GoalDraft>(key: K, value: GoalDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const result = parseGoal(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await putRow("goals", existing ? { ...existing, ...result.value } : result.value);
      toast(existing ? "Goal saved." : "Goal added.");
      onDone();
    } catch (err) {
      toast(`Could not save: ${err instanceof Error ? err.message : "unknown error"}`, { tone: "error" });
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    setBusy(true);
    try {
      await softDelete("goals", existing.id);
      toast("Goal deleted.");
      onDone();
    } catch (err) {
      toast(`Could not delete: ${err instanceof Error ? err.message : "unknown error"}`, { tone: "error" });
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-5 pb-2" noValidate>
      <NativeSelect label="Kind of goal" value={draft.kind} onChange={(v) => set("kind", v as GoalDraft["kind"])} options={GOAL_KINDS} />
      <Field
        label="Goal"
        multiline
        rows={2}
        maxLength={200}
        value={draft.description}
        error={errors.description}
        onChange={(e) => set("description", e.target.value)}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[15px] font-medium text-ink-dim">Muscles to focus on (optional)</legend>
        <div className="flex flex-wrap gap-2">
          {MUSCLES.map((m) => {
            const on = draft.focusMuscles.includes(m);
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                onClick={() => set("focusMuscles", on ? draft.focusMuscles.filter((x) => x !== m) : [...draft.focusMuscles, m])}
                className={`min-h-11 rounded-full border px-4 text-[15px] font-medium ${
                  on ? "border-ink bg-raised text-ink" : "border-line text-ink-dim active:bg-raised"
                }`}
              >
                {sentence(m)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <Field label="Target date (optional)" type="date" value={draft.targetDate} error={errors.targetDate} onChange={(e) => set("targetDate", e.target.value)} />

      <label className="flex min-h-11 items-center gap-3 text-[17px]">
        <input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} className="h-6 w-6 shrink-0 accent-ember" />
        Still working on this
      </label>

      <Button type="submit" variant="primary" size="lg" loading={busy}>
        Save
      </Button>
      {existing ? (
        <Button variant="danger" disabled={busy} onClick={() => void remove()}>
          Delete goal
        </Button>
      ) : null}
    </form>
  );
}
