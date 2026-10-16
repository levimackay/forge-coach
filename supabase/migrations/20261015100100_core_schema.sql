-- Core tables. Row level security, triggers, functions and the exercise seed
-- arrive in the following migrations.
--
-- Conventions
--   * Ids are client-made uuids so offline writes can be retried safely.
--   * updated_at is set by the client (last write wins). server_updated_at is
--     set by a trigger and is the cursor clients use to pull changes.
--   * Removal is soft (deleted_at) for synced tables.
--   * Enumerations are CHECK constraints so they are easy to extend.

create schema if not exists private;
revoke all on schema private from public;

-- profiles ---------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  unit text not null default 'lb' check (unit in ('lb', 'kg')),
  bodyweight numeric(6, 2) check (bodyweight is null or (bodyweight > 0 and bodyweight <= 1000)),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

-- goals ------------------------------------------------------------------

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('hypertrophy', 'strength', 'skill', 'body_composition', 'other')),
  description text not null check (char_length(description) <= 1000),
  focus_muscles text[] not null default '{}' check (
    cardinality(focus_muscles) <= 15
    and focus_muscles <@ array['chest', 'front_delts', 'side_delts', 'rear_delts', 'triceps', 'biceps', 'forearms', 'lats', 'upper_back', 'traps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs']::text[]
  ),
  target_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- equipment_profiles -----------------------------------------------------

create table public.equipment_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  equipment text[] not null default '{bodyweight}' check (
    cardinality(equipment) <= 12
    and equipment <@ array['bodyweight', 'pullup_bar', 'dip_bars', 'rings', 'dumbbells', 'bands', 'kettlebells', 'barbell', 'rack', 'bench', 'cable', 'machines']::text[]
  ),
  dumbbell_increment numeric(6, 2) check (dumbbell_increment is null or dumbbell_increment > 0),
  dumbbell_max numeric(7, 2) check (dumbbell_max is null or dumbbell_max > 0),
  barbell_increment numeric(6, 2) check (barbell_increment is null or barbell_increment > 0),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- exercises --------------------------------------------------------------
-- user_id is null for the global library (written only by migrations).

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name text not null check (char_length(name) between 1 and 120),
  primary_muscle text not null check (primary_muscle in ('chest', 'front_delts', 'side_delts', 'rear_delts', 'triceps', 'biceps', 'forearms', 'lats', 'upper_back', 'traps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs')),
  secondary_muscles text[] not null default '{}' check (
    cardinality(secondary_muscles) <= 15
    and secondary_muscles <@ array['chest', 'front_delts', 'side_delts', 'rear_delts', 'triceps', 'biceps', 'forearms', 'lats', 'upper_back', 'traps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs']::text[]
  ),
  movement_pattern text not null check (movement_pattern in ('horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull', 'squat', 'hinge', 'lunge', 'elbow_flexion', 'elbow_extension', 'shoulder_isolation', 'chest_isolation', 'calf', 'core')),
  equipment text[] not null default '{bodyweight}' check (
    cardinality(equipment) between 1 and 12
    and equipment <@ array['bodyweight', 'pullup_bar', 'dip_bars', 'rings', 'dumbbells', 'bands', 'kettlebells', 'barbell', 'rack', 'bench', 'cable', 'machines']::text[]
  ),
  load_type text not null check (load_type in ('bodyweight', 'external', 'assisted')),
  progression_group text check (progression_group is null or progression_group ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ladder_level int check (ladder_level is null or ladder_level between 1 and 50),
  default_rep_min int not null check (default_rep_min between 1 and 100),
  default_rep_max int not null check (default_rep_max between 1 and 100),
  default_increment numeric(6, 2) check (default_increment is null or default_increment > 0),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint exercises_rep_range check (default_rep_min <= default_rep_max),
  constraint exercises_ladder_pair check ((progression_group is null) = (ladder_level is null))
);

comment on column public.exercises.default_increment is
  'Smallest sensible load jump in pounds. Convert for kg users. Null means no numeric load (bodyweight, bands).';
comment on column public.exercises.equipment is
  'Every listed code is required. Bodyweight is always available to the lifter.';
comment on column public.exercises.progression_group is
  'Ladder family. Order within the family is ladder_level (1 is the easiest). movement_pattern may change along a ladder.';

-- programs ---------------------------------------------------------------

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  split text not null check (split in ('ppl', 'upper_lower', 'full_body', 'custom')),
  days_per_week int not null check (days_per_week between 1 and 7),
  is_active boolean not null default false,
  version int not null default 1 check (version >= 1),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- Deferred so a sync batch that switches the active program can send the
  -- two rows in any order and only the final state is checked.
  constraint programs_one_active_per_user
    exclude using btree (user_id with =) where (is_active and deleted_at is null)
    deferrable initially deferred
);

