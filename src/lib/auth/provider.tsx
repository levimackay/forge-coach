"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import { bindLocalDataToUser, UnsyncedChangesError } from "@/lib/local/data";
import { devFixtureActive, setActiveUserId, setDevFixtureActive } from "@/lib/local/session";
import { startSync, syncNow } from "@/lib/local/sync";
import { describeAuthError } from "./errors";
import { restoreSession } from "./persisted-session";

export type AuthStatus = "loading" | "signed_in" | "signed_out";

export interface AuthResult {
  error: string | null;
  /** Set when sign-in stopped because another account's changes on this device have not synced. */
  unsyncedOtherAccount?: number;
}

export interface SignInOptions {
  /** Drop another account's unsynced changes on this device. Only after the person chose to. */
  discardUnsynced?: boolean;
}

export interface SignUpResult extends AuthResult {
  /** True when the account exists but the email link has to be opened first. */
  needsConfirmation: boolean;
}

export interface AuthValue {
  user: User | null;
  session: Session | null;
  status: AuthStatus;
  signIn: (email: string, password: string, options?: SignInOptions) => Promise<AuthResult>;
  signUp: (email: string, password: string, options?: SignInOptions) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
}

interface AuthState {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
}

const AuthContext = createContext<AuthValue | null>(null);

const SIGN_OUT_FLUSH_MS = 3000;

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}

async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // the browser decides; the app works either way
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null, session: null });
  const boundUser = useRef<string | null>(null);
  const generation = useRef(0);
  const discardUnsynced = useRef(false);

  // Binds the local database to the user before the app sees them as signed in,
  // so no screen ever reads another account's rows or writes without an owner.
  // Returns the refusal when another account's unsynced changes are in the way:
  // that sign-in is undone on this device and nothing is deleted.
  const commit = useCallback(async (session: Session | null): Promise<UnsyncedChangesError | null> => {
    const gen = ++generation.current;
    if (!session) {
      boundUser.current = null;
      setActiveUserId(null);
      setState({ status: "signed_out", user: null, session: null });
      return null;
    }
    const user = session.user;
    if (boundUser.current !== user.id) {
      try {
        await bindLocalDataToUser(user.id, { discardUnsynced: discardUnsynced.current });
      } catch (err) {
        if (err instanceof UnsyncedChangesError) {
          await getSupabase().auth.signOut({ scope: "local" }).catch(() => {});
          if (gen === generation.current) {
            boundUser.current = null;
            setActiveUserId(null);
            setState({ status: "signed_out", user: null, session: null });
          }
          return err;
        }
        // storage blocked: screens report it when they try to read or write
      }
      if (gen !== generation.current) return null;
      boundUser.current = user.id;
      setActiveUserId(user.id);
    }
    setState((prev) => ({
      status: "signed_in",
      user: prev.user?.id === user.id ? prev.user : user,
      session,
    }));
    return null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (process.env.NODE_ENV === "development" && devFixtureActive()) {
      void import("./dev-session").then(({ devFixtureSession }) => {
        if (!cancelled) void commit(devFixtureSession());
      });
      return () => {
        cancelled = true;
      };
    }

    const supabase = getSupabase();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (session) void commit(session);
      else if (event === "SIGNED_OUT") void commit(null);
    });

    restoreSession({
      getSession: () => supabase.auth.getSession(),
      storage: window.localStorage,
      commit,
      cancelled: () => cancelled,
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [commit]);

  const userId = state.user?.id ?? null;
  useEffect(() => {
    if (state.status !== "signed_in" || !userId) return;
    void requestPersistentStorage();
    return startSync();
  }, [state.status, userId]);

  const signIn = useCallback(
    async (email: string, password: string, options: SignInOptions = {}): Promise<AuthResult> => {
      discardUnsynced.current = options.discardUnsynced === true;
      try {
        const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
        if (error) return { error: describeAuthError(error) };
        const blocked = await commit(data.session);
        return blocked ? { error: blocked.message, unsyncedOtherAccount: blocked.count } : { error: null };
      } finally {
        discardUnsynced.current = false;
      }
    },
    [commit],
  );

  const signUp = useCallback(
    async (email: string, password: string, options: SignInOptions = {}): Promise<SignUpResult> => {
      discardUnsynced.current = options.discardUnsynced === true;
      try {
        const { data, error } = await getSupabase().auth.signUp({ email, password });
        if (error) return { error: describeAuthError(error), needsConfirmation: false };
        if (data.session) {
          const blocked = await commit(data.session);
          return blocked
            ? { error: blocked.message, unsyncedOtherAccount: blocked.count, needsConfirmation: false }
            : { error: null, needsConfirmation: false };
        }
        return { error: null, needsConfirmation: true };
      } finally {
        discardUnsynced.current = false;
      }
    },
    [commit],
  );

  const signOut = useCallback(async () => {
    if (process.env.NODE_ENV === "development" && devFixtureActive()) {
      setDevFixtureActive(false);
      await commit(null);
      return;
    }
    // Try to push unsynced work first, but never hold the user hostage to the network.
    await Promise.race([syncNow(), new Promise<void>((resolve) => setTimeout(resolve, SIGN_OUT_FLUSH_MS))]);
    await getSupabase().auth.signOut();
    await commit(null);
  }, [commit]);

  const value = useMemo<AuthValue>(
    () => ({ user: state.user, session: state.session, status: state.status, signIn, signUp, signOut }),
    [state, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
