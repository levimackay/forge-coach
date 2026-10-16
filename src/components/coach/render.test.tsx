import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AuditEntry, CoachProposal } from "@/lib/domain/types";
import { ActivityLog, describeAudit } from "./activity-log";
import { splitGrants, toGrants } from "./connection";
import { DiffView } from "./diff-view";
import { HistoryList } from "./history-list";
import { ProposalCard, cautions } from "./proposal-card";
import type { DiffBlock, DiffContext } from "./diff";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = "2026-10-15T12:00:00.000Z";

const proposal = (over: Partial<CoachProposal> = {}): CoachProposal => ({
  id: ID(1),
  user_id: ID(99),
  created_at: "2026-10-15T10:00:00.000Z",
  updated_at: "2026-10-15T10:00:00.000Z",
  source: "claude",
  client_id: "client",
  program_id: ID(2),
  base_program_version: 2,
  title: "Add a set of lateral raises",
  rationale: "Side delts get three sets a week.",
  changes: [{ op: "update_prescription", planned_exercise_id: ID(3), set: { sets: 4 } }],
  inverse_changes: null,
  status: "pending",
  decided_at: null,
  applied_at: null,
  undone_at: null,
  decision_note: null,
  ...over,
});

const blocks: DiffBlock[] = [
  {
    key: "0",
    verb: "Change",
    title: "Lateral raise",
    place: "Push",
    rows: [{ label: "Sets", before: "3", after: "4" }],
    warning: null,
  },
];

const card = (over: Partial<Parameters<typeof ProposalCard>[0]> = {}) =>
  html(
    <ProposalCard
      proposal={proposal()}
      blocks={blocks}
      programVersion={2}
      programActive
      online
      nowIso={NOW}
      busy={null}
      anyBusy={false}
      onDecide={() => {}}
      {...over}
    />,
  );

describe("ProposalCard", () => {
  it("shows the title, one row per change, Why?, Not now and Approve", () => {
    const out = card();
    expect(out).toContain("Add a set of lateral raises.");
    expect(out).toContain("Lateral raise.");
    expect(out).toContain("3 → 4 sets");
    expect(out).toContain(">Why?<");
    expect(out).toContain(">Not now<");
    expect(out).toContain("<span>Approve</span>");
    expect(out).not.toContain('disabled=""');
  });

  it("keeps the reason, the source and the note field off the screen until Why? is opened", () => {
    const out = card();
    expect(out).not.toContain("Side delts get three sets a week.");
    expect(out).not.toContain("From Claude");
    expect(out).not.toContain("Note");
  });

  it("approves with a pinned ink band and declines with plain text, no radius or shadow or red", () => {
    const out = card();
    expect(out).toMatch(/<button[^>]*class="[^"]*bg-ink[^"]*fixed[^"]*"[^>]*><span>Approve<\/span>/);
    expect(out).toMatch(/<button[^>]*class="[^"]*underline[^"]*"[^>]*>Not now<\/button>/);
    expect(out).not.toMatch(/rounded|shadow|bg-red/);
  });

  it("lists every line of a change that does more than one thing", () => {
    const two: DiffBlock[] = [
      {
        ...blocks[0],
        rows: [
          { label: "Sets", before: "3", after: "4" },
          { label: "Load", before: "20 lb", after: "25 lb" },
        ],
      },
    ];
    const out = card({ blocks: two });
    expect(out).toContain("3 → 4 sets");
    expect(out).toContain("20 lb → 25 lb");
  });

  it("reads each arrow as 'changes to' for screen readers", () => {
    expect(card()).toContain("3 changes to 4 sets");
  });

  it("points at Why? only when there is something to check", () => {
    expect(card()).not.toContain("Check Why?");
    expect(card({ programVersion: 5 })).toContain("Check Why? before you approve.");
    expect(card({ blocks: [{ ...blocks[0], warning: "Already set to these values." }] })).toContain("Check Why? before you approve.");
  });

  it("disables both actions offline and says why", () => {
    const out = card({ online: false });
    expect(out.match(/disabled=""/g)).toHaveLength(2);
    expect(out).toContain("You are offline.");
    expect(out).toMatch(/aria-describedby="[^"]+"/);
  });

  it("keeps the actions off while one runs", () => {
    expect(card({ anyBusy: true }).match(/disabled=""/g)).toHaveLength(2);
  });
});

describe("cautions", () => {
  const base = { base_program_version: 2 };

  it("is empty when the program is the one the suggestion was written for", () => {
    expect(cautions(base, blocks, 2, true)).toEqual([]);
  });

  it("names the program problem: missing, replaced or moved on, with both versions", () => {
    expect(cautions(base, blocks, null, true)[0].title).toBe("This program is not on this device");
    expect(cautions(base, blocks, 2, false)[0].title).toBe("This program is no longer active");
    const moved = cautions(base, blocks, 5, true)[0];
    expect(moved.title).toBe("Your program changed since this was suggested");
    expect(moved.detail).toContain("version 2");
    expect(moved.detail).toContain("version 5");
  });

  it("adds a block's own warning under that exercise's name", () => {
    const warned = [{ ...blocks[0], warning: "Already set to these values." }];
    expect(cautions(base, warned, 2, true)).toEqual([{ title: "Lateral raise", detail: "Already set to these values." }]);
  });
});

