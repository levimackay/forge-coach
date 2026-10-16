-- Row level security and privileges.
--
-- Access model
--   * Every API request runs as the Postgres role "authenticated" (the "anon"
--     role gets nothing). Rows are scoped to user_id = auth.uid().
--   * Claude connects through Supabase's OAuth server and receives a normal
--     user JWT plus a client_id claim. RESTRICTIVE policies make every write
--     require client_id to be null, so such a token can read the user's data
--     and insert a pending proposal, and nothing else.
--   * The hosted project still hands out table privileges to anon by default
--     (and stops doing so for everyone on 2026-10-30), so every table here
--     revokes first and grants exactly what it needs.

-- Tables where each row belongs to one user and clients may write -----------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'goals', 'equipment_profiles', 'programs', 'program_days',
    'planned_exercises', 'workouts', 'workout_sets', 'recovery_logs',
    'body_measurements', 'progression_decisions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);

    execute format(
      'create policy %I on public.%I for select to authenticated
         using (user_id = (select auth.uid()))',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (user_id = (select auth.uid()))',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (user_id = (select auth.uid()))',
      t || '_delete_own', t);

    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated
         with check (((select auth.jwt()) ->> ''client_id'') is null)',
      t || '_first_party_insert', t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated
         using (((select auth.jwt()) ->> ''client_id'') is null)
         with check (((select auth.jwt()) ->> ''client_id'') is null)',
      t || '_first_party_update', t);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated
         using (((select auth.jwt()) ->> ''client_id'') is null)',
      t || '_first_party_delete', t);
  end loop;
end;
$$;

-- exercises: global rows (user_id is null) are readable by every signed-in
-- user and writable by nobody through the API -------------------------------

alter table public.exercises enable row level security;
revoke all on table public.exercises from public, anon, authenticated;
grant select, insert, update, delete on table public.exercises to authenticated;

create policy exercises_select_global_or_own on public.exercises
  for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));
create policy exercises_insert_own on public.exercises
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy exercises_update_own on public.exercises
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy exercises_delete_own on public.exercises
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy exercises_first_party_insert on public.exercises
  as restrictive for insert to authenticated
  with check (((select auth.jwt()) ->> 'client_id') is null);
create policy exercises_first_party_update on public.exercises
  as restrictive for update to authenticated
  using (((select auth.jwt()) ->> 'client_id') is null)
  with check (((select auth.jwt()) ->> 'client_id') is null);
create policy exercises_first_party_delete on public.exercises
  as restrictive for delete to authenticated
  using (((select auth.jwt()) ->> 'client_id') is null);

-- coach_proposals: clients (including Claude) may read and insert pending
-- rows. Every state change goes through the functions in a later migration.

alter table public.coach_proposals enable row level security;
revoke all on table public.coach_proposals from public, anon, authenticated;
grant select, insert on table public.coach_proposals to authenticated;

create policy coach_proposals_select_own on public.coach_proposals
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy coach_proposals_insert_pending on public.coach_proposals
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and decided_at is null
    and applied_at is null
    and undone_at is null
    and inverse_changes is null
    and decision_note is null
  );

-- No update or delete is granted; these keep it that way if a grant is ever added.
create policy coach_proposals_first_party_update on public.coach_proposals
  as restrictive for update to authenticated
  using (((select auth.jwt()) ->> 'client_id') is null)
  with check (((select auth.jwt()) ->> 'client_id') is null);
create policy coach_proposals_first_party_delete on public.coach_proposals
  as restrictive for delete to authenticated
  using (((select auth.jwt()) ->> 'client_id') is null);

-- audit_log: read only for users, written by definer functions and triggers --

alter table public.audit_log enable row level security;
revoke all on table public.audit_log from public, anon, authenticated;
grant select on table public.audit_log to authenticated;

create policy audit_log_select_own on public.audit_log
  for select to authenticated
  using (user_id = (select auth.uid()));
