import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  chooseRandomItem,
  createRngState,
  randomOperationSchema,
  rngStateSchema,
  shuffleItems,
  type RandomOperation
} from "../engine";
import type { Card } from "../catalog";
import { getUnitPlayProfile } from "./card-runtime";
import {
  cardDomainsInMetadataOrder,
  domains,
  rainbowPower,
  type Domain,
  type PaymentMode,
  type PaymentPlan,
  type PowerRequirement,
  type ResourcePayment
} from "./payment";

export const gameStatuses = ["setup_pending", "ready", "in_progress", "complete"] as const;
export const gameTurnPhases = [
  "awaken",
  "beginning",
  "channel",
  "draw",
  "action",
  "end"
] as const;
export const startOfTurnSteps = ["awaken", "beginning", "channel", "draw"] as const;

export const battlefieldChoiceSchema = z.object({
  playerId: z.string().min(1),
  status: z.enum(["unlocked", "locked", "revealed"]),
  cardInstanceId: z.string().min(1).nullable(),
  lockedAt: z.string().datetime().nullable(),
  revealedAt: z.string().datetime().nullable()
});

export const playerBattlefieldPoolSchema = z.object({
  playerId: z.string().min(1),
  registeredCardInstanceIds: z.array(z.string().min(1)),
  usedCardInstanceIds: z.array(z.string().min(1))
});

export const mulliganChoiceSchema = z.object({
  playerId: z.string().min(1),
  status: z.enum(["unlocked", "locked"]),
  selectedCardInstanceIds: z.array(z.string().min(1)).max(2),
  lockedAt: z.string().datetime().nullable()
});

export const gameSetupStateSchema = z.object({
  playerIds: z.tuple([z.string().min(1), z.string().min(1)]),
  startingPlayerChooserId: z.string().min(1).nullable(),
  startingPlayerId: z.string().min(1).nullable(),
  battlefieldChoices: z.record(z.string().min(1), battlefieldChoiceSchema),
  battlefieldPools: z.record(z.string().min(1), playerBattlefieldPoolSchema),
  mulliganChoices: z.record(z.string().min(1), mulliganChoiceSchema)
});

export const gameTurnStateSchema = z.object({
  turnNumber: z.number().int().min(1),
  activePlayerId: z.string().min(1),
  phase: z.enum(gameTurnPhases),
  passedPlayerIds: z.array(z.string().min(1)),
  completedStartOfTurnSteps: z.array(z.enum(startOfTurnSteps)).default([])
});

export const showdownStateSchema = z.object({
  battlefieldId: z.string().min(1),
  relevantPlayerIds: z.array(z.string().min(1)).min(1),
  focusPlayerId: z.string().min(1),
  priorityPlayerId: z.string().min(1),
  passedPlayerIds: z.array(z.string().min(1))
});

export const chosenTargetsSchema = z.object({
  targetCardInstanceIds: z.array(z.string().min(1)).default([]),
  targetBattlefieldIds: z.array(z.string().min(1)).default([]),
  targetPlayerIds: z.array(z.string().min(1)).default([])
});

export const chainItemSchema = z.object({
  id: z.string().min(1),
  controllerPlayerId: z.string().min(1),
  sourceCardInstanceId: z.string().min(1).nullable(),
  cardInstanceId: z.string().min(1).nullable(),
  label: z.string().min(1),
  kind: z.enum(["spell", "ability", "trigger"]),
  effectId: z.string().min(1),
  choices: chosenTargetsSchema.default({
    targetCardInstanceIds: [],
    targetBattlefieldIds: [],
    targetPlayerIds: []
  }),
  payment: z.unknown().optional()
});

export const chainStateSchema = z.object({
  items: z.array(chainItemSchema),
  relevantPlayerIds: z.array(z.string().min(1)).min(1),
  priorityPlayerId: z.string().min(1),
  passedPlayerIds: z.array(z.string().min(1))
});

export const pendingChoiceSchema = z.object({
  id: z.string().min(1),
  playerId: z.string().min(1),
  type: z.literal("orderTriggers"),
  prompt: z.string().min(1),
  optionIds: z.array(z.string().min(1)).min(1),
  pendingChainItems: z.array(chainItemSchema).default([])
});

export const modifierSchema = z.object({
  id: z.string().min(1),
  controllerPlayerId: z.string().min(1),
  sourceCardInstanceId: z.string().min(1).nullable(),
  targetCardInstanceId: z.string().min(1).nullable(),
  kind: z.enum(["mightDelta", "spellEnergyDiscount"]),
  amount: z.number().int(),
  minimum: z.number().int().min(0).nullable().default(null),
  duration: z.enum(["thisTurn", "whileSourceAtBattlefield"]),
  createdAtTurn: z.number().int().min(1)
});

export const runePoolSchema = z.object({
  energy: z.number().int().min(0),
  conditionalEnergy: z
    .record(
      z.string().min(1),
      z.object({
        amount: z.number().int().min(0),
        restriction: z.enum(["spell"])
      })
    )
    .optional(),
  power: z.record(z.string().min(1), z.number().int().min(0))
});

export const cardObjectStateSchema = z.object({
  damage: z.number().int().min(0).optional(),
  exhausted: z.boolean()
});

export const playerZonesSchema = z.object({
  legend: z.string().min(1).nullable(),
  champion: z.string().min(1).nullable(),
  mainDeck: z.array(z.string().min(1)),
  runeDeck: z.array(z.string().min(1)),
  hand: z.array(z.string().min(1)),
  trash: z.array(z.string().min(1)),
  banishment: z.array(z.string().min(1)),
  base: z.array(z.string().min(1))
});

export const gamePlayerStateSchema = z.object({
  playerId: z.string().min(1),
  runePool: runePoolSchema.default({
    energy: 0,
    power: {}
  }),
  zones: playerZonesSchema
});

export const battlefieldStateSchema = z.object({
  battlefieldId: z.string().min(1),
  selectedByPlayerId: z.string().min(1),
  cardInstanceId: z.string().min(1),
  units: z.array(z.string().min(1)),
  facedownSlot: z
    .object({
      controllerId: z.string().min(1),
      cardInstanceId: z.string().min(1)
    })
    .nullable()
});

export const canonicalGameStateSchema = z.object({
  battlefields: z.array(battlefieldStateSchema),
  cardStates: z.record(z.string().min(1), cardObjectStateSchema).default({}),
  chain: chainStateSchema.nullable().default(null),
  modifiers: z.array(modifierSchema).default([]),
  pendingChoice: pendingChoiceSchema.nullable().default(null),
  rng: rngStateSchema,
  players: z.record(z.string().min(1), gamePlayerStateSchema),
  setup: gameSetupStateSchema,
  turn: gameTurnStateSchema.nullable(),
  showdown: showdownStateSchema.nullable()
});

export const gameSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  matchId: z.string().min(1),
  gameNumber: z.number().int().min(1).max(3),
  status: z.enum(gameStatuses),
  stateVersion: z.number().int().min(0),
  canonicalState: canonicalGameStateSchema,
  winnerPlayerId: z.string().min(1).nullable()
});

export type GameStatus = (typeof gameStatuses)[number];
export type BattlefieldChoice = z.infer<typeof battlefieldChoiceSchema>;
export type PlayerBattlefieldPool = z.infer<typeof playerBattlefieldPoolSchema>;
export type MulliganChoice = z.infer<typeof mulliganChoiceSchema>;
export type PlayerZones = z.infer<typeof playerZonesSchema>;
export type GamePlayerState = z.infer<typeof gamePlayerStateSchema>;
export type BattlefieldState = z.infer<typeof battlefieldStateSchema>;
export type GameSetupState = z.infer<typeof gameSetupStateSchema>;
export type GameTurnPhase = (typeof gameTurnPhases)[number];
export type StartOfTurnStep = (typeof startOfTurnSteps)[number];
export type GameTurnState = z.infer<typeof gameTurnStateSchema>;
export type ShowdownState = z.infer<typeof showdownStateSchema>;
export type RunePool = z.infer<typeof runePoolSchema>;
export type CardObjectState = z.infer<typeof cardObjectStateSchema>;
export type ChainItem = z.infer<typeof chainItemSchema>;
export type ChainState = z.infer<typeof chainStateSchema>;
export type ChosenTargets = z.infer<typeof chosenTargetsSchema>;
export type Modifier = z.infer<typeof modifierSchema>;
export type PendingChoice = z.infer<typeof pendingChoiceSchema>;
export type CanonicalGameState = z.infer<typeof canonicalGameStateSchema>;
export type Game = z.infer<typeof gameSchema>;
export type CardLookup = Readonly<Record<string, Card>>;

export type CreateGameInput = {
  id?: string;
  now?: string;
  matchId: string;
  gameNumber: number;
  playerIds: [string, string];
  rngSeed?: string;
  battlefieldCardInstanceIdsByPlayer?: Partial<Record<string, string[]>>;
  usedBattlefieldCardInstanceIdsByPlayer?: Partial<Record<string, string[]>>;
  mainDeckCardInstanceIdsByPlayer?: Partial<Record<string, string[]>>;
  runeDeckCardInstanceIdsByPlayer?: Partial<Record<string, string[]>>;
};

export type AssignStartingPlayerChooserResult = {
  game: Game;
  randomOperation: RandomOperation;
};

export type AssignPreviousGameLoserChooserResult = {
  game: Game;
  previousGameLoserId: string;
};

export type ShuffleDecksResult = {
  game: Game;
  randomOperations: RandomOperation[];
};

export type ChooseStartingPlayerInput = {
  actorPlayerId: string;
  startingPlayerId: string;
  now?: string;
};

export type LockBattlefieldChoiceInput = {
  actorPlayerId: string;
  cardInstanceId: string;
  now?: string;
};

export type PlaceStartingObjectsInput = {
  legendCardInstanceIdsByPlayer: Record<string, string>;
  championCardInstanceIdsByPlayer: Record<string, string>;
  now?: string;
};

export type CommitMulliganInput = {
  actorPlayerId: string;
  selectedCardInstanceIds: string[];
  now?: string;
};

export type StartGameInput = {
  now?: string;
};

export type DrawCardsInput = {
  actorPlayerId: string;
  count?: number;
  now?: string;
};

export type ChannelRunesInput = {
  actorPlayerId: string;
  count?: number;
  now?: string;
};

export type RecycleCardsInput = {
  actorPlayerId: string;
  ownerPlayerId: string;
  cardInstanceIds: string[];
  sourceZone: "hand" | "trash" | "banishment" | "base";
  destinationDeck: "mainDeck" | "runeDeck";
  now?: string;
};

export type RecycleCardsResult = {
  game: Game;
  randomOperations: RandomOperation[];
};

export type AddRuneResourceInput = {
  actorPlayerId: string;
  runeCardInstanceId: string;
  resourceType: "energy" | "power";
  now?: string;
};

export type PlayCardInput = {
  actorPlayerId: string;
  cardInstanceId: string;
  choices?: Partial<ChosenTargets>;
  selectedModeId?: string;
  destination?: "base";
  now?: string;
};

export type PlayCardResult = {
  game: Game;
  payment: PaymentPlan;
  randomOperations: RandomOperation[];
};

export type AvailablePaymentModesByCard = Record<string, PaymentMode[]>;

export type PassPriorityInput = {
  actorPlayerId: string;
  now?: string;
  autoPassOpponent?: boolean;
  cardsByInstanceId?: CardLookup;
};

export type EndTurnInput = {
  actorPlayerId: string;
  now?: string;
};

export type MoveUnitToBattlefieldInput = {
  actorPlayerId: string;
  unitCardInstanceId: string;
  battlefieldId: string;
  now?: string;
};

export type ActivateAbilityInput = {
  actorPlayerId: string;
  sourceCardInstanceId: string;
  abilityId: string;
  choices?: Partial<ChosenTargets>;
  now?: string;
};

export type SubmitChoiceInput = {
  actorPlayerId: string;
  choiceId: string;
  orderedIds: string[];
  now?: string;
  autoPassOpponent?: boolean;
};

type ApplyStartOfTurnInput = {
  activePlayerId: string;
  turnNumber: number;
};

export type PassShowdownInput = {
  actorPlayerId: string;
  now?: string;
};

