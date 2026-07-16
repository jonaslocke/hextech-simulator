import { createHash } from "node:crypto";
import type { DeckId, MatchIntent, MatchProjection } from "@/shared/game";
import { assertLegalRegisteredDeckConfiguration } from "@/server/deck/deck-validation-service";
import { loadDeckSnapshot } from "@/server/services/deck-catalog-service";
import type { Db } from "mongodb";
import type { DamageAssignment } from "./combat";
import type { TokenPlacement } from "./effect-resolution";
import {
  createInitialDeckConfiguration,
  createMatchGame,
  registeredBattlefieldIds,
} from "./game-factory";
import {
  deriveRemainingBattlefieldRegisteredIdsByPlayerId,
  playerWithTwoSetPoints,
} from "./match-derivations";
import { projectMatch } from "./match-projection";
import type {
  DeckSnapshotDocument,
  GameEventDocument,
  GameRepositories,
} from "./repositories";
import { createGameRepositories } from "./repositories";
import { gameplayActions, performGameplayTransition } from "./actions";
import {
  isSetupActionId,
  performSetupAction,
  rebaseSetupActionId,
  setupActions,
} from "./setup";
import {
  createMatchId,
  createPlayerToken,
  createRuntimeDeckSnapshot,
  matchDocumentSchema,
  verifyPlayerToken,
  type DeckRuntimeSnapshot,
  type GameDocument,
  type MatchDocument,
} from "./state";
import type { DeckSnapshot } from "./schemas";

export class MatchServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const deckSnapshotCache = new Map<string, DeckSnapshotDocument>();
const matchDocumentCache = new Map<string, MatchDocument>();
const gameDocumentCache = new Map<string, GameDocument>();
const gameEventsCache = new Map<string, GameEventDocument[]>();

type CreateMatchInput = {
  db: Db;
  repositories: GameRepositories;
  now?: string;
  matchId?: string;
  rngSeed?: string;
  playerDecks?: { player1: DeckId; player2: DeckId };
  deckTemplates?: [DeckSnapshot, DeckSnapshot];
  playerDeckLabels?: { player1: string; player2: string };
  allowCrossDomainCardsByPlayer?: { player1: boolean; player2: boolean };
  playerNames?: {
    player1?: string;
    player2?: string;
  };
};

export async function createMatch(input: CreateMatchInput) {
  const maxAttempts = input.matchId ? 1 : 5;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await createMatchAttempt(input);
    } catch (error) {
      lastError = error;
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new MatchServiceError(
        "match.creationFailed",
        "Unable to allocate a unique match identity.",
      );
}

