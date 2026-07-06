import type { DeckId } from "@/shared/game";

export type OnlineRoomView = {
  code: string;
  status: "waiting-for-opponent" | "game-created" | "closed";
  seats: {
    player1: { connected: boolean; deckId: DeckId };
    player2: { connected: boolean; deckId?: DeckId };
  };
  gameId?: string;
};

export type OnlinePlayerCredentials = {
  matchId: string;
  gameId: string;
  player: {
    playerId: string;
    seat: "player-1" | "player-2";
    deckId: DeckId;
    playerToken: string;
  };
};

export type DeckOption = { id: DeckId; label: string };