export function createGame(input: CreateGameInput): Game {
  assertDistinctPlayerIds(input.playerIds);

  const id = input.id ?? randomUUID();
  const now = input.now ?? new Date().toISOString();
  const canonicalState: CanonicalGameState = {
    battlefields: [],
    cardStates: {},
    chain: null,
    modifiers: [],
    pendingChoice: null,
    rng: createRngState(input.rngSeed ?? id),
    players: createInitialPlayerStates(input),
    setup: {
      playerIds: input.playerIds,
      startingPlayerChooserId: null,
      startingPlayerId: null,
      battlefieldChoices: createInitialBattlefieldChoices(input.playerIds),
      battlefieldPools: createInitialBattlefieldPools(input),
      mulliganChoices: createInitialMulliganChoices(input.playerIds)
    },
    turn: null,
    showdown: null
  };

  return gameSchema.parse({
    id,
    createdAt: now,
    updatedAt: now,
    matchId: input.matchId,
    gameNumber: input.gameNumber,
    status: "setup_pending",
    stateVersion: 0,
    canonicalState,
    winnerPlayerId: null
  });
}

export function assignGameOneStartingPlayerChooser(
  game: Game,
  now = new Date().toISOString()
): AssignStartingPlayerChooserResult {
  if (game.gameNumber !== 1) {
    throw new Error("Only game 1 starting-player chooser is selected by RNG.");
  }

  if (game.canonicalState.setup.startingPlayerChooserId !== null) {
    throw new Error("Starting-player chooser has already been assigned.");
  }

  const choice = chooseRandomItem(
    game.canonicalState.rng,
    game.canonicalState.setup.playerIds,
    "game-1-starting-player-chooser"
  );
  const updatedGame = gameSchema.parse({
    ...game,
    updatedAt: now,
    stateVersion: game.stateVersion + 1,
    canonicalState: {
      ...game.canonicalState,
      rng: choice.rngState,
      setup: {
        ...game.canonicalState.setup,
        startingPlayerChooserId: choice.value
      }
    }
  });

  return {
    game: updatedGame,
    randomOperation: randomOperationSchema.parse(choice.operation)
  };
}

export function assignPreviousGameLoserStartingPlayerChooser(
  game: Game,
  previousGame: Game,
  now = new Date().toISOString()
): AssignPreviousGameLoserChooserResult {
  if (game.gameNumber !== 2 && game.gameNumber !== 3) {
    throw new Error("Only games 2 and 3 use the previous game loser as chooser.");
  }

  if (previousGame.gameNumber !== game.gameNumber - 1) {
    throw new Error("Previous game must immediately precede the game being set up.");
  }

  if (previousGame.status !== "complete" || previousGame.winnerPlayerId === null) {
    throw new Error("Previous game must be complete with a winner.");
  }

  if (game.canonicalState.setup.startingPlayerChooserId !== null) {
    throw new Error("Starting-player chooser has already been assigned.");
  }

  assertSamePlayers(game, previousGame);

  const previousGameLoserId = game.canonicalState.setup.playerIds.find(
    (playerId) => playerId !== previousGame.winnerPlayerId
  );

  if (!previousGameLoserId) {
    throw new Error("Previous game winner must be one of the current game players.");
  }

  return {
    game: gameSchema.parse({
      ...game,
      updatedAt: now,
      stateVersion: game.stateVersion + 1,
      canonicalState: {
        ...game.canonicalState,
        setup: {
          ...game.canonicalState.setup,
          startingPlayerChooserId: previousGameLoserId
        }
      }
    }),
    previousGameLoserId
  };
}

export function chooseStartingPlayer(
  game: Game,
  input: ChooseStartingPlayerInput
): Game {
  const chooserId = game.canonicalState.setup.startingPlayerChooserId;

  if (game.status !== "setup_pending") {
    throw new Error("Starting player can only be chosen during setup.");
  }

  if (chooserId === null) {
    throw new Error("Starting-player chooser has not been assigned.");
  }

  if (game.canonicalState.setup.startingPlayerId !== null) {
    throw new Error("Starting player has already been chosen.");
  }

  if (input.actorPlayerId !== chooserId) {
    throw new Error("Only the assigned starting-player chooser can choose.");
  }

  if (!game.canonicalState.setup.playerIds.includes(input.startingPlayerId)) {
    throw new Error("Starting player must be one of the game players.");
  }

  return gameSchema.parse({
    ...game,
    updatedAt: input.now ?? new Date().toISOString(),
    stateVersion: game.stateVersion + 1,
    canonicalState: {
      ...game.canonicalState,
      setup: {
        ...game.canonicalState.setup,
        startingPlayerId: input.startingPlayerId
      }
    }
  });
}

export function lockBattlefieldChoice(
  game: Game,
  input: LockBattlefieldChoiceInput
): Game {
  const now = input.now ?? new Date().toISOString();

  if (game.status !== "setup_pending") {
    throw new Error("Battlefield choice can only be locked during setup.");
  }

  if (!game.canonicalState.setup.playerIds.includes(input.actorPlayerId)) {
    throw new Error("Only game players can lock a battlefield choice.");
  }

  const choice = game.canonicalState.setup.battlefieldChoices[input.actorPlayerId];
  const pool = game.canonicalState.setup.battlefieldPools[input.actorPlayerId];

  if (!choice || !pool) {
    throw new Error("Battlefield setup state is missing for player.");
  }

  if (choice.status !== "unlocked") {
    throw new Error("Battlefield choice has already been locked.");
  }

  if (!pool.registeredCardInstanceIds.includes(input.cardInstanceId)) {
    throw new Error("Battlefield choice must be one of the player's registered battlefields.");
  }

  if (pool.usedCardInstanceIds.includes(input.cardInstanceId)) {
    throw new Error("Battlefield choice has already been used in this match.");
  }

  return gameSchema.parse({
    ...game,
    updatedAt: now,
    stateVersion: game.stateVersion + 1,
    canonicalState: {
      ...game.canonicalState,
      setup: {
        ...game.canonicalState.setup,
        battlefieldChoices: {
          ...game.canonicalState.setup.battlefieldChoices,
          [input.actorPlayerId]: {
            ...choice,
            status: "locked",
            cardInstanceId: input.cardInstanceId,
            lockedAt: now
          }
        }
      }
    }
  });
}

export function revealBattlefieldChoices(
  game: Game,
  now = new Date().toISOString()
): Game {
  if (game.status !== "setup_pending") {
    throw new Error("Battlefield choices can only be revealed during setup.");
  }

  const choices = game.canonicalState.setup.battlefieldChoices;
  const pools = game.canonicalState.setup.battlefieldPools;

  for (const playerId of game.canonicalState.setup.playerIds) {
    const choice = choices[playerId];

    if (!choice || choice.status !== "locked" || choice.cardInstanceId === null) {
      throw new Error("Both players must lock battlefield choices before reveal.");
    }
  }

  const revealedChoices = Object.fromEntries(
    game.canonicalState.setup.playerIds.map((playerId) => [
      playerId,
      {
        ...choices[playerId]!,
        status: "revealed",
        revealedAt: now
      }
    ])
  );
  const updatedPools = Object.fromEntries(
    game.canonicalState.setup.playerIds.map((playerId) => {
      const pool = pools[playerId]!;
      const choice = choices[playerId]!;
      const usedCardInstanceIds = pool.usedCardInstanceIds.includes(
        choice.cardInstanceId!
      )
        ? pool.usedCardInstanceIds
        : [...pool.usedCardInstanceIds, choice.cardInstanceId!];

      return [
        playerId,
        {
          ...pool,
          usedCardInstanceIds
        }
      ];
    })
  );

  return gameSchema.parse({
    ...game,
    updatedAt: now,
    stateVersion: game.stateVersion + 1,
    canonicalState: {
      ...game.canonicalState,
      setup: {
        ...game.canonicalState.setup,
        battlefieldChoices: revealedChoices,
        battlefieldPools: updatedPools
      }
    }
  });
}

export function shuffleMainDecks(
  game: Game,
  now = new Date().toISOString()
): ShuffleDecksResult {
  return shuffleDeckZone(game, "mainDeck", "shuffle-main-deck", now);
}

export function shuffleRuneDecks(
  game: Game,
  now = new Date().toISOString()
): ShuffleDecksResult {
  return shuffleDeckZone(game, "runeDeck", "shuffle-rune-deck", now);
}

export function placeStartingObjects(
  game: Game,
  input: PlaceStartingObjectsInput
): Game {
  const now = input.now ?? new Date().toISOString();

  if (game.status !== "setup_pending") {
    throw new Error("Starting objects can only be placed during setup.");
  }

  if (game.canonicalState.battlefields.length > 0) {
    throw new Error("Starting battlefields have already been placed.");
  }

  const players = { ...game.canonicalState.players };
  const battlefields: BattlefieldState[] = [];

  for (const playerId of game.canonicalState.setup.playerIds) {
    const player = players[playerId];
    const choice = game.canonicalState.setup.battlefieldChoices[playerId];
    const legend = input.legendCardInstanceIdsByPlayer[playerId];
    const champion = input.championCardInstanceIdsByPlayer[playerId];

    if (!player) {
      throw new Error("Player zone state is missing.");
    }

    if (!legend || !champion) {
      throw new Error("Legend and champion instance IDs are required for each player.");
    }

    if (player.zones.legend !== null || player.zones.champion !== null) {
      throw new Error("Legend or champion has already been placed.");
    }

    if (!choice || choice.status !== "revealed" || choice.cardInstanceId === null) {
      throw new Error("Battlefields must be revealed before starting objects are placed.");
    }

    players[playerId] = {
      ...player,
      zones: {
        ...player.zones,
        legend,
        champion
      }
    };
    battlefields.push({
      battlefieldId: `${game.id}:battlefield:${playerId}`,
      selectedByPlayerId: playerId,
      cardInstanceId: choice.cardInstanceId,
      units: [],
      facedownSlot: null
    });
  }

  return gameSchema.parse({
    ...game,
    updatedAt: now,
    stateVersion: game.stateVersion + 1,
    canonicalState: {
      ...game.canonicalState,
      battlefields,
      players
    }
  });
}

export function drawOpeningHands(
  game: Game,
  now = new Date().toISOString()
): Game {
  if (game.status !== "setup_pending") {
    throw new Error("Opening hands can only be drawn during setup.");
  }

  if (game.canonicalState.battlefields.length !== game.canonicalState.setup.playerIds.length) {
    throw new Error("Starting objects must be placed before opening hands are drawn.");
  }

  const players = { ...game.canonicalState.players };

  for (const playerId of game.canonicalState.setup.playerIds) {
    const player = players[playerId];

    if (!player || player.zones.legend === null || player.zones.champion === null) {
      throw new Error("Legend and champion must be placed before opening hands are drawn.");
    }

    if (player.zones.hand.length > 0) {
      throw new Error("Opening hand has already been drawn.");
    }

    if (player.zones.mainDeck.length < 4) {
      throw new Error("Main deck must contain at least four cards for opening draw.");
    }

    players[playerId] = {
      ...player,
      zones: {
        ...player.zones,
        mainDeck: player.zones.mainDeck.slice(4),
        hand: player.zones.mainDeck.slice(0, 4)
      }
    };
  }

  return gameSchema.parse({
    ...game,
    updatedAt: now,
    stateVersion: game.stateVersion + 1,
    canonicalState: {
      ...game.canonicalState,
      players
    }
  });
}

export function commitMulligan(
  game: Game,
  input: CommitMulliganInput
): Game {
  const now = input.now ?? new Date().toISOString();

  if (game.status !== "setup_pending") {
    throw new Error("Mulligan can only be committed during setup.");
  }

  if (!game.canonicalState.setup.playerIds.includes(input.actorPlayerId)) {
    throw new Error("Only game players can commit a mulligan.");
  }

  if (input.selectedCardInstanceIds.length > 0) {
    throw new Error("Only zero-card mulligans are supported in the first MVP path.");
  }

  const choice = game.canonicalState.setup.mulliganChoices[input.actorPlayerId];
  const player = game.canonicalState.players[input.actorPlayerId];

  if (!choice || !player) {
    throw new Error("Mulligan setup state is missing for player.");
  }

  if (choice.status !== "unlocked") {
    throw new Error("Mulligan has already been committed.");
  }

  if (player.zones.hand.length === 0) {
    throw new Error("Opening hand must be drawn before mulligan commit.");
  }

  return gameSchema.parse({
    ...game,
    updatedAt: now,
    stateVersion: game.stateVersion + 1,
    canonicalState: {
      ...game.canonicalState,
      setup: {
        ...game.canonicalState.setup,
        mulliganChoices: {
          ...game.canonicalState.setup.mulliganChoices,
          [input.actorPlayerId]: {
            ...choice,
            status: "locked",
            selectedCardInstanceIds: [],
            lockedAt: now
          }
        }
      }
    }
  });
}