async function createMatchAttempt(input: CreateMatchInput) {
  const now = input.now ?? new Date().toISOString();
  const matchId = input.matchId ?? createMatchId();
  const selectedDecks = input.playerDecks ?? {
    player1: "lux" as const,
    player2: "lux" as const,
  };
  const selectedPlayerNames = {
    player1: normalizePlayerDisplayName(input.playerNames?.player1, "Player 1"),
    player2: normalizePlayerDisplayName(input.playerNames?.player2, "Player 2"),
  };
  const templates = input.deckTemplates ?? await loadMatchDeckTemplates(input.db, selectedDecks);
  const players = ["player-1", "player-2"] as const;
  const registeredDecks = players.map((id, index) =>
    createRuntimeDeckSnapshot(templates[index]!, id, `${matchId}:${id}:copy`),
  ) as [DeckRuntimeSnapshot, DeckRuntimeSnapshot];
  const tokens = players.map(() => createPlayerToken());
  const deckDocuments = registeredDecks.map(
    (deck, index): DeckSnapshotDocument => ({
      id: `${matchId}:deck:${players[index]}`,
      createdAt: now,
      updatedAt: now,
      matchId,
      playerId: players[index]!,
      snapshot: deck.template,
      instances: deck.instances,
    }),
  ) as [DeckSnapshotDocument, DeckSnapshotDocument];
  const seats = [
    {
      playerId: players[0],
      seat: "player-1" as const,
      tokenHash: tokens[0]!.tokenHash,
      registeredDeckSnapshotId: deckDocuments[0].id,
      displayName: selectedPlayerNames.player1,
      allowCrossDomainCards:
        input.allowCrossDomainCardsByPlayer?.player1 ?? false,
      currentDeckConfiguration: createInitialDeckConfiguration(
        deckDocuments[0].instances,
      ),
    },
    {
      playerId: players[1],
      seat: "player-2" as const,
      tokenHash: tokens[1]!.tokenHash,
      registeredDeckSnapshotId: deckDocuments[1].id,
      displayName: selectedPlayerNames.player2,
      allowCrossDomainCards:
        input.allowCrossDomainCardsByPlayer?.player2 ?? false,
      currentDeckConfiguration: createInitialDeckConfiguration(
        deckDocuments[1].instances,
      ),
    },
  ] as MatchDocument["seats"];
  deckDocuments.forEach((deck, index) => {
    assertLegalRegisteredDeckConfiguration({
      registeredDeck: deck,
      configuration: seats[index]!.currentDeckConfiguration,
      allowCrossDomainCards: seats[index]!.allowCrossDomainCards,
    });
  });
  const registeredDecksByPlayerId = Object.fromEntries(
    deckDocuments.map((deck) => [deck.playerId, deck]),
  );
  const game = createMatchGame({
    matchId,
    gameNumber: 1,
    now,
    players: seats,
    registeredDecksByPlayerId,
    activeConfigurationsByPlayerId: Object.fromEntries(
      seats.map((seat) => [seat.playerId, seat.currentDeckConfiguration]),
    ),
    startingPlayerChooserId:
      players[chooserIndex(input.rngSeed ?? matchId, players.length)]!,
    availableBattlefieldRegisteredIdsByPlayerId: Object.fromEntries(
      deckDocuments.map((deck) => [
        deck.playerId,
        registeredBattlefieldIds(deck.instances),
      ]),
    ),
  });
  const match = matchDocumentSchema.parse({
    id: matchId,
    format: "riftbound-1v1-match",
    status: "playing",
    stateVersion: 0,
    createdAt: now,
    updatedAt: now,
    currentGameId: game.id,
    gameIds: [game.id],
    completedGames: [],
    betweenGames: null,
    completion: null,
    seats,
  });

  await runInTransaction(input.db, async (repositories) => {
    for (const document of deckDocuments) {
      await repositories.deckSnapshots.insert(document);
    }
    await repositories.games.insert(game);
    await repositories.matches.insert(match);
    return true;
  });
  cacheMatchDocument(match);
  cacheGameDocument(game);
  cacheDeckSnapshots(deckDocuments);

  return {
    matchId,
    gameId: game.id,
    players: {
      player1: {
        playerId: players[0],
        seat: "player-1" as const,
        deckId: selectedDecks.player1,
        deckLabel: input.playerDeckLabels?.player1 ?? selectedDecks.player1,
        displayName: selectedPlayerNames.player1,
        playerToken: tokens[0]!.token,
      },
      player2: {
        playerId: players[1],
        seat: "player-2" as const,
        deckId: selectedDecks.player2,
        deckLabel: input.playerDeckLabels?.player2 ?? selectedDecks.player2,
        displayName: selectedPlayerNames.player2,
        playerToken: tokens[1]!.token,
      },
    },
    projections: Object.fromEntries(
      players.map((id) => [
        id,
        projectMatch({
          match,
          currentGame: game,
          viewerPlayerId: id,
          decks: deckDocuments,
        }),
      ]),
    ),
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export async function loadMatchDeckTemplates(
  db: Db,
  playerDecks: { player1: DeckId; player2: DeckId },
  loader = loadDeckSnapshot,
) {
  return Promise.all([
    loader(db, playerDecks.player1),
    loader(db, playerDecks.player2),
  ]);
}

export async function getViewerState(
  repositories: GameRepositories,
  matchId: string,
  playerToken: string,
): Promise<MatchProjection> {
  const { match, game, seat, decks } = await loadContext(
    repositories,
    matchId,
    playerToken,
  );
  const events = await loadGameEventsFromCache(repositories, game.id);
  return projectMatch({
    match,
    currentGame: game,
    viewerPlayerId: seat.playerId,
    decks,
    events,
  });
}

export async function performMatchAction(
  repositories: GameRepositories,
  input: {
    db: Db;
    matchId: string;
    playerToken: string;
    stateVersion: number;
    intent: MatchIntent;
    now?: string;
  },
): Promise<MatchProjection>;
export async function performMatchAction(
  repositories: GameRepositories,
  input: {
    db?: Db;
    matchId: string;
    playerToken: string;
    stateVersion: number;
    actionId: string;
    selectedIds: string[];
    allocations?: DamageAssignment[];
    tokenPlacements?: TokenPlacement[];
    now?: string;
  },
): Promise<MatchProjection>;
export async function performMatchAction(
  repositories: GameRepositories,
  input:
    | {
        db: Db;
        matchId: string;
        playerToken: string;
        stateVersion: number;
        intent: MatchIntent;
        now?: string;
      }
    | {
        db?: Db;
        matchId: string;
        playerToken: string;
        stateVersion: number;
        actionId: string;
        selectedIds: string[];
        allocations?: DamageAssignment[];
        tokenPlacements?: TokenPlacement[];
        now?: string;
      },
) {
  const now = input.now ?? new Date().toISOString();
  const intent =
    "intent" in input
      ? input.intent
      : {
          type: "game.performAction" as const,
          payload: {
            actionId: input.actionId,
            selectedIds: input.selectedIds,
            allocations: input.allocations ?? [],
            tokenPlacements: input.tokenPlacements ?? [],
          },
        };

  if (intent.type === "match.readyForNextGame") {
    if (!("db" in input) || !input.db) {
      throw new MatchServiceError(
        "match.invariantViolation",
        "Database handle is required for match readiness.",
      );
    }
    return readyForNextGame(input.db, input, intent.payload.betweenGamesId, now);
  }

  if (intent.type === "match.concedeMatch") {
    if (!("db" in input) || !input.db) {
      throw new MatchServiceError(
        "match.invariantViolation",
        "Database handle is required for match concession.",
      );
    }
    return concedeMatch(input.db, input, intent.payload.betweenGamesId, now);
  }

  if (intent.type === "match.submitDeckReconfiguration") {
    if (!("db" in input) || !input.db) {
      throw new MatchServiceError(
        "match.invariantViolation",
        "Database handle is required for deck reconfiguration.",
      );
    }
    return submitDeckReconfiguration(
      input.db,
      input,
      intent.payload.betweenGamesId,
      intent.payload.configuration,
      now,
    );
  }

  return performGameAction(
    repositories,
    {
      matchId: input.matchId,
      playerToken: input.playerToken,
      stateVersion: input.stateVersion,
    },
    intent.payload,
    now,
  );
}

export function deckSnapshotIdHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function performGameAction(
  repositories: GameRepositories,
  input: {
    matchId: string;
    playerToken: string;
    stateVersion: number;
    db?: Db;
  },
  payload: {
    actionId: string;
    selectedIds: string[];
    allocations?: DamageAssignment[];
    tokenPlacements?: TokenPlacement[];
  },
  now: string,
): Promise<MatchProjection> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { match, game, seat, decks } = await loadContext(
      repositories,
      input.matchId,
      input.playerToken,
    );
    if (match.status !== "playing") {
      throw new MatchServiceError(
        "match.intentNotAllowed",
        "Game actions are allowed only while the match is playing.",
      );
    }
    const isSetupPending = game.status === "setup_pending";
    const isSetupAction = isSetupPending && isSetupActionId(payload.actionId);

    if (game.stateVersion !== input.stateVersion && !isSetupAction) {
      throw new MatchServiceError(
        "state.gameVersionStale",
        "Game state version is stale.",
      );
    }

    const actionId = isSetupPending
      ? rebaseSetupActionId(game, payload.actionId)
      : payload.actionId;
    const acceptedAction = (
      isSetupPending
        ? setupActions(game, seat.playerId)
        : gameplayActions(game, seat.playerId, decks)
    ).find((action) => action.id === actionId);
    const deckRuntime = runtimeDecksForGame(decks, game, match);
    const transition = isSetupPending
      ? null
      : performGameplayTransition({
          game,
          actorPlayerId: seat.playerId,
          actionId,
          selectedIds: payload.selectedIds,
          allocations: payload.allocations,
          tokenPlacements: payload.tokenPlacements,
          decks,
          now,
        });
    const next = transition
      ? normalizeCompletedGame(transition.game)
      : performSetupAction({
          game,
          actorPlayerId: seat.playerId,
          actionId,
          selectedIds: payload.selectedIds,
          decksByPlayerId: deckRuntime,
          now,
        });
    const transitionEvents = transition?.events ?? [
      {
        type: `game.action.${actionId.split(":")[3] ?? "accepted"}`,
        actorPlayerId: seat.playerId,
        message: `${seat.playerId}: ${acceptedAction?.label ?? "Action accepted"}`,
        payload: { actionId },
      },
    ];

    const saveResult = input.db
      ? await runInTransaction(input.db, async (transactionRepositories) =>
          saveGameTransition({
            repositories: transactionRepositories,
            match,
            beforeGame: game,
            nextGame: next,
            decks,
            events: transitionEvents,
            now,
          }),
        )
      : await saveGameTransition({
          repositories,
          match,
          beforeGame: game,
          nextGame: next,
          decks,
          events: transitionEvents,
          now,
        });

    if (!saveResult.saved) {
      if (isSetupAction) continue;
      throw new MatchServiceError(
        "state.gameVersionStale",
        "Game state version is stale.",
      );
    }

    const events = await loadGameEventsFromCache(
      repositories,
      saveResult.currentGame.id,
    );
    return projectMatch({
      match: saveResult.match,
      currentGame: saveResult.currentGame,
      viewerPlayerId: seat.playerId,
      decks,
      events,
    });
  }

  throw new MatchServiceError(
    "state.gameVersionStale",
    "Game state version is stale.",
  );
}

