import type { DeckSnapshot } from "../deck";

export type BaseDocument = {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type PlayerSeatDocument = {
  playerId: string;
  displayName: string;
  tokenHash: string;
};

export type MatchDocument = BaseDocument & {
  format: "best-of-3";
  status: "setup_pending" | "ready" | "in_progress" | "complete";
  playerSeats: [PlayerSeatDocument, PlayerSeatDocument];
  currentGameId: string | null;
  gameIds: string[];
  matchScore: Record<string, number>;
  winnerPlayerId: string | null;
};

export type GameDocument = BaseDocument & {
  matchId: string;
  gameNumber: number;
  status: "setup_pending" | "ready" | "in_progress" | "complete";
  stateVersion: number;
  canonicalState: unknown;
  winnerPlayerId: string | null;
};

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