export function startGame(game: Game, input: StartGameInput = {}): Game {
  if (game.status !== "setup_pending") {
    throw new Error("Game can only start from setup.");
  }

  const startingPlayerId = game.canonicalState.setup.startingPlayerId;

  if (startingPlayerId === null) {
    throw new Error("Starting player must be chosen before the game starts.");
  }

  for (const playerId of game.canonicalState.setup.playerIds) {
    const mulligan = game.canonicalState.setup.mulliganChoices[playerId];

    if (!mulligan || mulligan.status !== "locked") {
      throw new Error("Both players must commit mulligans before the game starts.");
    }
  }

  const inProgressGame = gameSchema.parse({
    ...game,
    updatedAt: input.now ?? new Date().toISOString(),
    status: "in_progress",
    stateVersion: game.stateVersion + 1,
    canonicalState: {
      ...game.canonicalState,
      turn: {
        turnNumber: 1,
        activePlayerId: startingPlayerId,
        phase: "action",
        passedPlayerIds: [],
        completedStartOfTurnSteps: ["awaken", "beginning", "channel", "draw"]
      }
    }
  });

  return applyStartOfTurn(inProgressGame, {
    activePlayerId: startingPlayerId,
    turnNumber: 1
  });
}

export function drawCards(game: Game, input: DrawCardsInput): Game {
  const count = input.count ?? 1;

  assertPositiveCount(count);
  assertInProgressTurn(game);
  assertGamePlayer(game, input.actorPlayerId);

  const player = game.canonicalState.players[input.actorPlayerId]!;

  if (player.zones.mainDeck.length < count) {
    throw new Error("Burn Out is not implemented for empty Main Deck draws.");
  }

  return gameSchema.parse({
    ...game,
    updatedAt: input.now ?? new Date().toISOString(),
    stateVersion: game.stateVersion + 1,
    canonicalState: {
      ...game.canonicalState,
      turn: {
        ...game.canonicalState.turn!,
        passedPlayerIds: []
      },
      players: {
        ...game.canonicalState.players,
        [input.actorPlayerId]: {
          ...player,
          zones: {
            ...player.zones,
            mainDeck: player.zones.mainDeck.slice(count),
            hand: [...player.zones.hand, ...player.zones.mainDeck.slice(0, count)]
          }
        }
      }
    }
  });
}

export function channelRunes(game: Game, input: ChannelRunesInput): Game {
  const count = input.count ?? 1;

  assertPositiveCount(count);
  assertInProgressTurn(game);
  assertGamePlayer(game, input.actorPlayerId);

  const player = game.canonicalState.players[input.actorPlayerId]!;
  const channeledRuneCardInstanceIds = player.zones.runeDeck.slice(0, count);

  if (player.zones.runeDeck.length < count) {
    throw new Error("Rune Deck does not contain enough runes to channel.");
  }

  return gameSchema.parse({
    ...game,
    updatedAt: input.now ?? new Date().toISOString(),
    stateVersion: game.stateVersion + 1,
    canonicalState: {
      ...game.canonicalState,
      cardStates: {
        ...game.canonicalState.cardStates,
        ...Object.fromEntries(
          channeledRuneCardInstanceIds.map((cardInstanceId) => [
            cardInstanceId,
            game.canonicalState.cardStates[cardInstanceId] ?? { exhausted: false }
          ])
        )
      },
      turn: {
        ...game.canonicalState.turn!,
        passedPlayerIds: []
      },
      players: {
        ...game.canonicalState.players,
        [input.actorPlayerId]: {
          ...player,
          zones: {
            ...player.zones,
            runeDeck: player.zones.runeDeck.slice(count),
            base: [...player.zones.base, ...channeledRuneCardInstanceIds]
          }
        }
      }
    }
  });
}

export function recycleCards(
  game: Game,
  input: RecycleCardsInput
): RecycleCardsResult {
  if (input.cardInstanceIds.length === 0) {
    throw new Error("Recycle requires at least one card.");
  }

  assertGamePlayer(game, input.actorPlayerId);
  assertGamePlayer(game, input.ownerPlayerId);

  const player = game.canonicalState.players[input.ownerPlayerId]!;
  const sourceCards = player.zones[input.sourceZone];
  const sourceSet = new Set(sourceCards);

  for (const cardInstanceId of input.cardInstanceIds) {
    if (!sourceSet.has(cardInstanceId)) {
      throw new Error("Recycle source zone does not contain every selected card.");
    }
  }

  let rngState = game.canonicalState.rng;
  let recycledCardInstanceIds = input.cardInstanceIds;
  const randomOperations: RandomOperation[] = [];

  const recycleOrder = orderRecycledCardsForBottom(
    rngState,
    input.cardInstanceIds,
    input.destinationDeck,
    input.ownerPlayerId
  );
  rngState = recycleOrder.rngState;
  recycledCardInstanceIds = recycleOrder.cardInstanceIds;
  randomOperations.push(...recycleOrder.randomOperations);

  const selectedSet = new Set(input.cardInstanceIds);
  const nextSourceCards = sourceCards.filter(
    (cardInstanceId) => !selectedSet.has(cardInstanceId)
  );
  const cardStates = { ...game.canonicalState.cardStates };

  for (const cardInstanceId of input.cardInstanceIds) {
    delete cardStates[cardInstanceId];
  }

  return {
    game: gameSchema.parse({
      ...game,
      updatedAt: input.now ?? new Date().toISOString(),
      stateVersion: game.stateVersion + 1,
      canonicalState: {
        ...game.canonicalState,
        cardStates,
        rng: rngState,
        players: {
          ...game.canonicalState.players,
          [input.ownerPlayerId]: {
            ...player,
            zones: {
              ...player.zones,
              [input.sourceZone]: nextSourceCards,
              [input.destinationDeck]: [
                ...player.zones[input.destinationDeck],
                ...recycledCardInstanceIds
              ]
            }
          }
        }
      }
    }),
    randomOperations
  };
}

export function addRuneResource(
  game: Game,
  input: AddRuneResourceInput,
  cardsByInstanceId: CardLookup
): Game {
  assertInProgressTurn(game);
  assertGamePlayer(game, input.actorPlayerId);

  const player = game.canonicalState.players[input.actorPlayerId]!;

  if (!player.zones.base.includes(input.runeCardInstanceId)) {
    throw new Error("Rune must be in the acting player's base.");
  }

  const runeCard = requireCard(cardsByInstanceId, input.runeCardInstanceId);

  if (runeCard.classification.type !== "Rune") {
    throw new Error("Only Rune cards can add rune-pool resources.");
  }

  if (input.resourceType === "energy") {
    const currentState = game.canonicalState.cardStates[input.runeCardInstanceId] ?? {
      exhausted: false
    };

    if (currentState.exhausted) {
      throw new Error("Exhausted runes cannot add Energy.");
    }

    return gameSchema.parse({
      ...game,
      updatedAt: input.now ?? new Date().toISOString(),
      stateVersion: game.stateVersion + 1,
      canonicalState: {
        ...game.canonicalState,
        cardStates: {
          ...game.canonicalState.cardStates,
          [input.runeCardInstanceId]: {
            exhausted: true
          }
        },
        turn: {
          ...game.canonicalState.turn!,
          passedPlayerIds: []
        },
        players: {
          ...game.canonicalState.players,
          [input.actorPlayerId]: {
            ...player,
            runePool: {
              ...player.runePool,
              energy: player.runePool.energy + 1
            }
          }
        }
      }
    });
  }

  const domain = requireSingleRuneDomain(runeCard);
  const cardStates = { ...game.canonicalState.cardStates };
  delete cardStates[input.runeCardInstanceId];

  return gameSchema.parse({
    ...game,
    updatedAt: input.now ?? new Date().toISOString(),
    stateVersion: game.stateVersion + 1,
    canonicalState: {
      ...game.canonicalState,
      cardStates,
      turn: {
        ...game.canonicalState.turn!,
        passedPlayerIds: []
      },
      players: {
        ...game.canonicalState.players,
        [input.actorPlayerId]: {
          ...player,
          runePool: {
            ...player.runePool,
            power: addPower(player.runePool.power, domain, 1)
          },
          zones: {
            ...player.zones,
            base: player.zones.base.filter(
              (cardInstanceId) => cardInstanceId !== input.runeCardInstanceId
            ),
            runeDeck: [...player.zones.runeDeck, input.runeCardInstanceId]
          }
        }
      }
    }
  });
}

export function playCard(
  game: Game,
  input: PlayCardInput,
  cardsByInstanceId: CardLookup
): PlayCardResult {
  assertInProgressTurn(game);
  assertGamePlayer(game, input.actorPlayerId);

  if (game.canonicalState.showdown !== null) {
    throw new Error("Playing cards during showdown is not implemented.");
  }

  const selectedModeId = input.selectedModeId ?? "regular";

  if (selectedModeId !== "regular") {
    throw new Error("Unsupported payment mode.");
  }

  const player = game.canonicalState.players[input.actorPlayerId]!;
  const sourceZone = player.zones.hand.includes(input.cardInstanceId)
    ? "hand"
    : player.zones.champion === input.cardInstanceId
      ? "champion"
      : null;

  if (sourceZone === null) {
    throw new Error("Card must be in hand or champion zone to be played.");
  }

  const card = requireCard(cardsByInstanceId, input.cardInstanceId);

  if (game.canonicalState.chain !== null && card.classification.type !== "Spell") {
    throw new Error("Only Reaction spells can be played while the chain is open.");
  }

  if (card.classification.type === "Spell") {
    return playSpellCard(game, input, card, sourceZone, cardsByInstanceId);
  }

  if (card.classification.type !== "Unit") {
    throw new Error("Only Unit and supported Spell card play is supported.");
  }

  if (input.destination && input.destination !== "base") {
    throw new Error("Only playing units to base is supported.");
  }

  const profile = getUnitPlayProfile(card);

  if (!profile.supported) {
    throw new Error(profile.reason);
  }

  const payment = buildAutomaticPaymentPlan(
    game,
    input.actorPlayerId,
    readCardCostWithModifiers(game, input.actorPlayerId, card, cardsByInstanceId),
    cardsByInstanceId,
    selectedModeId,
    "unit"
  );
  const paidResult = applyPaymentPlan(
    game,
    input.actorPlayerId,
    payment,
    cardsByInstanceId,
    input.now
  );
  const paidGame = paidResult.game;
  const paidPlayer = paidGame.canonicalState.players[input.actorPlayerId]!;
  const playedGame = gameSchema.parse({
    ...paidGame,
    updatedAt: input.now ?? new Date().toISOString(),
    stateVersion: game.stateVersion + 1,
    canonicalState: {
      ...paidGame.canonicalState,
      cardStates: {
        ...paidGame.canonicalState.cardStates,
        [input.cardInstanceId]: {
          exhausted: !profile.entersReady
        }
      },
      turn: {
        ...paidGame.canonicalState.turn!,
        passedPlayerIds: []
      },
      players: {
        ...paidGame.canonicalState.players,
        [input.actorPlayerId]: {
          ...paidPlayer,
          zones:
            sourceZone === "hand"
              ? {
                  ...paidPlayer.zones,
                  hand: paidPlayer.zones.hand.filter(
                    (cardInstanceId) => cardInstanceId !== input.cardInstanceId
                  ),
                  base: [...paidPlayer.zones.base, input.cardInstanceId]
                }
              : {
                  ...paidPlayer.zones,
                  champion: null,
                  base: [...paidPlayer.zones.base, input.cardInstanceId]
                }
        }
      }
    }
  });

  return {
    game: enqueueUnitPlayedTriggers(
      playedGame,
      {
        controllerPlayerId: input.actorPlayerId,
        cardInstanceId: input.cardInstanceId
      },
      cardsByInstanceId,
      input.now
    ),
    payment,
    randomOperations: paidResult.randomOperations
  };
}

