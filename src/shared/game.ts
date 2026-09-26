import { z } from "zod";
import { deckValidationConstraintsSchema } from "./deck-validation";

export const gameZoneKinds = [
  "legend",
  "champion",
  "mainDeck",
  "runeDeck",
  "hand",
  "trash",
  "banishment",
  "base",
  "battlefield",
] as const;

export const runeResourceTypes = ["energy", "power"] as const;

export const projectedTargetRequirementSchema = z
  .object({
    kind: z.enum(["card", "battlefield", "location", "player", "chainItem"]),
    label: z.string().min(1).optional(),
    selectionKey: z.string().min(1).optional(),
    // A play declaration can contain independent target selections for more
    // than one execution. Each group remains a separate server-issued slot.
    selectionGroup: z.string().min(1).optional(),
    selectionPurpose: z.enum(["target", "optionalCost"]).optional(),
    sourceZone: z.enum(["hand", "trash", "mainDeck", "base"]).optional(),
    // A later location choice can be constrained by an earlier selected
    // object (for example, a unit's legal move destinations).
    legalIdsBySelectedId: z.record(z.array(z.string().min(1))).optional(),
    optionLabels: z.record(z.string().min(1)).optional(),
    maximumPerLocation: z.number().int().positive().optional(),
    mustShareLocation: z.boolean().optional(),
    locationKeysById: z.record(z.string().min(1)).optional(),
    legalIds: z.array(z.string().min(1)),
    minimum: z.number().int().nonnegative(),
    maximum: z.number().int().nonnegative(),
  })
  .refine((value) => value.minimum <= value.maximum, {
    message: "Target minimum cannot exceed maximum.",
  });

type TargetSelectionConstraint = {
  legalIds: readonly string[];
  minimum: number;
  maximum: number;
  maximumPerLocation?: number;
  mustShareLocation?: boolean;
  locationKeysById?: Readonly<Record<string, string>>;
};

export function targetSelectionSatisfiesRequirements(
  requirements: readonly TargetSelectionConstraint[],
  selectedIds: readonly string[],
): boolean {
  if (requirements.length === 0) return selectedIds.length === 0;
  const legalIds = new Set(requirements.flatMap((requirement) => [...requirement.legalIds]));
  const minimum = requirements.reduce((sum, requirement) => sum + requirement.minimum, 0);
  const maximum = requirements.reduce((sum, requirement) => sum + requirement.maximum, 0);
  return selectedIds.length >= minimum &&
    selectedIds.length <= maximum &&
    new Set(selectedIds).size === selectedIds.length &&
    selectedIds.every((id) => legalIds.has(id)) &&
    requirements.every((requirement) => {
      const selected = selectedIds.filter((id) => requirement.legalIds.includes(id));
      if (selected.length < requirement.minimum || selected.length > requirement.maximum) return false;
      const locations = selected.map((id) => requirement.locationKeysById?.[id]);
      if (requirement.maximumPerLocation !== undefined) {
        if (locations.some((location) => location === undefined)) return false;
        const countByLocation = new Map<string, number>();
        for (const location of locations as string[]) {
          const count = (countByLocation.get(location) ?? 0) + 1;
          if (count > requirement.maximumPerLocation) return false;
          countByLocation.set(location, count);
        }
      }
      return !requirement.mustShareLocation ||
        new Set(locations).size <= 1;
    });
}

export function targetSelectionCanAddToRequirements(
  requirements: readonly TargetSelectionConstraint[],
  selectedIds: readonly string[],
  candidateId: string,
): boolean {
  if (
    selectedIds.includes(candidateId) ||
    !requirements.some((requirement) => requirement.legalIds.includes(candidateId))
  ) return false;
  const proposed = [...selectedIds, candidateId];
  const maximum = requirements.reduce((sum, requirement) => sum + requirement.maximum, 0);
  return proposed.length <= maximum && requirements.every((requirement) => {
    const selected = proposed.filter((id) => requirement.legalIds.includes(id));
    if (selected.length > requirement.maximum) return false;
    const locations = selected.map((id) => requirement.locationKeysById?.[id]);
    if (requirement.maximumPerLocation !== undefined) {
      if (locations.some((location) => location === undefined)) return false;
      const countByLocation = new Map<string, number>();
      for (const location of locations as string[]) {
        const count = (countByLocation.get(location) ?? 0) + 1;
        if (count > requirement.maximumPerLocation) return false;
        countByLocation.set(location, count);
      }
    }
    return !requirement.mustShareLocation || new Set(locations).size <= 1;
  });
}

