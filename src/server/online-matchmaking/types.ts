import type { DeckId } from "@/server/game";
import type { DeckSnapshot } from "@/server/game/schemas";

export type OnlineRoomStatus =
  | "waiting-for-opponent"
  | "game-created"
  | "closed";

export type OnlineRoomDeck =
  | { kind: "catalog"; deckId: DeckId; label: string }
  | { kind: "temporary"; label: "Temporary test deck"; snapshot: DeckSnapshot };

export type OnlineRoomSeat = {
  seat: "player1" | "player2";
  deck: OnlineRoomDeck;
  displayName: string;
  onlineSessionId: string;
  socketId: string;
};

export type OnlineRoom = {
  code: string;
  status: OnlineRoomStatus;
  seat1: OnlineRoomSeat;
  seat2?: OnlineRoomSeat;
  gameId?: string;
};

export type PublicOnlineRoom = {
  code: string;
  status: OnlineRoomStatus;
  seats: {
    player1: { connected: boolean; deckLabel: string; displayName: string };
    player2: { connected: boolean; deckLabel?: string; displayName?: string };
  };
  gameId?: string;
};
