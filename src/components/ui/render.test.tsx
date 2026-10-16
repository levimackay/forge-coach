import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, ButtonLink } from "./button";
import { EmptyState } from "./empty-state";
import { Field } from "./field";
import { ListGroup, ListRow } from "./list-row";
import { NumberStepper } from "./number-stepper";
import { Segmented } from "./segmented";
import { Sheet } from "./sheet";
import { Skeleton } from "./skeleton";
import { named } from "./name";
import { ToastProvider } from "./toast";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("UI primitives render on the server", () => {
  it("Button keeps a 44px target and exposes loading", () => {
    const out = html(<Button size="sm" loading>Save</Button>);
    expect(out).toContain("min-h-11");
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain("disabled");
    expect(html(<ButtonLink href="/today" variant="primary">Go</ButtonLink>)).toContain('href="/today"');
  });

  it("Button draws primary and destructive actions as square bands and the live one in red", () => {
    const primary = html(<Button variant="primary" detail="160 × 6, 2 RIR">Start workout</Button>);
    expect(primary).toContain("bg-ink");
    expect(primary).toContain("min-h-16");
    expect(primary).toContain("160 × 6, 2 RIR");
    expect(html(<Button variant="danger">Delete</Button>)).toContain("bg-red");
    const live = html(<Button variant="live" pinned="bottom">Log set 2</Button>);
    expect(live).toContain("bg-red");
    expect(live).toContain("fixed");
    expect(html(<Button variant="primary" pinned="tabs">Go</Button>)).toContain("--tabbar-height");
    expect(html(<Button variant="primary">Go</Button>)).not.toContain("fixed");
  });

  it("A disabled band gives up its fill but a loading one keeps it", () => {
    const disabled = html(<Button variant="primary" disabled>Save</Button>);
    expect(disabled).toContain("text-grey");
    expect(disabled).not.toContain("bg-ink");
    expect(html(<Button variant="primary" loading>Save</Button>)).toContain("bg-ink");
  });

  it("Field ties label, hint and error to the control", () => {
    const out = html(<Field label="Email" hint="Used to sign in" error="Required" />);
    expect(out).toMatch(/<label[^>]+for="([^"]+)"/);
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain('role="alert"');
    expect(out).toMatch(/aria-describedby="[^"]+-error [^"]+-hint"/);
    expect(html(<Field label="Notes" multiline rows={4} />)).toContain("<textarea");
  });

  it("NumberStepper labels both buttons and shows the unit", () => {
    const out = html(<NumberStepper label="Weight" unit="lb" value={135} step={5} onChange={() => {}} />);
    expect(out).toContain('aria-label="Decrease Weight"');
    expect(out).toContain('aria-label="Increase Weight"');
    expect(out).toContain('value="135"');
    expect(out).toContain(">lb<");
  });

  it("NumberStepper is one row: 116px for the weight, 80px otherwise, 56px cells on the right", () => {
    const large = html(<NumberStepper large label="Weight" value={160} onChange={() => {}} />);
    expect(large).toContain("h-[116px]");
    expect(large).toContain("text-fig-88");
    expect(large).toContain("w-14");
    const small = html(<NumberStepper label="Reps" value={6} onChange={() => {}} />);
    expect(small).toContain("h-20");
    expect(small).toContain("text-fig-48");
    expect(html(<NumberStepper large label="Weight" value={137.5} onChange={() => {}} />)).toContain("text-fig-48");
  });

  it("Segmented is a radiogroup with one checked option", () => {
    const out = html(
      <Segmented
        label="Unit"
        value="kg"
        onChange={() => {}}
        options={[
          { value: "lb", label: "lb" },
          { value: "kg", label: "kg" },
        ]}
      />,
    );
    expect(out).toContain('role="radiogroup"');
    expect(out.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(out).toContain("underline");
    expect(out).not.toContain(">/<");
    const words = html(
      <Segmented
        slash
        label="Training at"
        value="gym"
        onChange={() => {}}
        options={[
          { value: "home", label: "Home" },
          { value: "gym", label: "Gym" },
        ]}
      />,
    );
    expect(words).toContain(">/<");
  });

  it("ListRow renders as link, button or plain row", () => {
    const out = html(
      <ListGroup label="Items">
        <ListRow title="Link" href="/program" />
        <ListRow title="Button" onClick={() => {}} />
        <ListRow title="Plain" subtitle="detail" trailing="42" />
      </ListGroup>,
    );
    expect(out).toContain('href="/program"');
    expect(out).toContain("<button");
    expect(out.match(/<li>/g)).toHaveLength(3);
    expect(html(<ListRow label="Chest" title="12" />)).toContain("--label-col");
  });

  it("named() puts a period on names and leaves finished text alone", () => {
    expect(named("Legs")).toBe("Legs.");
    expect(named("Barbell back squat.")).toBe("Barbell back squat.");
    expect(named("Delete account?")).toBe("Delete account?");
  });

  it("EmptyState, Skeleton, closed Sheet and the toast region render", () => {
    expect(html(<EmptyState title="No workouts yet">Start one from Today.</EmptyState>)).toContain("Start one from Today.");
    expect(html(<Skeleton className="h-8 w-24" />)).toContain('aria-hidden="true"');
    expect(html(<Skeleton rows={2} />).match(/border-b/g)).toHaveLength(2);
    expect(html(<Sheet open={false} onClose={() => {}} title="Edit">body</Sheet>)).not.toContain("body");
    expect(html(<ToastProvider><p>app</p></ToastProvider>)).toContain('aria-live="polite"');
  });
});
