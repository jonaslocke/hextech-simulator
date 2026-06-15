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

export const drawCardsIntentSchema = z.object({
  type: z.literal("game.draw"),
  payload: z
    .object({
      count: z.number().int().positive().optional()
    })
    .optional()
});

export const channelRunesIntentSchema = z.object({
  type: z.literal("game.channel"),
  payload: z
    .object({
      count: z.number().int().positive().optional()
    })
    .optional()
});

export const recycleCardsIntentSchema = z.object({
  type: z.literal("game.recycle"),
  payload: z.object({
    ownerPlayerId: z.string().min(1),
    cardInstanceIds: z.array(z.string().min(1)).min(1),
    sourceZone: z.enum(["hand", "trash", "banishment", "base"]),
    destinationDeck: z.enum(["mainDeck", "runeDeck"])
  })
});

export const addRuneResourceIntentSchema = z.object({
  type: z.literal("game.addRuneResource"),
  payload: z.object({
    runeCardInstanceId: z.string().min(1),
    resourceType: z.enum(["energy", "power"])
  })
});

export const playCardIntentSchema = z.object({
  type: z.literal("game.playCard"),
  payload: z.object({
    cardInstanceId: z.string().min(1),
    selectedModeId: z.string().min(1).optional(),
    destination: z.literal("base").optional()
  })
});

export const passPriorityIntentSchema = z.object({
  type: z.literal("game.pass"),
  payload: z.object({}).optional()
});

export const endTurnIntentSchema = z.object({
  type: z.literal("game.endTurn"),
  payload: z.object({}).optional()
});

export const moveUnitToBattlefieldIntentSchema = z.object({
  type: z.literal("game.moveUnitToBattlefield"),
  payload: z.object({
    unitCardInstanceId: z.string().min(1),
    battlefieldId: z.string().min(1)
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
export type DrawCardsIntent = z.infer<typeof drawCardsIntentSchema>;
export type ChannelRunesIntent = z.infer<typeof channelRunesIntentSchema>;
export type RecycleCardsIntent = z.infer<typeof recycleCardsIntentSchema>;
export type AddRuneResourceIntent = z.infer<typeof addRuneResourceIntentSchema>;
export type PlayCardIntent = z.infer<typeof playCardIntentSchema>;
export type PassPriorityIntent = z.infer<typeof passPriorityIntentSchema>;
export type EndTurnIntent = z.infer<typeof endTurnIntentSchema>;
export type MoveUnitToBattlefieldIntent = z.infer<
  typeof moveUnitToBattlefieldIntentSchema
>;
