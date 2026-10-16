import { named } from "@/components/ui/name";
import type { DiffBlock, DiffRow } from "./diff";

/**
 * Label and value rows. A row with a before value reads "3 → 4", the new value in medium weight;
 * screen readers hear "3 changes to 4".
 */
export function DiffRows({ rows }: { rows: DiffRow[] }) {
  return (
    <dl>
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[var(--label-col)_minmax(0,1fr)] items-baseline py-1">
          <dt>{row.label}</dt>
          <dd className="min-w-0">
            {row.before !== null ? (
              <>
                <span>{row.before}</span>
                <span aria-hidden="true">{" → "}</span>
                <span className="sr-only">{" changes to "}</span>
                <span className="font-medium">{row.after}</span>
              </>
            ) : (
              <span className="font-medium">{row.after}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** One hairline-separated block per change: the verb and the name, where it happens, then the rows. */
export function DiffView({ blocks, label }: { blocks: DiffBlock[]; label: string }) {
  return (
    <ul aria-label={label} className="border-b border-rule">
      {blocks.map((block) => (
        <li key={block.key} className="flex flex-col gap-1 border-t border-rule py-3">
          <p className="text-name">
            <span className="font-normal">{`${block.verb} `}</span>
            {named(block.title)}
          </p>
          {block.place ? <p className="text-small">{block.place}</p> : null}
          {block.warning ? <p className="text-small font-medium">{block.warning}</p> : null}
          {block.rows.length > 0 ? (
            <div className="mt-1">
              <DiffRows rows={block.rows} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