function playSpellCard(
  game: Game,
  input: PlayCardInput,
  card: Card,
  sourceZone: "hand" | "champion",
  cardsByInstanceId: CardLookup
): PlayCardResult {
  assertCanPlaySpell(game, input.actorPlayerId, card);

  const selectedModeId = input.selectedModeId ?? "regular";
  const profile = getLuxSpellProfile(card);
  const choices = normalizeChoices(input.choices);

  validateSpellChoices(game, input.actorPlayerId, profile, choices, cardsByInstanceId);

  const resourceCosts = addDeflectCosts(
    game,
    input.actorPlayerId,
    readCardCostWithModifiers(game, input.actorPlayerId, card, cardsByInstanceId),
    choices,
    cardsByInstanceId
  );
  const payment = buildAutomaticPaymentPlan(
    game,
    input.actorPlayerId,
    resourceCosts,
    cardsByInstanceId,
    selectedModeId,
    "spell"
  );
  const paidResult = applyPaymentPlan(
    game,
    input.actorPlayerId,
    payment,
    cardsByInstanceId,
    input.now
  );
  const paidGame = paidResult.game;
  const paidPlayer = paidGame.canonicalState.players[input.actorPlayerId]!;
  const chainItem: ChainItem = {
    id: `${input.cardInstanceId}:chain:${paidGame.stateVersion + 1}`,
    controllerPlayerId: input.actorPlayerId,
    sourceCardInstanceId: input.cardInstanceId,
    cardInstanceId: input.cardInstanceId,
    label: card.name,
    kind: "spell",
    effectId: profile.effectId,
    choices,
    payment
  };

  return {
    game: gameSchema.parse({
      ...paidGame,
      updatedAt: input.now ?? new Date().toISOString(),
      stateVersion: game.stateVersion + 1,
      canonicalState: {
        ...paidGame.canonicalState,
        chain: addChainItem(paidGame, chainItem),
        turn: {
          ...paidGame.canonicalState.turn!,
          passedPlayerIds: []
        },
        players: {
          ...paidGame.canonicalState.players,
          [input.actorPlayerId]: {
            ...paidPlayer,
            zones:
              sourceZone === "hand"
                ? {
                    ...paidPlayer.zones,
                    hand: paidPlayer.zones.hand.filter(
                      (cardInstanceId) => cardInstanceId !== input.cardInstanceId
                    )
                  }
                : {
                    ...paidPlayer.zones,
                    champion: null
                  }
          }
        }
      }
    }),
    payment,
    randomOperations: paidResult.randomOperations
  };
}

export function getAvailablePaymentModesForPlayer(
  game: Game,
  playerId: string,
  cardsByInstanceId: CardLookup
): AvailablePaymentModesByCard {
  assertGamePlayer(game, playerId);

  if (game.status !== "in_progress" || game.canonicalState.showdown !== null) {
    return {};
  }

  const player = game.canonicalState.players[playerId]!;
  const candidateCardInstanceIds = [
    ...player.zones.hand,
    ...(player.zones.champion === null ? [] : [player.zones.champion])
  ];
  const modesByCard: AvailablePaymentModesByCard = {};

  for (const cardInstanceId of candidateCardInstanceIds) {
    const card = cardsByInstanceId[cardInstanceId];

    if (
      !card ||
      (card.classification.type !== "Unit" && card.classification.type !== "Spell")
    ) {
      continue;
    }

    try {
      if (card.classification.type === "Unit") {
        if (game.canonicalState.chain !== null) {
          continue;
        }

        const profile = getUnitPlayProfile(card);

        if (!profile.supported) {
          continue;
        }
      } else {
        const profile = getLuxSpellProfile(card);

        if (!canPlaySpellAtCurrentTiming(game, playerId, card)) {
          continue;
        }

        if (!hasAnyLegalChoiceForSpell(game, playerId, profile, cardsByInstanceId)) {
          continue;
        }
      }

      const playKind = card.classification.type === "Spell" ? "spell" : "unit";
      const resourceCosts = readCardCostWithModifiers(
        game,
        playerId,
        card,
        cardsByInstanceId
      );
      buildAutomaticPaymentPlan(
        game,
        playerId,
        resourceCosts,
        cardsByInstanceId,
        "regular",
        playKind
      );
      modesByCard[cardInstanceId] = [
        {
          id: "regular",
          label: "Regular",
          optionalCosts: [],
          resourceCosts,
          isDefault: true
        }
      ];
    } catch {
      continue;
    }
  }

  return modesByCard;
}

export function passPriority(game: Game, input: PassPriorityInput): Game {
  assertInProgressTurn(game);
  assertGamePlayer(game, input.actorPlayerId);

  if (game.canonicalState.pendingChoice !== null) {
    throw new Error("A pending choice must be completed before passing.");
  }

  if (game.canonicalState.chain !== null) {
    return passChainPriority(game, input);
  }

  const turn = game.canonicalState.turn!;
  const passedPlayerIds = turn.passedPlayerIds.includes(input.actorPlayerId)
    ? turn.passedPlayerIds
    : [...turn.passedPlayerIds, input.actorPlayerId];

  return gameSchema.parse({
    ...game,
    updatedAt: input.now ?? new Date().toISOString(),
    stateVersion: game.stateVersion + 1,
    canonicalState: {
      ...game.canonicalState,
      turn: {
        ...turn,
        passedPlayerIds
      }
    }
  });
}

export function activateAbility(
  game: Game,
  input: ActivateAbilityInput,
  cardsByInstanceId: CardLookup
): Game {
  assertInProgressTurn(game);
  assertGamePlayer(game, input.actorPlayerId);

  if (game.canonicalState.showdown !== null) {
    throw new Error("Action/Reaction play during showdown is not implemented.");
  }

  if (game.canonicalState.pendingChoice !== null) {
    throw new Error("A pending choice must be completed before activating abilities.");
  }

  if (input.abilityId !== "lux-crownguard-add-spell-energy") {
    throw new Error("Activated ability is not implemented.");
  }

  const player = game.canonicalState.players[input.actorPlayerId]!;

  if (!player.zones.base.includes(input.sourceCardInstanceId)) {
    throw new Error("Lux Crownguard must be in the acting player's base.");
  }

  const card = requireCard(cardsByInstanceId, input.sourceCardInstanceId);

  if (card.name !== "Lux, Crownguard") {
    throw new Error("Only Lux Crownguard's activated ability is supported.");
  }

  if (
    !canActivateLuxCrownguardSpellEnergyAbility(
      game,
      input.actorPlayerId,
      input.sourceCardInstanceId,
      cardsByInstanceId
    )
  ) {
    throw new Error("Ability is not legal at the current timing.");
  }

  const currentState = game.canonicalState.cardStates[input.sourceCardInstanceId] ?? {
    exhausted: false
  };

  return gameSchema.parse({
    ...game,
    updatedAt: input.now ?? new Date().toISOString(),
    stateVersion: game.stateVersion + 1,
    canonicalState: {
      ...game.canonicalState,
      cardStates: {
        ...game.canonicalState.cardStates,
        [input.sourceCardInstanceId]: {
          ...currentState,
          exhausted: true
        }
      },
      players: {
        ...game.canonicalState.players,
        [input.actorPlayerId]: {
          ...player,
          runePool: addConditionalEnergy(
            player.runePool,
            "lux-crownguard-spell-energy",
            2,
            "spell"
          )
        }
      }
    }
  });
}

export function getAvailableActivatedAbilityIdsForPlayer(
  game: Game,
  playerId: string,
  cardsByInstanceId: CardLookup
): Record<string, string[]> {
  const player = game.canonicalState.players[playerId];

  if (!player || game.status !== "in_progress") {
    return {};
  }

  return Object.fromEntries(
    player.zones.base.flatMap((cardInstanceId) =>
      canActivateLuxCrownguardSpellEnergyAbility(
        game,
        playerId,
        cardInstanceId,
        cardsByInstanceId
      )
        ? [[cardInstanceId, ["lux-crownguard-add-spell-energy"]]]
        : []
    )
  );
}

export function submitChoice(
  game: Game,
  input: SubmitChoiceInput,
  cardsByInstanceId: CardLookup
): Game {
  assertInProgressTurn(game);
  assertGamePlayer(game, input.actorPlayerId);

  const pendingChoice = game.canonicalState.pendingChoice;

  if (pendingChoice === null) {
    throw new Error("No pending choice is available.");
  }

  if (pendingChoice.id !== input.choiceId) {
    throw new Error("Submitted choice does not match the pending choice.");
  }

  if (pendingChoice.playerId !== input.actorPlayerId) {
    throw new Error("Only the prompted player can submit this choice.");
  }

  if (!sameMembers(pendingChoice.optionIds, input.orderedIds)) {
    throw new Error("Trigger ordering must include every pending trigger exactly once.");
  }

  const chain = game.canonicalState.chain;

  if (chain === null) {
    throw new Error("Trigger ordering requires an active chain.");
  }

  const triggerItems = input.orderedIds.map((id) => {
    const item = pendingChoice.pendingChainItems.find((candidate) => candidate.id === id);

    if (!item) {
      throw new Error("Pending trigger was not found.");
    }

    return item;
  });
  const orderedGame = gameSchema.parse({
    ...game,
    updatedAt: input.now ?? new Date().toISOString(),
    stateVersion: game.stateVersion + 1,
    canonicalState: {
      ...game.canonicalState,
      chain: {
        ...chain,
        items: [...chain.items, ...triggerItems],
        priorityPlayerId: input.actorPlayerId,
        passedPlayerIds: []
      },
      pendingChoice: null
    }
  });

  return input.autoPassOpponent
    ? autoPassChainOpponents(orderedGame, input.actorPlayerId, cardsByInstanceId)
    : orderedGame;
}

export function endTurn(game: Game, input: EndTurnInput): Game {
  assertInProgressTurn(game);
  assertGamePlayer(game, input.actorPlayerId);

  const turn = game.canonicalState.turn!;

  if (turn.activePlayerId !== input.actorPlayerId) {
    throw new Error("Only the active player can end the turn.");
  }

  if (game.canonicalState.chain !== null) {
    throw new Error("Cannot end the turn while a chain is active.");
  }

  if (game.canonicalState.pendingChoice !== null) {
    throw new Error("Cannot end the turn while a choice is pending.");
  }

  const nextPlayerId = game.canonicalState.setup.playerIds.find(
    (playerId) => playerId !== input.actorPlayerId
  );

  if (!nextPlayerId) {
    throw new Error("Next player could not be determined.");
  }

  const advancedGame = gameSchema.parse({
    ...game,
    updatedAt: input.now ?? new Date().toISOString(),
    stateVersion: game.stateVersion + 1,
    canonicalState: {
      ...game.canonicalState,
      cardStates: clearMarkedDamage(game.canonicalState.cardStates),
      modifiers: game.canonicalState.modifiers.filter(
        (modifier) => modifier.duration !== "thisTurn"
      ),
      turn: {
        turnNumber: turn.turnNumber + 1,
        activePlayerId: nextPlayerId,
        phase: "action",
        passedPlayerIds: [],
        completedStartOfTurnSteps: ["awaken", "beginning", "channel", "draw"]
      }
    }
  });

  return applyStartOfTurn(advancedGame, {
    activePlayerId: nextPlayerId,
    turnNumber: turn.turnNumber + 1
  });
}

function applyStartOfTurn(game: Game, input: ApplyStartOfTurnInput): Game {
  const player = game.canonicalState.players[input.activePlayerId];

  if (!player) {
    throw new Error("Active player could not be found for Start of Turn.");
  }

  const playersWithClearedPools = Object.fromEntries(
    game.canonicalState.setup.playerIds.map((playerId) => {
      const currentPlayer = game.canonicalState.players[playerId]!;

      return [
        playerId,
        {
          ...currentPlayer,
          runePool: {
            energy: 0,
            power: {}
          }
        }
      ];
    })
  );
  const activePlayer = playersWithClearedPools[input.activePlayerId]!;
  const channelTargetCount = getStartOfTurnChannelCount(game, input);
  const channeledCount = Math.min(channelTargetCount, activePlayer.zones.runeDeck.length);
  const drawnCount = 1;

  if (activePlayer.zones.mainDeck.length < drawnCount) {
    throw new Error("Burn Out is not implemented for automatic Start of Turn draws.");
  }

  const channeledRuneCardInstanceIds = activePlayer.zones.runeDeck.slice(
    0,
    channeledCount
  );
  const players = {
    ...playersWithClearedPools,
    [input.activePlayerId]: {
      ...activePlayer,
      runePool: {
        energy: 0,
        power: {}
      },
      zones: {
        ...activePlayer.zones,
        runeDeck: activePlayer.zones.runeDeck.slice(channeledCount),
        mainDeck: activePlayer.zones.mainDeck.slice(drawnCount),
        hand: [
          ...activePlayer.zones.hand,
          ...activePlayer.zones.mainDeck.slice(0, drawnCount)
        ],
        base: [...activePlayer.zones.base, ...channeledRuneCardInstanceIds]
      }
    }
  };

  return gameSchema.parse({
    ...game,
    canonicalState: {
      ...game.canonicalState,
      cardStates: readyPlayerBoardCards(
        game.canonicalState.cardStates,
        player.zones
      ),
      players,
      turn: {
        turnNumber: input.turnNumber,
        activePlayerId: input.activePlayerId,
        phase: "action",
        passedPlayerIds: [],
        completedStartOfTurnSteps: ["awaken", "beginning", "channel", "draw"]
      }
    }
  });
}

