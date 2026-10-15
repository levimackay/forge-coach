-- Cross-user isolation check for the hosted project. Run it in the Supabase SQL
-- editor or through the SQL API. It creates two throwaway users and some rows,
-- impersonates each user (and an OAuth client token), asserts what each can and
-- cannot do, and ALWAYS ends by raising an exception, so the whole transaction
-- rolls back and nothing persists. A message starting with ISOLATION_OK means
-- every assertion held; anything else names the failed assertion.

do $$
declare
  v_u uuid[] := array['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']::uuid[];
  v_client text := '33333333-3333-4333-8333-333333333333';
  v_p uuid[]; v_d uuid[]; v_e uuid[]; v_pe1 uuid[]; v_pe2 uuid[]; v_w uuid[]; v_prop uuid[];
  v_bench uuid; v_push uuid; v_new uuid;
  v_tables text[] := array['profiles', 'goals', 'equipment_profiles', 'exercises', 'programs', 'program_days',
    'planned_exercises', 'workouts', 'workout_sets', 'recovery_logs', 'body_measurements',
    'progression_decisions', 'coach_proposals', 'audit_log'];
  v_writable text[] := array['profiles', 'goals', 'equipment_profiles', 'exercises', 'programs', 'program_days',
    'planned_exercises', 'workouts', 'workout_sets', 'recovery_logs', 'body_measurements', 'progression_decisions'];
  t text; i int; n bigint; rc bigint; v_text text; v_int int;
  v_snap jsonb;
  v_rep text := '';
