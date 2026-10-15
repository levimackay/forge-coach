# FORGE

A personal bodybuilding tracker that installs on an iPhone Home Screen, logs workouts with or without signal, adjusts the next session from what was actually lifted, and lets Claude read the training data and suggest program changes that only take effect after approval in the app.

Live app: https://forge-coach-app.vercel.app

## What it does

- Logs sets with reps, load, reps in reserve (RIR), warmup and pain flags, plus rest timing, session RPE, recovery check-ins and body measurements.
- Works offline. Every tap is saved on the phone first and synced to Postgres when the connection returns.
- Adjusts the next workout with a deterministic progression engine: double progression, equipment-aware load jumps, bodyweight variation ladders, RIR holds, stall deloads, long-gap reductions and pain holds. Every change comes with a one-line reason.
- Trains at home or at the gym. Picking the equipment profile for the day swaps in exercises that profile can do.
- Shows lift trends (estimated 1RM, load, reps, volume), weekly hard sets per muscle, consistency, bodyweight and the engine's recent decisions.
- Coach screen: program changes proposed by Claude, shown as a diff with the rationale, approved or rejected in the app, with an audit trail and undo.
- Reports for a session, week or month as Markdown or JSON, plus a ready-to-paste prompt for Claude when the connector is not set up.
- Export, import, delete all data and delete the account from Settings.

## Stack

Next.js 16 (App Router, every app screen prerendered as a static client shell), TypeScript, Tailwind CSS 4, Supabase Postgres and Auth, Dexie (IndexedDB), Serwist service worker, mcp-handler on Vercel.

## How the pieces fit

**Data path.** The browser talks to Supabase directly with the publishable key and the signed-in user's session. Row level security is the only access control, and every table is scoped to `auth.uid()`. No secret or service-role key exists in the app or on Vercel.

**Offline sync.** Dexie mirrors the tables. Writes go to Dexie with a client-generated UUID, then into an outbox that flushes on launch, on reconnect, when the app returns to the foreground and after each write. The server upserts by id, so a retried request never creates a duplicate. Conflicts are last-write-wins on the client `updated_at`, enforced by a trigger. Pulls page through a server-maintained `server_updated_at` cursor. Deletes are soft so they sync.

**Progression engine.** `src/lib/engine` is pure TypeScript with no I/O and takes `now` as an input, so the same history always produces the same next workout. It runs on the phone when a workout is finished. Constants live in one config object, each marked as taken from a cited source or as a heuristic.

**Claude connector.** `/api/mcp` is a remote MCP server (Streamable HTTP). Supabase Auth's OAuth 2.1 server signs Claude in as the user, and the MCP server verifies that token and forwards it to Postgres, so the same row level security applies. Restrictive policies give tokens issued to an OAuth client read access plus one write: inserting a pending proposal. Approving, rejecting and undoing require a first-party session in the app, and Claude can only apply a proposal that was already approved there. Proposals are validated in the database before insert, and applying one stores exact inverse operations for undo.

MCP tools: `get_athlete_profile`, `get_training_plan`, `get_recent_workouts`, `get_workout_details`, `get_exercise_performance`, `compare_sessions`, `get_weekly_progress`, `get_recovery_history`, `get_progression_decisions`, `search_exercises`, `propose_program_change`, `list_proposals`, `apply_approved_change`.

## Install on iPhone

1. Open https://forge-coach-app.vercel.app in Safari.
2. Tap Share, then Add to Home Screen.
3. Open FORGE from the Home Screen and sign in there. The installed app keeps its own storage, separate from Safari.

## Connect Claude

1. In claude.ai on the web, open Customize, then Connectors, then Add custom connector.
2. Paste `https://forge-coach-app.vercel.app/api/mcp`.
3. Choose "Use your own OAuth client" and paste the client ID shown on FORGE's Coach screen.
4. Sign in to FORGE when asked and approve access.
5. The connector then works in Claude on the web, desktop and the iOS app.

## Running it yourself

```bash
npm install
cp .env.example .env.local
npm run dev
```

Supabase setup:

1. Create a project with an asymmetric (ES256) JWT signing key.
2. Apply `supabase/migrations` in order (`supabase link` then `supabase db push`).
3. Turn on Authentication, OAuth Server with the authorization path `/oauth/consent` and dynamic registration off (`supabase/config.toml` documents these settings).
4. Register a public OAuth client with the redirect URI `https://claude.ai/api/mcp/auth_callback`.

Environment variables are listed in `.env.example`. `MCP_RESOURCE_URL` must be the exact production URL of `/api/mcp`.

## Tests

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

The suite covers the engine rules, analytics and reports, the sync outbox and pull logic against fake IndexedDB, the MCP auth checks, handshake and tools, and the database. Database tests run the real migrations in PGlite (Postgres in WebAssembly) with a Supabase-compatible auth shim and check cross-user isolation, the OAuth-client restrictions, proposal approve, apply and undo, and the sync triggers.

## Limitations

- iPhone web apps get no background sync. Sets logged offline sync the next time the app is opened with a connection.
- The Supabase OAuth 2.1 server is in beta.
- Access tokens already issued to Claude stay valid until they expire (up to an hour) after the connection is revoked.
- The free Supabase plan pauses a project after a week of inactivity and has no automatic backups. Use Settings, Export now and then.
