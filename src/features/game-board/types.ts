import type { ProjectedCardView } from "@/shared/game";

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
  supertype?: ProjectedCardView["supertype"];
  type?: ProjectedCardView["type"];
  isExhausted?: boolean;
  isStunned?: boolean;
  damage?: number;
  comesToPlayReady?: boolean;
};

export type ChainCardEntry = {
  card: Card;
  chainItemId: string;
  controllerPlayerId: string;
  controllerSeat: "player" | "opponent";
  controllerName: string;
  sourceCardInstanceId: string | null;
  targetCardInstanceIds: string[];
  targetLabels: string[];
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
  controllerPlayerId: string | null;
  contestedByPlayerId: string | null;
  name: string;
  description: string;
  playerUnits: Card[];
  opponentUnits: Card[];
  img: HTMLImageElement["src"];
};

export type GameLogEntry = {
  id: string;
  message: string;
  createdAt: string;
  sequence: number;
};