async function saveGameTransition(input: {
  repositories: GameRepositories;
  match: MatchDocument;
  beforeGame: GameDocument;
  nextGame: GameDocument;
  decks: DeckSnapshotDocument[];
  events: Array<{
    type: string;
    actorPlayerId: string | null;
    message: string;
    payload?: Record<string, string | number | boolean | null>;
  }>;
  now: string;
}): Promise<{ saved: boolean; match: MatchDocument; currentGame: GameDocument }> {
  const saved = await input.repositories.games.upsertIfStateVersion(
    input.nextGame,
    input.beforeGame.stateVersion,
  );
  if (!saved) {
    return { saved: false, match: input.match, currentGame: input.beforeGame };
  }

  let nextMatch = input.match;
  let currentGame = input.nextGame;
  if (input.nextGame.status === "complete") {
    nextMatch = recordCompletedGame(input.match, input.nextGame, input.decks, input.now);
  }

  if (nextMatch !== input.match) {
    const matchSaved = await input.repositories.matches.upsertIfStateVersion(
      nextMatch,
      input.match.stateVersion,
    );
    if (!matchSaved) {
      throw new MatchServiceError(
        "match.betweenGamesChanged",
        "Match state changed while recording the completed game.",
      );
    }
  }

  await Promise.all(
    input.events.map((event, eventIndex) =>
      input.repositories.gameEvents.insert({
        id: `${input.nextGame.id}:event:${input.nextGame.stateVersion}:${eventIndex}`,
        createdAt: input.now,
        updatedAt: input.now,
        matchId: input.match.id,
        gameId: input.nextGame.id,
        sequence: input.nextGame.stateVersion * 100 + eventIndex,
        actionVersion: input.nextGame.stateVersion,
        eventIndex,
        actorPlayerId: event.actorPlayerId,
        type: event.type,
        message: event.message,
        payload: event.payload,
      }),
    ),
  );
  // Game events are appended with every state transition. The next projection
  // must reload the log once, while polling requests can reuse it safely.
  gameEventsCache.delete(input.nextGame.id);

  if (nextMatch.currentGameId !== input.nextGame.id) {
    const loaded = await input.repositories.games.findById(nextMatch.currentGameId);
    if (loaded) currentGame = loaded;
  }

  cacheGameDocument(currentGame);
  cacheMatchDocument(nextMatch);
  return { saved: true, match: nextMatch, currentGame };
}

