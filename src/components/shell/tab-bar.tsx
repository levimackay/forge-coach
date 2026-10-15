"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  IconCoach,
  IconProgram,
  IconProgress,
  IconSettings,
  IconToday,
  type IconProps,
} from "@/components/ui/icons";

interface Tab {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
  /** Paths that keep this tab highlighted, including the screens opened from it. */
  match: string[];
}

export const TABS: Tab[] = [
  { href: "/today", label: "Today", Icon: IconToday, match: ["/today", "/workout", "/log"] },
  { href: "/program", label: "Program", Icon: IconProgram, match: ["/program"] },
  { href: "/progress", label: "Progress", Icon: IconProgress, match: ["/progress", "/history"] },
  { href: "/coach", label: "Coach", Icon: IconCoach, match: ["/coach"] },
  { href: "/settings", label: "Settings", Icon: IconSettings, match: ["/settings"] },
];

const isWithin = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-safe"
    >
      <ul className="mx-auto flex h-[var(--tabbar-height)] max-w-2xl">
        {TABS.map(({ href, label, Icon, match }) => {
          const active = match.some((base) => isWithin(pathname, base));
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                  active ? "text-ink" : "text-ink-faint active:text-ink-dim"
                }`}
              >
                <Icon size={24} strokeWidth={active ? 2.3 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
