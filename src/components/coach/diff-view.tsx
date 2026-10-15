import type { DiffBlock, DiffRow } from "./diff";

/** Label and value pairs. A row with a before value reads "3 → 4"; screen readers hear "3 changes to 4". */
export function DiffRows({ rows }: { rows: DiffRow[] }) {
  return (
    <dl className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4 text-[15px]">
          <dt className="shrink-0 text-ink-dim">{row.label}</dt>
          <dd className="min-w-0 text-right">
            {row.before !== null ? (
              <>
                <span className="text-ink-dim">{row.before}</span>
                <span aria-hidden="true">{" → "}</span>
                <span className="sr-only">{" changes to "}</span>
                <span className="font-semibold text-ink">{row.after}</span>
              </>
            ) : (
              <span className="font-semibold text-ink">{row.after}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function DiffView({ blocks, label }: { blocks: DiffBlock[]; label: string }) {
  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {blocks.map((block) => (
        <li key={block.key} className="flex flex-col gap-1 rounded-control border border-line bg-raised p-3">
          <p className="text-[17px] font-semibold text-ink">
            <span className="font-medium text-ink-dim">{`${block.verb} `}</span>
            {block.title}
          </p>
          {block.place ? <p className="text-[15px] text-ink-dim">{block.place}</p> : null}
          {block.warning ? <p className="text-[15px] font-medium text-ink">{block.warning}</p> : null}
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