async function readyForNextGame(
  db: Db,
  input: { matchId: string; playerToken: string; stateVersion: number },
  betweenGamesId: string,
  now: string,
): Promise<MatchProjection> {
  return runInTransaction(db, async (repositories) => {
    const { match, game, seat, decks } = await loadContext(
      repositories,
      input.matchId,
      input.playerToken,
    );
    if (match.status !== "between_games" || !match.betweenGames) {
      throw new MatchServiceError(
        "match.intentNotAllowed",
        "Readiness is allowed only between games.",
      );
    }
    if (match.stateVersion !== input.stateVersion) {
      throw new MatchServiceError(
        "match.betweenGamesChanged",
        "Between-games state has changed.",
      );
    }
    if (match.betweenGames.id !== betweenGamesId) {
      throw new MatchServiceError(
        "match.betweenGamesChanged",
        "Between-games state has changed.",
      );
    }
    const currentSubmission =
      match.betweenGames.submissionsByPlayerId[seat.playerId];
    if (currentSubmission?.status === "submitted") {
      throw new MatchServiceError(
        "match.alreadyReady",
        "Player is already ready for the next game.",
      );
    }

    const updatedBetweenGames = {
      ...match.betweenGames,
      submissionsByPlayerId: {
        ...match.betweenGames.submissionsByPlayerId,
        [seat.playerId]: {
          status: "submitted" as const,
          configuration: seat.currentDeckConfiguration,
          submittedAt: now,
        },
      },
    };
    const allSubmitted = match.seats.every(
      (item) =>
        updatedBetweenGames.submissionsByPlayerId[item.playerId]?.status ===
        "submitted",
    );
    let nextMatch: MatchDocument;
    let currentGame = game;

    if (allSubmitted) {
      if (match.gameIds.length >= 3) {
        throw new MatchServiceError(
          "match.nextGameAlreadyCreated",
          "No additional games can be created for this match.",
        );
      }

      const remainingBattlefields =
        deriveRemainingBattlefieldRegisteredIdsByPlayerId(match, decks);
      const activeConfigurations = Object.fromEntries(
        match.seats.map((item) => [
          item.playerId,
          updatedBetweenGames.submissionsByPlayerId[item.playerId]!
            .configuration ?? item.currentDeckConfiguration,
        ]),
      );
      const nextSeats = match.seats.map((item) => ({
        ...item,
        currentDeckConfiguration: activeConfigurations[item.playerId]!,
      })) as MatchDocument["seats"];
      const nextGame = createMatchGame({
        matchId: match.id,
        gameNumber: updatedBetweenGames.nextGameNumber,
        now,
        players: nextSeats,
        registeredDecksByPlayerId: Object.fromEntries(
          decks.map((deck) => [deck.playerId, deck]),
        ),
        activeConfigurationsByPlayerId: activeConfigurations,
        startingPlayerChooserId:
          updatedBetweenGames.nextStartingPlayerChooserId,
        availableBattlefieldRegisteredIdsByPlayerId: remainingBattlefields,
        autoSelectedBattlefieldRegisteredIdByPlayerId:
          updatedBetweenGames.nextGameNumber === 3
            ? Object.fromEntries(
                match.seats.map((item) => {
                  const remaining = remainingBattlefields[item.playerId] ?? [];
                  if (remaining.length !== 1) {
                    throw new MatchServiceError(
                      "match.invariantViolation",
                      "Game 3 requires exactly one remaining Battlefield per player.",
                    );
                  }
                  return [item.playerId, remaining[0]!];
                }),
              )
            : undefined,
      });
      nextMatch = matchDocumentSchema.parse({
        ...match,
        status: "playing",
        stateVersion: match.stateVersion + 1,
        updatedAt: now,
        currentGameId: nextGame.id,
        gameIds: [...match.gameIds, nextGame.id],
        betweenGames: null,
        seats: nextSeats,
      });
      await repositories.games.insert(nextGame);
      currentGame = nextGame;
    } else {
      nextMatch = matchDocumentSchema.parse({
        ...match,
        stateVersion: match.stateVersion + 1,
        updatedAt: now,
        betweenGames: updatedBetweenGames,
      });
    }

    const saved = await repositories.matches.upsertIfStateVersion(
      nextMatch,
      match.stateVersion,
    );
    if (!saved) {
      throw new MatchServiceError(
        "match.betweenGamesChanged",
        "Between-games state has changed.",
      );
    }

    await repositories.gameEvents.insert({
      id: `${match.id}:match-event:${nextMatch.stateVersion}:ready:${seat.playerId}`,
      createdAt: now,
      updatedAt: now,
      matchId: match.id,
      gameId: game.id,
      sequence: nextMatch.stateVersion * 100,
      actorPlayerId: seat.playerId,
      type: allSubmitted ? "match.nextGameCreated" : "match.playerReady",
      message: allSubmitted
        ? `Game ${nextMatch.gameIds.length} created.`
        : `${seat.playerId} is ready for the next game.`,
      payload: {
        playerId: seat.playerId,
        betweenGamesId,
      },
    });

    gameEventsCache.delete(game.id);
    gameEventsCache.delete(currentGame.id);

    cacheGameDocument(currentGame);
    cacheMatchDocument(nextMatch);
    return projectMatch({
      match: nextMatch,
      currentGame,
      viewerPlayerId: seat.playerId,
      decks,
      events: await loadGameEventsFromCache(repositories, currentGame.id),
    });
  });
}

