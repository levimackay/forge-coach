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
    expect(out).toContain(">10<");
    expect(out).toContain(">20<");
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
  });
});
