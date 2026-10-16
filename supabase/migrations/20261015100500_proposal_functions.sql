-- Functions the API can call (schema public) and the internals they share
-- (schema private).
--
-- The public functions are SECURITY DEFINER because they write tables that
-- clients cannot write directly (coach_proposals state, audit_log, the program
-- tables for a token that carries a client_id). Each one starts by calling
-- private.caller(), which rejects anonymous callers and, for the first-party
-- only actions, any token that carries a client_id claim.

-- applying operations -----------------------------------------------------

-- Applies a validated list of operations for one user and one program, in
-- order, and returns the inverse operations (last operation first) that
-- restore the exact previous values. p_inverse allows restore_exercise, which
-- only ever appears in stored inverse_changes.
create function private.apply_ops(p_user uuid, p_program uuid, p_ops jsonb, p_inverse boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ts timestamptz := clock_timestamp();
  v_op jsonb;
  v_kind text;
  v_set jsonb;
  v_prev jsonb;
  v_inv jsonb := '[]'::jsonb;
  v_chunk jsonb;
  v_pe public.planned_exercises;
  v_day public.program_days;
  v_id uuid;
  v_new_id uuid;
begin
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' then
    raise exception 'operations must be a JSON array' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.programs
     where id = p_program and user_id = p_user and deleted_at is null
  ) then
    raise exception 'program not found' using errcode = 'P0002';
  end if;

  for v_op in select value from jsonb_array_elements(p_ops) loop
    v_kind := case when jsonb_typeof(v_op -> 'op') = 'string' then v_op ->> 'op' end;

    if v_kind in ('update_prescription', 'swap_exercise', 'remove_exercise', 'restore_exercise') then
      if v_kind = 'restore_exercise' and not p_inverse then
        raise exception 'restore_exercise is not a valid proposal operation' using errcode = '22023';
      end if;
      select pe.* into v_pe
        from public.planned_exercises pe
        join public.program_days d on d.id = pe.program_day_id
       where pe.id = private.as_uuid(v_op -> 'planned_exercise_id')
         and pe.user_id = p_user and pe.deleted_at is null
         and d.user_id = p_user and d.program_id = p_program and d.deleted_at is null
         for update of pe;
      if not found then
        raise exception 'planned exercise % is not in this program', v_op ->> 'planned_exercise_id'
          using errcode = 'P0002';
      end if;
    end if;

    if v_kind = 'update_prescription' then
      v_set := v_op -> 'set';
      v_prev := jsonb_build_object(
        'sets', v_pe.sets, 'rep_min', v_pe.rep_min, 'rep_max', v_pe.rep_max,
        'target_rir', v_pe.target_rir, 'load', v_pe.load,
        'rest_seconds', v_pe.rest_seconds, 'notes', v_pe.notes);
      v_chunk := jsonb_build_array(jsonb_build_object(
        'op', 'update_prescription',
        'planned_exercise_id', v_pe.id,
        'set', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
                  from jsonb_each(v_prev) where v_set ? key)));
      update public.planned_exercises set
        sets = case when v_set ? 'sets' then private.to_int(v_set -> 'sets') else sets end,
        rep_min = case when v_set ? 'rep_min' then private.to_int(v_set -> 'rep_min') else rep_min end,
        rep_max = case when v_set ? 'rep_max' then private.to_int(v_set -> 'rep_max') else rep_max end,
        target_rir = case when v_set ? 'target_rir' then private.to_int(v_set -> 'target_rir') else target_rir end,
        load = case when v_set ? 'load' then (v_set ->> 'load')::numeric else load end,
        rest_seconds = case when v_set ? 'rest_seconds' then private.to_int(v_set -> 'rest_seconds') else rest_seconds end,
        notes = case when v_set ? 'notes' then v_set ->> 'notes' else notes end,
        updated_at = greatest(v_ts, updated_at)
       where id = v_pe.id;

    elsif v_kind = 'swap_exercise' then
      v_id := private.as_uuid(v_op -> 'exercise_id');
      if v_id is null or not exists (
        select 1 from public.exercises e
         where e.id = v_id and e.deleted_at is null and (e.user_id is null or e.user_id = p_user)
      ) then
        raise exception 'exercise % is not available', v_op ->> 'exercise_id' using errcode = 'P0002';
      end if;
      if v_id = v_pe.exercise_id then
        v_chunk := '[]'::jsonb;
      else
        -- A load belongs to the exercise it was logged on, so a swap clears it
        -- and the inverse puts both the exercise and the load back.
        v_chunk := jsonb_build_array(jsonb_build_object(
          'op', 'swap_exercise', 'planned_exercise_id', v_pe.id, 'exercise_id', v_pe.exercise_id));
        if v_pe.load is not null then
          v_chunk := v_chunk || jsonb_build_array(jsonb_build_object(
            'op', 'update_prescription', 'planned_exercise_id', v_pe.id,
            'set', jsonb_build_object('load', v_pe.load)));
        end if;
        update public.planned_exercises
           set exercise_id = v_id, load = null, updated_at = greatest(v_ts, updated_at)
         where id = v_pe.id;
      end if;

    elsif v_kind = 'add_exercise' then
      select d.* into v_day
        from public.program_days d
       where d.id = private.as_uuid(v_op -> 'program_day_id')
         and d.user_id = p_user and d.program_id = p_program and d.deleted_at is null
         for update;
      if not found then
        raise exception 'program day % is not in this program', v_op ->> 'program_day_id'
          using errcode = 'P0002';
      end if;
      v_id := private.as_uuid(v_op -> 'exercise_id');
      if v_id is null or not exists (
        select 1 from public.exercises e
         where e.id = v_id and e.deleted_at is null and (e.user_id is null or e.user_id = p_user)
      ) then
        raise exception 'exercise % is not available', v_op ->> 'exercise_id' using errcode = 'P0002';
      end if;
      v_new_id := gen_random_uuid();
      insert into public.planned_exercises
        (id, user_id, program_day_id, position, exercise_id, sets, rep_min, rep_max, target_rir, load, created_at, updated_at)
      values
        (v_new_id, p_user, v_day.id, private.to_int(v_op -> 'position'), v_id,
         private.to_int(v_op -> 'sets'), private.to_int(v_op -> 'rep_min'), private.to_int(v_op -> 'rep_max'),
         private.to_int(v_op -> 'target_rir'), (v_op ->> 'load')::numeric, v_ts, v_ts);
      v_chunk := jsonb_build_array(jsonb_build_object('op', 'remove_exercise', 'planned_exercise_id', v_new_id));

    elsif v_kind = 'remove_exercise' then
      v_chunk := case
        when v_pe.is_active then jsonb_build_array(jsonb_build_object('op', 'restore_exercise', 'planned_exercise_id', v_pe.id))
        else '[]'::jsonb
      end;
      update public.planned_exercises
         set is_active = false, updated_at = greatest(v_ts, updated_at)
       where id = v_pe.id;

    elsif v_kind = 'restore_exercise' then
      v_chunk := case
        when v_pe.is_active then '[]'::jsonb
        else jsonb_build_array(jsonb_build_object('op', 'remove_exercise', 'planned_exercise_id', v_pe.id))
      end;
      update public.planned_exercises
         set is_active = true, updated_at = greatest(v_ts, updated_at)
       where id = v_pe.id;

    elsif v_kind = 'update_day' then
      select d.* into v_day
        from public.program_days d
       where d.id = private.as_uuid(v_op -> 'program_day_id')
         and d.user_id = p_user and d.program_id = p_program and d.deleted_at is null
         for update;
      if not found then
        raise exception 'program day % is not in this program', v_op ->> 'program_day_id'
          using errcode = 'P0002';
      end if;
      v_set := v_op -> 'set';
      if v_set ? 'equipment_profile_id' and jsonb_typeof(v_set -> 'equipment_profile_id') <> 'null' and not exists (
        select 1 from public.equipment_profiles ep
         where ep.id = private.as_uuid(v_set -> 'equipment_profile_id')
           and ep.user_id = p_user and ep.deleted_at is null
      ) then
        raise exception 'equipment profile % is not available', v_set ->> 'equipment_profile_id'
          using errcode = 'P0002';
      end if;
      v_prev := jsonb_build_object(
        'name', v_day.name, 'focus', v_day.focus, 'equipment_profile_id', v_day.equipment_profile_id);
      v_chunk := jsonb_build_array(jsonb_build_object(
        'op', 'update_day',
        'program_day_id', v_day.id,
        'set', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
                  from jsonb_each(v_prev) where v_set ? key)));
      update public.program_days set
        name = case when v_set ? 'name' then v_set ->> 'name' else name end,
        focus = case when v_set ? 'focus' then v_set ->> 'focus' else focus end,
        equipment_profile_id = case when v_set ? 'equipment_profile_id'
          then (v_set ->> 'equipment_profile_id')::uuid else equipment_profile_id end,
        updated_at = greatest(v_ts, updated_at)
       where id = v_day.id;

    else
      raise exception 'unknown operation "%"', coalesce(v_kind, 'null') using errcode = '22023';
    end if;

    -- Later operations undo first.
    v_inv := v_chunk || v_inv;
  end loop;

  return v_inv;
