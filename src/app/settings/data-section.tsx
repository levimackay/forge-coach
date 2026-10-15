"use client";

import { useRef, useState, type ChangeEvent } from "react";
import type { ForgeExport } from "@/lib/domain/types";
import { saveTextFile } from "@/components/coach/browser-actions";
import { Section } from "@/components/coach/section";
import { Button, useToast } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { exportAll, importExport, useSyncStatus } from "@/lib/local";
import { MAX_IMPORT_BYTES, previewImport, type ImportPreview } from "./import-preview";

type ImportState =
  | { phase: "idle" }
  | { phase: "reading" }
  | { phase: "error"; message: string }
  | { phase: "preview"; fileName: string; preview: ImportPreview; data: ForgeExport }
  | { phase: "importing" };

const count = (n: number) => n.toLocaleString("en-US");

export function DataSection() {
  const { user } = useAuth();
  const sync = useSyncStatus();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [state, setState] = useState<ImportState>({ phase: "idle" });

  const runExport = async () => {
    setExporting(true);
    try {
      const data = await exportAll();
      const rows = Object.values(data.tables).reduce((n, list) => n + (list?.length ?? 0), 0);
      await saveTextFile(`forge-export-${data.exported_at.slice(0, 10)}.json`, `${JSON.stringify(data, null, 2)}\n`, "application/json");
      toast(`Exported ${count(rows)} rows.`);
    } catch (err) {
      toast(`Could not export: ${err instanceof Error ? err.message : "unknown error"}`, { tone: "error" });
    } finally {
      setExporting(false);
    }
  };

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
      setState({ phase: "error", message: "That file is not JSON. Choose a file saved with Export all data." });
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
      setState({ phase: "idle" });
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : "The import failed." });
    }
  };

  return (
    <Section title="Your data" description="Everything lives on this device and syncs to your account. These work offline.">
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
        <h3 className="title">Export</h3>
        <p className="text-[15px] text-ink-dim">
          Saves one JSON file with your program, workouts, sets, recovery, body measurements and decisions.
          {sync.pending > 0 ? ` ${sync.pending} recent changes have not synced yet; they are in the file.` : ""}
        </p>
        <Button variant="secondary" loading={exporting} onClick={() => void runExport()}>
          Export all data
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
        <h3 className="title">Import</h3>
        <p className="text-[15px] text-ink-dim">
          Add the contents of a FORGE export to this account. Rows with the same id are updated, nothing is deleted.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void pickFile(e)}
        />
        <Button
          variant="secondary"
          loading={state.phase === "reading"}
          disabled={state.phase === "importing"}
          onClick={() => fileInput.current?.click()}
        >
          Choose an export file
        </Button>

        {state.phase === "error" ? (
          <p role="alert" className="text-[15px] text-danger">
            {state.message}
          </p>
        ) : null}

        {state.phase === "preview" || state.phase === "importing" ? (
          <ImportSummary state={state} onCancel={() => setState({ phase: "idle" })} onConfirm={confirmImport} />
        ) : null}
      </div>
    </Section>
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
    return (
      <p role="status" className="text-[15px] text-ink-dim">
        Importing. Keep this screen open.
      </p>
    );
  }
  const { preview, data, fileName } = state;
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <p className="break-all text-[17px] font-medium text-ink">{`${fileName} is a valid export`}</p>
      <p className="text-[15px] text-ink-dim">{`Exported ${new Date(preview.exportedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}.`}</p>
      {preview.rows.length > 0 ? (
        <ul aria-label="Rows to import" className="flex flex-col gap-1 text-[15px]">
          {preview.rows.map((r) => (
            <li key={r.table} className="flex justify-between gap-3">
              <span className="text-ink-dim">{r.label}</span>
              <span className="font-medium text-ink">{count(r.count)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[15px] text-ink-dim">This file has no rows to import.</p>
      )}
      {preview.skipped > 0 ? (
        <p className="text-[15px] text-ink-faint">{`${count(preview.skipped)} rows are skipped: the shared exercise library, proposals and the activity log are not imported.`}</p>
      ) : null}
      {preview.otherAccount ? (
        <p className="rounded-control border border-ink-faint bg-raised p-3 text-[15px] text-ink">
          This file was exported from a different account. Its rows will be added to this one.
        </p>
      ) : null}
      <div className="flex gap-3">
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
