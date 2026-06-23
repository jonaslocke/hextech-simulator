import type { GameProjectionV2 } from "@/shared/game-v2";

export type SeatKeyV2 = "player1" | "player2";
export type CreatedPlayerV2 = {
  playerId: string;
  seat: "player-1" | "player-2";
  deckId: "lux";
  playerToken: string;
};
export type AcceptedMatchV2 = {
  accepted: true;
  matchId: string;
  gameId: string;
  players: Record<SeatKeyV2, CreatedPlayerV2>;
  projections: Record<string, GameProjectionV2>;
};
export type ApiFailureV2 = { accepted: false; error: { code: string; message: string } };