export const projectedActionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  sourceCardInstanceId: z.string().min(1).nullable(),
  enabled: z.boolean(),
  disabledReason: z.string().min(1).nullable(),
  targets: z.array(projectedTargetRequirementSchema),
  poolPayment: z.object({
    mode: z.enum(["card", "poolOnly"]).optional(),
    energy: z.number().int().nonnegative(),
    power: z.number().int().nonnegative(),
    powerDomains: z.array(z.string().min(1)),
    availableEnergy: z.number().int().nonnegative(),
    availablePower: z.number().int().nonnegative(),
    canPay: z.boolean(),
    powerCosts: z.array(z.object({ amount: z.number().int().nonnegative(), domains: z.array(z.string()) })).optional(),
  }).optional(),
  costPreview: z
    .object({
      energy: z.number().int().nonnegative(),
      basePower: z.number().int().nonnegative(),
      effectivePower: z.number().int().nonnegative(),
      printedEnergy: z.number().int().nonnegative(),
      printedPower: z.number().int().nonnegative(),
      availableAnyPower: z.number().int().nonnegative(),
      targetAdditionalPower: z.array(
        z.object({
          targetId: z.string().min(1),
          selectionGroup: z.string().min(1).optional(),
          amount: z.number().int().positive(),
        }),
      ),
    })
    .nullable()
    .optional(),
  choice: z
    .discriminatedUnion("kind", [
      z.object({
        kind: z.literal("combatDamage"),
        totalDamage: z.number().int().nonnegative(),
        targets: z.array(
          z.object({
            unitId: z.string().min(1),
            lethalAmount: z.number().int().positive(),
            hasTank: z.boolean(),
          }),
        ),
      }),
      z.object({
        kind: z.literal("effectSelection"),
        choiceId: z.string().min(1),
        prompt: z.string().min(1),
      }),
      z.object({
        kind: z.literal("effectOption"),
        choiceId: z.string().min(1),
        prompt: z.string().min(1),
        options: z.array(
          z.object({ id: z.string().min(1), label: z.string().min(1) }),
        ),
      }),
      z.object({
        kind: z.literal("tokenPlacement"),
        choiceId: z.string().min(1),
        prompt: z.string().min(1),
        tokenName: z.string().min(1),
        count: z.number().int().positive(),
        destinations: z.array(
          z.object({
            id: z.string().min(1),
            label: z.string().min(1),
          }),
        ),
      }),
      z.object({
        kind: z.literal("orderedOptions"),
        choiceId: z.string().min(1),
        optionIds: z.array(z.string().min(1)),
      }),
    ])
    .nullable()
    .optional(),
  presentation: z.object({
    resourceOutput: z.object({
      energy: z.number().int().nonnegative(),
      power: z.number().int().nonnegative(),
      powerDomains: z.array(z.string().min(1)),
    }).optional(),
    resourceCost: z.object({
      energy: z.number().int().nonnegative(),
      powerCosts: z.array(z.object({
        amount: z.number().int().nonnegative(),
        domains: z.array(z.string().min(1)),
      })),
    }).optional(),
    playCost: z.object({
      label: z.string(),
      declarationLabel: z.string().optional(),
      showCost: z.boolean(),
      modifierSources: z.array(z.string()),
    }).optional(),
    surface: z.enum([
      "setup-dialog",
      "card-menu",
      "action-rail",
      "choice-dialog",
    ]),
    style: z.enum(["primary", "secondary", "danger"]),
    prompt: z.string().min(1).nullable(),
    boardLocation: z
      .discriminatedUnion("kind", [
        z.object({
          kind: z.literal("base"),
        }),
        z.object({
          kind: z.literal("battlefield"),
          battlefieldId: z.string().min(1),
        }),
      ])
      .nullable()
      .optional(),
  }),
});

