-- Sync triggers for the offline-first client.
--
-- sync_stamp does three jobs on every synced table:
--   1. server_updated_at is always set by the database, never by the client.
--      clock_timestamp() (not now()) so rows written later in a long
--      transaction still sort later.
--   2. last write wins on the client-set updated_at. A write older than the
--      stored row is dropped silently (RETURN NULL), so a stale offline
--      retry cannot error and cannot overwrite newer data.
--   3. updated_at is capped five minutes into the future, so one device with a
--      wrong clock cannot make every later edit look stale.
-- Identical retries are also dropped so other devices do not re-pull them.

create function private.sync_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if tg_op = 'INSERT' then
    new.server_updated_at := v_now;
    new.updated_at := least(new.updated_at, v_now + interval '5 minutes');
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'user_id cannot be changed' using errcode = '42501';
  end if;

  new.created_at := old.created_at;
  new.updated_at := least(new.updated_at, v_now + interval '5 minutes');

  if new.updated_at < old.updated_at then
    return null;
  end if;

  if new.updated_at = old.updated_at
     and to_jsonb(new) - 'server_updated_at' = to_jsonb(old) - 'server_updated_at' then
    return null;
  end if;

  new.server_updated_at := v_now;
  return new;
end;
$$;

-- programs.version only moves through apply_proposal / undo_proposal. A client
-- that pushes a whole row with a stale (or invented) version keeps the stored one.
-- SECURITY INVOKER on purpose: current_user is the calling API role here and the
-- definer functions (owned by the migration role) pass straight through.
create function private.programs_version_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.version := 1;
    else
      new.version := old.version;
    end if;
  end if;
  return new;
end;
$$;

create trigger programs_version_guard
  before insert or update on public.programs
  for each row execute function private.programs_version_guard();

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'goals', 'equipment_profiles', 'exercises', 'programs',
    'program_days', 'planned_exercises', 'workouts', 'workout_sets',
    'recovery_logs', 'body_measurements', 'progression_decisions'
  ] loop
    execute format(
      'create trigger sync_stamp before insert or update on public.%I
         for each row execute function private.sync_stamp()', t);
  end loop;
end;
$$;