comment on column public.programs.version is
  'Bumped by apply_proposal and undo_proposal only. Client writes cannot change it.';

-- program_days -----------------------------------------------------------

create table public.program_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  position int not null check (position between 0 and 100),
  name text not null check (char_length(name) between 1 and 80),
  focus text not null check (focus in ('push', 'pull', 'legs', 'upper', 'lower', 'full')),
  equipment_profile_id uuid references public.equipment_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- planned_exercises ------------------------------------------------------
-- Removal is is_active = false so history links survive.
-- The exercise foreign key is deferred so deleting a whole account can cascade
-- through the user's custom exercises and the rows that use them in any order.

create table public.planned_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  program_day_id uuid not null references public.program_days (id) on delete cascade,
  position int not null check (position between 0 and 200),
  exercise_id uuid not null references public.exercises (id) on delete no action deferrable initially deferred,
  sets int not null check (sets between 1 and 20),
  rep_min int not null check (rep_min between 1 and 100),
  rep_max int not null check (rep_max between 1 and 100),
  target_rir int not null check (target_rir between 0 and 10),
  load numeric(7, 2) check (load is null or load between 0 and 5000),
  rest_seconds int check (rest_seconds is null or rest_seconds between 0 and 3600),
  notes text check (notes is null or char_length(notes) <= 1000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint planned_exercises_rep_range check (rep_min <= rep_max)
);

-- workouts ---------------------------------------------------------------

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  program_day_id uuid references public.program_days (id) on delete set null,
  equipment_profile_id uuid references public.equipment_profiles (id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  session_rpe int check (session_rpe is null or session_rpe between 1 and 10),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint workouts_completed_has_time check (status <> 'completed' or completed_at is not null)
);

-- workout_sets -----------------------------------------------------------

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  planned_exercise_id uuid references public.planned_exercises (id) on delete set null,
  exercise_id uuid not null references public.exercises (id) on delete no action deferrable initially deferred,
  set_index int not null check (set_index between 0 and 200),
  reps int not null check (reps between 0 and 1000),
  load numeric(7, 2) check (load is null or load between 0 and 5000),
  rir int check (rir is null or rir between 0 and 10),
  is_warmup boolean not null default false,
  pain boolean not null default false,
  completed_at timestamptz not null default now(),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- recovery_logs ----------------------------------------------------------

create table public.recovery_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  sleep_hours numeric(4, 2) check (sleep_hours is null or sleep_hours between 0 and 24),
  sleep_quality int check (sleep_quality is null or sleep_quality between 1 and 5),
  soreness int check (soreness is null or soreness between 1 and 5),
  energy int check (energy is null or energy between 1 and 5),
  stress int check (stress is null or stress between 1 and 5),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- body_measurements ------------------------------------------------------
-- Values are in the unit chosen on the profile (lb/in or kg/cm).

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  measured_on date not null,
  bodyweight numeric(6, 2) check (bodyweight is null or (bodyweight > 0 and bodyweight <= 1000)),
  waist numeric(5, 2) check (waist is null or (waist > 0 and waist <= 500)),
  chest numeric(5, 2) check (chest is null or (chest > 0 and chest <= 500)),
  arm numeric(5, 2) check (arm is null or (arm > 0 and arm <= 500)),
  thigh numeric(5, 2) check (thigh is null or (thigh > 0 and thigh <= 500)),
  body_fat_pct numeric(4, 1) check (body_fat_pct is null or (body_fat_pct > 0 and body_fat_pct < 100)),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- progression_decisions --------------------------------------------------