function getStartOfTurnChannelCount(
  game: Game,
  input: ApplyStartOfTurnInput
): number {
  const startingPlayerId = game.canonicalState.setup.startingPlayerId;

  if (input.turnNumber === 2 && input.activePlayerId !== startingPlayerId) {
    return 3;
  }

  return 2;
}

export function moveUnitToBattlefield(
  game: Game,
  input: MoveUnitToBattlefieldInput
): Game {
  assertInProgressTurn(game);
  assertGamePlayer(game, input.actorPlayerId);

  if (game.canonicalState.showdown !== null) {
    throw new Error("Units cannot move while a showdown is in progress.");
  }

  const player = game.canonicalState.players[input.actorPlayerId]!;

  if (!player.zones.base.includes(input.unitCardInstanceId)) {
    throw new Error("Unit must be in the acting player's base.");
  }

  const unitState = game.canonicalState.cardStates[input.unitCardInstanceId] ?? {
    exhausted: false
  };

  if (unitState.exhausted) {
    throw new Error("Exhausted units cannot move.");
  }

  const battlefield = game.canonicalState.battlefields.find(
    (candidate) => candidate.battlefieldId === input.battlefieldId
  );

  if (!battlefield) {
    throw new Error("Battlefield was not found.");
  }

  if (battlefield.units.length > 0) {
    throw new Error("Only movement to an empty battlefield is supported.");
  }

  return gameSchema.parse({
    ...game,
    updatedAt: input.now ?? new Date().toISOString(),
    stateVersion: game.stateVersion + 1,
    canonicalState: {
      ...game.canonicalState,
      cardStates: {
        ...game.canonicalState.cardStates,
        [input.unitCardInstanceId]: {
          exhausted: true
        }
      },
      players: {
        ...game.canonicalState.players,
        [input.actorPlayerId]: {
          ...player,
          zones: {
            ...player.zones,
            base: player.zones.base.filter(
              (cardInstanceId) => cardInstanceId !== input.unitCardInstanceId
            )
          }
        }
      },
      battlefields: game.canonicalState.battlefields.map((candidate) =>
        candidate.battlefieldId === input.battlefieldId
          ? {
              ...candidate,
              units: [...candidate.units, input.unitCardInstanceId]
            }
          : candidate
      ),
      showdown: {
        battlefieldId: input.battlefieldId,
        relevantPlayerIds: [...game.canonicalState.setup.playerIds],
        focusPlayerId: input.actorPlayerId,
        priorityPlayerId: input.actorPlayerId,
        passedPlayerIds: []
      }
    }
  });
}

export function passShowdown(game: Game, input: PassShowdownInput): Game {
  assertInProgressTurn(game);
  assertGamePlayer(game, input.actorPlayerId);

  const showdown = game.canonicalState.showdown;

  if (showdown === null) {
    throw new Error("No showdown is in progress.");
  }

  if (showdown.focusPlayerId !== input.actorPlayerId) {
    throw new Error("Only the player with focus can pass in showdown.");
  }

  const passedPlayerIds = showdown.passedPlayerIds.includes(input.actorPlayerId)
    ? showdown.passedPlayerIds
    : [...showdown.passedPlayerIds, input.actorPlayerId];
  const shouldClose = showdown.relevantPlayerIds.every((playerId) =>
    passedPlayerIds.includes(playerId)
  );
  const nextFocusPlayerId = shouldClose
    ? input.actorPlayerId
    : nextRelevantPlayer(showdown.relevantPlayerIds, input.actorPlayerId);

  return gameSchema.parse({
    ...game,
    updatedAt: input.now ?? new Date().toISOString(),
    stateVersion: game.stateVersion + 1,
    canonicalState: {
      ...game.canonicalState,
      showdown: shouldClose
        ? null
        : {
            ...showdown,
            focusPlayerId: nextFocusPlayerId,
            priorityPlayerId: nextFocusPlayerId,
            passedPlayerIds
          }
    }
  });
}

function passChainPriority(game: Game, input: PassPriorityInput): Game {
  const chain = game.canonicalState.chain!;

  if (chain.priorityPlayerId !== input.actorPlayerId) {
    throw new Error("Only the player with chain priority can pass.");
  }

  const passedPlayerIds = chain.passedPlayerIds.includes(input.actorPlayerId)
    ? chain.passedPlayerIds
    : [...chain.passedPlayerIds, input.actorPlayerId];
  const shouldResolve = chain.relevantPlayerIds.every((playerId) =>
    passedPlayerIds.includes(playerId)
  );
  const nextPriorityPlayerId = shouldResolve
    ? input.actorPlayerId
    : nextRelevantPlayer(chain.relevantPlayerIds, input.actorPlayerId);
  const passedGame = gameSchema.parse({
    ...game,
    updatedAt: input.now ?? new Date().toISOString(),
    stateVersion: game.stateVersion + 1,
    canonicalState: {
      ...game.canonicalState,
      chain: {
        ...chain,
        priorityPlayerId: nextPriorityPlayerId,
        passedPlayerIds
      }
    }
  });

  const nextGame = shouldResolve
    ? resolveTopChainItem(passedGame, input.cardsByInstanceId ?? {}, input.now)
    : passedGame;

  return input.autoPassOpponent
    ? autoPassChainOpponents(
        nextGame,
        input.actorPlayerId,
        input.cardsByInstanceId ?? {}
      )
    : nextGame;
}

function resolveTopChainItem(
  game: Game,
  cardsByInstanceId: CardLookup,
  now?: string
): Game {
  const chain = game.canonicalState.chain;

  if (chain === null || chain.items.length === 0) {
    throw new Error("No chain item is available to resolve.");
  }

  const item = chain.items[chain.items.length - 1]!;
  let resolvedGame = resolveChainItem(game, item, cardsByInstanceId, now);
  const remainingItems = chain.items.slice(0, -1);

  resolvedGame = gameSchema.parse({
    ...resolvedGame,
    updatedAt: now ?? new Date().toISOString(),
    canonicalState: {
      ...resolvedGame.canonicalState,
      chain:
        remainingItems.length === 0
          ? null
          : {
              ...chain,
              items: remainingItems,
              priorityPlayerId:
                remainingItems[remainingItems.length - 1]!.controllerPlayerId,
              passedPlayerIds: []
            }
    }
  });

  resolvedGame = cleanupLethalDamage(resolvedGame, cardsByInstanceId, now);

  if (item.kind === "spell") {
    resolvedGame = enqueueSpellPlayedTriggers(
      resolvedGame,
      item,
      cardsByInstanceId,
      now
    );
  }

  return resolvedGame;
}

function resolveChainItem(
  game: Game,
  item: ChainItem,
  cardsByInstanceId: CardLookup,
  now?: string
): Game {
  switch (item.effectId) {
    case "spell:stupefy":
      return resolveStupefy(game, item, now);
    case "spell:back-to-back":
      return resolveBackToBack(game, item, now);
    case "spell:falling-comet":
      return resolveDamageSpell(game, item, 6, now);
    case "spell:blast-of-power":
      return resolveKillSpell(game, item, now);
    case "spell:singularity":
      return resolveDamageSpell(game, item, 6, now);
    case "spell:final-spark":
      return resolveDamageSpell(game, item, 8, now);
    case "trigger:lady-of-luminosity-draw":
      return drawCards(game, {
        actorPlayerId: item.controllerPlayerId,
        count: 1,
        now
      });
    case "trigger:ravenbloom-student":
      return addMightModifier(game, {
        amount: 1,
        controllerPlayerId: item.controllerPlayerId,
        sourceCardInstanceId: item.sourceCardInstanceId,
        targetCardInstanceId: item.sourceCardInstanceId,
        minimum: null,
        now
      });
    case "trigger:lux-illuminated":
      return addMightModifier(game, {
        amount: 3,
        controllerPlayerId: item.controllerPlayerId,
        sourceCardInstanceId: item.sourceCardInstanceId,
        targetCardInstanceId: item.sourceCardInstanceId,
        minimum: null,
        now
      });
    case "trigger:lecturing-yordle-draw":
      return drawCards(game, {
        actorPlayerId: item.controllerPlayerId,
        count: 1,
        now
      });
    default:
      throw new Error(`Chain effect is not implemented: ${item.effectId}`);
  }
}


function resolveStupefy(game: Game, item: ChainItem, now?: string): Game {
  const targetId = item.choices.targetCardInstanceIds[0];

  if (!targetId || !isBoardUnit(game, targetId)) {
    return moveResolvedSpellToTrash(game, item, now);
  }

  const modifiedGame = addMightModifier(game, {
    amount: -1,
    controllerPlayerId: item.controllerPlayerId,
    sourceCardInstanceId: item.cardInstanceId,
    targetCardInstanceId: targetId,
    minimum: 1,
    now
  });
  const drawnGame = drawCards(modifiedGame, {
    actorPlayerId: item.controllerPlayerId,
    count: 1,
    now
  });

  return moveResolvedSpellToTrash(drawnGame, item, now);
}

function resolveBackToBack(game: Game, item: ChainItem, now?: string): Game {
  let nextGame = game;

  for (const targetId of item.choices.targetCardInstanceIds) {
    if (isFriendlyBoardUnit(nextGame, item.controllerPlayerId, targetId)) {
      nextGame = addMightModifier(nextGame, {
        amount: 2,
        controllerPlayerId: item.controllerPlayerId,
        sourceCardInstanceId: item.cardInstanceId,
        targetCardInstanceId: targetId,
        minimum: null,
        now
      });
    }
  }

  return moveResolvedSpellToTrash(nextGame, item, now);
}

function resolveDamageSpell(
  game: Game,
  item: ChainItem,
  damage: number,
  now?: string
): Game {
  let nextGame = game;

  for (const targetId of item.choices.targetCardInstanceIds) {
    if (isValidDamageTarget(nextGame, item.effectId, targetId)) {
      nextGame = markDamage(nextGame, targetId, damage, now);
    }
  }

  return moveResolvedSpellToTrash(nextGame, item, now);
}

function resolveKillSpell(game: Game, item: ChainItem, now?: string): Game {
  const targetId = item.choices.targetCardInstanceIds[0];
  const killedGame =
    targetId && isUnitAtBattlefield(game, targetId)
      ? killPermanent(game, targetId, now)
      : game;

  return moveResolvedSpellToTrash(killedGame, item, now);
}

function moveResolvedSpellToTrash(game: Game, item: ChainItem, now?: string): Game {
  if (!item.cardInstanceId) {
    return game;
  }

  const ownerId = item.controllerPlayerId;

  const owner = game.canonicalState.players[ownerId]!;

  return gameSchema.parse({
    ...game,
    updatedAt: now ?? new Date().toISOString(),
    canonicalState: {
      ...game.canonicalState,
      players: {
        ...game.canonicalState.players,
        [ownerId]: {
          ...owner,
          zones: {
            ...owner.zones,
            trash: [...owner.zones.trash, item.cardInstanceId]
          }
        }
      }
    }
  });
}

function enqueueSpellPlayedTriggers(
  game: Game,
  item: ChainItem,
  cardsByInstanceId: CardLookup,
  now?: string
): Game {
  const energyCost = readChainItemEnergyCost(item);
  const triggers: ChainItem[] = [];
  const controllerId = item.controllerPlayerId;
  const controller = game.canonicalState.players[controllerId]!;

  if (
    energyCost >= 5 &&
    controller.zones.legend &&
    cardsByInstanceId[controller.zones.legend]?.name === "Lady of Luminosity - Starter"
  ) {
    triggers.push(createTriggerChainItem(game, {
      controllerPlayerId: controllerId,
      effectId: "trigger:lady-of-luminosity-draw",
      label: "Lady of Luminosity",
      sourceCardInstanceId: controller.zones.legend
    }));
  }

  for (const unitId of controlledBoardUnitIds(game, controllerId)) {
    const name = cardsByInstanceId[unitId]?.name;

    if (name === "Ravenbloom Student") {
      triggers.push(createTriggerChainItem(game, {
        controllerPlayerId: controllerId,
        effectId: "trigger:ravenbloom-student",
        label: "Ravenbloom Student",
        sourceCardInstanceId: unitId
      }));
    }

    if (energyCost >= 5 && name === "Lux, Illuminated") {
      triggers.push(createTriggerChainItem(game, {
        controllerPlayerId: controllerId,
        effectId: "trigger:lux-illuminated",
        label: "Lux, Illuminated",
        sourceCardInstanceId: unitId
      }));
    }
  }

  if (triggers.length === 0) {
    return game;
  }

  const chain = game.canonicalState.chain;
  const nextChain: ChainState = chain ?? {
    items: [],
    relevantPlayerIds: [...game.canonicalState.setup.playerIds],
    priorityPlayerId: controllerId,
    passedPlayerIds: []
  };
  const withTriggers = gameSchema.parse({
    ...game,
    updatedAt: now ?? new Date().toISOString(),
    canonicalState: {
      ...game.canonicalState,
      chain: {
        ...nextChain,
        items: triggers.length > 1 ? nextChain.items : [...nextChain.items, ...triggers],
        priorityPlayerId: controllerId,
        passedPlayerIds: []
      },
      pendingChoice:
        triggers.length > 1
          ? {
              id: `choice:${game.stateVersion + 1}:${controllerId}:triggers`,
              playerId: controllerId,
              type: "orderTriggers",
              prompt: "Choose the order for triggered abilities.",
              optionIds: triggers.map((trigger) => trigger.id),
              pendingChainItems: triggers
            }
          : game.canonicalState.pendingChoice
    }
  });

  return withTriggers;
}