end;
$$;

create function private.bump_program_version(p_user uuid, p_program uuid)
returns int
language sql
security definer
set search_path = ''
as $$
  update public.programs
     set version = version + 1, updated_at = greatest(clock_timestamp(), updated_at)
   where id = p_program and user_id = p_user
  returning version;
$$;

-- Applies an approved proposal and records the result. The caller has already
-- locked the row and checked the status.
create function private.run_apply(p_id uuid, p_user uuid, p_actor text, p_client_id text)
returns public.coach_proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.coach_proposals;
  v_inverse jsonb;
  v_version int;
  v_ts timestamptz := clock_timestamp();
begin
  select * into v_p from public.coach_proposals where id = p_id and user_id = p_user;
  v_inverse := private.apply_ops(p_user, v_p.program_id, v_p.changes, false);
  v_version := private.bump_program_version(p_user, v_p.program_id);
  update public.coach_proposals
     set status = 'applied', applied_at = v_ts, inverse_changes = v_inverse, updated_at = v_ts
   where id = p_id
  returning * into v_p;
  perform private.write_audit(p_user, p_actor, p_client_id, 'proposal_applied', 'coach_proposals', p_id,
    jsonb_build_object(
      'title', v_p.title,
      'changes', jsonb_array_length(v_p.changes),
      'base_program_version', v_p.base_program_version,
      'program_version', v_version));
  return v_p;
