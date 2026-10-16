-- Global exercise library (user_id is null): readable by every signed-in user,
-- writable by nobody through the API.
--
-- Ids are derived from the slug so the same exercise has the same id in every
-- environment and exports restore cleanly into a fresh project.
-- Re-running this file is safe: rows are matched on slug and an unchanged row
-- is ignored by the sync trigger.
--
-- Conventions
--   * default_increment is in pounds; null means no numeric load to add.
--   * equipment lists every code that is required. bodyweight is always available.
--   * Rep ranges: free-weight compounds 6-10, machine/cable/dumbbell work 8-12,
--     small isolation 10-20, bodyweight 8-20 (harder rungs lower).
--   * Along a ladder (progression_group) level 1 is the easiest rung.
--     movement_pattern and primary_muscle can change between rungs.

insert into public.exercises
  (id, user_id, slug, name, primary_muscle, secondary_muscles, movement_pattern, equipment, load_type,
   progression_group, ladder_level, default_rep_min, default_rep_max, default_increment, notes)
select
  md5('forge-coach:exercise:' || v.slug)::uuid,
  null,
  v.slug,
  v.name,
  v.primary_muscle,
  v.secondary_muscles::text[],
  v.movement_pattern,
  v.equipment::text[],
  v.load_type,
  v.progression_group,
  v.ladder_level::int,
  v.rep_min::int,
  v.rep_max::int,
  v.increment_lb::numeric,
  v.notes