function enqueueUnitPlayedTriggers(
  game: Game,
  input: {
    controllerPlayerId: string;
    cardInstanceId: string;
  },
  cardsByInstanceId: CardLookup,
  now?: string
): Game {
  const card = cardsByInstanceId[input.cardInstanceId];

  if (!card) {
    return game;
  }

  const profile = getUnitPlayProfile(card);

  if (!profile.supported || profile.onPlay?.type !== "draw") {
    return game;
  }

  const trigger = createTriggerChainItem(game, {
    controllerPlayerId: input.controllerPlayerId,
    effectId: "trigger:lecturing-yordle-draw",
    label: card.name,
    sourceCardInstanceId: input.cardInstanceId
  });
  const chain = game.canonicalState.chain;
  const nextChain: ChainState = chain ?? {
    items: [],
    relevantPlayerIds: [...game.canonicalState.setup.playerIds],
    priorityPlayerId: input.controllerPlayerId,
    passedPlayerIds: []
  };

  return gameSchema.parse({
    ...game,
    updatedAt: now ?? new Date().toISOString(),
    canonicalState: {
      ...game.canonicalState,
      chain: {
        ...nextChain,
        items: [...nextChain.items, trigger],
        priorityPlayerId: input.controllerPlayerId,
        passedPlayerIds: []
      }
    }
  });
}

function createTriggerChainItem(
  game: Game,
  input: {
    controllerPlayerId: string;
    effectId: string;
    label: string;
    sourceCardInstanceId: string;
  }
): ChainItem {
  return {
    id: `${input.sourceCardInstanceId}:${input.effectId}:${game.stateVersion + 1}`,
    controllerPlayerId: input.controllerPlayerId,
    sourceCardInstanceId: input.sourceCardInstanceId,
    cardInstanceId: null,
    label: input.label,
    kind: "trigger",
    effectId: input.effectId,
    choices: {
      targetCardInstanceIds: [],
      targetBattlefieldIds: [],
      targetPlayerIds: []
    }
  };
}

function addChainItem(game: Game, item: ChainItem): ChainState {
  const chain = game.canonicalState.chain;

  if (chain === null) {
    return {
      items: [item],
      relevantPlayerIds: [...game.canonicalState.setup.playerIds],
      priorityPlayerId: item.controllerPlayerId,
      passedPlayerIds: []
    };
  }

  return {
    ...chain,
    items: [...chain.items, item],
    priorityPlayerId: item.controllerPlayerId,
    passedPlayerIds: []
  };
}

function assertCanPlaySpell(game: Game, actorPlayerId: string, card: Card) {
  if (!canPlaySpellAtCurrentTiming(game, actorPlayerId, card)) {
    throw new Error("Spell is not legal at the current timing.");
  }
}

function canActivateLuxCrownguardSpellEnergyAbility(
  game: Game,
  actorPlayerId: string,
  sourceCardInstanceId: string,
  cardsByInstanceId: CardLookup
): boolean {
  const player = game.canonicalState.players[actorPlayerId];

  if (!player?.zones.base.includes(sourceCardInstanceId)) {
    return false;
  }

  const card = cardsByInstanceId[sourceCardInstanceId];

  if (!card || card.name !== "Lux, Crownguard") {
    return false;
  }

  if (!canActivateAbilityAtCurrentTiming(game, actorPlayerId, card)) {
    return false;
  }

  const currentState = game.canonicalState.cardStates[sourceCardInstanceId] ?? {
    exhausted: false
  };

  return !currentState.exhausted;
}

function canActivateAbilityAtCurrentTiming(
  game: Game,
  actorPlayerId: string,
  sourceCard: Card
): boolean {
  if (game.canonicalState.showdown !== null || game.canonicalState.pendingChoice) {
    return false;
  }

  const turn = game.canonicalState.turn;

  if (!turn || turn.phase !== "action") {
    return false;
  }

  if (game.canonicalState.chain === null) {
    return turn.activePlayerId === actorPlayerId;
  }

  return (
    game.canonicalState.chain.priorityPlayerId === actorPlayerId &&
    abilityTiming(sourceCard) === "reaction"
  );
}

function canPlaySpellAtCurrentTiming(
  game: Game,
  actorPlayerId: string,
  card: Card
): boolean {
  if (game.canonicalState.showdown !== null || game.canonicalState.pendingChoice) {
    return false;
  }

  const turn = game.canonicalState.turn;

  if (!turn || turn.phase !== "action") {
    return false;
  }

  if (game.canonicalState.chain === null) {
    return turn.activePlayerId === actorPlayerId;
  }

  return (
    game.canonicalState.chain.priorityPlayerId === actorPlayerId &&
    spellTiming(card) === "reaction"
  );
}

function spellTiming(card: Card): "action" | "reaction" | "normal" {
  return timingFromText(card.text.plain);
}

function abilityTiming(card: Card): "action" | "reaction" | "normal" {
  return timingFromText(card.text.plain);
}

function timingFromText(text: string): "action" | "reaction" | "normal" {
  if (text.includes("[Reaction]")) {
    return "reaction";
  }

  if (text.includes("[Action]")) {
    return "action";
  }

  return "normal";
}

type LuxSpellProfile = {
  effectId: string;
  targetRule:
    | { type: "anyUnit"; count: number }
    | { type: "friendlyUnit"; count: number }
    | { type: "unitAtBattlefield"; count: number }
    | { type: "upToAnyUnit"; max: number };
};

function getLuxSpellProfile(card: Card): LuxSpellProfile {
  switch (card.name) {
    case "Stupefy":
      return { effectId: "spell:stupefy", targetRule: { type: "anyUnit", count: 1 } };
    case "Back to Back":
      return {
        effectId: "spell:back-to-back",
        targetRule: { type: "friendlyUnit", count: 2 }
      };
    case "Falling Comet":
      return {
        effectId: "spell:falling-comet",
        targetRule: { type: "unitAtBattlefield", count: 1 }
      };
    case "Blast of Power":
      return {
        effectId: "spell:blast-of-power",
        targetRule: { type: "unitAtBattlefield", count: 1 }
      };
    case "Singularity":
      return {
        effectId: "spell:singularity",
        targetRule: { type: "upToAnyUnit", max: 2 }
      };
    case "Final Spark":
      return {
        effectId: "spell:final-spark",
        targetRule: { type: "anyUnit", count: 1 }
      };
    default:
      throw new Error("This Spell's runtime behavior is not implemented.");
  }
}

function validateSpellChoices(
  game: Game,
  playerId: string,
  profile: LuxSpellProfile,
  choices: ChosenTargets,
  cardsByInstanceId: CardLookup
) {
  const targetIds = choices.targetCardInstanceIds;
  const uniqueTargetCount = new Set(targetIds).size;

  if (uniqueTargetCount !== targetIds.length) {
    throw new Error("A target can only be chosen once.");
  }

  switch (profile.targetRule.type) {
    case "anyUnit":
      if (targetIds.length !== profile.targetRule.count) {
        throw new Error("This spell requires the exact number of unit targets.");
      }
      break;
    case "friendlyUnit":
      if (targetIds.length !== profile.targetRule.count) {
        throw new Error("This spell requires the exact number of friendly targets.");
      }
      break;
    case "unitAtBattlefield":
      if (targetIds.length !== profile.targetRule.count) {
        throw new Error("This spell requires a unit at a battlefield.");
      }
      break;
    case "upToAnyUnit":
      if (targetIds.length > profile.targetRule.max) {
        throw new Error("This spell has too many targets.");
      }
      break;
  }

  for (const targetId of targetIds) {
    const targetCard = cardsByInstanceId[targetId];

    if (targetCard?.classification.type !== "Unit") {
      throw new Error("Spell target must be a unit.");
    }

    if (!isLegalTargetForRule(game, playerId, targetId, profile.targetRule)) {
      throw new Error("Spell target is not legal.");
    }

  }
}

function hasAnyLegalChoiceForSpell(
  game: Game,
  playerId: string,
  profile: LuxSpellProfile,
  cardsByInstanceId: CardLookup
): boolean {
  const legalTargets = getLegalTargetCardInstanceIds(
    game,
    playerId,
    profile.targetRule
  ).filter(
    (targetId) => cardsByInstanceId[targetId]?.classification.type === "Unit"
  );

  if (profile.targetRule.type === "upToAnyUnit") {
    return true;
  }

  return legalTargets.length >= profile.targetRule.count;
}

function normalizeChoices(input?: Partial<ChosenTargets>): ChosenTargets {
  return {
    targetCardInstanceIds: input?.targetCardInstanceIds ?? [],
    targetBattlefieldIds: input?.targetBattlefieldIds ?? [],
    targetPlayerIds: input?.targetPlayerIds ?? []
  };
}

function getLegalTargetCardInstanceIds(
  game: Game,
  playerId: string,
  rule: LuxSpellProfile["targetRule"]
): string[] {
  return allBoardUnitIds(game).filter((targetId) =>
    isLegalTargetForRule(game, playerId, targetId, rule)
  );
}

function isLegalTargetForRule(
  game: Game,
  playerId: string,
  targetId: string,
  rule: LuxSpellProfile["targetRule"]
): boolean {
  if (rule.type === "friendlyUnit") {
    return isFriendlyBoardUnit(game, playerId, targetId);
  }

  if (rule.type === "unitAtBattlefield") {
    return isUnitAtBattlefield(game, targetId);
  }

  return isBoardUnit(game, targetId);
}

function addMightModifier(
  game: Game,
  input: {
    amount: number;
    controllerPlayerId: string;
    sourceCardInstanceId: string | null;
    targetCardInstanceId: string | null;
    minimum: number | null;
    now?: string;
  }
): Game {
  if (!input.targetCardInstanceId || !isBoardUnit(game, input.targetCardInstanceId)) {
    return game;
  }

  return gameSchema.parse({
    ...game,
    updatedAt: input.now ?? new Date().toISOString(),
    canonicalState: {
      ...game.canonicalState,
      modifiers: [
        ...game.canonicalState.modifiers,
        {
          id: `modifier:${game.canonicalState.modifiers.length + 1}:${input.targetCardInstanceId}`,
          controllerPlayerId: input.controllerPlayerId,
          sourceCardInstanceId: input.sourceCardInstanceId,
          targetCardInstanceId: input.targetCardInstanceId,
          kind: "mightDelta",
          amount: input.amount,
          minimum: input.minimum,
          duration: "thisTurn",
          createdAtTurn: game.canonicalState.turn?.turnNumber ?? 1
        }
      ]
    }
  });
}

function markDamage(
  game: Game,
  cardInstanceId: string,
  damage: number,
  now?: string
): Game {
  const state = game.canonicalState.cardStates[cardInstanceId] ?? {
    exhausted: false
  };

  return gameSchema.parse({
    ...game,
    updatedAt: now ?? new Date().toISOString(),
    canonicalState: {
      ...game.canonicalState,
      cardStates: {
        ...game.canonicalState.cardStates,
        [cardInstanceId]: {
          ...state,
          damage: (state.damage ?? 0) + damage
        }
      }
    }
  });
}

function cleanupLethalDamage(
  game: Game,
  cardsByInstanceId: CardLookup,
  now?: string
): Game {
  let nextGame = game;

  for (const cardInstanceId of allBoardUnitIds(game)) {
    const damage = nextGame.canonicalState.cardStates[cardInstanceId]?.damage ?? 0;

    if (
      damage > 0 &&
      damage >= getComputedMight(nextGame, cardInstanceId, cardsByInstanceId)
    ) {
      nextGame = killPermanent(nextGame, cardInstanceId, now);
    }
  }

  return nextGame;
}

