import type { Report } from "@/lib/reports";

/** Puts text on the clipboard. Falls back to a hidden textarea where the async API is blocked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fall through to the older route
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

export function reportFilename(report: Pick<Report, "json">, ext: "md" | "json"): string {
  const { kind, period } = report.json;
  return `forge-${kind}-${period.to}.${ext}`;
}

/**
 * Saves text as a file. On a phone the share sheet offers "Save to Files", which a plain download link does
 * not do reliably in an installed web app; elsewhere a normal download is used.
 */
export async function saveTextFile(filename: string, content: string, mime: string): Promise<void> {
  const file = new File([content], filename, { type: mime });
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  if (touch && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      // Closing the sheet is a choice, not a failure.
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
