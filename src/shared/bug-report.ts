import { z } from "zod";
import {
  gameProjectionSchema,
  gameZoneKinds,
  projectedCardViewSchema,
} from "@/shared/game";

export const BUG_REPORT_SCHEMA_VERSION = 1;
export const BUG_REPORT_HISTORY_LIMIT = 4;
export const BUG_REPORT_MAX_RELATED_CARDS = 16;
export const BUG_REPORT_MAX_ISSUE_TEXT_LENGTH = 4_000;
export const BUG_REPORT_MAX_NOTES_LENGTH = 4_000;
export const BUG_REPORT_MAX_PAYLOAD_BYTES = 512 * 1024;

const relatedCardLocationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("zone"),
    playerId: z.string().min(1),
    zoneKind: z.enum(gameZoneKinds),
  }),
  z.object({
    kind: z.literal("battlefield"),
    battlefieldId: z.string().min(1),
    role: z.enum(["battlefield", "unit", "attachment", "facedown"]),
  }),
  z.object({ kind: z.literal("setupBattlefieldPool") }),
  z.object({ kind: z.literal("chain"), chainItemId: z.string().min(1) }),
  z.object({ kind: z.literal("pendingChoice"), choiceId: z.string().min(1) }),
]);

export const relatedProjectedCardSchema = projectedCardViewSchema.pick({
  instanceId: true,
  name: true,
  ownerPlayerId: true,
  publicCode: true,
}).extend({
  location: relatedCardLocationSchema,
});

export const structuredBugReportSchema = z.object({
  schemaVersion: z.literal(BUG_REPORT_SCHEMA_VERSION),
  reportId: z.string().min(1).max(128),
  capturedAt: z.string().datetime(),
  match: z.object({
    gameId: z.string().min(1),
    gameNumber: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    matchId: z.string().min(1),
    stateVersion: z.number().int().nonnegative(),
    viewerPlayerId: z.string().min(1),
  }),
  issue: z.object({
    actual: z.string().trim().min(1).max(BUG_REPORT_MAX_ISSUE_TEXT_LENGTH),
    expected: z
      .string()
      .trim()
      .min(1)
      .max(BUG_REPORT_MAX_ISSUE_TEXT_LENGTH),
    notes: z.string().trim().max(BUG_REPORT_MAX_NOTES_LENGTH).optional(),
  }),
  relatedCards: z.array(relatedProjectedCardSchema).max(BUG_REPORT_MAX_RELATED_CARDS),
  recentStates: z.array(gameProjectionSchema).max(BUG_REPORT_HISTORY_LIMIT),
  game: gameProjectionSchema,
});

export type RelatedProjectedCard = z.infer<typeof relatedProjectedCardSchema>;
export type StructuredBugReport = z.infer<typeof structuredBugReportSchema>;

export function serializeStructuredBugReport(report: StructuredBugReport): string {
  return JSON.stringify(report, null, 2);
}