async function submitDeckReconfiguration(
  db: Db,
  input: { matchId: string; playerToken: string; stateVersion: number },
  betweenGamesId: string,
  configuration: MatchDocument["seats"][number]["currentDeckConfiguration"],
  now: string,
): Promise<MatchProjection> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await submitDeckReconfigurationAttempt(
        db,
        input,
        betweenGamesId,
        configuration,
        now,
      );
    } catch (error) {
      if (
        attempt === 0 &&
        error instanceof MatchServiceError &&
        error.code === "match.betweenGamesChanged"
      ) {
        // A concurrent request may have refreshed this process's cache, but a
        // retry must always re-read the committed intermission state.
        matchDocumentCache.delete(input.matchId);
        continue;
      }
      throw error;
    }
  }

  throw new MatchServiceError(
    "match.betweenGamesChanged",
    "Between-games state has changed.",
  );
}

async function submitDeckReconfigurationAttempt(
  db: Db,
  input: { matchId: string; playerToken: string; stateVersion: number },
  betweenGamesId: string,
  configuration: MatchDocument["seats"][number]["currentDeckConfiguration"],
  now: string,
): Promise<MatchProjection> {
  return runInTransaction(db, async (repositories) => {
    const { match, game, seat, decks } = await loadContext(
      repositories,
      input.matchId,
      input.playerToken,
    );
    if (match.status !== "between_games" || !match.betweenGames) {
      throw new MatchServiceError(
        "match.intentNotAllowed",
        "Deck reconfiguration is allowed only between games.",
      );
    }
    // Both players submit independent deck configurations. The intermission ID
    // is the authoritative boundary: a stale match version caused only by the
    // opponent's submission is safe to merge, while a different or completed
    // intermission remains rejected below.
    if (match.betweenGames.id !== betweenGamesId) {
      throw new MatchServiceError(
        "match.betweenGamesChanged",
        "Between-games state has changed.",
      );
    }
    const currentSubmission =
      match.betweenGames.submissionsByPlayerId[seat.playerId];
    if (currentSubmission?.status === "submitted") {
      throw new MatchServiceError(
        "match.alreadyReady",
        "Player has already submitted for the next game.",
      );
    }

    const registeredDeck = decks.find((deck) => deck.playerId === seat.playerId);
    if (!registeredDeck) {
      throw new MatchServiceError(
        "match.invariantViolation",
        "Registered deck snapshot is unavailable.",
      );
    }

    try {
      assertLegalRegisteredDeckConfiguration({
        registeredDeck,
        configuration,
        allowCrossDomainCards: seat.allowCrossDomainCards,
      });
    } catch (error) {
      throw new MatchServiceError(
        "deck.illegalConfiguration",
        error instanceof Error
          ? error.message
          : "Deck configuration is not legal.",
      );
    }

    const updatedBetweenGames = {
      ...match.betweenGames,
      submissionsByPlayerId: {
        ...match.betweenGames.submissionsByPlayerId,
        [seat.playerId]: {
          status: "submitted" as const,
          configuration,
          submittedAt: now,
        },
      },
    };
    const allSubmitted = match.seats.every(
      (item) =>
        updatedBetweenGames.submissionsByPlayerId[item.playerId]?.status ===
        "submitted",
    );
    let nextMatch: MatchDocument;
    let currentGame = game;

    if (allSubmitted) {
      if (match.gameIds.length >= 3) {
        throw new MatchServiceError(
          "match.nextGameAlreadyCreated",
          "No additional games can be created for this match.",
        );
      }

      const remainingBattlefields =
        deriveRemainingBattlefieldRegisteredIdsByPlayerId(match, decks);
      const activeConfigurations = Object.fromEntries(
        match.seats.map((item) => [
          item.playerId,
          updatedBetweenGames.submissionsByPlayerId[item.playerId]!
            .configuration ?? item.currentDeckConfiguration,
        ]),
      );
      const nextSeats = match.seats.map((item) => ({
        ...item,
        currentDeckConfiguration: activeConfigurations[item.playerId]!,
      })) as MatchDocument["seats"];
      const nextGame = createMatchGame({
        matchId: match.id,
        gameNumber: updatedBetweenGames.nextGameNumber,
        now,
        players: nextSeats,
        registeredDecksByPlayerId: Object.fromEntries(
          decks.map((deck) => [deck.playerId, deck]),
        ),
        activeConfigurationsByPlayerId: activeConfigurations,
        startingPlayerChooserId:
          updatedBetweenGames.nextStartingPlayerChooserId,
        availableBattlefieldRegisteredIdsByPlayerId: remainingBattlefields,
        autoSelectedBattlefieldRegisteredIdByPlayerId:
          updatedBetweenGames.nextGameNumber === 3
            ? Object.fromEntries(
                match.seats.map((item) => {
                  const remaining = remainingBattlefields[item.playerId] ?? [];
                  if (remaining.length !== 1) {
                    throw new MatchServiceError(
                      "match.invariantViolation",
                      "Game 3 requires exactly one remaining Battlefield per player.",
                    );
                  }
                  return [item.playerId, remaining[0]!];
                }),
              )
            : undefined,
      });
      nextMatch = matchDocumentSchema.parse({
        ...match,
        status: "playing",
        stateVersion: match.stateVersion + 1,
        updatedAt: now,
        currentGameId: nextGame.id,
        gameIds: [...match.gameIds, nextGame.id],
        betweenGames: null,
        seats: nextSeats,
      });
      await repositories.games.insert(nextGame);
      currentGame = nextGame;
    } else {
      nextMatch = matchDocumentSchema.parse({
        ...match,
        stateVersion: match.stateVersion + 1,
        updatedAt: now,
        betweenGames: updatedBetweenGames,
      });
    }

    const saved = await repositories.matches.upsertIfStateVersion(
      nextMatch,
      match.stateVersion,
    );
    if (!saved) {
      throw new MatchServiceError(
        "match.betweenGamesChanged",
        "Between-games state has changed.",
      );
    }

    await repositories.gameEvents.insert({
      id: `${match.id}:match-event:${nextMatch.stateVersion}:sideboard:${seat.playerId}`,
      createdAt: now,
      updatedAt: now,
      matchId: match.id,
      gameId: game.id,
      sequence: nextMatch.stateVersion * 100,
      actorPlayerId: seat.playerId,
      type: allSubmitted ? "match.nextGameCreated" : "match.playerReady",
      message: allSubmitted
        ? `Game ${nextMatch.gameIds.length} created.`
        : `${seat.playerId} completed sideboarding.`,
      payload: {
        playerId: seat.playerId,
        betweenGamesId,
      },
    });

    gameEventsCache.delete(game.id);
    gameEventsCache.delete(currentGame.id);

    cacheGameDocument(currentGame);
    cacheMatchDocument(nextMatch);
    return projectMatch({
      match: nextMatch,
      currentGame,
      viewerPlayerId: seat.playerId,
      decks,
      events: await loadGameEventsFromCache(repositories, currentGame.id),
    });
  });
}