describe("DiffView", () => {
  it("reads before and after for screen readers and never shows an em dash", () => {
    const out = html(<DiffView blocks={blocks} label="Changes" />);
    expect(out).toContain("changes to");
    expect(out).toContain("→");
    expect(out).not.toContain(String.fromCharCode(0x2014));
  });

  it("names each change with a period and keeps rows as label and value pairs", () => {
    const out = html(<DiffView blocks={blocks} label="Changes" />);
    expect(out).toContain("Lateral raise.");
    expect(out).toContain("<dt>Sets</dt>");
    expect(out).not.toMatch(/rounded|bg-raised|border-line/);
  });

  it("shows only the new value when there is nothing to compare with", () => {
    const out = html(<DiffView blocks={[{ ...blocks[0], rows: [{ label: "Sets", before: null, after: "4" }] }]} label="x" />);
    expect(out).not.toContain("changes to");
    expect(out).toContain(">4<");
  });
});

describe("HistoryList", () => {
  const ctx: DiffContext = { planned: new Map(), days: new Map(), exercises: new Map(), equipment: new Map(), unit: "lb" };
  const list = (proposals: CoachProposal[], online = true) =>
    html(<HistoryList proposals={proposals} ctx={ctx} online={online} nowIso={NOW} undoing={null} onUndo={() => {}} />);

  it("labels each status and offers undo only on applied changes that can be undone", () => {
    const applied = proposal({
      id: ID(10),
      status: "applied",
      title: "Applied one",
      applied_at: "2026-10-14T12:00:00.000Z",
      inverse_changes: [{ op: "update_prescription", planned_exercise_id: ID(3), set: { sets: 3 } }],
    });
    const rejected = proposal({ id: ID(11), status: "rejected", title: "Rejected one", decided_at: "2026-10-13T12:00:00.000Z", decision_note: "Not now" });
    const undone = proposal({ id: ID(12), status: "undone", title: "Undone one", undone_at: "2026-10-12T12:00:00.000Z" });
    const out = list([applied, rejected, undone]);
    expect(out).toContain("Applied 1 day ago, from Claude");
    expect(out).toContain("Rejected 2 days ago");
    expect(out).toContain("Undone 3 days ago");
    expect(out).toContain("Your note: Not now");
    expect(out.match(/Undo this change/g)).toHaveLength(1);
  });

  it("offers undo as a hairline row, not a band", () => {
    const applied = proposal({ status: "applied", applied_at: NOW, inverse_changes: [] });
    expect(list([applied])).toMatch(/<button[^>]*border-b border-rule[^>]*>[\s\S]*Undo this change/);
  });

  it("does not offer undo without a stored inverse, and explains offline", () => {
    const noInverse = proposal({ status: "applied", applied_at: NOW, inverse_changes: null });
    expect(list([noInverse])).not.toContain("Undo this change");
    const withInverse = proposal({ status: "applied", applied_at: NOW, inverse_changes: [] });
    expect(list([withInverse], false)).toContain("You are offline. Undoing");
  });
});

describe("ActivityLog", () => {
  const entry = (over: Partial<AuditEntry>): AuditEntry => ({
    id: ID(50),
    user_id: ID(99),
    at: NOW,
    actor: "user",
    client_id: null,
    action: "proposal_approved",
    entity: "coach_proposals",
    entity_id: null,
    details: {},
    ...over,
  });

  it("writes known actions as sentences and falls back for unknown ones", () => {
    expect(describeAudit(entry({ actor: "claude", action: "proposal_created", details: { title: "More back" } }))).toEqual({
      text: "Claude proposed a change",
      extra: "More back",
    });
    expect(describeAudit(entry({ action: "proposal_undone", details: { title: "x", program_version: 4 } })).extra).toBe("x, program version 4");
    expect(describeAudit(entry({ action: "proposal_approved", details: { note: " ok " } })).extra).toBe("note:  ok ");
    expect(describeAudit(entry({ action: "proposal.rejected" })).text).toBe("You rejected a change");
    expect(describeAudit(entry({ actor: "system", action: "some_new_action" })).text).toBe("System: some new action");
  });

  it("shows the first eight and offers the rest", () => {
    const entries = Array.from({ length: 11 }, (_, i) => entry({ id: ID(100 + i) }));
    const out = html(<ActivityLog entries={entries} timeZone="UTC" />);
    expect(out.match(/You approved a change/g)).toHaveLength(8);
    expect(out).toContain("Show 3 more");
  });
});

describe("connection grants", () => {
  const grants = toGrants([
    { client: { id: "claude-id", name: "Claude", uri: "", logo_uri: "" }, scopes: [], granted_at: "2026-10-01T00:00:00Z" },
    { client: { id: "other-id", name: "", uri: "", logo_uri: "" }, scopes: [], granted_at: "2026-10-02T00:00:00Z" },
  ]);

  it("maps grants and names an unnamed client", () => {
    expect(grants.map((g) => g.name)).toEqual(["Claude", "An app"]);
  });

  it("splits Claude from other apps when the client id is known, and counts all when it is not", () => {
    const known = splitGrants(grants, "claude-id");
    expect(known.claude.map((g) => g.clientId)).toEqual(["claude-id"]);
    expect(known.other.map((g) => g.clientId)).toEqual(["other-id"]);
    expect(splitGrants(grants, undefined).claude).toHaveLength(2);
    expect(splitGrants([], "claude-id")).toEqual({ claude: [], other: [] });
  });
});
