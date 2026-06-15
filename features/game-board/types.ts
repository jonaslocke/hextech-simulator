import type { Card as CatalogCard, CardType } from "@/server/catalog";
import type { GameLogEntry } from "@/server/events";
import type { GameProjection } from "@/server/match";

export type TemporaryZone =
  | "chain"
  | "banish"
  | "log"
  | "opponentTrash"
  | "playerTrash"
  | null;

export type ZoneVisibility = "public" | "private" | "secret";
export type ZoneKind =
  | "banishment"
  | "base"
  | "battlefield"
  | "champion"
  | "hand"
  | "legend"
  | "mainDeck"
  | "runeDeck"
  | "trash";

export type GameBoardProps = {
  chainCardInstanceIds?: string[];
  cardsByInstanceId: Record<string, CatalogCard>;
  logEntries?: GameLogEntry[];
  playerNames?: Partial<Record<string, string>>;
  projection: GameProjection;
  scores?: Partial<Record<string, number>>;
};

export type PlayerData = {
  playerId: string;
  name: string;
  score: number;
  zones: {
    banishment: ZoneData;
    base: ZoneData;
    champion: ZoneData;
    hand: ZoneData;
    legend: ZoneData;
    mainDeck: ZoneData;
    runeDeck: ZoneData;
    trash: ZoneData;
  };
};

export interface GameScore {
  player: PlayerData;
  opponent: PlayerData;
}

export type Card = {
  domains?: string[];
  energy?: number;
  instanceId?: string;
  name: string;
  img: HTMLImageElement["src"];
  might?: number;
  power?: number;
  publicCode?: string;
  rulesText?: string;
  setLabel?: string;
  supertype?: CatalogCard["classification"]["supertype"];
  type?: CardType;
  isExhausted?: boolean;
  comesToPlayReady?: boolean;
};

export type ZoneData = {
  cards: Card[];
  count: number;
  kind: ZoneKind;
  visibility: ZoneVisibility;
};

export type BattlefieldData = {
  id: string;
  selectedByPlayerId: string;
  name: string;
  description: string;
  playerUnits: Card[];
  opponentUnits: Card[];
  img: HTMLImageElement["src"];
};
