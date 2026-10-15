import { IconChevronRight } from "@/components/ui/icons";

/** A tappable list row whose text wraps instead of being cut off, for sentences such as a goal. */
export function WrapList({ label, rows }: { label: string; rows: { key: string; title: string; subtitle: string; onClick: () => void }[] }) {
  return (
    <ul aria-label={label} className="overflow-hidden rounded-card border border-line bg-surface">
      {rows.map((row) => (
        <li key={row.key} className="border-b border-line last:border-b-0">
          <button
            type="button"
            onClick={row.onClick}
            className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-raised"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] text-ink">{row.title}</span>
              <span className="block text-[15px] text-ink-dim">{row.subtitle}</span>
            </span>
            <IconChevronRight size={20} className="shrink-0 text-ink-faint" />
          </button>
        </li>
      ))}
    </ul>
  );
}
