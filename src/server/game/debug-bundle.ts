import type { GameRepositories } from "./repositories";
import { verifyPlayerToken } from "./state";

export async function createGameplayDebugBundle(
  repositories: GameRepositories,
  input: { matchId: string; playerToken: string },
) {
  const match = await repositories.matches.findById(input.matchId);
  if (!match) throw new Error("Match was not found.");

  const viewerSeat = match.seats.find((seat) =>
    verifyPlayerToken(input.playerToken, seat.tokenHash),
  );
  if (!viewerSeat) throw new Error("Player token is invalid for this match.");

  const [game, decks, events] = await Promise.all([
    repositories.games.findById(match.currentGameId),
    Promise.all(
      match.seats.map((seat) =>
        repositories.deckSnapshots.findById(seat.registeredDeckSnapshotId),
      ),
    ),
    repositories.gameEvents.findByGameId(match.currentGameId),
  ]);
  if (!game) throw new Error("Current game was not found.");
  if (decks.some((deck) => deck === null)) {
    throw new Error("Deck snapshots are unavailable.");
  }

  return {
    format: "hextech-gameplay-debug-bundle",
    formatVersion: 1,
    capturedAt: new Date().toISOString(),
    instructions:
      "Give this entire JSON value to Codex with the observed behavior and the expected behavior.",
    context: {
      matchId: match.id,
      gameId: game.id,
      gameNumber: game.gameNumber,
      gameStateVersion: game.stateVersion,
      matchStateVersion: match.stateVersion,
      viewerPlayerId: viewerSeat.playerId,
    },
    match: {
      ...match,
      seats: match.seats.map((seat) => ({
        playerId: seat.playerId,
        seat: seat.seat,
        displayName: seat.displayName,
        registeredDeckSnapshotId: seat.registeredDeckSnapshotId,
        allowCrossDomainCards: seat.allowCrossDomainCards,
        currentDeckConfiguration: seat.currentDeckConfiguration,
      })),
    },
    game,
    decks,
    events,
  };
}