create table public.progression_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  planned_exercise_id uuid not null references public.planned_exercises (id) on delete cascade,
  workout_id uuid references public.workouts (id) on delete set null,
  decided_at timestamptz not null default now(),
  engine_version text not null check (char_length(engine_version) between 1 and 40),
  action text not null check (action in ('increase_load', 'increase_reps', 'hold', 'advance_variation', 'regress_variation', 'deload', 'reduce_after_gap', 'pain_hold', 'substitute_equipment')),
  before jsonb not null check (
    jsonb_typeof(before) = 'object'
    and before ?& array['exercise_id', 'sets', 'rep_min', 'rep_max', 'target_rir', 'load']
  ),
  after jsonb not null check (
    jsonb_typeof(after) = 'object'
    and after ?& array['exercise_id', 'sets', 'rep_min', 'rep_max', 'target_rir', 'load']
  ),
  reason text not null check (char_length(reason) between 1 and 1000),
  inputs jsonb not null default '{}' check (jsonb_typeof(inputs) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- coach_proposals --------------------------------------------------------
-- Created by the user or by Claude (OAuth client). Moves through its states
-- only via the functions in a later migration; clients cannot UPDATE it.

create table public.coach_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  source text not null default 'user' check (source in ('claude', 'user')),
  client_id text default (auth.jwt() ->> 'client_id'),
  program_id uuid not null references public.programs (id) on delete cascade,
  base_program_version int not null check (base_program_version >= 1),
  title text not null check (char_length(title) between 1 and 200),
  rationale text not null check (char_length(rationale) between 1 and 5000),
  changes jsonb not null check (jsonb_typeof(changes) = 'array' and jsonb_array_length(changes) between 1 and 30),
  inverse_changes jsonb check (inverse_changes is null or jsonb_typeof(inverse_changes) = 'array'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'applied', 'undone')),
  decided_at timestamptz,
  applied_at timestamptz,
  undone_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  constraint coach_proposals_decided check (status = 'pending' or decided_at is not null),
  constraint coach_proposals_applied check (status not in ('applied', 'undone') or (applied_at is not null and inverse_changes is not null)),
  constraint coach_proposals_undone check (status <> 'undone' or undone_at is not null)
);

-- audit_log --------------------------------------------------------------
-- Append only. Read cursor for clients is "at".

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  at timestamptz not null default clock_timestamp(),
  actor text not null check (actor in ('user', 'engine', 'claude', 'system')),
  client_id text,
  action text not null check (char_length(action) between 1 and 80),
  entity text not null check (char_length(entity) between 1 and 80),
  entity_id uuid,
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object')
);

-- indexes ----------------------------------------------------------------
-- Pull cursor on every synced table, then one index per foreign key.

create index goals_user_sync_idx on public.goals (user_id, server_updated_at);
create index equipment_profiles_user_sync_idx on public.equipment_profiles (user_id, server_updated_at);
create index exercises_user_sync_idx on public.exercises (user_id, server_updated_at);
create index programs_user_sync_idx on public.programs (user_id, server_updated_at);
create index program_days_user_sync_idx on public.program_days (user_id, server_updated_at);
create index planned_exercises_user_sync_idx on public.planned_exercises (user_id, server_updated_at);
create index workouts_user_sync_idx on public.workouts (user_id, server_updated_at);
create index workout_sets_user_sync_idx on public.workout_sets (user_id, server_updated_at);
create index recovery_logs_user_sync_idx on public.recovery_logs (user_id, server_updated_at);
create index body_measurements_user_sync_idx on public.body_measurements (user_id, server_updated_at);
create index progression_decisions_user_sync_idx on public.progression_decisions (user_id, server_updated_at);
create index coach_proposals_user_sync_idx on public.coach_proposals (user_id, server_updated_at);
create index audit_log_user_at_idx on public.audit_log (user_id, at desc);

create index exercises_global_sync_idx on public.exercises (server_updated_at) where user_id is null;
create unique index exercises_global_slug_key on public.exercises (slug) where user_id is null;
create unique index exercises_user_slug_key on public.exercises (user_id, slug) where user_id is not null and deleted_at is null;
create unique index exercises_global_ladder_key on public.exercises (progression_group, ladder_level) where user_id is null and progression_group is not null;

create index program_days_program_idx on public.program_days (program_id, position);
create index program_days_equipment_profile_idx on public.program_days (equipment_profile_id);
create index planned_exercises_day_idx on public.planned_exercises (program_day_id, position);
create index planned_exercises_exercise_idx on public.planned_exercises (exercise_id);
create index workouts_user_started_idx on public.workouts (user_id, started_at desc);
create index workouts_program_day_idx on public.workouts (program_day_id);
create index workouts_equipment_profile_idx on public.workouts (equipment_profile_id);
create index workout_sets_workout_idx on public.workout_sets (workout_id, set_index);
create index workout_sets_planned_exercise_idx on public.workout_sets (planned_exercise_id);
create index workout_sets_exercise_idx on public.workout_sets (exercise_id, completed_at desc);
create index progression_decisions_planned_idx on public.progression_decisions (planned_exercise_id, decided_at desc);
create index progression_decisions_workout_idx on public.progression_decisions (workout_id);
create index coach_proposals_program_idx on public.coach_proposals (program_id);
create index coach_proposals_user_status_idx on public.coach_proposals (user_id, status, created_at desc);
create index body_measurements_user_date_idx on public.body_measurements (user_id, measured_on desc);
create unique index recovery_logs_user_date_key on public.recovery_logs (user_id, date) where deleted_at is null;
