import { z } from "zod";

export const projectedTargetRequirementSchema = z.object({
  kind: z.enum(["card", "battlefield", "player"]),
  legalIds: z.array(z.string().min(1)),
  minimum: z.number().int().nonnegative(),
  maximum: z.number().int().nonnegative()
}).refine((value) => value.minimum <= value.maximum, {
  message: "Target minimum cannot exceed maximum."
});

export const projectedActionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  sourceCardInstanceId: z.string().min(1).nullable(),
  enabled: z.boolean(),
  disabledReason: z.string().min(1).nullable(),
  targets: z.array(projectedTargetRequirementSchema)
});

export const gameActionIntentSchema = z.object({
  type: z.literal("game.performAction"),
  payload: z.object({
    actionId: z.string().min(1),
    selectedIds: z.array(z.string().min(1)).default([])
  })
});

export type ProjectedTargetRequirement = z.infer<
  typeof projectedTargetRequirementSchema
>;
export type ProjectedAction = z.infer<typeof projectedActionSchema>;
export type GameActionIntent = z.infer<typeof gameActionIntentSchema>;

