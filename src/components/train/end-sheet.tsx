"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { EffortWords } from "./bits";
import { SESSION_RPE, type Effort } from "./effort";
import { countLabel } from "./format";

/**
 * Ending a workout: how it felt, then Finish; or throw it away. Both come back here as a throw,
 * so the sheet can say what went wrong where the lifter is looking.
 */
export function EndSheet({
  open,
  onClose,
  workSets,
  untrained,
  onFinish,
  onDiscard,
}: {
  open: boolean;
  onClose: () => void;
  workSets: number;
  /** Names of the exercises with no work set, which the plan leaves as they are. */
  untrained: string[];
  onFinish: (rpe: number | null, notes: string) => Promise<void>;
  onDiscard: () => Promise<void>;
}) {
  const [feel, setFeel] = useState<Effort | null>(null);
  const [notes, setNotes] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError(failure);
      setBusy(false);
    }
  };

  const close = () => {
    setConfirming(false);
    setError(null);
    onClose();
  };

  // With nothing logged there is nothing to finish, only to keep going or to drop.
  const discarding = confirming || workSets === 0;
  const alert = error ? (
    <p role="alert" className="border-b border-rule px-safe py-3 font-medium">
      {error}
    </p>
  ) : null;

  return (
    <Sheet
      open={open}
      onClose={close}
      title={discarding ? "Discard this workout?" : "End workout"}
      footer={
        discarding ? (
          <>
            {alert}
            <div className="flex items-stretch">
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                disabled={busy}
                onClick={workSets === 0 ? close : () => setConfirming(false)}
              >
                Keep going
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                loading={busy}
                onClick={() => void run(onDiscard, "The workout was not discarded. Try again.")}
              >
                Discard
              </Button>
            </div>
          </>
        ) : (
          <>
            {alert}
            <Button
              variant="primary"
              className="w-full"
              loading={busy}
              onClick={() =>
                void run(
                  () => onFinish(feel === null ? null : SESSION_RPE[feel], notes),
                  "The workout was not finished. Your sets are still saved. Try again.",
                )
              }
            >
              Finish workout
            </Button>
          </>
        )
      }
    >
      {discarding ? (
        <p>
          {workSets > 0 ? `The ${countLabel(workSets, "set")} you logged will not count.` : "Nothing has been logged yet."}
        </p>
      ) : (
        <div className="flex flex-col gap-5 pb-2">
          <div>
            <p className="pb-2 font-light">How was the workout?</p>
            <EffortWords label="How was the workout" value={feel} onChange={setFeel} />
          </div>
          {untrained.length > 0 ? <p className="font-light">Not done: {untrained.join(", ")}.</p> : null}
          {noteOpen ? (
            <Field label="Note" multiline rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          ) : (
            <div>
              <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setNoteOpen(true)}>
                Add a note
              </Button>
            </div>
          )}
          <div>
            <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setConfirming(true)}>
              Discard workout
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