end;
$$;

-- public API --------------------------------------------------------------

create function public.approve_proposal(p_id uuid, p_note text default null)
returns public.coach_proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller(true);
  v_p public.coach_proposals;
  v_ts timestamptz := clock_timestamp();
begin
  select * into v_p from public.coach_proposals where id = p_id and user_id = v_uid for update;
  if not found then
    raise exception 'proposal not found' using errcode = 'P0002';
  end if;
  if v_p.status <> 'pending' then
    raise exception 'proposal is already %', v_p.status using errcode = '55000';
  end if;
  update public.coach_proposals
     set status = 'approved', decided_at = v_ts, decision_note = p_note, updated_at = v_ts
   where id = p_id;
  perform private.write_audit(v_uid, 'user', null, 'proposal_approved', 'coach_proposals', p_id,
    jsonb_build_object('note', p_note));
  return private.run_apply(p_id, v_uid, 'user', null);
end;
$$;

create function public.reject_proposal(p_id uuid, p_note text default null)
returns public.coach_proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller(true);
  v_p public.coach_proposals;
  v_ts timestamptz := clock_timestamp();
begin
  select * into v_p from public.coach_proposals where id = p_id and user_id = v_uid for update;
  if not found then
    raise exception 'proposal not found' using errcode = 'P0002';
  end if;
  if v_p.status <> 'pending' then
    raise exception 'proposal is already %', v_p.status using errcode = '55000';
  end if;
  update public.coach_proposals
     set status = 'rejected', decided_at = v_ts, decision_note = p_note, updated_at = v_ts
   where id = p_id
  returning * into v_p;
  perform private.write_audit(v_uid, 'user', null, 'proposal_rejected', 'coach_proposals', p_id,
    jsonb_build_object('note', p_note));
  return v_p;
end;
$$;

-- Callable by the app and by Claude, but only for a proposal the user has
-- already approved. Applying twice returns the same result.
create function public.apply_proposal(p_id uuid)
returns public.coach_proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller(false);
  v_client text := (select auth.jwt()) ->> 'client_id';
  v_p public.coach_proposals;
begin
  select * into v_p from public.coach_proposals where id = p_id and user_id = v_uid for update;
  if not found then
    raise exception 'proposal not found' using errcode = 'P0002';
  end if;
  if v_p.status = 'applied' then
    return v_p;
  end if;
  if v_p.status <> 'approved' then
    raise exception 'proposal is % and has not been approved in the FORGE app', v_p.status
      using errcode = '55000';
  end if;
  return private.run_apply(p_id, v_uid, case when v_client is null then 'user' else 'claude' end, v_client);
end;
$$;

create function public.undo_proposal(p_id uuid)
returns public.coach_proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller(true);
  v_p public.coach_proposals;
  v_version int;
  v_ts timestamptz := clock_timestamp();
