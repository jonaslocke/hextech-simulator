import { createHash } from "node:crypto";
import type { GameProjection } from "../../shared/game";
import { loadInitialDeckSnapshot } from "./catalog";
import type { DeckSnapshotDocument, GameRepositories } from "./repositories";
import { performSetupAction, setupActions } from "./setup";
import {
  gameplayActions,
  performGameplayTransition
} from "./actions";
import { projectGame } from "./projection";
import {
  createInitialGame, createMatchId, createPlayerToken,
  createRuntimeDeckSnapshot, verifyPlayerToken,
  type DeckRuntimeSnapshot, type MatchDocument
} from "./state";
import type { Db } from "mongodb";
import type { DamageAssignment } from "./combat";

export async function createMatch(input: {
  db: Db; repositories: GameRepositories; now?: string; matchId?: string; rngSeed?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  const matchId = input.matchId ?? createMatchId();
  const template = await loadInitialDeckSnapshot(input.db);
  const players = ["player-1", "player-2"] as const;
  const runtimeDecks = players.map((id) => createRuntimeDeckSnapshot(template, id)) as [DeckRuntimeSnapshot, DeckRuntimeSnapshot];
  const tokens = players.map(() => createPlayerToken());
  const deckDocuments = runtimeDecks.map((deck, index): DeckSnapshotDocument => ({
    id: `${matchId}:deck:${players[index]}`, createdAt: now, updatedAt: now,
    matchId, playerId: players[index]!, snapshot: deck.template, instances: deck.instances
  }));
  const game = createInitialGame({ matchId, now, rngSeed: input.rngSeed ?? matchId, playerIds: [...players], decks: runtimeDecks });
  const match: MatchDocument = {
    id: matchId, createdAt: now, updatedAt: now, status: "setup_pending", currentGameId: game.id,
    seats: players.map((playerId, index) => ({ playerId, seat: index === 0 ? "player-1" : "player-2", tokenHash: tokens[index]!.tokenHash, deckSnapshotId: deckDocuments[index]!.id })) as MatchDocument["seats"]
  };
  await Promise.all([...deckDocuments.map((document) => input.repositories.deckSnapshots.insert(document)), input.repositories.games.insert(game), input.repositories.matches.insert(match)]);
  return {
    matchId, gameId: game.id,
    players: {
      player1: { playerId: players[0], seat: "player-1" as const, deckId: "lux" as const, playerToken: tokens[0]!.token },
      player2: { playerId: players[1], seat: "player-2" as const, deckId: "lux" as const, playerToken: tokens[1]!.token }
    },
    projections: Object.fromEntries(players.map((id) => [id, projectGame({ game, viewerPlayerId: id, decks: deckDocuments })]))
  };
}

export async function getViewerState(repositories: GameRepositories, matchId: string, playerToken: string): Promise<GameProjection> {
  const { match, game, seat, decks } = await loadContext(repositories, matchId, playerToken);
  const events = await repositories.gameEvents.findByGameId(game.id);
  void match;
  return projectGame({ game, viewerPlayerId: seat.playerId, decks, events });
}

export async function performMatchAction(repositories: GameRepositories, input: {
  matchId: string; playerToken: string; stateVersion: number; actionId: string;
  selectedIds: string[]; allocations?: DamageAssignment[]; now?: string;
}) {
  const { match, game, seat, decks } = await loadContext(repositories, input.matchId, input.playerToken);
  if (game.stateVersion !== input.stateVersion) throw new Error("Game state version is stale.");
  const deckRuntime = Object.fromEntries(decks.map((deck) => [deck.playerId, { template: deck.snapshot, instances: deck.instances }]));
  const now = input.now ?? new Date().toISOString();
  const acceptedAction = (game.status === "setup_pending"
    ? setupActions(game, seat.playerId)
    : gameplayActions(game, seat.playerId, decks))
    .find((action) => action.id === input.actionId);
  const transition = game.status === "setup_pending"
    ? null
    : performGameplayTransition({
      game,
      actorPlayerId: seat.playerId,
      actionId: input.actionId,
      selectedIds: input.selectedIds,
      allocations: input.allocations,
      decks,
      now
    });
  const next = transition
    ? transition.game
    : performSetupAction({ game, actorPlayerId: seat.playerId, actionId: input.actionId, selectedIds: input.selectedIds, decksByPlayerId: deckRuntime, now });
  const nextMatch = next.status === "in_progress"
    ? { ...match, status: "in_progress" as const, updatedAt: now }
    : match;
  const transitionEvents = transition?.events ?? [{
    type: `game.action.${input.actionId.split(":")[3] ?? "accepted"}`,
    actorPlayerId: seat.playerId,
    message: `${seat.playerId}: ${acceptedAction?.label ?? "Action accepted"}`,
    payload: { actionId: input.actionId }
  }];
  await Promise.all([
    repositories.games.upsert(next),
    repositories.matches.upsert(nextMatch),
    ...transitionEvents.map((event, eventIndex) => repositories.gameEvents.insert({
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
      payload: event.payload
    }))
  ]);
  const events = await repositories.gameEvents.findByGameId(next.id);
  return projectGame({ game: next, viewerPlayerId: seat.playerId, decks, events });
}

async function loadContext(repositories: GameRepositories, matchId: string, token: string) {
  const match = await repositories.matches.findById(matchId);
  if (!match) throw new Error("Match was not found.");
  const seat = match.seats.find((candidate) => verifyPlayerToken(token, candidate.tokenHash));
  if (!seat) throw new Error("Player token is invalid for this match.");
  const game = await repositories.games.findById(match.currentGameId);
  if (!game) throw new Error("Game was not found.");
  const decks = (await Promise.all(match.seats.map((item) => repositories.deckSnapshots.findById(item.deckSnapshotId)))).filter((item): item is DeckSnapshotDocument => item !== null);
  if (decks.length !== 2) throw new Error("Deck snapshots are unavailable.");
  return { match, seat, game, decks };
}

export function deckSnapshotIdHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
