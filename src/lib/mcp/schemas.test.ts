import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import type { DayFocus, EquipmentCode, Muscle, MovementPattern, ProposalChange, ProposalStatus } from "@/lib/domain/types";
import {
  DayFocusSchema,
  EquipmentSchema,
  MovementPatternSchema,
  MuscleSchema,
  ProposalChangeSchema,
  ProposalChangesSchema,
  ProposalStatusSchema,
} from "./schemas";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

// A change that satisfies the domain type must also satisfy the schema, and the other way round.
describe("schemas follow the domain types", () => {
  it("has the same enums", () => {
    expectTypeOf<z.infer<typeof MuscleSchema>>().toEqualTypeOf<Muscle>();
    expectTypeOf<z.infer<typeof EquipmentSchema>>().toEqualTypeOf<EquipmentCode>();
    expectTypeOf<z.infer<typeof MovementPatternSchema>>().toEqualTypeOf<MovementPattern>();
    expectTypeOf<z.infer<typeof DayFocusSchema>>().toEqualTypeOf<DayFocus>();
    expectTypeOf<z.infer<typeof ProposalStatusSchema>>().toEqualTypeOf<ProposalStatus>();
  });

  it("parses into a ProposalChange and accepts every ProposalChange shape", () => {
    const parsed: ProposalChange = ProposalChangeSchema.parse({ op: "remove_exercise", planned_exercise_id: A });
    expect(parsed.op).toBe("remove_exercise");
    expectTypeOf<ProposalChange>().toExtend<z.input<typeof ProposalChangeSchema>>();
  });
});

describe("ProposalChangeSchema", () => {
  const valid: ProposalChange[] = [
    { op: "update_prescription", planned_exercise_id: A, set: { sets: 4, rep_min: 6, rep_max: 10, target_rir: 2, load: 135, rest_seconds: 150, notes: "Pause the first rep" } },
    { op: "update_prescription", planned_exercise_id: A, set: { load: null, rest_seconds: null, notes: null } },
    { op: "swap_exercise", planned_exercise_id: A, exercise_id: B },
    { op: "add_exercise", program_day_id: A, exercise_id: B, position: 3, sets: 3, rep_min: 10, rep_max: 15, target_rir: 1, load: null },
    { op: "remove_exercise", planned_exercise_id: A },
    { op: "update_day", program_day_id: A, set: { name: "Push B", focus: "push", equipment_profile_id: null } },
  ];

  it.each(valid)("accepts $op unchanged", (change) => {
    expect(ProposalChangeSchema.parse(change)).toEqual(change);
  });

  it.each([
    ["an unknown op", { op: "drop_table", planned_exercise_id: A }],
    ["an extra top-level key", { op: "remove_exercise", planned_exercise_id: A, user_id: A }],
    ["a non-uuid id", { op: "remove_exercise", planned_exercise_id: "abc" }],
    ["an empty set", { op: "update_prescription", planned_exercise_id: A, set: {} }],
    ["an undefined-only set", { op: "update_prescription", planned_exercise_id: A, set: { sets: undefined } }],
    ["an unknown set key", { op: "update_prescription", planned_exercise_id: A, set: { exercise_id: B } }],
    ["fractional sets", { op: "update_prescription", planned_exercise_id: A, set: { sets: 2.5 } }],
    ["zero sets", { op: "update_prescription", planned_exercise_id: A, set: { sets: 0 } }],
    ["rep_min above rep_max", { op: "update_prescription", planned_exercise_id: A, set: { rep_min: 10, rep_max: 8 } }],
    ["a load above the cap", { op: "update_prescription", planned_exercise_id: A, set: { load: 2001 } }],
    ["a note that is too long", { op: "update_prescription", planned_exercise_id: A, set: { notes: "x".repeat(1001) } }],
    ["add_exercise with reversed reps", { op: "add_exercise", program_day_id: A, exercise_id: B, position: 0, sets: 3, rep_min: 12, rep_max: 8, target_rir: 2, load: null }],
    ["add_exercise without a load field", { op: "add_exercise", program_day_id: A, exercise_id: B, position: 0, sets: 3, rep_min: 8, rep_max: 12, target_rir: 2 }],
    ["update_day with an empty set", { op: "update_day", program_day_id: A, set: {} }],
    ["update_day with an unknown focus", { op: "update_day", program_day_id: A, set: { focus: "arms" } }],
    ["update_day with a blank name", { op: "update_day", program_day_id: A, set: { name: "   " } }],
  ])("rejects %s", (_name, change) => {
    expect(ProposalChangeSchema.safeParse(change).success).toBe(false);
  });

  it("limits a proposal to 1 to 30 changes", () => {
    const change = valid[2];
    expect(ProposalChangesSchema.safeParse([]).success).toBe(false);
    expect(ProposalChangesSchema.safeParse(Array.from({ length: 30 }, () => change)).success).toBe(true);
    expect(ProposalChangesSchema.safeParse(Array.from({ length: 31 }, () => change)).success).toBe(false);
  });
});
