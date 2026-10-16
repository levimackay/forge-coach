"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  href: string;
  label: string;
  /** Paths that keep this tab highlighted, including the screens opened from it. */
  match: string[];
}

export const TABS: Tab[] = [
  { href: "/today", label: "Today", match: ["/today", "/workout", "/log"] },
  { href: "/program", label: "Program", match: ["/program"] },
  { href: "/progress", label: "Progress", match: ["/progress", "/history"] },
  { href: "/coach", label: "Coach", match: ["/coach"] },
  { href: "/settings", label: "Settings", match: ["/settings"] },
];

const isWithin = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/** Five words on a hairline. The current one is ink and underlined, the others grey. */
export function TabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-ground pb-safe">
      <ul className="mx-auto grid h-[var(--tabbar-height)] max-w-2xl grid-cols-5">
        {TABS.map(({ href, label, match }) => {
          const active = match.some((base) => isWithin(pathname, base));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full min-h-11 items-center justify-center text-small ${active ? "text-ink" : "text-grey"}`}
              >
                <span className={active ? "underline decoration-2 underline-offset-[7px]" : undefined}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