function killPermanent(game: Game, cardInstanceId: string, now?: string): Game {
  const ownerId = findCardOwnerPlayerId(game, cardInstanceId);

  if (!ownerId) {
    return game;
  }

  const owner = game.canonicalState.players[ownerId]!;
  const cardStates = { ...game.canonicalState.cardStates };
  delete cardStates[cardInstanceId];

  return gameSchema.parse({
    ...game,
    updatedAt: now ?? new Date().toISOString(),
    canonicalState: {
      ...game.canonicalState,
      cardStates,
      modifiers: game.canonicalState.modifiers.filter(
        (modifier) =>
          modifier.targetCardInstanceId !== cardInstanceId &&
          modifier.sourceCardInstanceId !== cardInstanceId
      ),
      players: {
        ...game.canonicalState.players,
        [ownerId]: {
          ...owner,
          zones: {
            ...owner.zones,
            base: owner.zones.base.filter((id) => id !== cardInstanceId),
            trash: [...owner.zones.trash, cardInstanceId]
          }
        }
      },
      battlefields: game.canonicalState.battlefields.map((battlefield) => ({
        ...battlefield,
        units: battlefield.units.filter((id) => id !== cardInstanceId)
      }))
    }
  });
}

function clearMarkedDamage(
  cardStates: Record<string, CardObjectState>
): Record<string, CardObjectState> {
  return Object.fromEntries(
    Object.entries(cardStates).map(([cardInstanceId, state]) => {
      const { damage: _damage, ...rest } = state;
      return [cardInstanceId, rest];
    })
  );
}

function getComputedMight(
  game: Game,
  cardInstanceId: string,
  cardsByInstanceId: CardLookup
): number {
  const card = cardsByInstanceId[cardInstanceId];
  let might = card?.attributes.might ?? 0;
  let minimum: number | null = null;

  for (const modifier of game.canonicalState.modifiers) {
    if (modifier.kind !== "mightDelta") {
      continue;
    }

    if (modifier.targetCardInstanceId !== cardInstanceId) {
      continue;
    }

    might += modifier.amount;
    minimum =
      modifier.minimum === null
        ? minimum
        : minimum === null
          ? modifier.minimum
          : Math.max(minimum, modifier.minimum);
  }

  return Math.max(minimum ?? 0, might);
}

function readCardCostWithModifiers(
  game: Game,
  playerId: string,
  card: Card,
  cardsByInstanceId: CardLookup
): {
  energy: number;
  power: PowerRequirement[];
} {
  const cost = readCardCost(card);

  if (card.classification.type !== "Spell") {
    return cost;
  }

  const discounts = getSpellEnergyDiscounts(game, playerId, cardsByInstanceId);
  let energy = cost.energy;
  const appliedDiscounts: string[] = [];

  for (const discount of discounts) {
    const nextEnergy = Math.max(discount.minimum, energy - discount.amount);

    if (nextEnergy !== energy) {
      appliedDiscounts.push(discount.id);
    }

    energy = nextEnergy;
  }

  return {
    ...cost,
    energy
  };
}

function addDeflectCosts(
  game: Game,
  playerId: string,
  cost: {
    energy: number;
    power: PowerRequirement[];
  },
  choices: ChosenTargets,
  cardsByInstanceId: CardLookup
): {
  energy: number;
  power: PowerRequirement[];
} {
  const deflectPower = choices.targetCardInstanceIds.reduce((total, targetId) => {
    const card = cardsByInstanceId[targetId];
    const ownerId = findCardOwnerPlayerId(game, targetId);

    if (!card || ownerId === null || ownerId === playerId) {
      return total;
    }

    return total + readDeflectPowerCost(card);
  }, 0);

  if (deflectPower === 0) {
    return cost;
  }

  return {
    ...cost,
    power: [
      ...cost.power,
      {
        amount: deflectPower,
        payableBy: "any"
      }
    ]
  };
}

function readDeflectPowerCost(card: Card): number {
  const match = card.text.plain.match(/\[Deflect(?:\s+(\d+))?\]/);

  if (!match) {
    return 0;
  }

  return match[1] ? Number.parseInt(match[1], 10) : 1;
}

function getSpellEnergyDiscounts(
  game: Game,
  playerId: string,
  cardsByInstanceId: CardLookup
): Array<{ id: string; amount: number; minimum: number }> {
  const discounts: Array<{ id: string; amount: number; minimum: number }> = [];

  for (const unitId of controlledBattlefieldUnitIds(game, playerId)) {
    if (cardsByInstanceId[unitId]?.name === "Eager Apprentice") {
      discounts.push({
        id: `eager-apprentice:${unitId}`,
        amount: 1,
        minimum: 1
      });
    }
  }

  for (const modifier of game.canonicalState.modifiers) {
    if (
      modifier.kind === "spellEnergyDiscount" &&
      modifier.controllerPlayerId === playerId
    ) {
      discounts.push({
        id: modifier.id,
        amount: Math.abs(modifier.amount),
        minimum: modifier.minimum ?? 0
      });
    }
  }

  return discounts;
}

function addConditionalEnergy(
  runePool: RunePool,
  id: string,
  amount: number,
  restriction: "spell"
): RunePool {
  const current = runePool.conditionalEnergy?.[id];

  return {
    ...runePool,
    conditionalEnergy: {
      ...(runePool.conditionalEnergy ?? {}),
      [id]: {
        amount: (current?.amount ?? 0) + amount,
        restriction
      }
    }
  };
}

function autoPassChainOpponents(
  game: Game,
  originalActorPlayerId: string,
  cardsByInstanceId: CardLookup
): Game {
  let nextGame = game;

  while (
    nextGame.canonicalState.chain !== null &&
    nextGame.canonicalState.pendingChoice === null &&
    nextGame.canonicalState.chain.priorityPlayerId !== originalActorPlayerId
  ) {
    nextGame = passChainPriority(nextGame, {
      actorPlayerId: nextGame.canonicalState.chain.priorityPlayerId,
      autoPassOpponent: false
    });
  }

  return nextGame;
}

function readChainItemEnergyCost(item: ChainItem): number {
  const payment = item.payment as PaymentPlan | undefined;

  return payment?.resourceCosts.energy ?? 0;
}

function isValidDamageTarget(
  game: Game,
  effectId: string,
  cardInstanceId: string
): boolean {
  return effectId === "spell:falling-comet" || effectId === "spell:blast-of-power"
    ? isUnitAtBattlefield(game, cardInstanceId)
    : isBoardUnit(game, cardInstanceId);
}

function isBoardUnit(game: Game, cardInstanceId: string): boolean {
  return allBoardUnitIds(game).includes(cardInstanceId);
}

function isUnitAtBattlefield(game: Game, cardInstanceId: string): boolean {
  return game.canonicalState.battlefields.some((battlefield) =>
    battlefield.units.includes(cardInstanceId)
  );
}

function isFriendlyBoardUnit(
  game: Game,
  playerId: string,
  cardInstanceId: string
): boolean {
  return controlledBoardUnitIds(game, playerId).includes(cardInstanceId);
}

function allBoardUnitIds(game: Game): string[] {
  return [
    ...Object.values(game.canonicalState.players).flatMap((player) =>
      player.zones.base.filter((cardInstanceId) =>
        Boolean(game.canonicalState.cardStates[cardInstanceId])
      )
    ),
    ...game.canonicalState.battlefields.flatMap((battlefield) => battlefield.units)
  ];
}

function controlledBoardUnitIds(game: Game, playerId: string): string[] {
  const player = game.canonicalState.players[playerId]!;

  return [
    ...player.zones.base.filter((cardInstanceId) =>
      Boolean(game.canonicalState.cardStates[cardInstanceId])
    ),
    ...game.canonicalState.battlefields.flatMap((battlefield) =>
      battlefield.units.filter(
        (cardInstanceId) => findCardOwnerPlayerId(game, cardInstanceId) === playerId
      )
    )
  ];
}

function controlledBattlefieldUnitIds(game: Game, playerId: string): string[] {
  return game.canonicalState.battlefields.flatMap((battlefield) =>
    battlefield.units.filter(
      (cardInstanceId) => findCardOwnerPlayerId(game, cardInstanceId) === playerId
    )
  );
}

function findCardOwnerPlayerId(game: Game, cardInstanceId: string): string | null {
  for (const [playerId, player] of Object.entries(game.canonicalState.players)) {
    const zones = player.zones;

    if (
      zones.legend === cardInstanceId ||
      zones.champion === cardInstanceId ||
      zones.mainDeck.includes(cardInstanceId) ||
      zones.runeDeck.includes(cardInstanceId) ||
      zones.hand.includes(cardInstanceId) ||
      zones.trash.includes(cardInstanceId) ||
      zones.banishment.includes(cardInstanceId) ||
      zones.base.includes(cardInstanceId)
    ) {
      return playerId;
    }
  }

  const ownerPrefix = cardInstanceId.split(":")[0];

  if (ownerPrefix && game.canonicalState.setup.playerIds.includes(ownerPrefix)) {
    return ownerPrefix;
  }

  return null;
}

function sameMembers(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const leftSet = new Set(left);

  return right.every((value) => leftSet.has(value));
}

function createInitialBattlefieldChoices(
  playerIds: [string, string]
): Record<string, BattlefieldChoice> {
  return Object.fromEntries(
    playerIds.map((playerId) => [
      playerId,
      {
        playerId,
        status: "unlocked",
        cardInstanceId: null,
        lockedAt: null,
        revealedAt: null
      }
    ])
  );
}

function createInitialMulliganChoices(
  playerIds: [string, string]
): Record<string, MulliganChoice> {
  return Object.fromEntries(
    playerIds.map((playerId) => [
      playerId,
      {
        playerId,
        status: "unlocked",
        selectedCardInstanceIds: [],
        lockedAt: null
      }
    ])
  );
}

function createInitialPlayerStates(
  input: CreateGameInput
): Record<string, GamePlayerState> {
  return Object.fromEntries(
    input.playerIds.map((playerId) => [
      playerId,
      {
        playerId,
        runePool: {
          energy: 0,
          power: {}
        },
        zones: {
          legend: null,
          champion: null,
          mainDeck: input.mainDeckCardInstanceIdsByPlayer?.[playerId] ?? [],
          runeDeck: input.runeDeckCardInstanceIdsByPlayer?.[playerId] ?? [],
          hand: [],
          trash: [],
          banishment: [],
          base: []
        }
      }
    ])
  );
}

function shuffleDeckZone(
  game: Game,
  zone: "mainDeck" | "runeDeck",
  purposePrefix: string,
  now: string
): ShuffleDecksResult {
  if (game.status !== "setup_pending") {
    throw new Error("Decks can only be shuffled during setup.");
  }

  let rngState = game.canonicalState.rng;
  const randomOperations: RandomOperation[] = [];
  const players = { ...game.canonicalState.players };

  for (const playerId of game.canonicalState.setup.playerIds) {
    const player = players[playerId];

    if (!player) {
      throw new Error("Player zone state is missing.");
    }

    const result = shuffleItems(
      rngState,
      player.zones[zone],
      `${purposePrefix}:${playerId}`
    );

    rngState = result.rngState;
    randomOperations.push(result.operation);
    players[playerId] = {
      ...player,
      zones: {
        ...player.zones,
        [zone]: result.values
      }
    };
  }

  return {
    game: gameSchema.parse({
      ...game,
      updatedAt: now,
      stateVersion: game.stateVersion + 1,
      canonicalState: {
        ...game.canonicalState,
        rng: rngState,
        players
      }
    }),
    randomOperations
  };
}

function createInitialBattlefieldPools(
  input: CreateGameInput
): Record<string, PlayerBattlefieldPool> {
  return Object.fromEntries(
    input.playerIds.map((playerId) => [
      playerId,
      {
        playerId,
        registeredCardInstanceIds:
          input.battlefieldCardInstanceIdsByPlayer?.[playerId] ?? [],
        usedCardInstanceIds:
          input.usedBattlefieldCardInstanceIdsByPlayer?.[playerId] ?? []
      }
    ])
  );
}

function assertDistinctPlayerIds(playerIds: [string, string]) {
  if (playerIds[0] === playerIds[1]) {
    throw new Error("A game cannot use the same playerId for both players.");
  }
}

function assertSamePlayers(game: Game, previousGame: Game) {
  const currentPlayers = new Set(game.canonicalState.setup.playerIds);
  const previousPlayers = new Set(previousGame.canonicalState.setup.playerIds);

  if (
    currentPlayers.size !== previousPlayers.size ||
    [...currentPlayers].some((playerId) => !previousPlayers.has(playerId))
  ) {
    throw new Error("Current game and previous game must contain the same players.");
  }
}

