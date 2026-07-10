import { createHash } from "node:crypto";
import type { GameProjection } from "../../shared/game";
import type { DeckId } from "@/shared/game";
import { loadDeckSnapshot } from "@/server/services/deck-catalog-service";
import type { DeckSnapshotDocument, GameRepositories } from "./repositories";
import {
  isSetupActionId,
  performSetupAction,
  rebaseSetupActionId,
  setupActions,
} from "./setup";
import { gameplayActions, performGameplayTransition } from "./actions";
import type { TokenPlacement } from "./effect-resolution";
import { projectGame } from "./projection";
import {
  createInitialGame,
  createMatchId,
  createPlayerToken,
  createRuntimeDeckSnapshot,
  verifyPlayerToken,
  type DeckRuntimeSnapshot,
  type MatchDocument,
} from "./state";
import type { Db } from "mongodb";
import type { DamageAssignment } from "./combat";

export async function createMatch(input: {
  db: Db;
  repositories: GameRepositories;
  now?: string;
  matchId?: string;
  rngSeed?: string;
  playerDecks?: { player1: DeckId; player2: DeckId };
  playerNames?: {
    player1?: string;
    player2?: string;
  };
}) {
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
  const templates = await loadMatchDeckTemplates(input.db, selectedDecks);
  const players = ["player-1", "player-2"] as const;
  const runtimeDecks = players.map((id, index) =>
    createRuntimeDeckSnapshot(templates[index]!, id),
  ) as [DeckRuntimeSnapshot, DeckRuntimeSnapshot];
  const tokens = players.map(() => createPlayerToken());
  const deckDocuments = runtimeDecks.map(
    (deck, index): DeckSnapshotDocument => ({
      id: `${matchId}:deck:${players[index]}`,
      createdAt: now,
      updatedAt: now,
      matchId,
      playerId: players[index]!,
      snapshot: deck.template,
      instances: deck.instances,
    }),
  );
  const game = createInitialGame({
    matchId,
    now,
    rngSeed: input.rngSeed ?? matchId,
    playerIds: [...players],
    decks: runtimeDecks,
  });
  const match: MatchDocument = {
    id: matchId,
    createdAt: now,
    updatedAt: now,
    status: "setup_pending",
    currentGameId: game.id,
    seats: [
      {
        playerId: players[0]!,
        seat: "player-1",
        tokenHash: tokens[0]!.tokenHash,
        deckSnapshotId: deckDocuments[0]!.id,
        displayName: selectedPlayerNames.player1,
      },
      {
        playerId: players[1]!,
        seat: "player-2",
        tokenHash: tokens[1]!.tokenHash,
        deckSnapshotId: deckDocuments[1]!.id,
        displayName: selectedPlayerNames.player2,
      },
    ],
  };
  const playerNamesById = {
    [players[0]]: selectedPlayerNames.player1,
    [players[1]]: selectedPlayerNames.player2,
  };
  await Promise.all([
    ...deckDocuments.map((document) =>
      input.repositories.deckSnapshots.insert(document),
    ),
    input.repositories.games.insert(game),
    input.repositories.matches.insert(match),
  ]);
  return {
    matchId,
    gameId: game.id,
    players: {
      player1: {
        playerId: players[0],
        seat: "player-1" as const,
        deckId: selectedDecks.player1,
        playerToken: tokens[0]!.token,
      },
      player2: {
        playerId: players[1],
        seat: "player-2" as const,
        deckId: selectedDecks.player2,
        playerToken: tokens[1]!.token,
      },
    },
    projections: Object.fromEntries(
      players.map((id) => [
        id,
        projectGame({
          game,
          viewerPlayerId: id,
          decks: deckDocuments,
          playerNames: playerNamesById,
        }),
      ]),
    ),
  };
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
): Promise<GameProjection> {
  const { match, game, seat, decks } = await loadContext(
    repositories,
    matchId,
    playerToken,
  );
  const events = await repositories.gameEvents.findByGameId(game.id);
  void match;
  return projectGame({
    game,
    viewerPlayerId: seat.playerId,
    decks,
    events,
    playerNames: playerNamesFromMatch(match),
  });
}

