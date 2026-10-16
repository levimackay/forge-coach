import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LineChart } from "./line-chart";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

const POINTS = [
  { x: 1, y: 135, label: "Oct 1" },
  { x: 8, y: 145, label: "Oct 8" },
  { x: 15, y: 150, label: "Oct 15" },
];

const textsBySize = (out: string) =>
  [...out.matchAll(/<text [^>]*font-size="(\d+)"[^>]*>([^<]*)<\/text>/g)].map((m) => [m[1], m[2]] as const);

describe("LineChart", () => {
  it("lists every value in a table for assistive tech and hides the drawing from it", () => {
    const out = html(<LineChart points={POINTS} label="Bench press estimated max by workout" unit="lb" />);
    expect(out).toContain("<caption>Bench press estimated max by workout</caption>");
    expect(out.match(/<tr>/g)).toHaveLength(POINTS.length + 1);
    expect(out).toContain("<td>145 lb</td>");
    expect(out).toContain('aria-hidden="true"');
  });

  it("draws a line for two or more points and only a marker for one", () => {
    expect(html(<LineChart points={POINTS} label="x" />)).toContain("<path");
    const one = html(<LineChart points={[POINTS[0]]} label="x" />);
    expect(one).not.toContain("<path");
    expect(one).toContain("Oct 1");
  });

  it("labels the first value and the first and last dates, and nothing else", () => {
    const texts = textsBySize(html(<LineChart points={POINTS} label="x" />));
    expect(texts.filter(([size]) => size === "20").map(([, t]) => t)).toEqual(["135"]);
    expect(texts.filter(([size]) => size === "15").map(([, t]) => t)).toEqual(["Oct 1", "Oct 15"]);
    expect(texts).toHaveLength(3);
  });

  it("marks the latest point larger than the rest", () => {
    const radii = [...html(<LineChart points={POINTS} label="x" />).matchAll(/<circle [^>]*r="([\d.]+)"/g)].map((m) => m[1]);
    expect(radii).toEqual(["2.5", "2.5", "4.5"]);
  });

  it("draws no y axis ticks and no gridlines, only the baseline", () => {
    expect(html(<LineChart points={POINTS} label="x" />).match(/<line /g)).toHaveLength(1);
  });

  it("stays as light on a long series: still one value label and two dates", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ x: i, y: 100 + (i % 7), label: `D${i}` }));
    const texts = textsBySize(html(<LineChart points={many} label="x" />));
    expect(texts.map(([, t]) => t)).toEqual(["100", "D0", "D39"]);
  });

  it("formats the value with the caller's formatter and renders nothing without points", () => {
    const out = html(<LineChart points={POINTS} label="x" formatY={(y) => `${Math.round(y)}!`} />);
    expect(out).toContain(">135!</text>");
    expect(html(<LineChart points={[]} label="x" />)).toBe("");
  });

  it("does not crash when every value is the same", () => {
    const flat = POINTS.map((p) => ({ ...p, y: 100 }));
    expect(html(<LineChart points={flat} label="x" />)).toContain("<path");
  });
});
