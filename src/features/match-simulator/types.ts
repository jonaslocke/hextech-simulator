import type { Card as CatalogCard } from "@/server/catalog";
import type { GameLogEntry } from "@/server/events";
import type { GameProjection } from "@/server/match";

export type { CatalogCard, GameLogEntry, GameProjection };

export type FixedDeckId = "annie" | "lux";
export type SeatKey = "player1" | "player2";

export type CreatedPlayer = {
  playerId: string;
  seat: "player-1" | "player-2";
  deckId: FixedDeckId;
  playerToken: string;
};

export type MatchIntent = { type: string; payload?: unknown };

export type CreateMatchResponse =
  | {
      accepted: true;
      matchId: string;
      gameId: string;
      gameStatus: string;
      stateVersion: number;
      players: Record<SeatKey, CreatedPlayer>;
      projections: Record<string, GameProjection>;
      cardsByInstanceId: Record<string, CatalogCard>;
      logEntries: Record<string, GameLogEntry[]>;
    }
  | {
      accepted: false;
      error: {
        code: string;
        message: string;
      };
    };

export type AcceptedMatch = Extract<CreateMatchResponse, { accepted: true }>;

export type ViewerStateResponse =
  | {
      accepted: true;
      matchId: string;
      gameId: string;
      projection: GameProjection;
      cardsByInstanceId: Record<string, CatalogCard>;
      logEntries: GameLogEntry[];
    }
  | {
      accepted: false;
      error: {
        code: string;
        message: string;
      };
    };

export type IntentResponse =
  | {
      accepted: true;
      projection: GameProjection;
      logEntries: GameLogEntry[];
    }
  | {
      accepted: false;
      error: {
        code: string;
        message: string;
      };
    };