export const gameActionIntentSchema = z.object({
  type: z.literal("game.performAction"),
  payload: z.object({
    actionId: z.string().min(1),
    selectedIds: z.array(z.string().min(1)).default([]),
    targetSelections: z.record(z.array(z.string().min(1))).default({}),
    allocations: z
      .array(
        z.object({
          targetUnitId: z.string().min(1),
          amount: z.number().int().positive(),
        }),
      )
      .default([]),
    tokenPlacements: z
      .array(
        z.object({
          destinationId: z.string().min(1),
          count: z.number().int().positive(),
        }),
      )
      .default([]),
  }),
});

export const gameIntentRequestSchema = z.object({
  playerToken: z.string().min(1),
  stateVersion: z.number().int().nonnegative(),
  intent: gameActionIntentSchema,
});

export const deckIdSchema = z.enum([
  "lux",
  "annie",
  "master-yi",
  "stellacorn-herder",
  "garen",
  "lux-s",
  "annie-s",
  "master-yi-s",
  "garen-s",
  "ornn",
  "jayce",
  "ornn-hidden-test",
]);
export type DeckId = z.infer<typeof deckIdSchema>;

export const createMatchRequestSchema = z.object({
  playerDecks: z.object({
    player1: deckIdSchema,
    player2: deckIdSchema,
  }),
  rngSeed: z.string().min(1).optional(),
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
  mightModifiers: z.array(z.object({
    id: z.string(), amount: z.number(), sourceName: z.string(), label: z.string(), duration: z.string(),
  })).optional(),
  keywordAnnotations: z.array(z.object({
    keywordId: z.string().min(1),
    displayName: z.string().min(1),
    effectiveAmount: z.number().nullable(),
    activationOrder: z.number().int().nonnegative(),
  })).optional(),
  runtimeEffects: z.array(z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("keyword"),
      keywordId: z.string().min(1),
      displayName: z.string().min(1),
      contributionAmount: z.number().nullable(),
      displayDuration: z.string().min(1).nullable(),
      sourceName: z.string().min(1),
    }),
    z.object({
      kind: z.literal("grantedBehavior"),
      text: z.string().min(1),
      displayDuration: z.string().min(1).nullable(),
      sourceName: z.string().min(1),
    }),
  ])).optional(),
  damage: z.number().int().nonnegative(),
  exhausted: z.boolean(),
  empowered: z.boolean().optional(),
  attachedToCardInstanceId: z.string().min(1).nullable().optional(),
});

export const projectedZoneSchema = z.object({
  kind: z.enum([
    "legend",
    "champion",
    "mainDeck",
    "runeDeck",
    "hand",
    "trash",
    "banishment",
    "base",
  ]),
  visibility: z.enum(["public", "private", "secret"]),
  count: z.number().int().nonnegative(),
  cards: z.array(projectedCardViewSchema),
});

export const projectedPlayerSchema = z.object({
  playerId: z.string().min(1),
  displayName: z.string().min(1).max(32),
  isViewer: z.boolean(),
  points: z.number().int().nonnegative(),
  xp: z.number().int().nonnegative().optional(),
  energy: z.number().int().nonnegative(),
  conditionalEnergy: z.number().int().nonnegative(),
  power: z.record(z.number().int().nonnegative()),
  restrictedResources: z
    .object({
      energy: z.record(z.number().int().nonnegative()),
      power: z.record(z.record(z.number().int().nonnegative())),
    })
    .optional(),
  zones: z.array(projectedZoneSchema),
});

export const projectedBattlefieldSchema = z.object({
  battlefieldId: z.string().min(1),
  selectedByPlayerId: z.string().min(1),
  controllerPlayerId: z.string().min(1).nullable(),
  contestedByPlayerId: z.string().min(1).nullable(),
  card: projectedCardViewSchema,
  units: z.array(projectedCardViewSchema),
  attachedCards: z.array(projectedCardViewSchema).optional(),
  facedownCard: projectedCardViewSchema.nullable().default(null),
  facedownCardPresent: z.boolean().default(false),
});

export const projectedChainItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  controllerPlayerId: z.string().min(1),
  sourceCardInstanceId: z.string().min(1).nullable(),
  targetCardInstanceIds: z.array(z.string().min(1)),
  kind: z.enum(["spell", "ability", "trigger", "unit"]),
  card: projectedCardViewSchema.nullable(),
});