begin
  select * into v_p from public.coach_proposals where id = p_id and user_id = v_uid for update;
  if not found then
    raise exception 'proposal not found' using errcode = 'P0002';
  end if;
  if v_p.status <> 'applied' then
    raise exception 'only an applied proposal can be undone, this one is %', v_p.status
      using errcode = '55000';
  end if;
  perform private.apply_ops(v_uid, v_p.program_id, v_p.inverse_changes, true);
  v_version := private.bump_program_version(v_uid, v_p.program_id);
  update public.coach_proposals
     set status = 'undone', undone_at = v_ts, updated_at = v_ts
   where id = p_id
  returning * into v_p;
  perform private.write_audit(v_uid, 'user', null, 'proposal_undone', 'coach_proposals', p_id,
    jsonb_build_object('title', v_p.title, 'program_version', v_version));
  return v_p;
end;
$$;

-- Tables included in an export, parents first.
create function private.user_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'profiles', 'goals', 'equipment_profiles', 'exercises', 'programs', 'program_days',
    'planned_exercises', 'workouts', 'workout_sets', 'recovery_logs', 'body_measurements',
    'progression_decisions', 'coach_proposals', 'audit_log'
  ];
$$;

create function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller(true);
  v_tables jsonb := '{}'::jsonb;
  v_rows jsonb;
  t text;
begin
  -- exercises: only the caller's own rows. The global library is part of the schema.
  foreach t in array private.user_tables() loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x) order by %s), ''[]''::jsonb) from public.%I x where x.user_id = $1',
      case t when 'audit_log' then 'x.at, x.id' when 'profiles' then 'x.user_id' else 'x.created_at, x.id' end,
      t)
      into v_rows using v_uid;
    v_tables := v_tables || jsonb_build_object(t, v_rows);
  end loop;
  perform private.write_audit(v_uid, 'user', null, 'export_my_data', 'account', v_uid, '{}'::jsonb);
  return jsonb_build_object(
    'format', 'forge-coach-export',
    'version', 1,
    'exported_at', clock_timestamp(),
    'user_id', v_uid,
    'tables', v_tables);
end;
$$;

-- Deletes every row the user owns, children before parents. Returns row counts.
create function private.wipe_user(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_counts jsonb := '{}'::jsonb;
  v_order text[] := array[
    'progression_decisions', 'workout_sets', 'workouts', 'coach_proposals', 'planned_exercises',
    'program_days', 'programs', 'recovery_logs', 'body_measurements', 'goals',
    'equipment_profiles', 'exercises', 'profiles', 'audit_log'
  ];
  t text;
  n bigint;
begin
  foreach t in array v_order loop
    execute format(
      'with d as (delete from public.%I where user_id = $1 returning 1) select count(*) from d', t)
      into n using p_user;
    v_counts := v_counts || jsonb_build_object(t, n);
  end loop;
  return v_counts;
end;
$$;

-- Leaves a single audit row saying the wipe happened, so the history is never
-- silently empty.
create function public.delete_my_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller(true);
  v_counts jsonb;
begin
  v_counts := private.wipe_user(v_uid);
  perform private.write_audit(v_uid, 'user', null, 'delete_my_data', 'account', v_uid,
    jsonb_build_object('deleted', v_counts));
  return v_counts;
end;
$$;

create function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.caller(true);
  v_counts jsonb;
begin
  v_counts := private.wipe_user(v_uid);
  delete from auth.users where id = v_uid;
  return jsonb_build_object('deleted', v_counts, 'account_deleted', true);
end;
$$;

-- privileges ---------------------------------------------------------------
-- Functions in public are callable through the API only by signed-in users.
-- Everything in private is unreachable from the API.

revoke all on all functions in schema private from public, anon, authenticated;

revoke all on function public.approve_proposal(uuid, text) from public, anon, authenticated;
revoke all on function public.reject_proposal(uuid, text) from public, anon, authenticated;
revoke all on function public.apply_proposal(uuid) from public, anon, authenticated;
revoke all on function public.undo_proposal(uuid) from public, anon, authenticated;
revoke all on function public.export_my_data() from public, anon, authenticated;
revoke all on function public.delete_my_data() from public, anon, authenticated;
revoke all on function public.delete_my_account() from public, anon, authenticated;

grant execute on function public.approve_proposal(uuid, text) to authenticated;
grant execute on function public.reject_proposal(uuid, text) to authenticated;
grant execute on function public.apply_proposal(uuid) to authenticated;
grant execute on function public.undo_proposal(uuid) to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.delete_my_data() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
