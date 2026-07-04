import type { DeckId, GameProjection } from "@/shared/game";

export type SeatKey = "player1" | "player2";
export type CreatedPlayer = {
  playerId: string;
  seat: "player-1" | "player-2";
  deckId: DeckId;
  playerToken: string;
};
export type AcceptedMatch = {
  accepted: true;
  matchId: string;
  gameId: string;
  players: Record<SeatKey, CreatedPlayer>;
  projections: Record<string, GameProjection>;
};
export type ApiFailure = { accepted: false; error: { code: string; message: string } };
export type DeckOption = { id: DeckId; label: string };
