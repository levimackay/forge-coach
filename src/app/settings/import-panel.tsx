"use client";

import { useRef, useState, type ChangeEvent } from "react";
import type { ForgeExport } from "@/lib/domain/types";
import { Button, useToast } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { importExport } from "@/lib/local";
import { MAX_IMPORT_BYTES, previewImport, type ImportPreview } from "./import-preview";

type ImportState =
  | { phase: "idle" }
  | { phase: "reading" }
  | { phase: "error"; message: string }
  | { phase: "preview"; fileName: string; preview: ImportPreview; data: ForgeExport }
  | { phase: "importing" };

const count = (n: number) => n.toLocaleString("en-US");

export function ImportPanel({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ImportState>({ phase: "idle" });

  const pickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Clear it so choosing the same file again still fires a change.
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setState({ phase: "error", message: "That file is over 25 MB, which is far larger than a FORGE export." });
      return;
    }
    setState({ phase: "reading" });
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      setState({ phase: "error", message: "That file is not JSON. Choose a file saved with Export." });
      return;
    }
    const result = previewImport(json, user?.id ?? null);
    setState(
      result.ok
        ? { phase: "preview", fileName: file.name, preview: result.preview, data: result.data }
        : { phase: "error", message: result.message },
    );
  };

  const confirmImport = async (data: ForgeExport) => {
    setState({ phase: "importing" });
    try {
      const { imported } = await importExport(data);
      const rows = Object.values(imported).reduce((n, c) => n + (c ?? 0), 0);
      toast(`Imported ${count(rows)} rows. They sync in the background.`);
      onDone();
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : "The import failed." });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {state.phase === "preview" || state.phase === "importing" ? (
        <ImportSummary state={state} onCancel={() => setState({ phase: "idle" })} onConfirm={confirmImport} />
      ) : (
        <>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => void pickFile(e)}
          />
          {state.phase === "error" ? (
            <p role="alert" className="border-l-2 border-ink pl-3 font-medium">
              {state.message}
            </p>
          ) : null}
          <Button variant="primary" className="bleed" loading={state.phase === "reading"} onClick={() => fileInput.current?.click()}>
            Choose an export file
          </Button>
        </>
      )}
    </div>
  );
}

function ImportSummary({
  state,
  onCancel,
  onConfirm,
}: {
  state: Extract<ImportState, { phase: "preview" | "importing" }>;
  onCancel: () => void;
  onConfirm: (data: ForgeExport) => Promise<void>;
}) {
  if (state.phase === "importing") {
    return <p role="status">Importing. Keep this screen open.</p>;
  }
  const { preview, data, fileName } = state;
  return (
    <div className="flex flex-col gap-3">
      <p className="break-all text-name">{`${fileName} is a valid export`}</p>
      <p className="text-small">{`Exported ${new Date(preview.exportedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}.`}</p>
      {preview.rows.length > 0 ? (
        <ul aria-label="Rows to import" className="border-b border-rule">
          {preview.rows.map((r) => (
            <li key={r.table} className="flex items-baseline justify-between gap-3 border-t border-rule py-2">
              <span>{r.label}</span>
              <span className="text-fig-24">{count(r.count)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>This file has no rows to import.</p>
      )}
      {preview.skipped > 0 ? (
        <p className="text-why">{`${count(preview.skipped)} rows are skipped: the shared exercise library, proposals and the activity log are not imported.`}</p>
      ) : null}
      {preview.otherAccount ? (
        <p className="border-l-2 border-ink pl-3 font-medium">
          This file was exported from a different account. Its rows will be added to this one.
        </p>
      ) : null}
      <div className="bleed flex items-stretch">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" className="flex-1" disabled={preview.total === 0} onClick={() => void onConfirm(data)}>
          {`Import ${count(preview.total)} rows`}
        </Button>
      </div>
    </div>
  );
}
