import type { GameDocument } from "./state";

export type TurnTiming =
  | "neutralOpen"
  | "neutralClosed"
  | "showdownOpen"
  | "showdownClosed";

export function currentTiming(game: GameDocument): TurnTiming {
  if (game.state.showdown) {
    return game.state.chain ? "showdownClosed" : "showdownOpen";
  }
  return game.state.chain ? "neutralClosed" : "neutralOpen";
}

export function relevantPlayers(game: GameDocument): string[] {
  return game.state.chain?.relevantPlayerIds
    ?? game.state.showdown?.relevantPlayerIds
    ?? [...game.state.setup.playerIds];
}

export function nextRelevantPlayer(
  game: GameDocument,
  playerId: string,
  playerIds = relevantPlayers(game)
): string {
  const current = playerIds.indexOf(playerId);
  if (current < 0) throw new Error("Player is not relevant to the current window.");
  return playerIds[(current + 1) % playerIds.length]!;
}

export function addConsecutivePass(
  passedPlayerIds: readonly string[],
  playerId: string
): string[] {
  if (passedPlayerIds.includes(playerId)) {
    throw new Error("A player cannot pass twice in one priority sequence.");
  }
  return [...passedPlayerIds, playerId];
}
