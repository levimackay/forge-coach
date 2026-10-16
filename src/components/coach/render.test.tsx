import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AuditEntry, CoachProposal } from "@/lib/domain/types";
import { ActivityLog, describeAudit } from "./activity-log";
import { splitGrants, toGrants } from "./connection";
import { DiffView } from "./diff-view";
import { HistoryList } from "./history-list";
import { ProposalCard } from "./proposal-card";
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
  it("shows title, source, age, rationale, the diff and both actions", () => {
    const out = card();
    expect(out).toContain("Add a set of lateral raises");
    expect(out).toContain("From Claude, 2 hours ago");
    expect(out).toContain("Side delts get three sets a week.");
    expect(out).toContain("Lateral raise");
    expect(out).toContain(">Approve<");
    expect(out).toContain(">Reject<");
    expect(out).toContain("Note (optional)");
    expect(out).not.toContain("changed since this was proposed");
    expect(out).not.toContain('disabled=""');
  });

  it("names the proposal with a period, approves with an ink band and rejects with plain text", () => {
    const out = card();
    expect(out).toContain("Add a set of lateral raises.");
    expect(out).toMatch(/<button[^>]*class="[^"]*bg-ink[^"]*"[^>]*><span>Approve<\/span>/);
    expect(out).toMatch(/<button[^>]*class="[^"]*underline[^"]*"[^>]*>Reject<\/button>/);
    expect(out).not.toMatch(/rounded|shadow|bg-red/);
  });

  it("labels a proposal the user made as coming from them", () => {
    expect(card({ proposal: proposal({ source: "user", client_id: null }) })).toContain("From You, ");
  });

  it("warns when the program version moved on, naming both versions", () => {
    const out = card({ programVersion: 5 });
    expect(out).toContain("Your program changed since this was proposed");
    expect(out).toContain("version 2");
    expect(out).toContain("version 5");
  });

  it("warns when the program is missing or no longer active", () => {
    expect(card({ programVersion: null })).toContain("This program is not on this device");
    expect(card({ programActive: false })).toContain("This program is no longer active");
  });

  it("disables both actions offline and says why", () => {
    const out = card({ online: false });
    expect(out.match(/disabled=""/g)).toHaveLength(2);
    expect(out).toContain("You are offline.");
    expect(out).toMatch(/aria-describedby="[^"]+"/);
  });

  it("keeps every card's buttons off while one action runs", () => {
    const out = card({ anyBusy: true });
    expect(out.match(/disabled=""/g)).toHaveLength(2);
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