export const projectedChainSchema = z
  .object({
    items: z.array(projectedChainItemSchema),
    relevantPlayerIds: z.array(z.string().min(1)),
    priorityPlayerId: z.string().min(1),
    passedPlayerIds: z.array(z.string().min(1)),
  })
  .nullable();

export const gameProjectionSchema = z.object({
  id: z.string().min(1),
  matchId: z.string().min(1),
  gameNumber: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  stateVersion: z.number().int().nonnegative(),
  status: z.enum(["setup_pending", "ready", "in_progress", "complete"]),
  viewerPlayerId: z.string().min(1),
  activePlayerId: z.string().min(1).nullable(),
  winnerPlayerId: z.string().min(1).nullable(),
  victoryScore: z.number().int().positive(),
  setup: z.object({
    playerIds: z.tuple([z.string().min(1), z.string().min(1)]),
    startingPlayerChooserId: z.string().min(1),
    startingPlayerId: z.string().min(1).nullable(),
    battlefieldChoices: z.record(
      z.object({
        status: z.enum(["unlocked", "locked", "revealed"]),
        cardInstanceId: z.string().min(1).nullable(),
      }),
    ),
    mulligans: z.record(
      z.object({
        status: z.enum(["unlocked", "locked"]),
      }),
    ),
    battlefieldPool: z.array(projectedCardViewSchema),
    waitingReason: z.string().min(1).nullable(),
  }),
  turn: z
    .object({
      turnNumber: z.number().int().positive(),
      activePlayerId: z.string().min(1),
      phase: z.enum([
        "awaken",
        "beginning",
        "channel",
        "draw",
        "action",
        "end",
      ]),
      passedPlayerIds: z.array(z.string().min(1)),
    })
    .nullable(),
  effectPlayDecision: z.object({
    playerId: z.string().min(1),
    stagedCardInstanceId: z.string().min(1).nullable(),
    canDecline: z.boolean(),
  }).nullable().optional(),
  showdown: z
    .object({
      kind: z.enum(["nonCombat", "combat"]),
      battlefieldId: z.string().min(1),
      relevantPlayerIds: z.array(z.string().min(1)),
      focusPlayerId: z.string().min(1),
      priorityPlayerId: z.string().min(1).nullable(),
      passedPlayerIds: z.array(z.string().min(1)),
    })
    .nullable(),
  combat: z
    .object({
      battlefieldId: z.string().min(1),
      stage: z.enum(["showdown", "attackerAssignment", "defenderAssignment"]),
      attackerPlayerId: z.string().min(1),
      defenderPlayerId: z.string().min(1),
      attackerUnitIds: z.array(z.string().min(1)),
      defenderUnitIds: z.array(z.string().min(1)),
      attackerMight: z.number().int().nonnegative().nullable(),
      defenderMight: z.number().int().nonnegative().nullable(),
    })
    .nullable(),
  pendingChoice: z
    .discriminatedUnion("type", [
      z.object({
        type: z.literal("orderTriggers"),
        id: z.string().min(1),
        playerId: z.string().min(1),
        prompt: z.string().min(1),
        optionIds: z.array(z.string().min(1)),
        pendingChainItems: z.array(projectedChainItemSchema),
      }),
      z.object({
        type: z.literal("orderReplacements"),
        id: z.string().min(1),
        playerId: z.string().min(1),
        prompt: z.string().min(1),
        options: z.array(
          z.object({
            id: z.string().min(1),
            sourceCardInstanceId: z.string().min(1),
          }),
        ),
      }),
      z.object({
        type: z.literal("effectSelection"),
        id: z.string().min(1),
        playerId: z.string().min(1),
        prompt: z.string().min(1),
        title: z.string().min(1),
        waitingMessage: z.string().min(1),
        sourceZone: z.enum(["hand", "trash", "mainDeck", "base"]).nullable(),
        presentation: z.enum(["cardSelection", "vision"]),
        revealedCards: z.array(projectedCardViewSchema),
        visibleCards: z.array(projectedCardViewSchema).default([]).optional(),
        minimum: z.number().int().nonnegative(),
        maximum: z.number().int().nonnegative(),
      }),
      z.object({
        type: z.literal("effectOption"),
        id: z.string().min(1),
        playerId: z.string().min(1),
        prompt: z.string().min(1),
        title: z.string().min(1),
        waitingMessage: z.string().min(1),
        options: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })),
        revealedCards: z.array(projectedCardViewSchema),
      }),
      z.object({
        type: z.literal("tokenPlacement"),
        id: z.string().min(1),
        playerId: z.string().min(1),
        prompt: z.string().min(1),
        title: z.string().min(1),
        waitingMessage: z.string().min(1),
        tokenName: z.string().min(1),
        count: z.number().int().positive(),
        destinations: z.array(
          z.object({
            id: z.string().min(1),
            label: z.string().min(1),
          }),
        ),
      }),
      z.object({
        type: z.literal("assignCombatDamage"),
        id: z.string().min(1),
        playerId: z.string().min(1),
        totalDamage: z.number().int().nonnegative(),
      }),
    ])
    .nullable(),
  players: z.array(projectedPlayerSchema).length(2),
  battlefields: z.array(projectedBattlefieldSchema),
  chain: projectedChainSchema,
  publicReveals: z.array(
    z.object({
      id: z.string().min(1),
      message: z.string().min(1),
      cards: z.array(projectedCardViewSchema),
    }),
  ).default([]).optional(),
  actions: z.array(projectedActionSchema),
  logEntries: z.array(
    z.object({
      id: z.string().min(1),
      message: z.string(),
      createdAt: z.string(),
    }),
  ),
});

