-- Proposal integrity: audit helper, JSON validation for the "changes" array,
-- and the triggers that make coach_proposals trustworthy.
--
-- Everything here lives in the "private" schema, which the API does not expose.
-- Functions that must see rows across RLS are SECURITY DEFINER with an empty
-- search_path and always filter by an explicit user id taken from auth.uid().

-- audit -------------------------------------------------------------------

create function private.write_audit(
  p_user uuid,
  p_actor text,
  p_client_id text,
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (user_id, actor, client_id, action, entity, entity_id, details)
  values (p_user, p_actor, p_client_id, p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;

-- caller checks -----------------------------------------------------------

-- Returns the signed-in user id. With p_first_party it also rejects tokens that
-- carry a client_id claim, i.e. anything issued to Claude through OAuth.
create function private.caller(p_first_party boolean)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_first_party and ((select auth.jwt()) ->> 'client_id') is not null then
    raise exception 'this action can only be done in the FORGE app' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- JSON helpers ------------------------------------------------------------

create function private.is_int(v jsonb, lo int, hi int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(v) = 'number'
    and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
    and (v #>> '{}')::numeric between lo and hi,
    false);
$$;

-- JSON numbers keep their written form ("10.0"), so integers go through numeric.
create function private.to_int(v jsonb)
returns int
language sql
immutable
set search_path = ''
as $$
  select (v #>> '{}')::numeric::int;
$$;

create function private.is_num(v jsonb, lo numeric, hi numeric)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric between lo and hi, false);
$$;

create function private.is_text(v jsonb, min_len int, max_len int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_typeof(v) = 'string' and char_length(v #>> '{}') between min_len and max_len, false);
$$;

create function private.as_uuid(v jsonb)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if v is null or jsonb_typeof(v) <> 'string' then
    return null;
  end if;
  return (v #>> '{}')::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create function private.require_keys(p_idx int, p_op jsonb, p_required text[], p_optional text[])
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
begin
  for k in select jsonb_object_keys(p_op) loop
    if not (k = any (p_required || p_optional)) then
      raise exception 'change %: unexpected field "%"', p_idx, k using errcode = '22023';
    end if;
  end loop;
  foreach k in array p_required loop
    if not (p_op ? k) then
      raise exception 'change %: missing field "%"', p_idx, k using errcode = '22023';
    end if;
  end loop;
end;
$$;

-- Validates the "set" object of update_prescription.
create function private.check_prescription_set(p_idx int, p_set jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
  v_ok boolean;
begin
  if p_set is null or jsonb_typeof(p_set) <> 'object' or p_set = '{}'::jsonb then
    raise exception 'change %: "set" must be a non-empty object', p_idx using errcode = '22023';
  end if;
  for k, v in select key, value from jsonb_each(p_set) loop
    v_ok := case k
      when 'sets' then private.is_int(v, 1, 20)
      when 'rep_min' then private.is_int(v, 1, 100)
      when 'rep_max' then private.is_int(v, 1, 100)
      when 'target_rir' then private.is_int(v, 0, 10)
      when 'load' then jsonb_typeof(v) = 'null' or private.is_num(v, 0, 5000)
      when 'rest_seconds' then jsonb_typeof(v) = 'null' or private.is_int(v, 0, 3600)
      when 'notes' then jsonb_typeof(v) = 'null' or private.is_text(v, 0, 1000)
      else null
    end;
    if v_ok is null then
      raise exception 'change %: unexpected field "%" in set', p_idx, k using errcode = '22023';
    elsif not v_ok then
      raise exception 'change %: invalid value for "%"', p_idx, k using errcode = '22023';
    end if;
  end loop;
end;
$$;

-- changes validation ------------------------------------------------------

-- Checks shape, ranges and ownership of everything a proposal touches. Every
-- referenced id must belong to p_user, and every program row to p_program.
create function private.validate_proposal_changes(p_user uuid, p_program uuid, p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_idx int := 0;
  v_op jsonb;
  v_kind text;
  v_set jsonb;
  v_id uuid;
  v_pe public.planned_exercises;
  v_min int;
  v_max int;
  k text;
  v jsonb;
  v_ok boolean;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'changes must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_changes) not between 1 and 30 then
    raise exception 'changes must contain between 1 and 30 operations' using errcode = '22023';
  end if;

  for v_op in select value from jsonb_array_elements(p_changes) loop
    v_idx := v_idx + 1;
    if jsonb_typeof(v_op) <> 'object' then
      raise exception 'change %: must be an object', v_idx using errcode = '22023';
    end if;
    v_kind := case when jsonb_typeof(v_op -> 'op') = 'string' then v_op ->> 'op' end;

    if v_kind in ('update_prescription', 'swap_exercise', 'remove_exercise') then
      if v_kind = 'update_prescription' then
        perform private.require_keys(v_idx, v_op, array['op', 'planned_exercise_id', 'set'], array[]::text[]);
        perform private.check_prescription_set(v_idx, v_op -> 'set');
      elsif v_kind = 'swap_exercise' then
        perform private.require_keys(v_idx, v_op, array['op', 'planned_exercise_id', 'exercise_id'], array[]::text[]);
      else
        perform private.require_keys(v_idx, v_op, array['op', 'planned_exercise_id'], array[]::text[]);
      end if;

      select pe.* into v_pe
        from public.planned_exercises pe
        join public.program_days d on d.id = pe.program_day_id
       where pe.id = private.as_uuid(v_op -> 'planned_exercise_id')
         and pe.user_id = p_user and pe.deleted_at is null
         and d.user_id = p_user and d.program_id = p_program and d.deleted_at is null;
      if not found then
        raise exception 'change %: planned_exercise_id is not an exercise in this program', v_idx using errcode = '22023';
      end if;

      if v_kind = 'update_prescription' then
        v_set := v_op -> 'set';
        v_min := coalesce(private.to_int(v_set -> 'rep_min'), v_pe.rep_min);
        v_max := coalesce(private.to_int(v_set -> 'rep_max'), v_pe.rep_max);
        if v_min > v_max then
          raise exception 'change %: rep_min (%) is above rep_max (%)', v_idx, v_min, v_max using errcode = '22023';
        end if;
      elsif v_kind = 'swap_exercise' then
        v_id := private.as_uuid(v_op -> 'exercise_id');
        if v_id is null or not exists (
          select 1 from public.exercises e
           where e.id = v_id and e.deleted_at is null and (e.user_id is null or e.user_id = p_user)
        ) then
          raise exception 'change %: exercise_id is not an available exercise', v_idx using errcode = '22023';
        end if;
      end if;

    elsif v_kind = 'add_exercise' then
      perform private.require_keys(v_idx, v_op,
        array['op', 'program_day_id', 'exercise_id', 'position', 'sets', 'rep_min', 'rep_max', 'target_rir', 'load'],
        array[]::text[]);
      if not private.is_int(v_op -> 'position', 0, 200)
         or not private.is_int(v_op -> 'sets', 1, 20)
         or not private.is_int(v_op -> 'rep_min', 1, 100)
         or not private.is_int(v_op -> 'rep_max', 1, 100)
         or not private.is_int(v_op -> 'target_rir', 0, 10)
         or not (jsonb_typeof(v_op -> 'load') = 'null' or private.is_num(v_op -> 'load', 0, 5000)) then
        raise exception 'change %: a numeric field is missing or out of range', v_idx using errcode = '22023';
      end if;
      if private.to_int(v_op -> 'rep_min') > private.to_int(v_op -> 'rep_max') then
        raise exception 'change %: rep_min is above rep_max', v_idx using errcode = '22023';
      end if;
      if not exists (
        select 1 from public.program_days d
         where d.id = private.as_uuid(v_op -> 'program_day_id')
           and d.user_id = p_user and d.program_id = p_program and d.deleted_at is null
      ) then
        raise exception 'change %: program_day_id is not a day of this program', v_idx using errcode = '22023';
      end if;
      v_id := private.as_uuid(v_op -> 'exercise_id');
      if v_id is null or not exists (
        select 1 from public.exercises e
         where e.id = v_id and e.deleted_at is null and (e.user_id is null or e.user_id = p_user)
      ) then
        raise exception 'change %: exercise_id is not an available exercise', v_idx using errcode = '22023';
      end if;

    elsif v_kind = 'update_day' then
      perform private.require_keys(v_idx, v_op, array['op', 'program_day_id', 'set'], array[]::text[]);
      if not exists (
        select 1 from public.program_days d
         where d.id = private.as_uuid(v_op -> 'program_day_id')
           and d.user_id = p_user and d.program_id = p_program and d.deleted_at is null
      ) then
        raise exception 'change %: program_day_id is not a day of this program', v_idx using errcode = '22023';
      end if;
      v_set := v_op -> 'set';
      if jsonb_typeof(v_set) <> 'object' or v_set = '{}'::jsonb then
        raise exception 'change %: "set" must be a non-empty object', v_idx using errcode = '22023';
      end if;
      for k, v in select key, value from jsonb_each(v_set) loop
        v_ok := case k
          when 'name' then private.is_text(v, 1, 80)
          when 'focus' then jsonb_typeof(v) = 'string' and (v #>> '{}') in ('push', 'pull', 'legs', 'upper', 'lower', 'full')
          when 'equipment_profile_id' then jsonb_typeof(v) = 'null' or exists (
            select 1 from public.equipment_profiles ep
             where ep.id = private.as_uuid(v) and ep.user_id = p_user and ep.deleted_at is null)
          else null
        end;
        if v_ok is null then
          raise exception 'change %: unexpected field "%" in set', v_idx, k using errcode = '22023';
        elsif not v_ok then
          raise exception 'change %: invalid value for "%"', v_idx, k using errcode = '22023';
        end if;
      end loop;

    else
      raise exception 'change %: unknown op "%"', v_idx, coalesce(v_kind, 'null') using errcode = '22023';
    end if;
  end loop;
end;
$$;

-- coach_proposals triggers ------------------------------------------------

-- Runs before the RLS check. client_id and source cannot be chosen by the
-- caller: they are read from the JWT. Validation uses auth.uid(), never the
-- submitted user_id, so a forged row cannot be used to probe another user.
create function private.coach_proposals_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_client text := (select auth.jwt()) ->> 'client_id';
  v_version int;
  v_now timestamptz := clock_timestamp();
begin
  if v_uid is null or new.user_id is distinct from v_uid then
    raise exception 'new row violates row-level security policy for table "coach_proposals"'
      using errcode = '42501';
  end if;

  new.client_id := v_client;
  new.source := case when v_client is null then 'user' else 'claude' end;
  new.created_at := v_now;
  new.updated_at := v_now;
  new.server_updated_at := v_now;

  select p.version into v_version
    from public.programs p
   where p.id = new.program_id and p.user_id = v_uid and p.deleted_at is null;
  if not found then
    raise exception 'program_id is not one of your programs' using errcode = '22023';
  end if;
  if new.base_program_version is distinct from v_version then
    raise exception 'base_program_version must equal the program''s current version (%), read the plan again', v_version
      using errcode = '22023';
  end if;

  perform private.validate_proposal_changes(v_uid, new.program_id, new.changes);
  return new;
end;
$$;

create trigger coach_proposals_before_insert
  before insert on public.coach_proposals
  for each row execute function private.coach_proposals_before_insert();

create function private.coach_proposals_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.write_audit(
    new.user_id,
    case when new.client_id is null then 'user' else 'claude' end,
    new.client_id,
    'proposal_created',
    'coach_proposals',
    new.id,
    jsonb_build_object('title', new.title, 'changes', jsonb_array_length(new.changes)));
  return null;
end;
$$;

create trigger coach_proposals_after_insert
  after insert on public.coach_proposals
  for each row execute function private.coach_proposals_after_insert();

-- What a proposal says never changes after it is created; only its state does.
create function private.coach_proposals_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.program_id is distinct from old.program_id
     or new.source is distinct from old.source
     or new.client_id is distinct from old.client_id
     or new.base_program_version is distinct from old.base_program_version
     or new.title is distinct from old.title
     or new.rationale is distinct from old.rationale
     or new.changes is distinct from old.changes
     or new.created_at is distinct from old.created_at then
    raise exception 'a proposal cannot be edited after it is created' using errcode = '42501';
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger coach_proposals_before_update
  before update on public.coach_proposals
  for each row execute function private.coach_proposals_before_update();
