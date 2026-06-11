import { z } from "zod";

export const playerCredentialsSchema = z.object({
  matchId: z.string().min(1),
  playerToken: z.string().min(1)
});

export const matchJoinPayloadSchema = playerCredentialsSchema;

export const matchIntentPayloadSchema = playerCredentialsSchema.extend({
  gameId: z.string().min(1).optional(),
  stateVersion: z.number().int().nonnegative(),
  intent: z.object({
    type: z.string().min(1),
    payload: z.unknown().optional()
  })
});

export type MatchJoinPayload = z.infer<typeof matchJoinPayloadSchema>;
export type MatchIntentPayload = z.infer<typeof matchIntentPayloadSchema>;