begin
  select id into v_bench from public.exercises where slug = 'barbell-bench-press' and user_id is null;
  select id into v_push from public.exercises where slug = 'push-up' and user_id is null;
  if v_bench is null or v_push is null then raise exception 'FAIL: seeded exercises are missing'; end if;
  v_snap := jsonb_build_object('exercise_id', v_bench, 'sets', 3, 'rep_min', 6, 'rep_max', 10, 'target_rir', 2, 'load', 135);

  -- fixtures, written as the database owner with the user's claims so triggers see a user
  for i in 1..2 loop
    insert into auth.users (id, aud, role, email)
    values (v_u[i], 'authenticated', 'authenticated', 'throwaway-' || i || '@forge-coach.invalid');
    perform set_config('request.jwt.claims', json_build_object('sub', v_u[i]::text, 'role', 'authenticated')::text, true);
    v_p[i] := gen_random_uuid(); v_d[i] := gen_random_uuid(); v_e[i] := gen_random_uuid();
    v_pe1[i] := gen_random_uuid(); v_pe2[i] := gen_random_uuid(); v_w[i] := gen_random_uuid(); v_prop[i] := gen_random_uuid();
    insert into public.profiles (user_id, display_name) values (v_u[i], 'Throwaway ' || i);
    insert into public.goals (user_id, kind, description) values (v_u[i], 'hypertrophy', 'x');
    insert into public.equipment_profiles (id, user_id, name) values (v_e[i], v_u[i], 'Home');
    insert into public.exercises (user_id, slug, name, primary_muscle, movement_pattern, load_type, default_rep_min, default_rep_max)
      values (v_u[i], 'custom-' || i, 'Custom', 'biceps', 'elbow_flexion', 'external', 8, 12);
    insert into public.programs (id, user_id, name, split, days_per_week, is_active) values (v_p[i], v_u[i], 'Base', 'ppl', 3, true);
    insert into public.program_days (id, user_id, program_id, position, name, focus) values (v_d[i], v_u[i], v_p[i], 0, 'Push', 'push');
    insert into public.planned_exercises (id, user_id, program_day_id, position, exercise_id, sets, rep_min, rep_max, target_rir, load)
      values (v_pe1[i], v_u[i], v_d[i], 0, v_bench, 3, 6, 10, 2, 135), (v_pe2[i], v_u[i], v_d[i], 1, v_push, 3, 8, 20, 2, null);
    insert into public.workouts (id, user_id, program_day_id, started_at, completed_at, status)
      values (v_w[i], v_u[i], v_d[i], now(), now(), 'completed');
    insert into public.workout_sets (user_id, workout_id, planned_exercise_id, exercise_id, set_index, reps, load, rir)
      values (v_u[i], v_w[i], v_pe1[i], v_bench, 0, 8, 135, 2);
    insert into public.recovery_logs (user_id, date, sleep_hours, soreness) values (v_u[i], '2026-10-01', 7.5, 2);
    insert into public.body_measurements (user_id, measured_on, bodyweight) values (v_u[i], '2026-10-01', 180);
    insert into public.progression_decisions (user_id, planned_exercise_id, workout_id, engine_version, action, before, after, reason)
      values (v_u[i], v_pe1[i], v_w[i], 't', 'hold', v_snap, v_snap, 'r');
    insert into public.coach_proposals (id, user_id, program_id, base_program_version, title, rationale, changes)
      values (v_prop[i], v_u[i], v_p[i], 1, 'T', 'R',
        jsonb_build_array(jsonb_build_object('op', 'update_prescription', 'planned_exercise_id', v_pe1[i], 'set', jsonb_build_object('sets', 4))));
  end loop;

  -- 1. user A: sees only their own rows in every table ---------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_u[1]::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' then raise exception 'FAIL: role switch did not happen'; end if;
  foreach t in array v_tables loop
    execute format('select count(*) from public.%I where user_id is not null and user_id <> $1', t) into n using v_u[1];
    if n <> 0 then raise exception 'FAIL: A sees % foreign rows in %', n, t; end if;
    execute format('select count(*) from public.%I where user_id = $1', t) into n using v_u[1];
    if n < 1 then raise exception 'FAIL: A cannot see their own rows in %', t; end if;
  end loop;
  select count(*) into n from public.exercises where user_id is null;
  if n < 70 then raise exception 'FAIL: global exercises not readable (%)', n; end if;
  v_rep := v_rep || 'A sees own rows only (14 tables, ' || n || ' global exercises); ';

  -- 2. user B: cannot read, update, delete or insert for A ------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_u[2]::text, 'role', 'authenticated')::text, true);
  foreach t in array v_tables loop
    execute format('select count(*) from public.%I where user_id = $1', t) into n using v_u[1];
    if n <> 0 then raise exception 'FAIL: B reads % of A''s rows in %', n, t; end if;
  end loop;
  foreach t in array v_writable loop
    if t = 'profiles' then
      execute format('update public.%I set display_name = ''hacked'' where user_id = $1', t) using v_u[1];
    else
      execute format('update public.%I set updated_at = updated_at + interval ''1 hour'' where user_id = $1', t) using v_u[1];
    end if;
    get diagnostics rc = row_count;
    if rc <> 0 then raise exception 'FAIL: B updated % of A''s rows in %', rc, t; end if;
    execute format('delete from public.%I where user_id = $1', t) using v_u[1];
    get diagnostics rc = row_count;
    if rc <> 0 then raise exception 'FAIL: B deleted % of A''s rows in %', rc, t; end if;
  end loop;
  begin
    insert into public.goals (user_id, kind, description) values (v_u[1], 'other', 'stolen');
    raise exception 'FAIL: B inserted a goal for A' using errcode = 'XX999';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.programs (user_id, name, split, days_per_week) values (v_u[1], 'stolen', 'custom', 2);
    raise exception 'FAIL: B inserted a program for A' using errcode = 'XX999';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.approve_proposal(v_prop[1]);
    raise exception 'FAIL: B approved A''s proposal' using errcode = 'XX999';
  exception when no_data_found then null;
  end;
  begin
    perform public.apply_proposal(v_prop[1]);
    raise exception 'FAIL: B applied A''s proposal' using errcode = 'XX999';
  exception when no_data_found then null;
  end;
  v_rep := v_rep || 'B cannot read/update/delete/insert for A; ';

  -- 3. anon gets nothing ---------------------------------------------------------
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    perform count(*) from public.programs;
    raise exception 'FAIL: anon read programs' using errcode = 'XX999';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.export_my_data();
    raise exception 'FAIL: anon called export_my_data' using errcode = 'XX999';
  exception when insufficient_privilege then null;
  end;
  reset role;
  v_rep := v_rep || 'anon denied; ';

  -- 4. OAuth client token (Claude) for A ------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_u[1]::text, 'role', 'authenticated', 'client_id', v_client)::text, true);
  set local role authenticated;
  foreach t in array v_tables loop
    execute format('select count(*) from public.%I where user_id = $1', t) into n using v_u[1];
    if n < 1 then raise exception 'FAIL: OAuth token cannot read % ', t; end if;
  end loop;
  foreach t in array v_writable loop
    if t = 'profiles' then
      execute format('update public.%I set display_name = ''claude'' where user_id = $1', t) using v_u[1];
    else
      execute format('update public.%I set updated_at = updated_at + interval ''1 hour'' where user_id = $1', t) using v_u[1];
    end if;
    get diagnostics rc = row_count;
    if rc <> 0 then raise exception 'FAIL: OAuth token updated % rows in %', rc, t; end if;
    execute format('delete from public.%I where user_id = $1', t) using v_u[1];
    get diagnostics rc = row_count;
    if rc <> 0 then raise exception 'FAIL: OAuth token deleted % rows in %', rc, t; end if;
  end loop;
  begin
    insert into public.goals (user_id, kind, description) values (v_u[1], 'other', 'from claude');
    raise exception 'FAIL: OAuth token inserted a goal' using errcode = 'XX999';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.planned_exercises (user_id, program_day_id, position, exercise_id, sets, rep_min, rep_max, target_rir)
      values (v_u[1], v_d[1], 5, v_push, 3, 8, 12, 2);
    raise exception 'FAIL: OAuth token inserted a planned exercise' using errcode = 'XX999';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.coach_proposals set status = 'approved', decided_at = now() where id = v_prop[1];
    raise exception 'FAIL: OAuth token updated a proposal' using errcode = 'XX999';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.audit_log (user_id, actor, action, entity) values (v_u[1], 'user', 'x', 'y');
    raise exception 'FAIL: OAuth token wrote the audit log' using errcode = 'XX999';
  exception when insufficient_privilege then null;
  end;

  insert into public.coach_proposals (user_id, program_id, base_program_version, title, rationale, changes, client_id, source)
    values (v_u[1], v_p[1], 1, 'Claude proposal', 'R',
      jsonb_build_array(jsonb_build_object('op', 'remove_exercise', 'planned_exercise_id', v_pe2[1])), 'spoofed', 'user')
    returning id into v_new;
  select client_id || '/' || source || '/' || status into v_text from public.coach_proposals where id = v_new;
  if v_text <> v_client || '/claude/pending' then raise exception 'FAIL: proposal fields are % ', v_text; end if;
  begin
    insert into public.coach_proposals (user_id, program_id, base_program_version, title, rationale, changes, status)
      values (v_u[1], v_p[1], 1, 'x', 'R', jsonb_build_array(jsonb_build_object('op', 'remove_exercise', 'planned_exercise_id', v_pe2[1])), 'approved');
    raise exception 'FAIL: OAuth token inserted an approved proposal' using errcode = 'XX999';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.coach_proposals (user_id, program_id, base_program_version, title, rationale, changes)
      values (v_u[1], v_p[1], 1, 'x', 'R', jsonb_build_array(jsonb_build_object('op', 'remove_exercise', 'planned_exercise_id', v_pe2[2])));
    raise exception 'FAIL: proposal accepted another user''s planned exercise' using errcode = 'XX999';
  exception when invalid_parameter_value then null;
  end;
  begin perform public.approve_proposal(v_new); raise exception 'FAIL: OAuth approve' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform public.reject_proposal(v_new); raise exception 'FAIL: OAuth reject' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform public.undo_proposal(v_new); raise exception 'FAIL: OAuth undo' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform public.delete_my_data(); raise exception 'FAIL: OAuth delete_my_data' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform public.apply_proposal(v_new); raise exception 'FAIL: OAuth applied a pending proposal' using errcode = 'XX999';
  exception when object_not_in_prerequisite_state then null; end;
  v_rep := v_rep || 'OAuth token is read-only plus pending proposals; ';

  -- the user approves (done here as the owner), then Claude may apply
  reset role;
  update public.coach_proposals set status = 'approved', decided_at = now() where id = v_new;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_u[1]::text, 'role', 'authenticated', 'client_id', v_client)::text, true);
  set local role authenticated;
  perform public.apply_proposal(v_new);
  perform public.apply_proposal(v_new);
  select is_active::text into v_text from public.planned_exercises where id = v_pe2[1];
  if v_text <> 'false' then raise exception 'FAIL: approved proposal was not applied'; end if;
  select count(*) into n from public.audit_log where entity_id = v_new and actor = 'claude' and client_id = v_client;
  if n < 2 then raise exception 'FAIL: audit rows for Claude missing (%)', n; end if;
  v_rep := v_rep || 'OAuth token applied an approved proposal only; ';

  -- 5. first party: approve, apply, undo ------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_u[1]::text, 'role', 'authenticated')::text, true);
  perform public.approve_proposal(v_prop[1], 'ok');
  select sets into v_int from public.planned_exercises where id = v_pe1[1];
  if v_int <> 4 then raise exception 'FAIL: approve did not apply (sets=%)', v_int; end if;
  select version into v_int from public.programs where id = v_p[1];
  if v_int <> 3 then raise exception 'FAIL: program version is % (expected 3: one apply by Claude, one by the user)', v_int; end if;
  perform public.undo_proposal(v_prop[1]);
  select sets into v_int from public.planned_exercises where id = v_pe1[1];
  if v_int <> 3 then raise exception 'FAIL: undo did not restore sets (%)', v_int; end if;
  select status into v_text from public.coach_proposals where id = v_prop[1];
  if v_text <> 'undone' then raise exception 'FAIL: status is %', v_text; end if;
  v_rep := v_rep || 'approve/undo restore exact values; ';

  -- 6. sync rules -----------------------------------------------------------------
  update public.goals set description = 'stale', updated_at = '2000-01-01' where user_id = v_u[1];
  get diagnostics rc = row_count;
  if rc <> 0 then raise exception 'FAIL: stale write was applied'; end if;
  insert into public.goals (user_id, kind, description, server_updated_at) values (v_u[1], 'other', 'ssu', '2000-01-01');
  select count(*) into n from public.goals where description = 'ssu' and server_updated_at < now() - interval '1 minute';
  if n <> 0 then raise exception 'FAIL: client chose server_updated_at'; end if;
  update public.programs set version = 99, name = 'renamed', updated_at = now() + interval '1 minute' where id = v_p[1];
  select version into v_int from public.programs where id = v_p[1];
  if v_int = 99 then raise exception 'FAIL: client changed programs.version'; end if;
  update public.exercises set name = 'x' where user_id is null;
  get diagnostics rc = row_count;
  if rc <> 0 then raise exception 'FAIL: global exercises were updated'; end if;
  begin
    insert into public.exercises (user_id, slug, name, primary_muscle, movement_pattern, load_type, default_rep_min, default_rep_max)
      values (null, 'sneaky', 'x', 'chest', 'horizontal_push', 'bodyweight', 8, 12);
    raise exception 'FAIL: global exercise inserted' using errcode = 'XX999';
  exception when insufficient_privilege then null;
  end;
  v_rep := v_rep || 'LWW, server_updated_at, version guard and global library hold; ';

  -- 7. export and wipe for B only ---------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_u[2]::text, 'role', 'authenticated')::text, true);
  select jsonb_array_length(public.export_my_data() -> 'tables' -> 'planned_exercises') into v_int;
  if v_int <> 2 then raise exception 'FAIL: export has % planned exercises', v_int; end if;
  perform public.delete_my_data();
  reset role;
  select count(*) into n from public.programs where user_id = v_u[2];
  if n <> 0 then raise exception 'FAIL: delete_my_data left programs'; end if;
  select count(*) into n from public.programs where user_id = v_u[1];
  if n <> 1 then raise exception 'FAIL: delete_my_data touched A (programs=%)', n; end if;
  v_rep := v_rep || 'delete_my_data removes only the caller''s rows.';

  raise exception 'ISOLATION_OK: %', v_rep;
end;
$$;
