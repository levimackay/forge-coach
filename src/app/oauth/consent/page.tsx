"use client";

import { useEffect, useRef, useState } from "react";
import type { AuthOAuthAuthorizationDetailsResponse } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import { oncePerKey, readAuthorizationId, safeDestination, toDetails } from "./flow";
import { ConsentCard, Notice, Problem, SignInCard, type ConsentDetails } from "./parts";

type View =
  | { step: "loading" }
  | { step: "missing" }
  | { step: "sign_in"; busy: boolean; error: string | null }
  | { step: "consent"; details: ConsentDetails; busy: "approve" | "deny" | null; error: string | null }
  | { step: "leaving" }
  | { step: "failed"; detail: string | null };

const lookupOnce = oncePerKey<AuthOAuthAuthorizationDetailsResponse>();

const lookUp = (authorizationId: string) =>
  lookupOnce(authorizationId, () => getSupabase().auth.oauth.getAuthorizationDetails(authorizationId));

export default function OAuthConsentPage() {
  const [view, setView] = useState<View>({ step: "loading" });
  const authorizationId = useRef<string | null>(null);

  async function review(id: string, show: (next: View) => void) {
    const { data, error } = await lookUp(id);
    if (error || !data) return show({ step: "failed", detail: error?.message ?? null });
    if (!("authorization_id" in data)) {
      // Already consented: the server hands back the way out directly.
      const destination = safeDestination(data.redirect_url);
      if (!destination) return show({ step: "failed", detail: null });
      show({ step: "leaving" });
      window.location.assign(destination);
      return;
    }
    const details = toDetails(data);
    if (!details) return show({ step: "failed", detail: null });
    show({ step: "consent", details, busy: null, error: null });
  }

  useEffect(() => {
    let active = true;
    const show = (next: View) => {
      if (active) setView(next);
    };

    async function start() {
      const id = readAuthorizationId(window.location.search);
      if (!id) return show({ step: "missing" });
      authorizationId.current = id;
      try {
        const { data } = await getSupabase().auth.getSession();
        if (!data.session) return show({ step: "sign_in", busy: false, error: null });
        await review(id, show);
      } catch {
        show({ step: "failed", detail: null });
      }
    }

    void start();
    return () => {
      active = false;
    };
  }, []);

  async function signIn(email: string, password: string) {
    const id = authorizationId.current;
    if (!id) return;
    setView({ step: "sign_in", busy: true, error: null });
    const { error } = await getSupabase()
      .auth.signInWithPassword({ email, password })
      .catch(() => ({ error: new Error("network") }));
    if (error) {
      const wrong = error.message.toLowerCase().includes("invalid login");
      return setView({
        step: "sign_in",
        busy: false,
        error: wrong ? "That email and password did not match." : "Could not sign in. Check your connection and try again.",
      });
    }
    setView({ step: "loading" });
    try {
      await review(id, setView);
    } catch {
      setView({ step: "failed", detail: null });
    }
  }

  async function decide(choice: "approve" | "deny") {
    const id = authorizationId.current;
    if (!id || view.step !== "consent" || view.busy) return;
    const current = view;
    setView({ ...current, busy: choice, error: null });

    const oauth = getSupabase().auth.oauth;
    const { data, error } = await (choice === "approve"
      ? oauth.approveAuthorization(id, { skipBrowserRedirect: true })
      : oauth.denyAuthorization(id, { skipBrowserRedirect: true })
    ).catch(() => ({ data: null, error: new Error("network") }));

    const destination = data ? safeDestination(data.redirect_url) : null;
    if (error || !destination) {
      return setView({
        ...current,
        busy: null,
        error: "That did not go through. Go back to Claude and start the connection again.",
      });
    }
    setView({ step: "leaving" });
    window.location.assign(destination);
  }

  return (
    <>
      {view.step === "loading" ? <Notice title="Checking your request" /> : null}
      {view.step === "missing" ? (
        <Problem title="This link is incomplete">
          It is missing its authorization request. Go back to Claude and start the connection again.
        </Problem>
      ) : null}
      {view.step === "sign_in" ? <SignInCard busy={view.busy} error={view.error} onSubmit={signIn} /> : null}
      {view.step === "consent" ? (
        <ConsentCard details={view.details} busy={view.busy} error={view.error} onDecide={decide} />
      ) : null}
      {view.step === "leaving" ? <Notice title="Sending you back to Claude">One moment.</Notice> : null}
      {view.step === "failed" ? (
        <Problem title="This request cannot be completed" detail={view.detail ?? undefined}>
          The approval request may have expired or already been used. Go back to Claude and start the connection again.
        </Problem>
      ) : null}
    </>
  );
}
