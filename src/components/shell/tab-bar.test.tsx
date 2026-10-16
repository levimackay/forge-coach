import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ path: "/today", pending: undefined as unknown[] | undefined }));

vi.mock("next/navigation", () => ({ usePathname: () => mock.path }));
vi.mock("@/lib/local/hooks", () => ({ useProposals: () => mock.pending }));

import { TABS, TabBar } from "./tab-bar";

const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

beforeEach(() => {
  mock.path = "/today";
  mock.pending = [];
});

describe("TabBar", () => {
  it("has exactly Today, Progress and Coach", () => {
    expect(TABS.map((t) => t.label)).toEqual(["Today", "Progress", "Coach"]);
    expect(renderToStaticMarkup(<TabBar />).match(/<a /g)).toHaveLength(3);
  });

  it("keeps Today lit on the screens opened from it", () => {
    for (const path of ["/today", "/workout", "/more", "/program", "/history", "/history/session", "/log", "/settings"]) {
      mock.path = path;
      const out = renderToStaticMarkup(<TabBar />);
      expect(out.match(/aria-current="page"/g), path).toHaveLength(1);
      expect(out, path).toMatch(/aria-current="page"[^>]*>\s*<span[^>]*>Today</);
    }
  });

  it("lights Progress and Coach on their own paths", () => {
    mock.path = "/progress";
    expect(renderToStaticMarkup(<TabBar />)).toMatch(/aria-current="page"[^>]*>\s*<span[^>]*>Progress</);
    mock.path = "/coach";
    expect(renderToStaticMarkup(<TabBar />)).toMatch(/aria-current="page"[^>]*>\s*<span[^>]*>Coach</);
  });

  it("marks Coach only while a suggestion is waiting", () => {
    expect(text(renderToStaticMarkup(<TabBar />))).not.toContain("suggestion waiting");
    mock.pending = undefined;
    expect(text(renderToStaticMarkup(<TabBar />))).not.toContain("suggestion waiting");
    mock.pending = [{ id: "p" }];
    const out = renderToStaticMarkup(<TabBar />);
    expect(text(out)).toContain("Coach , suggestion waiting");
    expect(out.match(/bg-ink/g)).toHaveLength(1);
  });
});
