import type { FormEvent, ReactNode } from "react";
import { Button, Field } from "@/components/ui";

export function Screen({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col">
      <div
        className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4"
        style={{
          paddingTop: "max(2rem, env(safe-area-inset-top))",
          paddingBottom: actions ? "2rem" : "max(2rem, env(safe-area-inset-bottom))",
        }}
      >
        {children}
      </div>
      {actions ? (
        // Pinned so Approve and Deny are reachable without scrolling to the end of the list.
        <div
          className="sticky bottom-0 border-t border-line bg-ground px-4 pt-4"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto flex w-full max-w-md flex-col gap-3">{actions}</div>
        </div>
      ) : null}
    </main>
  );
}

export function Heading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-[28px] font-semibold leading-tight">{title}</h1>
      {children ? <p className="text-[17px] leading-relaxed text-ink-dim">{children}</p> : null}
    </header>
  );
}

export function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Screen>
      <div role="status" aria-live="polite">
        <Heading title={title}>{children}</Heading>
      </div>
    </Screen>
  );
}

export function Problem({ title, children, detail }: { title: string; children: ReactNode; detail?: string }) {
  return (
    <Screen>
      <div role="alert" className="flex flex-col gap-3">
        <Heading title={title}>{children}</Heading>
        {detail ? <p className="break-words text-[15px] text-ink-faint">{detail}</p> : null}
      </div>
    </Screen>
  );
}

function Points({ label, items }: { label: string; items: string[] }) {
  return (
    <section aria-label={label} className="rounded-card border border-line bg-surface">
      <h2 className="px-4 pt-4 text-[17px] font-semibold">{label}</h2>
      <ul className="mt-2 divide-y divide-line">
        {items.map((item) => (
          <li key={item} className="px-4 py-3 text-[17px] leading-snug">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface ConsentDetails {
  authorizationId: string;
  clientName: string;
  clientId: string;
  redirectUri: string;
  redirectHost: string;
  trustedHost: boolean;
  scope: string;
  email: string;
}

export function ConsentCard({
  details,
  busy,
  error,
  onDecide,
}: {
  details: ConsentDetails;
  busy: "approve" | "deny" | null;
  error: string | null;
  onDecide: (choice: "approve" | "deny") => void;
}) {
  return (
    <Screen
      actions={
        <>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={busy === "approve"}
            disabled={busy !== null}
            onClick={() => onDecide("approve")}
          >
            {busy === "approve" ? "Approving…" : "Approve"}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            loading={busy === "deny"}
            disabled={busy !== null}
            onClick={() => onDecide("deny")}
          >
            {busy === "deny" ? "Denying…" : "Deny"}
          </Button>
        </>
      }
    >
      <Heading title="Connect Claude to FORGE">
        {details.clientName} is asking to connect to your training log. Signed in as {details.email}.
      </Heading>

      <Points
        label="Claude will be able to"
        items={[
          "Read your profile, goals, equipment and body measurements",
          "Read your program, workouts, sets, recovery logs and the engine's progression decisions",
          "Suggest changes to your program",
        ]}
      />
      <Points
        label="Claude will not be able to"
        items={[
          "Change your program until you approve a suggestion in the Coach tab of FORGE",
          "Log, edit or delete your workouts and other data",
          "See your password or sign in as you",
        ]}
      />

      {details.trustedHost ? (
        <p className="text-[15px] text-ink-dim">After you choose, you go back to {details.redirectHost}.</p>
      ) : (
        <p role="note" className="rounded-control border border-ember p-3 text-[15px] leading-snug">
          This request sends you to {details.redirectHost}, not claude.ai. Only approve it if you started this connection
          yourself.
        </p>
      )}

      {error ? (
        <p role="alert" className="text-[15px] leading-snug text-danger">
          {error}
        </p>
      ) : null}

      <details className="text-[15px] text-ink-dim">
        <summary className="min-h-11 cursor-pointer py-2">Technical details</summary>
        <dl className="mt-2 flex flex-col gap-3 break-words">
          <div>
            <dt className="font-medium text-ink">Client id</dt>
            <dd>{details.clientId}</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Redirect address</dt>
            <dd>{details.redirectUri}</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Requested scopes</dt>
            <dd>{details.scope || "none"}</dd>
          </div>
        </dl>
      </details>
    </Screen>
  );
}

export function SignInCard({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (email: string, password: string) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit(String(form.get("email") ?? "").trim(), String(form.get("password") ?? ""));
  }

  return (
    <Screen>
      <Heading title="Sign in to continue">
        Claude is asking to connect to your FORGE training log. Sign in first, then you can approve or deny it.
      </Heading>
      <form onSubmit={submit} className="flex flex-col gap-4" aria-busy={busy}>
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        {error ? (
          <p role="alert" className="text-[15px] leading-snug text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </Screen>
  );
}
