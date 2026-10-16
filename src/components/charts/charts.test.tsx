import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BandBars, bandStatus } from "./band-bars";
import { LineChart } from "./line-chart";
import { WeekColumns } from "./week-columns";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

const POINTS = [
  { x: 1, y: 135, label: "Oct 1" },
  { x: 8, y: 145, label: "Oct 8" },
  { x: 15, y: 150, label: "Oct 15" },
];

describe("LineChart", () => {
  it("exposes the selected point to assistive tech and lists every value in a table", () => {
    const out = html(<LineChart points={POINTS} selected={1} onSelect={() => {}} label="Bench press estimated one rep max" unit="lb" />);
    expect(out).toContain('role="slider"');
    expect(out).toContain('aria-valuetext="Oct 8: 145 lb"');
    expect(out).toContain('aria-valuenow="1"');
    expect(out).toContain("<caption>Bench press estimated one rep max</caption>");
    expect(out.match(/<tr>/g)).toHaveLength(POINTS.length + 1);
    expect(out).toContain("145 lb");
    expect(out).toContain('aria-hidden="true"');
  });

  it("draws a line for two or more points and only a marker for one", () => {
    const many = html(<LineChart points={POINTS} selected={2} onSelect={() => {}} label="x" />);
    expect(many).toContain("<path");
    const one = html(<LineChart points={[POINTS[0]]} selected={0} onSelect={() => {}} label="x" />);
    expect(one).not.toContain("<path");
    expect(one).toContain("Oct 1");
  });

  it("labels every point with its value and the date, and sets the selected value larger", () => {
    const out = html(<LineChart points={POINTS} selected={2} onSelect={() => {}} label="x" />);
    const texts = [...out.matchAll(/<text [^>]*font-size="(\d+)"[^>]*>([^<]*)<\/text>/g)].map((m) => [m[1], m[2]]);
    expect(texts.filter(([size]) => size === "15").map(([, t]) => t)).toEqual(["135", "145"]);
    expect(texts.filter(([size]) => size === "18").map(([, t]) => t)).toEqual(["150"]);
    expect(texts.filter(([size]) => size === "13").map(([, t]) => t)).toEqual(["Oct 1", "Oct 8", "Oct 15"]);
  });

  it("draws no y axis ticks and no gridlines, only the baseline", () => {
    const out = html(<LineChart points={POINTS} selected={0} onSelect={() => {}} label="x" />);
    expect(out.match(/<line /g)).toHaveLength(1);
  });

  it("thins labels on a long series but still labels the selected point and the last one", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ x: i, y: 100 + (i % 7), label: `D${i}` }));
    const out = html(<LineChart points={many} selected={10} onSelect={() => {}} label="x" />);
    const values = [...out.matchAll(/<text [^>]*font-size="(15|18)"[^>]*>/g)];
    expect(values.length).toBeGreaterThan(1);
    expect(values.length).toBeLessThan(40);
    expect(out).toContain(">D10</text>");
    expect(out).toContain(">D39</text>");
  });

  it("clamps an out of range selection and renders nothing without points", () => {
    expect(html(<LineChart points={POINTS} selected={99} onSelect={() => {}} label="x" />)).toContain('aria-valuenow="2"');
    expect(html(<LineChart points={[]} selected={0} onSelect={() => {}} label="x" />)).toBe("");
  });

  it("does not crash when every value is the same", () => {
    const flat = POINTS.map((p) => ({ ...p, y: 100 }));
    expect(html(<LineChart points={flat} selected={0} onSelect={() => {}} label="x" />)).toContain("<path");
  });
});

describe("BandBars", () => {
  const band = { min: 10, max: 20 };

  it("classifies values against the band edges", () => {
    expect(bandStatus(9.5, band)).toBe("below");
    expect(bandStatus(10, band)).toBe("within");
    expect(bandStatus(20, band)).toBe("within");
    expect(bandStatus(20.5, band)).toBe("above");
  });

  it("puts the band on the same scale as the bars: a rule segment from the band start, an ink bar from zero", () => {
    const out = html(<BandBars label="x" band={band} rows={[{ key: "chest", label: "Chest", value: 12 }, { key: "quads", label: "Quads", value: 24 }]} />);
    const top = Math.max(band.max * 1.15, 12 * 1.05, 24 * 1.05);
    const segment = out.match(/bg-rule" style="left:([\d.]+)%;width:([\d.]+)%/);
    expect(Number(segment?.[1])).toBeCloseTo((band.min / top) * 100, 5);
    expect(Number(segment?.[2])).toBeCloseTo(((band.max - band.min) / top) * 100, 5);
    expect(out.match(/bg-rule"/g)).toHaveLength(2);
    const bar = out.match(/left-0 bg-ink" style="width:([\d.]+)%/);
    expect(Number(bar?.[1])).toBeCloseTo((12 / top) * 100, 5);
  });

  it("states each row's position relative to the range in text, not only color", () => {
    const out = html(
      <BandBars
        label="Hard sets per muscle"
        band={band}
        rows={[
          { key: "chest", label: "Chest", value: 12, detail: "9 direct, 6 indirect" },
          { key: "calves", label: "Calves", value: 4 },
          { key: "quads", label: "Quads", value: 24 },
        ]}
      />,
    );
    expect(out).toContain('aria-label="Hard sets per muscle"');
    expect(out).toContain("inside the reference range, 9 direct, 6 indirect");
    expect(out).toContain("below the reference range");
    expect(out).toContain("above the reference range");
  });
});

describe("WeekColumns", () => {
  it("labels each week with done and planned counts and marks the current week", () => {
    const out = html(
      <WeekColumns
        label="Sessions per week"
        weeks={[
          { key: "a", label: "Oct 6", completed: 3, planned: 4, inProgress: false },
          { key: "b", label: "Oct 13", completed: 1, planned: 4, inProgress: true },
        ]}
      />,
    );
    expect(out).toContain("Week of Oct 6: 3 of 4 planned sessions");
    expect(out).toContain("Week of Oct 13, in progress: 1 of 4 planned sessions");
  });

  it("omits the planned part when there is no program", () => {
    const out = html(<WeekColumns label="x" weeks={[{ key: "a", label: "Oct 6", completed: 2, planned: null, inProgress: false }]} />);
    expect(out).toContain("Week of Oct 6: 2 sessions");
    expect(out).not.toContain("planned");
    expect(out).not.toContain("h-0.5");
  });

  it("draws sessions done as an ink bar with a line at sessions planned, and underlines the week in progress", () => {
    const out = html(
      <WeekColumns
        label="x"
        height={100}
        weeks={[
          { key: "a", label: "Oct 6", completed: 3, planned: 4, inProgress: false },
          { key: "b", label: "Oct 13", completed: 1, planned: 4, inProgress: true },
        ]}
      />,
    );
    expect(out.match(/h-0\.5 bg-ink" style="bottom:99px"/g)).toHaveLength(2);
    expect(out).toContain('bg-ink" style="height:75px"');
    expect(out).toContain('bg-ink" style="height:25px"');
    expect(out.match(/block underline decoration-2/g)).toHaveLength(2);
  });
});