from (values
  -- push-up ladder
  ('wall-push-up', 'Wall push-up', 'chest', '{triceps,front_delts}', 'horizontal_push', '{bodyweight}', 'bodyweight', 'push-up', 1, 10, 20, null, 'Stand an arm''s length from a wall with your hands on it at chest height and your body in one straight line.'),
  ('incline-push-up-high', 'High incline push-up', 'chest', '{triceps,front_delts}', 'horizontal_push', '{bodyweight}', 'bodyweight', 'push-up', 2, 10, 20, null, 'Hands on a counter or sturdy table, body in one straight line.'),
  ('incline-push-up-low', 'Low incline push-up', 'chest', '{triceps,front_delts}', 'horizontal_push', '{bodyweight}', 'bodyweight', 'push-up', 3, 8, 20, null, 'Hands on a bench or low step, body in one straight line.'),
  ('push-up', 'Push-up', 'chest', '{triceps,front_delts}', 'horizontal_push', '{bodyweight}', 'bodyweight', 'push-up', 4, 8, 20, null, 'Hands under the shoulders, chest to just above the floor, body in one straight line.'),
  ('close-grip-push-up', 'Close-grip push-up', 'chest', '{triceps,front_delts}', 'horizontal_push', '{bodyweight}', 'bodyweight', 'push-up', 5, 8, 20, null, 'Hands under the chest with the elbows brushing the ribs. Diamond hands make it harder.'),
  ('decline-push-up', 'Decline push-up', 'chest', '{triceps,front_delts}', 'horizontal_push', '{bodyweight}', 'bodyweight', 'push-up', 6, 8, 20, null, 'Feet on a chair or bench, hands on the floor.'),
  ('archer-push-up', 'Archer push-up', 'chest', '{triceps,front_delts}', 'horizontal_push', '{bodyweight}', 'bodyweight', 'push-up', 7, 4, 10, null, 'Wide hands. Lower toward one hand while the other arm stays straight, then alternate sides.'),
  ('pseudo-planche-push-up', 'Pseudo planche push-up', 'chest', '{front_delts,triceps}', 'horizontal_push', '{bodyweight}', 'bodyweight', 'push-up', 8, 5, 12, null, 'Hands by the hips with the fingers turned out, shoulders well past the hands.'),
  ('weighted-push-up', 'Weighted push-up', 'chest', '{triceps,front_delts}', 'horizontal_push', '{bodyweight}', 'external', 'push-up', 9, 6, 12, 5, 'Add a weight vest or a loaded backpack. The load is the added weight.'),

  -- pike and handstand push-up ladder
  ('pike-push-up', 'Pike push-up', 'front_delts', '{side_delts,triceps}', 'vertical_push', '{bodyweight}', 'bodyweight', 'pike-push-up', 1, 6, 15, null, 'Hips high, move the head between the hands toward the floor.'),
  ('elevated-pike-push-up', 'Feet-elevated pike push-up', 'front_delts', '{side_delts,triceps}', 'vertical_push', '{bodyweight}', 'bodyweight', 'pike-push-up', 2, 5, 12, null, 'Feet on a chair or bench so the torso is closer to vertical.'),
  ('wall-handstand-push-up', 'Wall handstand push-up', 'front_delts', '{side_delts,triceps}', 'vertical_push', '{bodyweight}', 'bodyweight', 'pike-push-up', 3, 3, 8, null, 'Kick up to a wall, lower the head to a pad or the floor, press back up. Start with a partial range.'),

  -- dip ladder
  ('bench-dip', 'Bench dip', 'triceps', '{chest,front_delts}', 'elbow_extension', '{bench}', 'bodyweight', 'dip', 1, 8, 20, null, 'Hands on a bench behind you, feet on the floor, lower until the elbows reach about 90 degrees.'),
  ('parallel-bar-dip', 'Parallel bar dip', 'chest', '{triceps,front_delts}', 'horizontal_push', '{dip_bars}', 'bodyweight', 'dip', 2, 6, 15, null, 'Lean forward slightly and lower until the upper arms are about parallel to the floor.'),
  ('ring-dip', 'Ring dip', 'chest', '{triceps,front_delts}', 'horizontal_push', '{rings}', 'bodyweight', 'dip', 3, 4, 10, null, 'Turn the rings out at the top and keep them close to the body on the way down.'),
  ('weighted-dip', 'Weighted dip', 'chest', '{triceps,front_delts}', 'horizontal_push', '{dip_bars}', 'external', 'dip', 4, 6, 10, 5, 'Add a belt or a dumbbell between the feet. The load is the added weight.'),

  -- dumbbell and band pushing
  ('dumbbell-bench-press', 'Dumbbell bench press', 'chest', '{triceps,front_delts}', 'horizontal_push', '{dumbbells,bench}', 'external', null, null, 8, 12, 5, 'Lower until the upper arms are about level with the bench, then press up and slightly in.'),
  ('incline-dumbbell-press', 'Incline dumbbell press', 'chest', '{front_delts,triceps}', 'horizontal_push', '{dumbbells,bench}', 'external', null, null, 8, 12, 5, 'Bench at a low incline, about 30 degrees.'),
  ('seated-dumbbell-shoulder-press', 'Seated dumbbell shoulder press', 'front_delts', '{side_delts,triceps}', 'vertical_push', '{dumbbells,bench}', 'external', null, null, 8, 12, 5, 'Back supported, press overhead without arching the lower back.'),
  ('dumbbell-lateral-raise', 'Dumbbell lateral raise', 'side_delts', '{}', 'shoulder_isolation', '{dumbbells}', 'external', null, null, 12, 20, 5, 'Raise to shoulder height with a slight bend in the elbows and lower slowly.'),
  ('dumbbell-fly', 'Dumbbell fly', 'chest', '{front_delts}', 'chest_isolation', '{dumbbells}', 'external', null, null, 10, 15, 5, 'Slight elbow bend, open until the chest stretches, then bring the dumbbells together. Floor or bench.'),
  ('dumbbell-overhead-triceps-extension', 'Dumbbell overhead triceps extension', 'triceps', '{}', 'elbow_extension', '{dumbbells}', 'external', null, null, 10, 15, 5, 'One dumbbell held in both hands, lower it behind the head, extend until the elbows are straight.'),
  ('band-lateral-raise', 'Band lateral raise', 'side_delts', '{}', 'shoulder_isolation', '{bands}', 'external', null, null, 12, 20, null, 'Stand on the band and raise the handles to shoulder height. Note which band you use.'),
  ('band-triceps-pushdown', 'Band triceps pushdown', 'triceps', '{}', 'elbow_extension', '{bands}', 'external', null, null, 12, 20, null, 'Anchor the band overhead, elbows pinned to the sides, extend fully.'),

  -- gym pushing
  ('barbell-bench-press', 'Barbell bench press', 'chest', '{triceps,front_delts}', 'horizontal_push', '{barbell,rack,bench}', 'external', null, null, 6, 10, 5, 'Shoulder blades pinned back, bar to the lower chest, feet planted.'),
  ('overhead-press', 'Overhead press', 'front_delts', '{triceps,side_delts}', 'vertical_push', '{barbell,rack}', 'external', null, null, 6, 10, 5, 'Standing with the glutes tight, press the bar in a straight line over the mid-foot.'),
  ('cable-fly', 'Cable fly', 'chest', '{front_delts}', 'chest_isolation', '{cable}', 'external', null, null, 10, 15, 5, 'Slight elbow bend, bring the handles together in front of the chest.'),
  ('cable-lateral-raise', 'Cable lateral raise', 'side_delts', '{}', 'shoulder_isolation', '{cable}', 'external', null, null, 12, 20, 5, 'Cable set low, raise the arm out to shoulder height, one side at a time.'),
  ('cable-triceps-pushdown', 'Cable triceps pushdown', 'triceps', '{}', 'elbow_extension', '{cable}', 'external', null, null, 10, 15, 5, 'Elbows pinned to the sides, extend fully, control the way up.'),
  ('overhead-cable-triceps-extension', 'Overhead cable triceps extension', 'triceps', '{}', 'elbow_extension', '{cable}', 'external', null, null, 10, 15, 5, 'Face away from the stack with the rope behind the head and extend until the elbows are straight.'),

  -- pull-up ladder
  ('negative-pull-up', 'Negative pull-up', 'lats', '{biceps,upper_back}', 'vertical_pull', '{pullup_bar}', 'bodyweight', 'pull-up', 1, 3, 6, null, 'Jump or step to the top position, then lower yourself over three to five seconds.'),
  ('band-assisted-pull-up', 'Band-assisted pull-up', 'lats', '{biceps,upper_back}', 'vertical_pull', '{pullup_bar,bands}', 'assisted', 'pull-up', 2, 6, 12, null, 'Loop the band over the bar and under a knee or foot. The load is the assistance, so less assistance is progress.'),
  ('chin-up', 'Chin-up', 'lats', '{biceps,upper_back}', 'vertical_pull', '{pullup_bar}', 'bodyweight', 'pull-up', 3, 5, 12, null, 'Palms facing you, pull until the chin clears the bar, lower to straight arms.'),
  ('pull-up', 'Pull-up', 'lats', '{biceps,upper_back}', 'vertical_pull', '{pullup_bar}', 'bodyweight', 'pull-up', 4, 5, 12, null, 'Palms facing away, pull until the chin clears the bar, lower to straight arms.'),
  ('weighted-pull-up', 'Weighted pull-up', 'lats', '{biceps,upper_back}', 'vertical_pull', '{pullup_bar}', 'external', 'pull-up', 5, 5, 10, 5, 'Add a belt or a dumbbell between the feet. The load is the added weight.'),

  -- inverted row ladder
  ('high-inverted-row', 'High inverted row', 'upper_back', '{lats,biceps,rear_delts}', 'horizontal_pull', '{rings}', 'bodyweight', 'inverted-row', 1, 8, 20, null, 'Rings or straps at chest height with the body leaning back at a steep angle.'),
  ('inverted-row', 'Inverted row', 'upper_back', '{lats,biceps,rear_delts}', 'horizontal_pull', '{rings}', 'bodyweight', 'inverted-row', 2, 8, 15, null, 'Body near level with the floor, pull the chest to the rings.'),
  ('feet-elevated-inverted-row', 'Feet-elevated inverted row', 'upper_back', '{lats,biceps,rear_delts}', 'horizontal_pull', '{rings}', 'bodyweight', 'inverted-row', 3, 6, 12, null, 'Feet on a chair or bench so the body sits above level.'),

  -- dumbbell and band pulling
  ('one-arm-dumbbell-row', 'One-arm dumbbell row', 'upper_back', '{lats,biceps,rear_delts}', 'horizontal_pull', '{dumbbells}', 'external', null, null, 8, 12, 5, 'One hand on a bench or sturdy surface, pull the elbow toward the hip.'),
  ('chest-supported-dumbbell-row', 'Chest-supported dumbbell row', 'upper_back', '{lats,rear_delts,biceps}', 'horizontal_pull', '{dumbbells,bench}', 'external', null, null, 8, 12, 5, 'Bench at a slight incline with the chest on the pad, row both dumbbells to the ribs.'),
  ('dumbbell-reverse-fly', 'Dumbbell reverse fly', 'rear_delts', '{upper_back}', 'shoulder_isolation', '{dumbbells}', 'external', null, null, 12, 20, 5, 'Hinge forward and raise the dumbbells out to the sides with a slight elbow bend.'),
  ('dumbbell-curl', 'Dumbbell curl', 'biceps', '{forearms}', 'elbow_flexion', '{dumbbells}', 'external', null, null, 10, 15, 5, 'Elbows by the sides, curl up, lower under control.'),
  ('hammer-curl', 'Hammer curl', 'biceps', '{forearms}', 'elbow_flexion', '{dumbbells}', 'external', null, null, 10, 15, 5, 'Palms facing each other throughout.'),
  ('incline-dumbbell-curl', 'Incline dumbbell curl', 'biceps', '{}', 'elbow_flexion', '{dumbbells,bench}', 'external', null, null, 10, 15, 5, 'Bench at a steep incline with the arms hanging behind the torso for a long stretch.'),
  ('band-pulldown', 'Band pulldown', 'lats', '{biceps,upper_back}', 'vertical_pull', '{bands}', 'external', null, null, 10, 15, null, 'Anchor the band overhead on a door anchor or pull-up bar and pull the elbows down to the ribs.'),
  ('band-row', 'Band row', 'upper_back', '{lats,biceps,rear_delts}', 'horizontal_pull', '{bands}', 'external', null, null, 10, 15, null, 'Anchor the band at chest height, pull the elbows back and squeeze the shoulder blades.'),
  ('band-face-pull', 'Band face pull', 'rear_delts', '{upper_back}', 'shoulder_isolation', '{bands}', 'external', null, null, 12, 20, null, 'Anchor the band at face height and pull toward the forehead with the elbows high.'),

  -- gym pulling
  ('barbell-row', 'Barbell row', 'upper_back', '{lats,biceps,rear_delts}', 'horizontal_pull', '{barbell}', 'external', null, null, 6, 10, 5, 'Hinge to about 45 degrees with a flat back and pull the bar to the lower ribs.'),
  ('lat-pulldown', 'Lat pulldown', 'lats', '{biceps,upper_back}', 'vertical_pull', '{cable}', 'external', null, null, 8, 12, 10, 'Pull the bar to the upper chest with the elbows down and slightly forward.'),
  ('seated-cable-row', 'Seated cable row', 'upper_back', '{lats,biceps,rear_delts}', 'horizontal_pull', '{cable}', 'external', null, null, 8, 12, 10, 'Chest tall, pull the handle to the stomach and squeeze the shoulder blades.'),
  ('face-pull', 'Face pull', 'rear_delts', '{upper_back}', 'shoulder_isolation', '{cable}', 'external', null, null, 12, 20, 5, 'Rope at face height, pull toward the forehead with the elbows high.'),
  ('reverse-pec-deck', 'Reverse pec deck', 'rear_delts', '{upper_back}', 'shoulder_isolation', '{machines}', 'external', null, null, 12, 20, 10, 'Chest on the pad, sweep the handles back with nearly straight arms.'),
  ('barbell-curl', 'Barbell curl', 'biceps', '{forearms}', 'elbow_flexion', '{barbell}', 'external', null, null, 8, 12, 5, 'Elbows by the sides, curl without swinging the torso.'),

  -- bodyweight legs
  ('bodyweight-squat', 'Bodyweight squat', 'quads', '{glutes}', 'squat', '{bodyweight}', 'bodyweight', 'bodyweight-leg', 1, 10, 20, null, 'Feet shoulder width apart, sit between the hips until the thighs are about parallel.'),
  ('split-squat', 'Split squat', 'quads', '{glutes}', 'lunge', '{bodyweight}', 'bodyweight', 'bodyweight-leg', 2, 8, 15, null, 'Long stride, drop the back knee toward the floor with the front foot flat.'),
  ('bulgarian-split-squat', 'Bulgarian split squat', 'quads', '{glutes}', 'lunge', '{bodyweight}', 'bodyweight', 'bodyweight-leg', 3, 8, 15, null, 'Rear foot on a chair, couch or bench, front foot far enough forward to keep the heel down.'),
  ('shrimp-squat', 'Shrimp squat', 'quads', '{glutes}', 'lunge', '{bodyweight}', 'bodyweight', 'bodyweight-leg', 4, 4, 10, null, 'Hold the rear foot behind you and lower the back knee to the floor on one leg.'),
  ('pistol-squat', 'Pistol squat', 'quads', '{glutes}', 'squat', '{bodyweight}', 'bodyweight', 'bodyweight-leg', 5, 3, 8, null, 'One-leg squat to full depth with the other leg held out in front.'),
  ('glute-bridge', 'Glute bridge', 'glutes', '{hamstrings}', 'hinge', '{bodyweight}', 'bodyweight', 'glute-bridge', 1, 10, 20, null, 'Feet flat, drive the hips up until the body is in a line from shoulders to knees.'),
  ('single-leg-glute-bridge', 'Single-leg glute bridge', 'glutes', '{hamstrings}', 'hinge', '{bodyweight}', 'bodyweight', 'glute-bridge', 2, 8, 15, null, 'One foot on the floor and the other leg extended, drive the hips up level.'),
  ('slider-leg-curl', 'Slider leg curl', 'hamstrings', '{glutes}', 'hinge', '{bodyweight}', 'bodyweight', 'hamstring-bodyweight', 1, 6, 15, null, 'Heels on towels or sliders on a smooth floor, hips up, curl the heels toward you.'),
  ('nordic-curl', 'Nordic curl', 'hamstrings', '{glutes}', 'hinge', '{bodyweight}', 'bodyweight', 'hamstring-bodyweight', 2, 3, 8, null, 'Anchor the heels, lower the torso as slowly as you can, catch with the hands and push back up.'),
  ('single-leg-calf-raise', 'Single-leg calf raise', 'calves', '{}', 'calf', '{bodyweight}', 'bodyweight', null, null, 12, 20, null, 'Ball of one foot on a step, full stretch at the bottom, pause at the top.'),
  ('hanging-knee-raise', 'Hanging knee raise', 'abs', '{}', 'core', '{pullup_bar}', 'bodyweight', 'hanging-core', 1, 8, 15, null, 'Hang from the bar and curl the knees toward the chest without swinging.'),
  ('hanging-leg-raise', 'Hanging leg raise', 'abs', '{}', 'core', '{pullup_bar}', 'bodyweight', 'hanging-core', 2, 6, 12, null, 'Hang from the bar and raise straight legs to about hip height without swinging.'),

  -- dumbbell legs
  ('goblet-squat', 'Goblet squat', 'quads', '{glutes}', 'squat', '{dumbbells}', 'external', null, null, 8, 12, 5, 'Hold one dumbbell at the chest and sit between the hips with the torso upright.'),
  ('dumbbell-romanian-deadlift', 'Dumbbell Romanian deadlift', 'hamstrings', '{glutes,upper_back}', 'hinge', '{dumbbells}', 'external', null, null, 8, 12, 5, 'Soft knees, push the hips back and lower until the hamstrings stretch, keeping the back flat.'),
  ('dumbbell-lunge', 'Dumbbell lunge', 'quads', '{glutes}', 'lunge', '{dumbbells}', 'external', null, null, 8, 12, 5, 'Step forward or back and lower the rear knee toward the floor with the dumbbells at your sides.'),

  -- gym legs
  ('barbell-back-squat', 'Barbell back squat', 'quads', '{glutes}', 'squat', '{barbell,rack}', 'external', null, null, 6, 10, 10, 'Bar on the upper back, brace, sit to at least parallel and drive up.'),
  ('romanian-deadlift', 'Romanian deadlift', 'hamstrings', '{glutes,upper_back}', 'hinge', '{barbell}', 'external', null, null, 6, 10, 10, 'Soft knees, push the hips back with the bar close to the legs and lower until the hamstrings stretch.'),
  ('deadlift', 'Deadlift', 'hamstrings', '{glutes,upper_back,traps}', 'hinge', '{barbell}', 'external', null, null, 5, 8, 10, 'Bar over the mid-foot, flat back, push the floor away and stand tall.'),
  ('hip-thrust', 'Hip thrust', 'glutes', '{hamstrings}', 'hinge', '{barbell,bench}', 'external', null, null, 8, 12, 10, 'Upper back on the bench with the bar over the hips, drive up until the hips are level with the shoulders.'),
  ('leg-press', 'Leg press', 'quads', '{glutes}', 'squat', '{machines}', 'external', null, null, 8, 12, 10, 'Feet shoulder width apart, lower until the knees reach about 90 degrees and do not lock out hard.'),
  ('leg-extension', 'Leg extension', 'quads', '{}', 'squat', '{machines}', 'external', null, null, 10, 15, 10, 'Extend fully, pause briefly at the top and lower under control.'),
  ('lying-leg-curl', 'Lying leg curl', 'hamstrings', '{}', 'hinge', '{machines}', 'external', null, null, 10, 15, 10, 'Hips pressed into the pad, curl the heels toward the glutes.'),
  ('standing-calf-raise', 'Standing calf raise', 'calves', '{}', 'calf', '{machines}', 'external', null, null, 10, 20, 10, 'Full stretch at the bottom, pause at the top.'),
  ('cable-crunch', 'Cable crunch', 'abs', '{}', 'core', '{cable}', 'external', null, null, 10, 15, 10, 'Kneel under a high rope and curl the ribs toward the pelvis.')
) as v (slug, name, primary_muscle, secondary_muscles, movement_pattern, equipment, load_type,
        progression_group, ladder_level, rep_min, rep_max, increment_lb, notes)
on conflict (slug) where user_id is null do update set
  name = excluded.name,
  primary_muscle = excluded.primary_muscle,
  secondary_muscles = excluded.secondary_muscles,
  movement_pattern = excluded.movement_pattern,
  equipment = excluded.equipment,
  load_type = excluded.load_type,
  progression_group = excluded.progression_group,
  ladder_level = excluded.ladder_level,
  default_rep_min = excluded.default_rep_min,
  default_rep_max = excluded.default_rep_max,
  default_increment = excluded.default_increment,
  notes = excluded.notes;
