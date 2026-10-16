"use client";

import { useState } from "react";
import { Button, Field } from "@/components/ui";

const WORD = "DELETE";

/** Deleting asks for the word DELETE, then runs `onConfirm`. A failure stays on screen so it can be retried. */
export function TypedConfirm({
  description,
  action,
  onConfirm,
  onClose,
}: {
  description: string;
  action: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work.");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p>{description}</p>
      <Field
        label={`Type ${WORD} to confirm`}
        value={typed}
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        error={error}
        onChange={(e) => setTyped(e.target.value)}
      />
      <div className="flex flex-col">
        <Button variant="danger" className="bleed" loading={busy} disabled={typed.trim() !== WORD} onClick={() => void run()}>
          {action}
        </Button>
        <Button variant="secondary" size="lg" fullWidth disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
