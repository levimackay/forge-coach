"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProposals } from "@/lib/local/hooks";

interface Tab {
  href: string;
  label: string;
  /** Paths that keep this tab highlighted, including the screens opened from it. */
  match: string[];
}

export const TABS: Tab[] = [
  { href: "/today", label: "Today", match: ["/today", "/workout", "/more", "/program", "/history", "/log", "/settings"] },
  { href: "/progress", label: "Progress", match: ["/progress"] },
  { href: "/coach", label: "Coach", match: ["/coach"] },
];

const isWithin = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/**
 * Three words on a hairline. The current one is ink and underlined, the others grey. A small ink
 * square after Coach means a suggestion is waiting.
 */
export function TabBar() {
  const pathname = usePathname();
  const waiting = (useProposals("pending")?.length ?? 0) > 0;
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-ground pb-safe">
      <ul className="mx-auto grid h-[var(--tabbar-height)] max-w-2xl grid-cols-3">
        {TABS.map(({ href, label, match }) => {
          const active = match.some((base) => isWithin(pathname, base));
          const mark = href === "/coach" && waiting;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full min-h-11 items-center justify-center text-word ${active ? "text-ink" : "text-grey"}`}
              >
                <span className={active ? "underline decoration-2 underline-offset-[7px]" : undefined}>{label}</span>
                {mark ? (
                  <>
                    <span aria-hidden="true" className="ml-1.5 inline-block h-1.5 w-1.5 self-start bg-ink mt-3" />
                    <span className="sr-only">, suggestion waiting</span>
                  </>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