async function concedeMatch(
  db: Db,
  input: { matchId: string; playerToken: string; stateVersion: number },
  betweenGamesId: string,
  now: string,
): Promise<MatchProjection> {
  return runInTransaction(db, async (repositories) => {
    const { match, game, seat, decks } = await loadContext(
      repositories,
      input.matchId,
      input.playerToken,
    );
    if (match.status !== "between_games" || !match.betweenGames) {
      throw new MatchServiceError(
        "match.intentNotAllowed",
        "Match concession is allowed only between games.",
      );
    }
    if (
      match.stateVersion !== input.stateVersion ||
      match.betweenGames.id !== betweenGamesId
    ) {
      throw new MatchServiceError(
        "match.betweenGamesChanged",
        "Between-games state has changed.",
      );
    }

    const winnerPlayerId = match.seats.find(
      (item) => item.playerId !== seat.playerId,
    )!.playerId;
    const nextMatch = matchDocumentSchema.parse({
      ...match,
      status: "complete",
      stateVersion: match.stateVersion + 1,
      updatedAt: now,
      betweenGames: null,
      completion: {
        reason: "match_concession",
        winnerPlayerId,
        concededByPlayerId: seat.playerId,
        completedAt: now,
      },
    });
    const saved = await repositories.matches.upsertIfStateVersion(
      nextMatch,
      match.stateVersion,
    );
    if (!saved) {
      throw new MatchServiceError(
        "match.betweenGamesChanged",
        "Between-games state has changed.",
      );
    }
    await repositories.gameEvents.insert({
      id: `${match.id}:match-event:${nextMatch.stateVersion}:concede:${seat.playerId}`,
      createdAt: now,
      updatedAt: now,
      matchId: match.id,
      gameId: game.id,
      sequence: nextMatch.stateVersion * 100,
      actorPlayerId: seat.playerId,
      type: "match.conceded",
      message: `${seat.playerId} conceded the match.`,
      payload: { winnerPlayerId, concededByPlayerId: seat.playerId },
    });

    gameEventsCache.delete(game.id);

    cacheMatchDocument(nextMatch);
    return projectMatch({
      match: nextMatch,
      currentGame: game,
      viewerPlayerId: seat.playerId,
      decks,
      events: await loadGameEventsFromCache(repositories, game.id),
    });
  });
}

