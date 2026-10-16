"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { devFixtureActive } from "@/lib/local/session";
import { Button, IconChevronRight, Sheet, named, useToast } from "@/components/ui";
import { copyText } from "./browser-actions";
import { splitGrants, toGrants, type Grant, type GrantLookup } from "./connection";
import { dateText } from "./format";
import { Steps } from "./steps";
import { useNowIso, useOnline } from "./use-now";

// Static reads so Next can inline them into the client bundle.
const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL?.trim() || undefined;
const CLIENT_ID = process.env.NEXT_PUBLIC_MCP_OAUTH_CLIENT_ID?.trim() || undefined;

async function lookupGrants(): Promise<GrantLookup> {
  if (devFixtureActive()) return { kind: "error", message: "Connections cannot be checked while the development fixture is loaded." };
  try {
    const { data, error } = await getSupabase().auth.oauth.listGrants();
    if (error) return { kind: "error", message: error.message };
    return { kind: "ok", grants: toGrants(data ?? []) };
  } catch {
    return { kind: "error", message: "Could not reach the server." };
  }
}

export function ConnectPanel() {
  const online = useOnline();
  const nowIso = useNowIso();
  const { toast } = useToast();
  const [result, setResult] = useState<GrantLookup | null>(null);
  const [round, setRound] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    void lookupGrants().then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [online, round]);

  const recheck = useCallback(() => {
    setResult(null);
    setRound((n) => n + 1);
  }, []);

  const split = result?.kind === "ok" ? splitGrants(result.grants, CLIENT_ID) : null;

  const disconnect = async () => {
    if (!split) return;
    setConfirming(false);
    setRevoking(true);
    try {
      for (const grant of split.claude) {
        const { error } = await getSupabase().auth.oauth.revokeGrant({ clientId: grant.clientId });
        if (error) throw new Error(error.message);
      }
      toast("Claude is disconnected.");
    } catch (err) {
      toast(`Could not disconnect: ${err instanceof Error ? err.message : "unknown error"}`, { tone: "error" });
    } finally {
      setRevoking(false);
      recheck();
    }
  };

  const connected = split !== null && split.claude.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="border-b border-rule">
        <StatusLine online={online} result={result} split={split} nowIso={nowIso} />
        {connected ? (
          <div className="grid grid-cols-[var(--label-col)_minmax(0,1fr)] border-t border-rule py-3">
            <span>Access</span>
            <p className="text-why">
              Claude can read your training data and propose program changes. It cannot approve them. You approve every change in this
              tab.
            </p>
          </div>
        ) : null}
      </div>
      {connected || result ? (
        <div className="flex flex-wrap items-center">
          {connected ? (
            <Button variant="secondary" className="-ml-4" disabled={!online || revoking} loading={revoking} onClick={() => setConfirming(true)}>
              Disconnect Claude
            </Button>
          ) : null}
          {result ? (
            <Button variant="ghost" size="sm" className={connected ? "" : "-ml-2"} disabled={!online} onClick={recheck}>
              Check again
            </Button>
          ) : null}
        </div>
      ) : null}

      {connected ? (
        <details className="group border-y border-rule">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
            Setup steps
            <IconChevronRight size={20} className="transition-transform group-open:rotate-90" />
          </summary>
          <div className="pb-4">
            <SetupSteps />
          </div>
        </details>
      ) : (
        <SetupSteps />
      )}

      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Disconnect Claude?"
        footer={
          <div className="flex items-stretch">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirming(false)}>
              Stay connected
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => void disconnect()}>
              Disconnect
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p>Claude will lose access to your training data and can no longer propose changes.</p>
          <p className="text-why">
            A sign-in Claude already holds may keep working for up to an hour before it expires. Proposals already waiting stay in this tab.
          </p>
        </div>
      </Sheet>
    </div>
  );
}

function SetupSteps() {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-name">{named("Connect Claude")}</h3>
      <p className="text-why">
        Claude can then read your sessions and suggest program changes, which appear above for you to approve. Connect it once on a
        computer; after that it works in the Claude app on your iPhone.
      </p>
      <Steps>
        <p>Open claude.ai in a browser and sign in.</p>
        <p>{"Go to Customize > Connectors > Add custom connector."}</p>
        <>
          <p>Paste this address as the server URL.</p>
          <CopyField label="Server URL" value={MCP_URL} missing="NEXT_PUBLIC_MCP_URL is not set in this build." />
        </>
        <>
          <p>Choose Use your own OAuth client, then paste this client ID. Leave the client secret empty.</p>
          <CopyField label="Client ID" value={CLIENT_ID} missing="NEXT_PUBLIC_MCP_OAUTH_CLIENT_ID is not set in this build." />
        </>
        <p>Choose Connect. Claude opens the FORGE sign-in page. Sign in with your FORGE account and approve what Claude can do.</p>
        <p>Open the Claude app on your iPhone, start a chat and switch the FORGE connector on for it. Then ask about your training.</p>
      </Steps>
      <p className="text-why">
        This page only says Claude is connected after Supabase lists a grant for it. If a step fails, remove the connector in Claude and
        add it again; its sign-in settings cannot be edited.
      </p>
    </div>
  );
}

function StatusLine({
  online,
  result,
  split,
  nowIso,
}: {
  online: boolean;
  result: GrantLookup | null;
  split: { claude: Grant[]; other: Grant[] } | null;
  nowIso: string;
}) {
  let title: string;
  let detail: string | null = null;

  if (!online) {
    title = "Connection status unknown";
    detail = "You are offline. Go online to see whether Claude is connected.";
  } else if (!result) {
    title = "Checking the connection";
  } else if (result.kind === "error") {
    title = "Could not check the connection";
    detail = result.message;
  } else if (split && split.claude.length > 0) {
    title = "Claude is connected";
    detail = split.claude.map((g) => `${g.name}, since ${dateText(g.grantedAt, nowIso)}`).join(". ");
  } else {
    title = "Claude is not connected";
    detail =
      split && split.other.length > 0
        ? `Other apps with access: ${split.other.map((g) => g.name).join(", ")}.`
        : "Follow the steps below to connect it.";
  }

  return (
    <div role="status" className="grid grid-cols-[var(--label-col)_minmax(0,1fr)] border-t border-rule py-3">
      <span>Status</span>
      <div className="flex flex-col gap-1">
        <p>{title}</p>
        {detail ? <p className="text-why">{detail}</p> : null}
      </div>
    </div>
  );
}

function CopyField({ label, value, missing }: { label: string; value: string | undefined; missing: string }) {
  const { toast } = useToast();
  if (!value) {
    return <p className="border-y border-rule py-3 text-why [overflow-wrap:anywhere]">{missing}</p>;
  }
  return (
    <div className="flex flex-col gap-1 border-y border-rule py-3">
      <p className="text-small">{label}</p>
      <p className="break-all">{value}</p>
      <Button
        variant="secondary"
        size="sm"
        className="-ml-4 self-start"
        onClick={async () => toast((await copyText(value)) ? `${label} copied.` : "Could not copy. Select the text and copy it by hand.", { tone: "neutral" })}
      >
        {`Copy ${label.toLowerCase()}`}
      </Button>
    </div>
  );
}
