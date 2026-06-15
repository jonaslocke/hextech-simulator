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

export const runePoolSchema = z.object({
  energy: z.number().int().min(0),
  power: z.record(z.string().min(1), z.number().int().min(0))
});

export const cardObjectStateSchema = z.object({
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
  runePool: runePoolSchema.default({ energy: 0, power: {} }),
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

  if (input.destination && input.destination !== "base") {
    throw new Error("Only playing units to base is supported.");
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

  if (card.classification.type !== "Unit") {
    throw new Error("Only Unit card play to base is supported.");
  }

  const profile = getUnitPlayProfile(card);

  if (!profile.supported) {
    throw new Error(profile.reason);
  }

  const payment = buildAutomaticPaymentPlan(
    game,
    input.actorPlayerId,
    readCardCost(card),
    cardsByInstanceId,
    selectedModeId
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
  let zones =
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
        };

  if (profile.onPlay?.type === "draw") {
    if (zones.mainDeck.length < profile.onPlay.count) {
      throw new Error("Burn Out is not implemented for empty Main Deck draws.");
    }

    zones = {
      ...zones,
      mainDeck: zones.mainDeck.slice(profile.onPlay.count),
      hand: [
        ...zones.hand,
        ...zones.mainDeck.slice(0, profile.onPlay.count)
      ]
    };
  }

  return {
    game: gameSchema.parse({
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
            zones
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

    if (!card || card.classification.type !== "Unit") {
      continue;
    }

    try {
      const profile = getUnitPlayProfile(card);

      if (!profile.supported) {
        continue;
      }

      const resourceCosts = readCardCost(card);
      buildAutomaticPaymentPlan(game, playerId, resourceCosts, cardsByInstanceId);
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

export function endTurn(game: Game, input: EndTurnInput): Game {
  assertInProgressTurn(game);
  assertGamePlayer(game, input.actorPlayerId);

  const turn = game.canonicalState.turn!;

  if (turn.activePlayerId !== input.actorPlayerId) {
    throw new Error("Only the active player can end the turn.");
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
  selectedModeId = "regular"
): PaymentPlan {
  const player = game.canonicalState.players[playerId]!;
  let remainingEnergy = cost.energy;
  const resourcePayments: ResourcePayment[] = [];
  const recycledRuneCardInstanceIds = new Set<string>();
  const availablePoolPower = { ...player.runePool.power };

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
  let energy = player.runePool.energy;

  for (const resourcePayment of payment.resourcePayments) {
    if (resourcePayment.type === "spendEnergy") {
      energy -= resourcePayment.amount;
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
            runePool: {
              energy,
              power: Object.fromEntries(
                Object.entries(power).filter(([, amount]) => amount > 0)
              )
            },
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