function assertGamePlayer(game: Game, playerId: string) {
  if (!game.canonicalState.setup.playerIds.includes(playerId)) {
    throw new Error("Player must be one of the game players.");
  }
}

function assertInProgressTurn(game: Game) {
  if (game.status !== "in_progress" || game.canonicalState.turn === null) {
    throw new Error("Game must be in progress.");
  }
}

function assertPositiveCount(count: number) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Count must be a positive integer.");
  }
}

function requireCard(cardsByInstanceId: CardLookup, cardInstanceId: string): Card {
  const card = cardsByInstanceId[cardInstanceId];

  if (!card) {
    throw new Error(`Card metadata was not found for instance: ${cardInstanceId}`);
  }

  return card;
}

function requireSingleRuneDomain(card: Card): string {
  const domains = card.classification.domain.filter((domain) => domain !== "Colorless");

  if (domains.length !== 1) {
    throw new Error("Rune Power generation requires exactly one non-colorless domain.");
  }

  return domains[0]!;
}

function addPower(
  power: Record<string, number>,
  domain: string,
  amount: number
): Record<string, number> {
  return {
    ...power,
    [domain]: (power[domain] ?? 0) + amount
  };
}

function readCardCost(card: Card): {
  energy: number;
  power: PowerRequirement[];
} {
  const energy = card.attributes.energy ?? 0;
  const power = card.attributes.power ?? 0;
  const powerDomains = cardDomainsInMetadataOrder(card.classification.domain);

  if (energy < 0 || power < 0) {
    throw new Error("Negative costs are not supported.");
  }

  if (power > 0 && powerDomains.length === 0) {
    throw new Error("Power costs require at least one card domain.");
  }

  return {
    energy,
    power:
      power === 0
        ? []
        : [
            {
              amount: power,
              payableBy: powerDomains
            }
          ]
  };
}

function buildAutomaticPaymentPlan(
  game: Game,
  playerId: string,
  cost: {
    energy: number;
    power: PowerRequirement[];
  },
  cardsByInstanceId: CardLookup,
  selectedModeId = "regular",
  playKind: "spell" | "unit" = "unit"
): PaymentPlan {
  const player = game.canonicalState.players[playerId]!;
  let remainingEnergy = cost.energy;
  const resourcePayments: ResourcePayment[] = [];
  const recycledRuneCardInstanceIds = new Set<string>();
  const availablePoolPower = { ...player.runePool.power };
  const availableConditionalEnergy = { ...(player.runePool.conditionalEnergy ?? {}) };

  if (playKind === "spell") {
    for (const [restrictionId, entry] of Object.entries(availableConditionalEnergy)) {
      if (remainingEnergy === 0) {
        break;
      }

      if (entry.restriction !== "spell" || entry.amount <= 0) {
        continue;
      }

      const spent = Math.min(entry.amount, remainingEnergy);

      if (spent > 0) {
        resourcePayments.push({
          type: "spendConditionalEnergy",
          amount: spent,
          sourceId: restrictionId,
          restriction: "spell"
        });
        availableConditionalEnergy[restrictionId] = {
          ...entry,
          amount: entry.amount - spent
        };
        remainingEnergy -= spent;
      }
    }
  }

  const spentEnergyFromPool = Math.min(player.runePool.energy, remainingEnergy);

  if (spentEnergyFromPool > 0) {
    resourcePayments.push({
      type: "spendEnergy",
      amount: spentEnergyFromPool
    });
  }

  remainingEnergy -= spentEnergyFromPool;

  for (const runeCardInstanceId of player.zones.base) {
    if (remainingEnergy === 0) {
      break;
    }

    const card = cardsByInstanceId[runeCardInstanceId];
    const state = game.canonicalState.cardStates[runeCardInstanceId] ?? {
      exhausted: false
    };

    if (card?.classification.type === "Rune" && !state.exhausted) {
      resourcePayments.push({
        type: "exhaustRuneForEnergy",
        cardInstanceId: runeCardInstanceId
      });
      remainingEnergy -= 1;
    }
  }

  if (remainingEnergy > 0) {
    throw new Error("Not enough Energy to pay this card's cost.");
  }

  for (const requirement of cost.power) {
    let remainingPower = requirement.amount;
    const poolPayments = spendPowerFromPool(
      availablePoolPower,
      requirement,
      remainingPower
    );

    for (const payment of poolPayments) {
      resourcePayments.push(payment);
      availablePoolPower[payment.domain] =
        (availablePoolPower[payment.domain] ?? 0) - payment.amount;
      remainingPower -= payment.amount;
    }

    if (remainingPower > 0) {
      const runePayments = recycleRunesForPower(
        game,
        playerId,
        requirement,
        remainingPower,
        recycledRuneCardInstanceIds,
        cardsByInstanceId
      );

      for (const payment of runePayments) {
        resourcePayments.push(payment);
        recycledRuneCardInstanceIds.add(payment.cardInstanceId);
        remainingPower -= 1;
      }
    }

    if (remainingPower > 0) {
      throw new Error("Not enough Power to pay this card's cost.");
    }
  }

  return {
    selectedModeId,
    resourceCosts: cost,
    resourcePayments,
    nonResourceCosts: [],
    optionalCostsChosen: [],
    costModifiersApplied: []
  };
}

function applyPaymentPlan(
  game: Game,
  playerId: string,
  payment: PaymentPlan,
  cardsByInstanceId: CardLookup,
  now?: string
): RecycleCardsResult {
  const player = game.canonicalState.players[playerId]!;
  const recycledRuneCardInstanceIds = payment.resourcePayments
    .filter((resourcePayment) => resourcePayment.type === "recycleRuneForPower")
    .map((resourcePayment) => resourcePayment.cardInstanceId);
  const recycledSet = new Set(recycledRuneCardInstanceIds);
  const recycleOrder = orderRecycledCardsForBottom(
    game.canonicalState.rng,
    recycledRuneCardInstanceIds,
    "runeDeck",
    playerId
  );
  const cardStates = { ...game.canonicalState.cardStates };
  const power = { ...player.runePool.power };
  const conditionalEnergy = { ...(player.runePool.conditionalEnergy ?? {}) };
  let energy = player.runePool.energy;

  for (const resourcePayment of payment.resourcePayments) {
    if (resourcePayment.type === "spendEnergy") {
      energy -= resourcePayment.amount;
      continue;
    }

    if (resourcePayment.type === "spendConditionalEnergy") {
      const entry = conditionalEnergy[resourcePayment.sourceId];

      if (entry) {
        conditionalEnergy[resourcePayment.sourceId] = {
          ...entry,
          amount: Math.max(0, entry.amount - resourcePayment.amount)
        };
      }

      continue;
    }

    if (resourcePayment.type === "spendPower") {
      power[resourcePayment.domain] = Math.max(
        0,
        (power[resourcePayment.domain] ?? 0) - resourcePayment.amount
      );
      continue;
    }

    if (resourcePayment.type === "recycleRuneForPower") {
      delete cardStates[resourcePayment.cardInstanceId];
      continue;
    }

    if (resourcePayment.type === "exhaustRuneForEnergy") {
      if (!recycledSet.has(resourcePayment.cardInstanceId)) {
        cardStates[resourcePayment.cardInstanceId] = {
          exhausted: true
        };
      }
    }
  }

  const remainingConditionalEnergy = Object.fromEntries(
    Object.entries(conditionalEnergy).filter(([, entry]) => entry.amount > 0)
  );
  const nextRunePool: RunePool = {
    energy,
    ...(Object.keys(remainingConditionalEnergy).length > 0
      ? { conditionalEnergy: remainingConditionalEnergy }
      : {}),
    power: Object.fromEntries(
      Object.entries(power).filter(([, amount]) => amount > 0)
    )
  };

  return {
    game: gameSchema.parse({
      ...game,
      updatedAt: now ?? new Date().toISOString(),
      canonicalState: {
        ...game.canonicalState,
        cardStates,
        rng: recycleOrder.rngState,
        players: {
          ...game.canonicalState.players,
          [playerId]: {
            ...player,
            runePool: nextRunePool,
            zones: {
              ...player.zones,
              base: player.zones.base.filter(
                (cardInstanceId) => !recycledSet.has(cardInstanceId)
              ),
              runeDeck: [
                ...player.zones.runeDeck,
                ...recycleOrder.cardInstanceIds
              ]
            }
          }
        }
      }
    }),
    randomOperations: recycleOrder.randomOperations
  };
}

function orderRecycledCardsForBottom(
  rngState: Game["canonicalState"]["rng"],
  cardInstanceIds: string[],
  destinationDeck: "mainDeck" | "runeDeck",
  ownerPlayerId: string
): {
  rngState: Game["canonicalState"]["rng"];
  cardInstanceIds: string[];
  randomOperations: RandomOperation[];
} {
  if (cardInstanceIds.length <= 1) {
    return {
      rngState,
      cardInstanceIds,
      randomOperations: []
    };
  }

  const purposeDeck =
    destinationDeck === "mainDeck" ? "main-deck" : "rune-deck";
  const result = shuffleItems(
    rngState,
    cardInstanceIds,
    `recycle-${purposeDeck}:${ownerPlayerId}`
  );

  return {
    rngState: result.rngState,
    cardInstanceIds: result.values,
    randomOperations: [result.operation]
  };
}

function spendPowerFromPool(
  powerPool: Record<string, number>,
  requirement: PowerRequirement,
  maxAmount: number
): Extract<ResourcePayment, { type: "spendPower" }>[] {
  let remaining = maxAmount;
  const payments: Extract<ResourcePayment, { type: "spendPower" }>[] = [];

  for (const domain of payableDomainsInPriorityOrder(requirement)) {
    if (remaining === 0) {
      break;
    }

    const spent = Math.min(powerPool[domain] ?? 0, remaining);

    if (spent > 0) {
      payments.push({
        type: "spendPower",
        domain,
        amount: spent
      });
      remaining -= spent;
    }
  }

  if (remaining > 0) {
    const spentRainbow = Math.min(powerPool[rainbowPower] ?? 0, remaining);

    if (spentRainbow > 0) {
      payments.push({
        type: "spendPower",
        domain: rainbowPower,
        amount: spentRainbow
      });
    }
  }

  return payments;
}

function recycleRunesForPower(
  game: Game,
  playerId: string,
  requirement: PowerRequirement,
  maxAmount: number,
  alreadyRecycled: Set<string>,
  cardsByInstanceId: CardLookup
): Extract<ResourcePayment, { type: "recycleRuneForPower" }>[] {
  const player = game.canonicalState.players[playerId]!;
  let remaining = maxAmount;
  const payments: Extract<ResourcePayment, { type: "recycleRuneForPower" }>[] = [];

  for (const domain of payableDomainsInPriorityOrder(requirement)) {
    if (remaining === 0) {
      break;
    }

    for (const runeCardInstanceId of player.zones.base) {
      if (remaining === 0) {
        break;
      }

      if (alreadyRecycled.has(runeCardInstanceId)) {
        continue;
      }

      const card = cardsByInstanceId[runeCardInstanceId];

      if (!card || card.classification.type !== "Rune") {
        continue;
      }

      const runeDomain = requireSingleRuneDomain(card);

      if (runeDomain === domain) {
        payments.push({
          type: "recycleRuneForPower",
          cardInstanceId: runeCardInstanceId,
          producedDomain: domain
        });
        alreadyRecycled.add(runeCardInstanceId);
        remaining -= 1;
      }
    }
  }

  return payments;
}

function payableDomainsInPriorityOrder(requirement: PowerRequirement): Domain[] {
  return requirement.payableBy === "any" ? [...domains] : requirement.payableBy;
}

function readyPlayerBoardCards(
  cardStates: Record<string, CardObjectState>,
  zones: PlayerZones
): Record<string, CardObjectState> {
  const readyIds = new Set([
    ...(zones.legend === null ? [] : [zones.legend]),
    ...(zones.champion === null ? [] : [zones.champion]),
    ...zones.base
  ]);

  return Object.fromEntries(
    Object.entries(cardStates).map(([cardInstanceId, state]) => [
      cardInstanceId,
      readyIds.has(cardInstanceId) ? { ...state, exhausted: false } : state
    ])
  );
}

function nextRelevantPlayer(relevantPlayerIds: string[], currentPlayerId: string): string {
  const currentIndex = relevantPlayerIds.indexOf(currentPlayerId);

  if (currentIndex === -1) {
    throw new Error("Current focus player must be relevant.");
  }

  return relevantPlayerIds[(currentIndex + 1) % relevantPlayerIds.length]!;
}