function recordCompletedGame(
  match: MatchDocument,
  game: GameDocument,
  decks: DeckSnapshotDocument[],
  now: string,
): MatchDocument {
  if (match.completedGames.some((completed) => completed.gameId === game.id)) {
    return match;
  }
  if (!game.winnerPlayerId || game.status !== "complete") {
    throw new MatchServiceError(
      "match.invariantViolation",
      "Only complete games with a winner can be recorded.",
    );
  }
  const loserPlayerId = game.state.setup.playerIds.find(
    (id) => id !== game.winnerPlayerId,
  );
  if (!loserPlayerId) {
    throw new MatchServiceError(
      "match.invariantViolation",
      "Completed game loser could not be derived.",
    );
  }
  if (!game.state.setup.startingPlayerId) {
    throw new MatchServiceError(
      "match.invariantViolation",
      "Completed game has no starting player.",
    );
  }

  const completedGames = [
    ...match.completedGames,
    {
      gameId: game.id,
      gameNumber: game.gameNumber,
      winnerPlayerId: game.winnerPlayerId,
      loserPlayerId,
      startingPlayerChooserId: game.state.setup.startingPlayerChooserId,
      startingPlayerId: game.state.setup.startingPlayerId,
      battlefieldRegisteredCardIdByPlayerId:
        battlefieldRegisteredIdsByPlayer(game, decks),
      completionReason: game.completionReason ?? "victory",
      completedAt: now,
    },
  ];
  const candidate = matchDocumentSchema.parse({
    ...match,
    completedGames,
  });
  const setWinner = playerWithTwoSetPoints(candidate);
  if (setWinner) {
    return matchDocumentSchema.parse({
      ...candidate,
      status: "complete",
      stateVersion: match.stateVersion + 1,
      updatedAt: now,
      betweenGames: null,
      completion: {
        reason: "two_set_points",
        winnerPlayerId: setWinner,
        completedAt: now,
      },
    });
  }

  const nextGameNumber = (game.gameNumber + 1) as 2 | 3;
  if (nextGameNumber > 3) {
    throw new MatchServiceError(
      "match.invariantViolation",
      "A fourth game cannot be created.",
    );
  }

  return matchDocumentSchema.parse({
    ...candidate,
    status: "between_games",
    stateVersion: match.stateVersion + 1,
    updatedAt: now,
    betweenGames: {
      id: `${match.id}:between:${game.id}`,
      afterGameId: game.id,
      nextGameNumber,
      previousGameWinnerPlayerId: game.winnerPlayerId,
      previousGameLoserPlayerId: loserPlayerId,
      nextStartingPlayerChooserId: loserPlayerId,
      submissionsByPlayerId: Object.fromEntries(
        match.seats.map((seat) => [
          seat.playerId,
          { status: "pending", configuration: null, submittedAt: null },
        ]),
      ),
    },
  });
}

function battlefieldRegisteredIdsByPlayer(
  game: GameDocument,
  decks: DeckSnapshotDocument[],
): Record<string, string> {
  const instances = new Map([
    ...decks.flatMap((deck) =>
      deck.instances.map((instance) => [instance.instanceId, instance] as const),
    ),
    ...(game.state.createdCardInstances ?? []).map(
      (instance) => [instance.instanceId, instance] as const,
    ),
  ]);

  return Object.fromEntries(
    game.state.setup.playerIds.map((playerId) => {
      const selected =
        game.state.setup.battlefieldChoices[playerId]?.cardInstanceId;
      const registeredCardId = selected
        ? instances.get(selected)?.registeredCardId
        : null;
      if (!registeredCardId) {
        throw new MatchServiceError(
          "match.invariantViolation",
          "Completed game is missing a registered Battlefield selection.",
        );
      }

      return [playerId, registeredCardId];
    }),
  );
}

function normalizeCompletedGame(game: GameDocument): GameDocument {
  if (game.status !== "complete" || game.completionReason) {
    return game;
  }

  return { ...game, completionReason: "victory" };
}

