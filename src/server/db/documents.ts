import type { DeckSnapshot } from "../deck";
import type { Game, MatchFormat, MatchStatus, PlayerSeat } from "../match";

export type BaseDocument = {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type PlayerSeatDocument = PlayerSeat;

export type MatchDocument = BaseDocument & {
  format: MatchFormat;
  status: MatchStatus;
  playerSeats: [PlayerSeatDocument, PlayerSeatDocument];
  currentGameId: string | null;
  gameIds: string[];
  matchScore: Record<string, number>;
  winnerPlayerId: string | null;
};

export type GameDocument = Game;

export type GameEventDocument = BaseDocument & {
  matchId: string;
  gameId: string | null;
  sequence: number;
  type: string;
  actorPlayerId: string | null;
  payload: unknown;
};

export type DeckSnapshotDocument = BaseDocument & {
  matchId: string | null;
  playerId: string;
  sourceText: string;
  catalogVersionHash: string;
  snapshot: DeckSnapshot;
};

export type CardCatalogVersionDocument = BaseDocument & {
  versionHash: string;
  setFiles: string[];
  cardCount: number;
};
