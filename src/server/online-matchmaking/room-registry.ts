import { randomInt } from "node:crypto";
import type { OnlineRoom } from "./types";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;
const MAX_CODE_ATTEMPTS = 20;

export class OnlineRoomRegistry {
  private readonly rooms = new Map<string, OnlineRoom>();

  create(room: Omit<OnlineRoom, "code">): OnlineRoom {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const code = createRoomCode();

      if (!this.rooms.has(code)) {
        const created = { ...room, code };
        this.rooms.set(code, created);
        return created;
      }
    }

    throw new Error("Unable to allocate a unique room code.");
  }

  get(code: string): OnlineRoom | undefined {
    return this.rooms.get(normalizeRoomCode(code));
  }

  save(room: OnlineRoom): void {
    this.rooms.set(room.code, room);
  }

  findBySocketId(socketId: string): OnlineRoom | undefined {
    return [...this.rooms.values()].find(
      (room) =>
        room.seat1.socketId === socketId || room.seat2?.socketId === socketId,
    );
  }
}

export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}

function createRoomCode(): string {
  return Array.from(
    { length: ROOM_CODE_LENGTH },
    () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)],
  ).join("");
}

