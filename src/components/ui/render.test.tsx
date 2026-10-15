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
  });

  it("EmptyState, Skeleton, closed Sheet and the toast region render", () => {
    expect(html(<EmptyState title="No workouts yet">Start one from Today.</EmptyState>)).toContain("Start one from Today.");
    expect(html(<Skeleton className="h-8 w-24" />)).toContain('aria-hidden="true"');
    expect(html(<Sheet open={false} onClose={() => {}} title="Edit">body</Sheet>)).not.toContain("body");
    expect(html(<ToastProvider><p>app</p></ToastProvider>)).toContain('aria-live="polite"');
  });
});