export async function performMatchAction(
  repositories: GameRepositories,
  input: {
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

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { match, game, seat, decks } = await loadContext(
      repositories,
      input.matchId,
      input.playerToken,
    );
    const isSetupPending = game.status === "setup_pending";
    const isSetupAction = isSetupPending && isSetupActionId(input.actionId);

    if (game.stateVersion !== input.stateVersion && !isSetupAction) {
      throw new Error("Game state version is stale.");
    }

    const actionId = isSetupPending
      ? rebaseSetupActionId(game, input.actionId)
      : input.actionId;
    const deckRuntime = Object.fromEntries(
      decks.map((deck) => [
        deck.playerId,
        { template: deck.snapshot, instances: deck.instances },
      ]),
    );
    const acceptedAction = (
      isSetupPending
        ? setupActions(game, seat.playerId)
        : gameplayActions(game, seat.playerId, decks)
    ).find((action) => action.id === actionId);
    const transition = isSetupPending
      ? null
      : performGameplayTransition({
          game,
          actorPlayerId: seat.playerId,
          actionId,
          selectedIds: input.selectedIds,
          allocations: input.allocations,
          tokenPlacements: input.tokenPlacements,
          decks,
          now,
        });
    const next = transition
      ? transition.game
      : performSetupAction({
          game,
          actorPlayerId: seat.playerId,
          actionId,
          selectedIds: input.selectedIds,
          decksByPlayerId: deckRuntime,
          now,
        });
    const saved = await repositories.games.upsertIfStateVersion(
      next,
      game.stateVersion,
    );

    if (!saved) {
      if (isSetupAction) continue;
      throw new Error("Game state version is stale.");
    }

    const nextMatch =
      next.status === "complete"
        ? { ...match, status: "complete" as const, updatedAt: now }
        : next.status === "in_progress"
          ? { ...match, status: "in_progress" as const, updatedAt: now }
          : match;
    const transitionEvents = transition?.events ?? [
      {
        type: `game.action.${actionId.split(":")[3] ?? "accepted"}`,
        actorPlayerId: seat.playerId,
        message: `${seat.playerId}: ${acceptedAction?.label ?? "Action accepted"}`,
        payload: { actionId },
      },
    ];

    await Promise.all([
      repositories.matches.upsert(nextMatch),
      ...transitionEvents.map((event, eventIndex) =>
        repositories.gameEvents.insert({
          id: `${next.id}:event:${next.stateVersion}:${eventIndex}`,
          createdAt: now,
          updatedAt: now,
          matchId: match.id,
          gameId: next.id,
          sequence: next.stateVersion * 100 + eventIndex,
          actionVersion: next.stateVersion,
          eventIndex,
          actorPlayerId: event.actorPlayerId,
          type: event.type,
          message: event.message,
          payload: event.payload,
        }),
      ),
    ]);
    const events = await repositories.gameEvents.findByGameId(next.id);
    return projectGame({
      game: next,
      viewerPlayerId: seat.playerId,
      decks,
      events,
      playerNames: playerNamesFromMatch(nextMatch),
    });
  }

  throw new Error("Game state version is stale.");
}

async function loadContext(
  repositories: GameRepositories,
  matchId: string,
  token: string,
) {
  const match = await repositories.matches.findById(matchId);
  if (!match) throw new Error("Match was not found.");
  const seat = match.seats.find((candidate) =>
    verifyPlayerToken(token, candidate.tokenHash),
  );
  if (!seat) throw new Error("Player token is invalid for this match.");
  const game = await repositories.games.findById(match.currentGameId);
  if (!game) throw new Error("Game was not found.");
  const decks = (
    await Promise.all(
      match.seats.map((item) =>
        repositories.deckSnapshots.findById(item.deckSnapshotId),
      ),
    )
  ).filter((item): item is DeckSnapshotDocument => item !== null);
  if (decks.length !== 2) throw new Error("Deck snapshots are unavailable.");
  return { match, seat, game, decks };
}

export function deckSnapshotIdHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePlayerDisplayName(
  value: string | undefined,
  fallback: string,
) {
  const normalized = value?.trim().replace(/\s+/g, " ").slice(0, 32);

  return normalized || fallback;
}

function playerNamesFromMatch(match: MatchDocument): Record<string, string> {
  return Object.fromEntries(
    match.seats.map((seat) => [
      seat.playerId,
      seat.displayName || seat.playerId,
    ]),
  );
}
