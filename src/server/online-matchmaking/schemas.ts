import { z } from "zod";
import { deckIdSchema } from "@/shared/game";

export const createOnlineRoomSchema = z.object({
  deckId: deckIdSchema,
  onlineSessionId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(32),
});

export const joinOnlineRoomSchema = createOnlineRoomSchema.extend({
  code: z.string().trim().min(1).max(12),
});

export const leaveOnlineRoomSchema = z.object({
  code: z.string().trim().min(1).max(12),
  onlineSessionId: z.string().uuid(),
});