export const deckConfigurationSchema = z.object({
  chosenChampionRegisteredCardId: z.string().min(1),
  mainDeckRegisteredCardIds: z.array(z.string().min(1)),
  sideboardRegisteredCardIds: z.array(z.string().min(1)),
});

export const registeredDeckConfigurationSchema = deckConfigurationSchema.extend({
  legendRegisteredCardId: z.string().min(1),
  runeDeckRegisteredCardIds: z.array(z.string().min(1)),
  battlefieldRegisteredCardIds: z.array(z.string().min(1)),
});

export const registeredCardCopySchema = z.object({
  registeredCardId: z.string().min(1),
  cardCode: z.string().min(1),
  canonicalName: z.string().min(1),
});

export const sideboardingCardViewSchema = z.object({
  cardCode: z.string().min(1),
  canonicalName: z.string().min(1),
  name: z.string().min(1),
  imageUrl: z.string().nullable(),
  rulesText: z.string(),
  publicCode: z.string().min(1),
  type: z.string().min(1),
  supertype: z.string().nullable(),
  domains: z.array(z.string()),
  tags: z.array(z.string()),
  energy: z.number().nullable(),
  might: z.number().nullable(),
  power: z.number().nullable(),
});

export const sideboardingSessionSchema = z.object({
  validationConstraints: deckValidationConstraintsSchema,
  matchId: z.string().min(1),
  playerId: z.string().min(1),
  gameNumber: z.union([z.literal(2), z.literal(3)]),
  expectedIntermissionVersion: z.number().int().nonnegative(),
  originalRegisteredDeck: registeredDeckConfigurationSchema,
  currentDeckConfiguration: deckConfigurationSchema,
  eligibleChosenChampionRegisteredCardIds: z.array(z.string().min(1)),
  registeredCardPool: z.array(registeredCardCopySchema),
  cardsByCode: z.record(sideboardingCardViewSchema),
  context: z.object({
    previousGameWinnerPlayerId: z.string().min(1),
    previousGameLoserPlayerId: z.string().min(1),
    nextStartingPlayerChooserId: z.string().min(1),
    usedBattlefieldRegisteredCardIds: z.array(z.string().min(1)),
    remainingBattlefieldRegisteredCardIds: z.array(z.string().min(1)),
    nextBattlefieldMode: z.enum(["player-choice", "server-auto"]),
  }),
  opponentStatus: z.enum(["editing", "submitted"]),
});

export const matchReadyIntentSchema = z.object({
  type: z.literal("match.readyForNextGame"),
  payload: z.object({
    betweenGamesId: z.string().min(1),
  }),
});

export const matchConcedeIntentSchema = z.object({
  type: z.literal("match.concedeMatch"),
  payload: z.object({
    betweenGamesId: z.string().min(1),
  }),
});

