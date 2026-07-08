import type { Server, Socket } from "socket.io";
import { getMongoDatabase } from "@/server/db";
import { createGameRepositories, createMatch } from "@/server/game";
import {
  createOnlineRoomSchema,
  joinOnlineRoomSchema,
  leaveOnlineRoomSchema,
} from "./schemas";
import { OnlineRoomError, OnlineRoomService } from "./room-service";

type MatchResult = Awaited<ReturnType<typeof createMatch>>;

export function registerOnlineMatchmakingHandlers(
  io: Server,
  service: OnlineRoomService,
): void {
  io.on("connection", (socket) => {
    socket.on("client:room:create", (payload: unknown) => {
      const parsed = createOnlineRoomSchema.safeParse(payload);
      if (!parsed.success) return emitInvalidPayload(socket);

      try {
        const room = service.create({ ...parsed.data, socketId: socket.id });
        void socket.join(room.code);
        socket.emit("server:room:created", service.toPublicRoom(room));
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on("client:room:join", async (payload: unknown) => {
      const parsed = joinOnlineRoomSchema.safeParse(payload);
      if (!parsed.success) return emitInvalidPayload(socket);

      let room;
      try {
        room = service.join({ ...parsed.data, socketId: socket.id });
        await socket.join(room.code);
        socket.emit("server:room:joined", service.toPublicRoom(room));
        io.to(room.code).emit(
          "server:room:stateChanged",
          service.toPublicRoom(room),
        );
      } catch (error) {
        emitRoomError(socket, error);
        return;
      }

      try {
        const db = await getMongoDatabase();
        const match = await createMatch({
          db,
          repositories: createGameRepositories(db),
          playerDecks: {
            player1: room.seat1.deckId,
            player2: room.seat2!.deckId,
          },
          playerNames: {
            player1: room.seat1.displayName,
            player2: room.seat2!.displayName,
          },
        });
        const startedRoom = service.markGameCreated(room.code, match.gameId);
        io.to(room.code).emit(
          "server:room:stateChanged",
          service.toPublicRoom(startedRoom),
        );
        emitGameCreated(io, startedRoom.seat1.socketId, "player1", match);
        emitGameCreated(io, startedRoom.seat2!.socketId, "player2", match);
      } catch (error) {
        const waitingRoom = service.releaseSeat2(room.code);
        const failure = {
          code: "match_creation_failed",
          message:
            error instanceof Error
              ? error.message
              : "Unable to create the match.",
        };
        socket.emit(
          "server:room:stateChanged",
          service.toPublicRoom(waitingRoom),
        );
        socket.emit("server:room:error", failure);
        await socket.leave(room.code);
        io.to(room.code).emit(
          "server:room:stateChanged",
          service.toPublicRoom(waitingRoom),
        );
        io.to(room.code).emit("server:room:error", failure);
      }
    });

    socket.on("client:room:leave", async (payload: unknown) => {
      const parsed = leaveOnlineRoomSchema.safeParse(payload);
      if (!parsed.success) return emitInvalidPayload(socket);

      try {
        const room = service.leave({ ...parsed.data, socketId: socket.id });
        if (room.status === "closed") {
          io.to(room.code).emit(
            "server:room:closed",
            service.toPublicRoom(room),
          );
        } else {
          io.to(room.code).emit(
            "server:room:stateChanged",
            service.toPublicRoom(room),
          );
        }
        await socket.leave(room.code);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on("disconnect", () => {
      const room = service.disconnect(socket.id);
      if (!room || room.status === "game-created") return;

      io.to(room.code).emit("server:player:disconnected", {
        room: service.toPublicRoom(room),
      });
      if (room.status === "closed") {
        io.to(room.code).emit("server:room:closed", service.toPublicRoom(room));
      } else {
        io.to(room.code).emit(
          "server:room:stateChanged",
          service.toPublicRoom(room),
        );
      }
    });
  });
}

function emitGameCreated(
  io: Server,
  socketId: string,
  seat: "player1" | "player2",
  match: MatchResult,
): void {
  io.to(socketId).emit("server:room:gameCreated", {
    matchId: match.matchId,
    gameId: match.gameId,
    player: match.players[seat],
  });
}

function emitInvalidPayload(socket: Socket): void {
  socket.emit("server:room:error", {
    code: "invalid_payload",
    message: "The room request is malformed.",
  });
}

function emitRoomError(socket: Socket, error: unknown): void {
  socket.emit("server:room:error", {
    code: error instanceof OnlineRoomError ? error.code : "room_error",
    message:
      error instanceof Error ? error.message : "The room request failed.",
  });
}
