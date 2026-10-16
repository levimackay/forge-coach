import { useId, type ReactNode } from "react";
import { named } from "@/components/ui/name";

/**
 * A named block of a screen: the name in medium weight with its period, an optional short note at the
 * right edge, then an optional sentence in light weight. The heading names the region for screen readers.
 */
export function Section({
  title,
  description,
  aside,
  children,
  anchor,
}: {
  title: string;
  description?: ReactNode;
  /** A few words aligned to the right of the name, such as "Band 10 to 20". */
  aside?: ReactNode;
  children: ReactNode;
  /** Makes the section a link target such as `#connect`. */
  anchor?: string;
}) {
  const id = useId();
  return (
    <section id={anchor} aria-labelledby={id} className="scroll-mt-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={id} className="text-name">
          {named(title)}
        </h2>
        {aside ? <p className="shrink-0 text-small">{aside}</p> : null}
      </div>
      {description ? <p className="mt-1 text-why">{description}</p> : null}
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </section>
  );
}