export const matchSubmitDeckReconfigurationIntentSchema = z.object({
  type: z.literal("match.submitDeckReconfiguration"),
  payload: z.object({
    betweenGamesId: z.string().min(1),
    configuration: deckConfigurationSchema,
  }),
});

export const matchIntentSchema = z.discriminatedUnion("type", [
  gameActionIntentSchema,
  matchReadyIntentSchema,
  matchConcedeIntentSchema,
  matchSubmitDeckReconfigurationIntentSchema,
]);

export const matchIntentRequestSchema = z.object({
  playerToken: z.string().min(1),
  stateVersion: z.number().int().nonnegative(),
  intent: matchIntentSchema,
});

export const viewerBetweenGamesProjectionSchema = z.object({
  id: z.string().min(1),
  mode: z.enum(["ready_with_current_configuration", "sideboarding"]),
  nextGameNumber: z.union([z.literal(2), z.literal(3)]),
  previousGameWinnerPlayerId: z.string().min(1),
  previousGameLoserPlayerId: z.string().min(1),
  nextStartingPlayerChooserId: z.string().min(1),
  viewerStatus: z.enum(["pending", "submitted"]),
  opponentStatus: z.enum(["pending", "submitted"]),
  usedBattlefieldRegisteredIdsByPlayerId: z.record(z.array(z.string())),
  remainingBattlefieldRegisteredIdsByPlayerId: z.record(z.array(z.string())),
  nextBattlefieldMode: z.enum(["player_choice", "server_auto"]),
  viewerCurrentDeckConfiguration: deckConfigurationSchema,
  capabilities: z.object({
    canReadyWithCurrentConfiguration: z.boolean(),
    canSubmitDeckReconfiguration: z.boolean(),
    canConcedeMatch: z.boolean(),
  }),
  sideboardingSession: sideboardingSessionSchema.nullable(),
});

export const matchProjectionSchema = z.object({
  matchId: z.string().min(1),
  stateVersion: z.number().int().nonnegative(),
  format: z.literal("riftbound-1v1-match"),
  status: z.enum(["playing", "between_games", "complete"]),
  viewerPlayerId: z.string().min(1),
  scoreByPlayerId: z.record(z.number().int().nonnegative()),
  winnerPlayerId: z.string().min(1).nullable(),
  completionReason: z.enum(["two_set_points", "match_concession"]).nullable(),
  currentGameId: z.string().min(1),
  gameNumber: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  gameIds: z.array(z.string().min(1)),
  completedGames: z.array(
    z.object({
      gameId: z.string().min(1),
      gameNumber: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      winnerPlayerId: z.string().min(1),
      completionReason: z.enum(["victory", "game_concession"]),
    }),
  ),
  currentGame: gameProjectionSchema,
  betweenGames: viewerBetweenGamesProjectionSchema.nullable(),
});

export type ProjectedTargetRequirement = z.infer<
  typeof projectedTargetRequirementSchema
>;
export type ProjectedAction = z.infer<typeof projectedActionSchema>;
export type GameActionIntent = z.infer<typeof gameActionIntentSchema>;
export type ProjectedCardView = z.infer<typeof projectedCardViewSchema>;
export type ProjectedZone = z.infer<typeof projectedZoneSchema>;
export type ProjectedPlayer = z.infer<typeof projectedPlayerSchema>;
export type ProjectedBattlefield = z.infer<typeof projectedBattlefieldSchema>;
export type ProjectedChainItem = z.infer<typeof projectedChainItemSchema>;
export type ProjectedChain = z.infer<typeof projectedChainSchema>;
export type GameProjection = z.infer<typeof gameProjectionSchema>;
export type DeckConfiguration = z.infer<typeof deckConfigurationSchema>;
export type RegisteredDeckConfiguration = z.infer<
  typeof registeredDeckConfigurationSchema
>;
export type RegisteredCardCopy = z.infer<typeof registeredCardCopySchema>;
export type SideboardingCardView = z.infer<typeof sideboardingCardViewSchema>;
export type SideboardingSessionInput = z.infer<
  typeof sideboardingSessionSchema
>;
export type MatchIntent = z.infer<typeof matchIntentSchema>;
export type MatchProjection = z.infer<typeof matchProjectionSchema>;
export type ViewerBetweenGamesProjection = z.infer<
  typeof viewerBetweenGamesProjectionSchema
>;
