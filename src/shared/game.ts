import { z } from "zod";

export const projectedTargetRequirementSchema = z.object({
  kind: z.enum(["card", "battlefield", "player"]),
  label: z.string().min(1).optional(),
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
  targets: z.array(projectedTargetRequirementSchema),
  presentation: z.object({
    surface: z.enum(["setup-dialog", "card-menu", "action-rail", "choice-dialog"]),
    style: z.enum(["primary", "secondary", "danger"]),
    prompt: z.string().min(1).nullable()
  })
});

export const gameActionIntentSchema = z.object({
  type: z.literal("game.performAction"),
  payload: z.object({
    actionId: z.string().min(1),
    selectedIds: z.array(z.string().min(1)).default([])
  })
});

export const gameV2IntentRequestSchema = z.object({
  playerToken: z.string().min(1),
  stateVersion: z.number().int().nonnegative(),
  intent: gameActionIntentSchema
});

export const createMatchV2RequestSchema = z.object({
  playerDecks: z.object({
    player1: z.literal("lux"),
    player2: z.literal("lux")
  }),
  rngSeed: z.string().min(1).optional()
});

export const projectedCardViewSchema = z.object({
  instanceId: z.string().min(1),
  ownerPlayerId: z.string().min(1),
  name: z.string().min(1),
  imageUrl: z.string().nullable(),
  rulesText: z.string(),
  publicCode: z.string().min(1),
  type: z.string().min(1),
  supertype: z.string().nullable(),
  domains: z.array(z.string()),
  energy: z.number().nullable(),
  might: z.number().nullable(),
  power: z.number().nullable(),
  computedMight: z.number().nullable(),
  damage: z.number().int().nonnegative(),
  exhausted: z.boolean()
});

export const projectedZoneV2Schema = z.object({
  kind: z.enum([
    "legend", "champion", "mainDeck", "runeDeck", "hand", "trash",
    "banishment", "base"
  ]),
  visibility: z.enum(["public", "private", "secret"]),
  count: z.number().int().nonnegative(),
  cards: z.array(projectedCardViewSchema)
});

export const projectedPlayerV2Schema = z.object({
  playerId: z.string().min(1),
  isViewer: z.boolean(),
  energy: z.number().int().nonnegative(),
  conditionalEnergy: z.number().int().nonnegative(),
  power: z.record(z.number().int().nonnegative()),
  zones: z.array(projectedZoneV2Schema)
});

export const projectedBattlefieldV2Schema = z.object({
  battlefieldId: z.string().min(1),
  selectedByPlayerId: z.string().min(1),
  card: projectedCardViewSchema,
  units: z.array(projectedCardViewSchema),
  facedownCard: projectedCardViewSchema.nullable().default(null)
});

export const projectedChainItemV2Schema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  controllerPlayerId: z.string().min(1),
  sourceCardInstanceId: z.string().min(1).nullable(),
  targetCardInstanceIds: z.array(z.string().min(1)),
  kind: z.enum(["spell", "ability", "trigger", "unit"]),
  card: projectedCardViewSchema.nullable()
});

export const projectedChainV2Schema = z.object({
  items: z.array(projectedChainItemV2Schema),
  relevantPlayerIds: z.array(z.string().min(1)),
  priorityPlayerId: z.string().min(1),
  passedPlayerIds: z.array(z.string().min(1))
}).nullable();

export const gameProjectionV2Schema = z.object({
  id: z.string().min(1),
  matchId: z.string().min(1),
  gameNumber: z.number().int().positive(),
  stateVersion: z.number().int().nonnegative(),
  status: z.enum(["setup_pending", "ready", "in_progress", "complete"]),
  viewerPlayerId: z.string().min(1),
  activePlayerId: z.string().min(1).nullable(),
  winnerPlayerId: z.string().min(1).nullable(),
  setup: z.object({
    playerIds: z.tuple([z.string().min(1), z.string().min(1)]),
    startingPlayerChooserId: z.string().min(1),
    startingPlayerId: z.string().min(1).nullable(),
    battlefieldChoices: z.record(z.object({
      status: z.enum(["unlocked", "locked", "revealed"]),
      cardInstanceId: z.string().min(1).nullable()
    })),
    mulligans: z.record(z.object({
      status: z.enum(["unlocked", "locked"])
    })),
    battlefieldPool: z.array(projectedCardViewSchema),
    waitingReason: z.string().min(1).nullable()
  }),
  turn: z.object({
    turnNumber: z.number().int().positive(),
    activePlayerId: z.string().min(1),
    phase: z.enum(["awaken", "beginning", "channel", "draw", "action", "end"]),
    passedPlayerIds: z.array(z.string().min(1))
  }).nullable(),
  showdown: z.object({
    battlefieldId: z.string().min(1),
    relevantPlayerIds: z.array(z.string().min(1)),
    focusPlayerId: z.string().min(1),
    priorityPlayerId: z.string().min(1),
    passedPlayerIds: z.array(z.string().min(1))
  }).nullable(),
  pendingChoice: z.object({
    id: z.string().min(1),
    playerId: z.string().min(1),
    prompt: z.string().min(1),
    optionIds: z.array(z.string().min(1)),
    pendingChainItems: z.array(projectedChainItemV2Schema)
  }).nullable(),
  players: z.array(projectedPlayerV2Schema).length(2),
  battlefields: z.array(projectedBattlefieldV2Schema),
  chain: projectedChainV2Schema,
  actions: z.array(projectedActionSchema),
  logEntries: z.array(z.object({
    id: z.string().min(1),
    message: z.string(),
    createdAt: z.string()
  }))
});

export type ProjectedTargetRequirement = z.infer<
  typeof projectedTargetRequirementSchema
>;
export type ProjectedAction = z.infer<typeof projectedActionSchema>;
export type GameActionIntent = z.infer<typeof gameActionIntentSchema>;
export type ProjectedCardView = z.infer<typeof projectedCardViewSchema>;
export type ProjectedZoneV2 = z.infer<typeof projectedZoneV2Schema>;
export type ProjectedPlayerV2 = z.infer<typeof projectedPlayerV2Schema>;
export type ProjectedBattlefieldV2 = z.infer<typeof projectedBattlefieldV2Schema>;
export type ProjectedChainItemV2 = z.infer<typeof projectedChainItemV2Schema>;
export type ProjectedChainV2 = z.infer<typeof projectedChainV2Schema>;
export type GameProjectionV2 = z.infer<typeof gameProjectionV2Schema>;
