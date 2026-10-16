import type { EquipmentProfile, Exercise } from "@/lib/domain/types";
import { getDb } from "@/lib/local/db";
import { requireUserId } from "@/lib/local/session";
import { putRows } from "@/lib/local/write";
import { buildPplProgram, type PplBuild, type PplVariant } from "@/lib/templates/ppl";

/**
 * Writes a new push, pull, legs program built for one equipment profile and makes it
 * the active one. The program, its days and its exercises go in together, so a crash
 * cannot leave a half-built program, and any program that was active is switched off
 * in the same step because only one may be active.
 */
export async function createPplProgram(args: {
  variant: PplVariant;
  equipment: EquipmentProfile;
  library: Exercise[];
  now?: Date;
}): Promise<PplBuild> {
  const build = buildPplProgram({
    variant: args.variant,
    userId: requireUserId(),
    equipment: args.equipment,
    library: args.library,
    now: args.now,
  });
  if (build.planned.length === 0) {
    throw new Error("No exercises in the library fit this equipment, so no program was created.");
  }

  const db = getDb();
  await db.transaction("rw", [db.programs, db.program_days, db.planned_exercises, db.outbox], async () => {
    const active = await db.programs.filter((p) => p.is_active && !p.deleted_at).toArray();
    if (active.length) await putRows("programs", active.map((p) => ({ ...p, is_active: false })));
    await putRows("programs", [build.program]);
    await putRows("program_days", build.days);
    await putRows("planned_exercises", build.planned);
  });
  return build;
}
