"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ForgeMark } from "@/components/ui/icons";

type Mode = "signin" | "signup";

interface FieldErrors {
  email?: string;
  password?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const noopSubscribe = () => () => {};

/** iOS keeps Home Screen app storage apart from Safari, so sign-in has to happen inside the app. */
function installHintNeeded(): boolean {
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

export function LoginForm() {
  const { status, signIn, signUp } = useAuth();
  const router = useRouter();
  const installHint = useSyncExternalStore(noopSubscribe, installHintNeeded, () => false);

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  // Another account's unsynced changes are on this device; signing in here would delete them.
  const [blockedBy, setBlockedBy] = useState<number | null>(null);

  useEffect(() => {
    if (status === "signed_in") router.replace("/");
  }, [status, router]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
    setFormError(null);
    setBlockedBy(null);
  };

  const run = async (discardUnsynced: boolean) => {
    const trimmed = email.trim();
    setBusy(true);
    try {
      if (mode === "signin") {
        const result = await signIn(trimmed, password, { discardUnsynced });
        if (result.error) setFormError(result.error);
        setBlockedBy(result.unsyncedOtherAccount ?? null);
      } else {
        const result = await signUp(trimmed, password, { discardUnsynced });
        if (result.error) setFormError(result.error);
        else if (result.needsConfirmation) setConfirmFor(trimmed);
        setBlockedBy(result.unsyncedOtherAccount ?? null);
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    const next: FieldErrors = {};
    if (!EMAIL_PATTERN.test(trimmed)) next.email = "Enter a valid email address.";
    if (mode === "signin" && password === "") next.password = "Enter your password.";
    if (mode === "signup" && password.length < 8) next.password = "Use at least 8 characters.";
    setErrors(next);
    setFormError(null);
    setBlockedBy(null);
    if (next.email || next.password) return;
    await run(false);
  };

  if (confirmFor) {
    return (
      <div className="flex flex-1 flex-col justify-center gap-8 py-10">
        <div className="flex flex-col gap-3">
          <h1 className="text-head">Check your email.</h1>
          <p>
            We sent a confirmation link to <span className="font-medium">{confirmFor}</span>. Open it, then come back to
            this app and sign in.
          </p>
          <p className="text-small">
            The link opens in your browser, not here. That is expected: sign in again in this app afterwards.
          </p>
        </div>
        <Button
          variant="primary"
          className="bleed"
          onClick={() => {
            setConfirmFor(null);
            switchMode("signin");
            setPassword("");
          }}
        >
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-10 pb-6 pt-10">
      <header className="flex flex-col gap-4">
        <ForgeMark size={120} className="-ml-1" />
        <div className="flex flex-col gap-2">
          <h1 className="text-head">{mode === "signin" ? "Sign in." : "Create account."}</h1>
          {mode === "signup" ? <p>An account keeps your training in sync between devices.</p> : null}
        </div>
      </header>

      <form noValidate onSubmit={submit} className="flex flex-col gap-6">
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint={mode === "signup" ? "At least 8 characters." : undefined}
        />
        {formError ? (
          <p role="alert" className="text-small font-medium">
            {formError}
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="bleed" loading={busy}>
          {mode === "signin" ? "Sign in" : "Create account"}
        </Button>
        {blockedBy !== null ? (
          <Button variant="danger" className="bleed" disabled={busy} onClick={() => void run(true)}>
            {`Delete ${blockedBy} unsynced ${blockedBy === 1 ? "change" : "changes"} and continue`}
          </Button>
        ) : null}
      </form>

      <div className="flex flex-col gap-4">
        <Button variant="ghost" fullWidth onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
        </Button>
        {installHint ? (
          <p className="text-small">
            To use FORGE offline, add it to your Home Screen first (Share, then Add to Home Screen) and sign in from
            there. Data from a browser tab does not move into the installed app.
          </p>
        ) : null}
      </div>
    </div>
  );
}
