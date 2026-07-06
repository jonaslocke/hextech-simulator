import type { DeckId } from "@/server/game";

export type OnlineRoomStatus =
  | "waiting-for-opponent"
  | "game-created"
  | "closed";

export type OnlineRoomSeat = {
  seat: "player1" | "player2";
  deckId: DeckId;
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
    player1: { connected: boolean; deckId: DeckId };
    player2: { connected: boolean; deckId?: DeckId };
  };
  gameId?: string;
};

