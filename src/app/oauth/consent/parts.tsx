import type { FormEvent, ReactNode } from "react";
import { Button, Field, IconChevronDown, named } from "@/components/ui";

export function Screen({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 pb-8 pt-8">{children}</div>
      {actions ? (
        // Pinned so Approve and Deny are reachable without scrolling to the end of the list. The shell's
        // gutter and bottom padding are cancelled so the bands run edge to edge and sit on the screen edge.
        <div className="bleed pb-safe sticky bottom-0 -mb-[calc(env(safe-area-inset-bottom)+16px)] border-t border-rule bg-ground">
          <div className="mx-auto flex w-full max-w-md flex-col">{actions}</div>
        </div>
      ) : null}
    </div>
  );
}

export function Heading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3">
      <h1 className="text-head">{named(title)}</h1>
      {children ? <p>{children}</p> : null}
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
        {detail ? <p className="break-words text-small">{detail}</p> : null}
      </div>
    </Screen>
  );
}

function Points({ label, items }: { label: string; items: string[] }) {
  return (
    <section aria-label={label}>
      <h2 className="pb-3 font-medium">{label}</h2>
      <ul className="border-t border-rule">
        {items.map((item) => (
          <li key={item} className="border-b border-rule py-3">
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
            loading={busy === "approve"}
            disabled={busy !== null}
            onClick={() => onDecide("approve")}
          >
            {busy === "approve" ? "Approving…" : "Approve"}
          </Button>
          <div className="px-safe">
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
          </div>
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
          "Read your program, workouts, sets, sleep logs and the weight changes the app made",
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
        <p className="text-small">After you choose, you go back to {details.redirectHost}.</p>
      ) : (
        <p role="note" className="border-y-2 border-ink py-3 font-medium">
          This request sends you to {details.redirectHost}, not claude.ai. Only approve it if you started this connection
          yourself.
        </p>
      )}

      {error ? (
        <p role="alert" className="text-small font-medium">
          {error}
        </p>
      ) : null}

      <details className="group text-small">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 [&::-webkit-details-marker]:hidden">
          <span className="underline decoration-1 underline-offset-4">Technical details</span>
          <IconChevronDown size={16} className="group-open:rotate-180" />
        </summary>
        <dl className="mt-2 break-words border-t border-rule">
          <div className="border-b border-rule py-3">
            <dt className="font-medium">Client id</dt>
            <dd>{details.clientId}</dd>
          </div>
          <div className="border-b border-rule py-3">
            <dt className="font-medium">Redirect address</dt>
            <dd>{details.redirectUri}</dd>
          </div>
          <div className="border-b border-rule py-3">
            <dt className="font-medium">Requested scopes</dt>
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
      <form onSubmit={submit} className="flex flex-col gap-6" aria-busy={busy}>
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
          <p role="alert" className="text-small font-medium">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="bleed" loading={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </Screen>
  );
}
