import type { DeckSnapshotDocument } from "./repositories";
import type { MatchDocument } from "./state";
import { registeredBattlefieldIds } from "./game-factory";

export function deriveScoreByPlayerId(match: MatchDocument): Record<string, number> {
  const score = Object.fromEntries(
    match.seats.map((seat) => [seat.playerId, 0]),
  );

  for (const game of match.completedGames) {
    score[game.winnerPlayerId] = (score[game.winnerPlayerId] ?? 0) + 1;
  }

  return score;
}

export function deriveUsedBattlefieldRegisteredIdsByPlayerId(
  match: MatchDocument,
): Record<string, string[]> {
  const used = Object.fromEntries(
    match.seats.map((seat) => [seat.playerId, [] as string[]]),
  );

  for (const game of match.completedGames) {
    for (const [playerId, registeredCardId] of Object.entries(
      game.battlefieldRegisteredCardIdByPlayerId,
    )) {
      used[playerId] ??= [];
      if (!used[playerId]!.includes(registeredCardId)) {
        used[playerId]!.push(registeredCardId);
      }
    }
  }

  return used;
}

export function deriveRemainingBattlefieldRegisteredIdsByPlayerId(
  match: MatchDocument,
  decks: readonly DeckSnapshotDocument[],
): Record<string, string[]> {
  const used = deriveUsedBattlefieldRegisteredIdsByPlayerId(match);
  const deckByPlayerId = new Map(decks.map((deck) => [deck.playerId, deck]));

  return Object.fromEntries(
    match.seats.map((seat) => {
      const deck = deckByPlayerId.get(seat.playerId);
      if (!deck) return [seat.playerId, []];

      const usedForPlayer = new Set(used[seat.playerId] ?? []);
      return [
        seat.playerId,
        registeredBattlefieldIds(deck.instances).filter(
          (id) => !usedForPlayer.has(id),
        ),
      ];
    }),
  );
}

export function playerWithTwoSetPoints(
  match: MatchDocument,
): string | null {
  const score = deriveScoreByPlayerId(match);
  return (
    Object.entries(score).find(([, points]) => points >= 2)?.[0] ?? null
  );
}
