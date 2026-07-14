import { OnlineRoomRegistry, normalizeRoomCode } from "./room-registry";
import type { OnlineRoom, OnlineRoomDeck, OnlineRoomSeat, PublicOnlineRoom } from "./types";

export class OnlineRoomError extends Error {
  constructor(
    public readonly code:
      | "room_not_found"
      | "room_full"
      | "room_started"
      | "room_closed"
      | "seat_not_owned",
    message: string,
  ) {
    super(message);
  }
}

export class OnlineRoomService {
  constructor(private readonly registry: OnlineRoomRegistry) {}

  create(input: {
    deck: OnlineRoomDeck;
    onlineSessionId: string;
    socketId: string;
    displayName: string;
  }): OnlineRoom {
    return this.registry.create({
      status: "waiting-for-opponent",
      seat1: createSeat("player1", input),
    });
  }

  join(input: {
    code: string;
    deck: OnlineRoomDeck;
    onlineSessionId: string;
    socketId: string;
    displayName: string;
  }): OnlineRoom {
    const room = this.getRequired(input.code);

    if (room.status === "game-created") {
      throw new OnlineRoomError(
        "room_started",
        "This room has already started.",
      );
    }
    if (room.status === "closed") {
      throw new OnlineRoomError("room_closed", "This room is closed.");
    }
    if (room.seat2) {
      throw new OnlineRoomError(
        "room_full",
        "This room already has two players.",
      );
    }

    const next = {
      ...room,
      seat2: createSeat("player2", input),
    };
    this.registry.save(next);
    return next;
  }

  markGameCreated(code: string, gameId: string): OnlineRoom {
    const room = this.getRequired(code);
    const next = { ...room, status: "game-created" as const, gameId };
    this.registry.save(next);
    return next;
  }

  releaseSeat2(code: string): OnlineRoom {
    const room = this.getRequired(code);
    const { seat2: _seat2, ...withoutSeat2 } = room;
    void _seat2;
    const next = {
      ...withoutSeat2,
      status: "waiting-for-opponent" as const,
    };
    this.registry.save(next);
    return next;
  }

  leave(input: {
    code: string;
    onlineSessionId: string;
    socketId: string;
  }): OnlineRoom {
    const room = this.getRequired(input.code);
    const seat = findOwnedSeat(room, input);

    if (!seat) {
      throw new OnlineRoomError(
        "seat_not_owned",
        "This player does not own a seat in the room.",
      );
    }

    if (room.status === "game-created") {
      return room;
    }

    if (seat.seat === "player1") {
      const next = { ...room, status: "closed" as const };
      this.registry.save(next);
      return next;
    }

    return this.releaseSeat2(room.code);
  }

  disconnect(socketId: string): OnlineRoom | undefined {
    const room = this.registry.findBySocketId(socketId);
    if (!room || room.status === "game-created") return room;

    if (room.seat1.socketId === socketId) {
      const next = { ...room, status: "closed" as const };
      this.registry.save(next);
      return next;
    }

    return this.releaseSeat2(room.code);
  }

  toPublicRoom(room: OnlineRoom): PublicOnlineRoom {
    return {
      code: room.code,
      status: room.status,
      seats: {
        player1: {
          connected: true,
          deckLabel: room.seat1.deck.label,
          displayName: room.seat1.displayName,
        },
        player2: room.seat2
          ? {
              connected: true,
              deckLabel: room.seat2.deck.label,
              displayName: room.seat2.displayName,
            }
          : { connected: false },
      },
      gameId: room.gameId,
    };
  }

  private getRequired(code: string): OnlineRoom {
    const room = this.registry.get(normalizeRoomCode(code));
    if (!room) {
      throw new OnlineRoomError("room_not_found", "Room code was not found.");
    }
    return room;
  }
}

function createSeat(
  seat: OnlineRoomSeat["seat"],
  input: {
    deck: OnlineRoomDeck;
    onlineSessionId: string;
    socketId: string;
    displayName: string;
  },
): OnlineRoomSeat {
  return { seat, ...input };
}

function findOwnedSeat(
  room: OnlineRoom,
  input: { onlineSessionId: string; socketId: string },
): OnlineRoomSeat | undefined {
  return [room.seat1, room.seat2].find(
    (seat) =>
      seat?.onlineSessionId === input.onlineSessionId &&
      seat.socketId === input.socketId,
  );
}
