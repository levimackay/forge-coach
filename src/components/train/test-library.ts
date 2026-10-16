// Test support only: the seeded exercise library, read from the real migrations.
import type { Exercise } from "@/lib/domain/types";
import { asAdmin, createDb, type Row } from "../../../tests/db/harness";

const toExercise = (r: Row): Exercise => ({
  id: r.id,
  user_id: r.user_id,
  slug: r.slug,
  name: r.name,
  primary_muscle: r.primary_muscle,
  secondary_muscles: r.secondary_muscles,
  movement_pattern: r.movement_pattern,
  equipment: r.equipment,
  load_type: r.load_type,
  progression_group: r.progression_group,
  ladder_level: r.ladder_level,
  default_rep_min: r.default_rep_min,
  default_rep_max: r.default_rep_max,
  default_increment: r.default_increment === null ? null : Number(r.default_increment),
  notes: r.notes,
  created_at: new Date(r.created_at).toISOString(),
  updated_at: new Date(r.updated_at).toISOString(),
  deleted_at: null,
});

let cached: Promise<Exercise[]> | null = null;

export function seededLibrary(): Promise<Exercise[]> {
  cached ??= (async () => {
    const db = await createDb();
    try {
      const rows = await asAdmin(db, (s) => s.rows("select * from public.exercises where user_id is null order by slug"));
      return rows.map(toExercise);
    } finally {
      await db.close();
    }
  })();
  return cached;
}
