"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Splash } from "./splash";
import { TabBar } from "./tab-bar";

// Reachable without a session. The consent page handles its own sign-in so it can keep its query.
const PUBLIC_PATHS = ["/login", "/~offline", "/oauth", "/dev"];
// Full-screen flows where the tab bar would get in the way.
const NO_TABS = ["/workout", "/onboarding"];

const within = (pathname: string, bases: string[]) =>
  bases.some((base) => pathname === base || pathname.startsWith(`${base}/`));

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useAuth();

  const isPublic = within(pathname, PUBLIC_PATHS);

  useEffect(() => {
    if (status === "signed_out" && !isPublic) router.replace("/login");
  }, [status, isPublic, router]);

  const signedIn = status === "signed_in";
  const showTabs = signedIn && !isPublic && !within(pathname, NO_TABS);

  let content: ReactNode = children;
  if (!isPublic && !signedIn) content = <Splash />;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-0 focus:top-0 focus:z-50 focus:bg-ink focus:px-4 focus:py-3 focus:text-ground"
      >
        Skip to content
      </a>
      <main
        id="main"
        className={`px-safe pt-safe flex flex-1 flex-col ${
          showTabs ? "pb-[calc(var(--tabbar-height)+env(safe-area-inset-bottom)+16px)]" : "pb-[calc(env(safe-area-inset-bottom)+16px)]"
        }`}
      >
        {content}
      </main>
      {showTabs ? <TabBar /> : null}
    </div>
  );
}
