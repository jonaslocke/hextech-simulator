import { createHash } from "node:crypto";
import type { GameProjectionV2 } from "../../shared/game-v2";
import { loadInitialDeckSnapshot } from "./catalog";
import type { DeckSnapshotDocumentV2, GameV2Repositories } from "./repositories";
import { performSetupActionV2 } from "./setup";
import { performGameplayActionV2 } from "./actions";
import { projectGameV2 } from "./projection";
import {
  createInitialGameV2, createMatchIdV2, createPlayerTokenV2,
  createRuntimeDeckSnapshot, verifyPlayerTokenV2,
  type DeckRuntimeSnapshotV2, type MatchDocumentV2
} from "./state";
import type { Db } from "mongodb";

export async function createMatchV2(input: {
  db: Db; repositories: GameV2Repositories; now?: string; matchId?: string; rngSeed?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  const matchId = input.matchId ?? createMatchIdV2();
  const template = await loadInitialDeckSnapshot(input.db);
  const players = ["player-1", "player-2"] as const;
  const runtimeDecks = players.map((id) => createRuntimeDeckSnapshot(template, id)) as [DeckRuntimeSnapshotV2, DeckRuntimeSnapshotV2];
  const tokens = players.map(() => createPlayerTokenV2());
  const deckDocuments = runtimeDecks.map((deck, index): DeckSnapshotDocumentV2 => ({
    id: `${matchId}:deck:${players[index]}`, createdAt: now, updatedAt: now,
    matchId, playerId: players[index]!, snapshot: deck.template, instances: deck.instances
  }));
  const game = createInitialGameV2({ matchId, now, rngSeed: input.rngSeed ?? matchId, playerIds: [...players], decks: runtimeDecks });
  const match: MatchDocumentV2 = {
    id: matchId, createdAt: now, updatedAt: now, status: "setup_pending", currentGameId: game.id,
    seats: players.map((playerId, index) => ({ playerId, seat: index === 0 ? "player-1" : "player-2", tokenHash: tokens[index]!.tokenHash, deckSnapshotId: deckDocuments[index]!.id })) as MatchDocumentV2["seats"]
  };
  await Promise.all([...deckDocuments.map((document) => input.repositories.deckSnapshots.insert(document)), input.repositories.games.insert(game), input.repositories.matches.insert(match)]);
  return {
    matchId, gameId: game.id,
    players: {
      player1: { playerId: players[0], seat: "player-1" as const, deckId: "lux" as const, playerToken: tokens[0]!.token },
      player2: { playerId: players[1], seat: "player-2" as const, deckId: "lux" as const, playerToken: tokens[1]!.token }
    },
    projections: Object.fromEntries(players.map((id) => [id, projectGameV2({ game, viewerPlayerId: id, decks: deckDocuments })]))
  };
}

export async function getViewerStateV2(repositories: GameV2Repositories, matchId: string, playerToken: string): Promise<GameProjectionV2> {
  const { match, game, seat, decks } = await loadContext(repositories, matchId, playerToken);
  const events = await repositories.gameEvents.findByGameId(game.id);
  void match;
  return projectGameV2({ game, viewerPlayerId: seat.playerId, decks, events });
}

export async function performMatchActionV2(repositories: GameV2Repositories, input: {
  matchId: string; playerToken: string; stateVersion: number; actionId: string; selectedIds: string[]; now?: string;
}) {
  const { match, game, seat, decks } = await loadContext(repositories, input.matchId, input.playerToken);
  if (game.stateVersion !== input.stateVersion) throw new Error("Game state version is stale.");
  const deckRuntime = Object.fromEntries(decks.map((deck) => [deck.playerId, { template: deck.snapshot, instances: deck.instances }]));
  const now = input.now ?? new Date().toISOString();
  const next = game.status === "setup_pending"
    ? performSetupActionV2({ game, actorPlayerId: seat.playerId, actionId: input.actionId, selectedIds: input.selectedIds, decksByPlayerId: deckRuntime, now })
    : performGameplayActionV2({ game, actorPlayerId: seat.playerId, actionId: input.actionId, selectedIds: input.selectedIds, decks, now });
  const nextMatch = next.status === "in_progress"
    ? { ...match, status: "in_progress" as const, updatedAt: now }
    : match;
  await Promise.all([
    repositories.games.upsert(next),
    repositories.matches.upsert(nextMatch),
    repositories.gameEvents.insert({
      id: `${next.id}:event:${next.stateVersion}`,
      createdAt: now,
      updatedAt: now,
      matchId: match.id,
      gameId: next.id,
      sequence: next.stateVersion,
      actorPlayerId: seat.playerId,
      type: "game.action.accepted",
      message: `Player action accepted: ${input.actionId}`
    })
  ]);
  const events = await repositories.gameEvents.findByGameId(next.id);
  return projectGameV2({ game: next, viewerPlayerId: seat.playerId, decks, events });
}

async function loadContext(repositories: GameV2Repositories, matchId: string, token: string) {
  const match = await repositories.matches.findById(matchId);
  if (!match) throw new Error("Match was not found.");
  const seat = match.seats.find((candidate) => verifyPlayerTokenV2(token, candidate.tokenHash));
  if (!seat) throw new Error("Player token is invalid for this match.");
  const game = await repositories.games.findById(match.currentGameId);
  if (!game) throw new Error("Game was not found.");
  const decks = (await Promise.all(match.seats.map((item) => repositories.deckSnapshots.findById(item.deckSnapshotId)))).filter((item): item is DeckSnapshotDocumentV2 => item !== null);
  if (decks.length !== 2) throw new Error("Deck snapshots are unavailable.");
  return { match, seat, game, decks };
}

export function deckSnapshotIdHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
