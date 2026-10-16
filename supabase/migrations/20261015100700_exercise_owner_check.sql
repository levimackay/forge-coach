-- A planned exercise or a logged set may point only at a library exercise or at
-- one of the same user's own exercises.
--
-- Foreign key checks skip row level security, so without this another user who
-- knows the id of someone's custom exercise could reference it. That foreign key
-- is ON DELETE NO ACTION, so the stray row would then block the owner's
-- delete_my_data and delete_my_account, and the owner could not even see it.
--
-- SECURITY INVOKER on purpose: for an API caller, another user's exercise is
-- hidden by row level security and so reads as missing.

create function private.exercise_is_own_or_library()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.exercises e
     where e.id = new.exercise_id
       and (e.user_id is null or e.user_id = new.user_id)
  ) then
    raise exception 'exercise_id must be a library exercise or one of your own'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger planned_exercises_exercise_owner
  before insert or update of exercise_id, user_id on public.planned_exercises
  for each row execute function private.exercise_is_own_or_library();

create trigger workout_sets_exercise_owner
  before insert or update of exercise_id, user_id on public.workout_sets
  for each row execute function private.exercise_is_own_or_library();

-- Trigger functions never need EXECUTE; keep the private schema closed to API roles.
revoke all on function private.exercise_is_own_or_library() from public, anon, authenticated;