async function loadContext(
  repositories: GameRepositories,
  matchId: string,
  token: string,
) {
  const match = await loadMatchDocumentFromCache(repositories, matchId);
  if (!match) {
    throw new MatchServiceError("match.notFound", "Match was not found.");
  }
  const seat = match.seats.find((candidate) =>
    verifyPlayerToken(token, candidate.tokenHash),
  );
  if (!seat) {
    throw new MatchServiceError(
      "match.invalidPlayerToken",
      "Player token is invalid for this match.",
    );
  }
  const [game, decks] = await Promise.all([
    loadGameDocumentFromCache(repositories, match.currentGameId),
    Promise.all(
      match.seats.map((item) =>
        loadDeckSnapshotFromCache(
          repositories,
          item.registeredDeckSnapshotId,
        ),
      ),
    ),
  ]);
  if (!game) {
    throw new MatchServiceError("match.notFound", "Game was not found.");
  }
  const resolvedDecks = decks.filter(
    (item): item is DeckSnapshotDocument => item !== null,
  );
  if (resolvedDecks.length !== 2) {
    throw new MatchServiceError(
      "match.invariantViolation",
      "Deck snapshots are unavailable.",
    );
  }

  return { match, seat, game, decks: resolvedDecks };
}

async function loadMatchDocumentFromCache(
  repositories: GameRepositories,
  id: string,
): Promise<MatchDocument | null> {
  const cached = matchDocumentCache.get(id);
  if (cached) return structuredClone(cached);

  const match = await repositories.matches.findById(id);
  if (match) cacheMatchDocument(match);
  return match;
}

async function loadGameDocumentFromCache(
  repositories: GameRepositories,
  id: string,
): Promise<GameDocument | null> {
  const cached = gameDocumentCache.get(id);
  if (cached) return structuredClone(cached);

  const game = await repositories.games.findById(id);
  if (game) cacheGameDocument(game);
  return game;
}

async function loadDeckSnapshotFromCache(
  repositories: GameRepositories,
  id: string,
): Promise<DeckSnapshotDocument | null> {
  const cached = deckSnapshotCache.get(id);
  if (cached) return cached;

  const deck = await repositories.deckSnapshots.findById(id);
  if (deck) deckSnapshotCache.set(id, deck);
  return deck;
}

async function loadGameEventsFromCache(
  repositories: GameRepositories,
  gameId: string,
): Promise<GameEventDocument[]> {
  const cached = gameEventsCache.get(gameId);
  if (cached) return cached;

  const events = await repositories.gameEvents.findByGameId(gameId);
  gameEventsCache.set(gameId, events);
  return events;
}

function cacheDeckSnapshots(decks: readonly DeckSnapshotDocument[]): void {
  for (const deck of decks) {
    deckSnapshotCache.set(deck.id, deck);
  }
}

function cacheMatchDocument(match: MatchDocument): void {
  matchDocumentCache.set(match.id, structuredClone(match));
}

function cacheGameDocument(game: GameDocument): void {
  gameDocumentCache.set(game.id, structuredClone(game));
}

async function runInTransaction<T>(
  db: Db,
  callback: (repositories: GameRepositories) => Promise<T>,
): Promise<T> {
  const session = db.client.startSession();
  let result: T | undefined;
  try {
    await session.withTransaction(async () => {
      result = await callback(createGameRepositories(db, session));
    });
  } finally {
    await session.endSession();
  }
  if (result === undefined) {
    throw new MatchServiceError(
      "match.invariantViolation",
      "Transaction did not produce a result.",
    );
  }

  return result;
}

function runtimeDecksForGame(
  decks: readonly DeckSnapshotDocument[],
  game: GameDocument,
  match: MatchDocument,
): Record<string, DeckRuntimeSnapshot> {
  return Object.fromEntries(
    decks.map((deck) => {
      const seat = match.seats.find((item) => item.playerId === deck.playerId);
      const chosenChampionRegisteredCardId =
        seat?.currentDeckConfiguration.chosenChampionRegisteredCardId;
      return [
        deck.playerId,
        {
          template: deck.snapshot,
          instances: [
            ...deck.instances
              .filter(
                (instance) =>
                  instance.ownerPlayerId === deck.playerId &&
                  Boolean(game.state.cardStates[instance.instanceId]),
              )
              .map((instance) =>
                instance.registeredCardId === chosenChampionRegisteredCardId
                  ? { ...instance, source: "champion" as const }
                  : instance,
              ),
            ...(game.state.createdCardInstances ?? []).filter(
              (instance) => instance.ownerPlayerId === deck.playerId,
            ),
          ],
        },
      ] as const;
    }),
  );
}

function chooserIndex(seed: string, playerCount: number): number {
  return createHash("sha256").update(seed).digest()[0]! % playerCount;
}

function normalizePlayerDisplayName(
  value: string | undefined,
  fallback: string,
) {
  const normalized = value?.trim().replace(/\s+/g, " ").slice(0, 32);

  return normalized || fallback;
}
