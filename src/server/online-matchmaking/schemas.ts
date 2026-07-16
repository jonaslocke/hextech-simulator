import { z } from "zod";
import { deckIdSchema } from "@/shared/game";

export const onlineRoomDeckRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("catalog"), deckId: deckIdSchema }),
  z.object({
    kind: z.literal("temporary"),
    sourceText: z.string().trim().min(1).max(20_000),
    allowCrossDomainCards: z.boolean().optional().default(false),
  }),
]);

export const createOnlineRoomSchema = z.object({
  deck: onlineRoomDeckRequestSchema,
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
