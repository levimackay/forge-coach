import { forgeExportSchema } from "@/lib/local/schema";
import type { ForgeExport, TableRowMap } from "@/lib/domain/types";
import { sentence } from "@/components/coach/format";

export interface ImportPreview {
  exportedAt: string;
  rows: { table: string; label: string; count: number }[];
  total: number;
  /** Rows the import will skip: the shared exercise library and the server-owned proposals and activity log. */
  skipped: number;
  /** The file was exported from another account. Its rows are added to this one. */
  otherAccount: boolean;
}

export type PreviewResult = { ok: true; preview: ImportPreview; data: ForgeExport } | { ok: false; message: string };

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

const SERVER_OWNED = new Set<keyof TableRowMap>(["coach_proposals", "audit_log"]);

const LABELS: Partial<Record<keyof TableRowMap, string>> = {
  planned_exercises: "Planned exercises",
  program_days: "Program days",
  workout_sets: "Logged sets",
  progression_decisions: "Progression decisions",
  equipment_profiles: "Equipment profiles",
  recovery_logs: "Recovery logs",
  body_measurements: "Body measurements",
  exercises: "Custom exercises",
};

/** Checks an export file against the same schema the import uses, and counts what it holds. */
export function previewImport(json: unknown, currentUserId: string | null): PreviewResult {
  const parsed = forgeExportSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.length ? ` at ${issue.path.join(".")}` : "";
    return { ok: false, message: `This file is not a valid FORGE export${where}: ${issue.message}` };
  }
  const data = parsed.data;
  const rows: ImportPreview["rows"] = [];
  let skipped = 0;
  for (const [table, list] of Object.entries(data.tables) as [keyof TableRowMap, unknown[] | undefined][]) {
    if (!list || list.length === 0) continue;
    if (SERVER_OWNED.has(table)) {
      skipped += list.length;
      continue;
    }
    let count = list.length;
    if (table === "exercises") {
      const custom = (list as TableRowMap["exercises"][]).filter((e) => e.user_id !== null).length;
      skipped += count - custom;
      count = custom;
    }
    // Exports carry soft-deleted rows so references survive; they are not rows anyone would count.
    count -= (list as { user_id?: string | null; deleted_at?: string | null }[]).filter(
      (r) => r.deleted_at && (table !== "exercises" || r.user_id !== null),
    ).length;
    if (count > 0) rows.push({ table, label: LABELS[table] ?? sentence(table), count });
  }
  return {
    ok: true,
    data,
    preview: {
      exportedAt: data.exported_at,
      rows,
      total: rows.reduce((n, r) => n + r.count, 0),
      skipped,
      otherAccount: currentUserId !== null && data.user_id !== currentUserId,
    },
  };
}
