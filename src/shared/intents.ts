import { z } from "zod";

export const playerCredentialsSchema = z.object({
  matchId: z.string().min(1),
  playerToken: z.string().min(1)
});

export const matchJoinPayloadSchema = playerCredentialsSchema;

export const chooseStartingPlayerIntentSchema = z.object({
  type: z.literal("setup.chooseStartingPlayer"),
  payload: z.object({
    startingPlayerId: z.string().min(1)
  })
});

export const lockBattlefieldChoiceIntentSchema = z.object({
  type: z.literal("setup.lockBattlefieldChoice"),
  payload: z.object({
    cardInstanceId: z.string().min(1)
  })
});

export const commitMulliganIntentSchema = z.object({
  type: z.literal("setup.commitMulligan"),
  payload: z.object({
    selectedCardInstanceIds: z.array(z.string().min(1)).max(2)
  })
});

export const matchIntentPayloadSchema = playerCredentialsSchema.extend({
  gameId: z.string().min(1).optional(),
  stateVersion: z.number().int().nonnegative(),
  intent: z.object({
    type: z.string().min(1),
    payload: z.unknown().optional()
  })
});

export const matchIntentRequestBodySchema = matchIntentPayloadSchema.omit({
  matchId: true
});

export type MatchJoinPayload = z.infer<typeof matchJoinPayloadSchema>;
export type MatchIntentPayload = z.infer<typeof matchIntentPayloadSchema>;
export type MatchIntentRequestBody = z.infer<typeof matchIntentRequestBodySchema>;
export type ChooseStartingPlayerIntent = z.infer<
  typeof chooseStartingPlayerIntentSchema
>;
export type LockBattlefieldChoiceIntent = z.infer<
  typeof lockBattlefieldChoiceIntentSchema
>;
export type CommitMulliganIntent = z.infer<typeof commitMulliganIntentSchema>;
