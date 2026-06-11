import type { Server } from "socket.io";
import {
  matchIntentPayloadSchema,
  matchJoinPayloadSchema
} from "@/shared/intents";

export function registerRealtimeHandlers(io: Server) {
  io.on("connection", (socket) => {
    socket.on("match:join", (payload) => {
      const parsed = matchJoinPayloadSchema.safeParse(payload);

      if (!parsed.success) {
        socket.emit("match:error", {
          code: "socket.invalidJoinPayload",
          message: "Invalid match join payload."
        });
        return;
      }

      socket.join(`match:${parsed.data.matchId}`);
      socket.emit("match:state", {
        matchId: parsed.data.matchId,
        status: "joined"
      });
    });

    socket.on("match:intent", (payload) => {
      const parsed = matchIntentPayloadSchema.safeParse(payload);

      if (!parsed.success) {
        socket.emit("match:error", {
          code: "socket.invalidIntentPayload",
          message: "Invalid match intent payload."
        });
        return;
      }

      socket.emit("match:error", {
        code: "intent.unsupported",
        message: "Gameplay intents are not implemented yet."
      });
    });
  });
}
