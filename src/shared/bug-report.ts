import { z } from "zod";
import {
  gameProjectionSchema,
  gameZoneKinds,
  projectedCardViewSchema,
  type GameProjection,
} from "@/shared/game";

export const BUG_REPORT_SCHEMA_VERSION = 1;
export const BUG_REPORT_HISTORY_LIMIT = 4;

const relatedCardLocationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("zone"),
    playerId: z.string().min(1),
    zoneKind: z.enum(gameZoneKinds),
  }),
  z.object({
    kind: z.literal("battlefield"),
    battlefieldId: z.string().min(1),
    role: z.enum(["battlefield", "unit", "facedown"]),
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
  reportId: z.string().min(1),
  capturedAt: z.string().datetime(),
  match: z.object({
    gameId: z.string().min(1),
    gameNumber: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    matchId: z.string().min(1),
    stateVersion: z.number().int().nonnegative(),
    viewerPlayerId: z.string().min(1),
  }),
  issue: z.object({
    actual: z.string().trim().min(1),
    expected: z.string().trim().min(1),
    notes: z.string().trim().optional(),
  }),
  relatedCards: z.array(relatedProjectedCardSchema),
  recentStates: z.array(gameProjectionSchema).max(BUG_REPORT_HISTORY_LIMIT),
  game: gameProjectionSchema,
});

export type RelatedProjectedCard = z.infer<typeof relatedProjectedCardSchema>;
export type StructuredBugReport = z.infer<typeof structuredBugReportSchema>;

export function cloneViewerSafeProjection(projection: GameProjection): GameProjection {
  return JSON.parse(JSON.stringify(projection)) as GameProjection;
}

export function appendViewerSafeProjectionHistory(
  history: readonly GameProjection[],
  projection: GameProjection,
): GameProjection[] {
  const snapshot = cloneViewerSafeProjection(projection);
  const withoutCurrentVersion = history.filter(
    (entry) => entry.stateVersion !== snapshot.stateVersion,
  );

  return [...withoutCurrentVersion, snapshot].slice(-BUG_REPORT_HISTORY_LIMIT);
}

export function findRelatedProjectedCard(
  projection: GameProjection,
  instanceId: string,
): RelatedProjectedCard | null {
  for (const player of projection.players) {
    for (const zone of player.zones) {
      const card = zone.cards.find((item) => item.instanceId === instanceId);
      if (card) return relatedCard(card, { kind: "zone", playerId: player.playerId, zoneKind: zone.kind });
    }
  }

  for (const battlefield of projection.battlefields) {
    if (battlefield.card.instanceId === instanceId) {
      return relatedCard(battlefield.card, { kind: "battlefield", battlefieldId: battlefield.battlefieldId, role: "battlefield" });
    }
    const unit = battlefield.units.find((card) => card.instanceId === instanceId);
    if (unit) return relatedCard(unit, { kind: "battlefield", battlefieldId: battlefield.battlefieldId, role: "unit" });
    if (battlefield.facedownCard?.instanceId === instanceId) {
      return relatedCard(battlefield.facedownCard, { kind: "battlefield", battlefieldId: battlefield.battlefieldId, role: "facedown" });
    }
  }

  const setupCard = projection.setup.battlefieldPool.find((card) => card.instanceId === instanceId);
  if (setupCard) return relatedCard(setupCard, { kind: "setupBattlefieldPool" });

  const chainItem = projection.chain?.items.find((item) => item.card?.instanceId === instanceId);
  if (chainItem?.card) return relatedCard(chainItem.card, { kind: "chain", chainItemId: chainItem.id });

  const pendingChoice = projection.pendingChoice;
  if (pendingChoice?.type === "orderTriggers") {
    const item = pendingChoice.pendingChainItems.find((entry) => entry.card?.instanceId === instanceId);
    if (item?.card) return relatedCard(item.card, { kind: "pendingChoice", choiceId: pendingChoice.id });
  }
  if (pendingChoice?.type === "effectSelection") {
    const card = pendingChoice.revealedCards.find((entry) => entry.instanceId === instanceId);
    if (card) return relatedCard(card, { kind: "pendingChoice", choiceId: pendingChoice.id });
  }

  return null;
}

export function toggleRelatedProjectedCardSelection(input: {
  instanceId: string;
  projection: GameProjection;
  selectedCardInstanceIds: ReadonlySet<string>;
}): Set<string> {
  if (!findRelatedProjectedCard(input.projection, input.instanceId)) {
    return new Set(input.selectedCardInstanceIds);
  }
  const selectedCardInstanceIds = new Set(input.selectedCardInstanceIds);
  if (selectedCardInstanceIds.has(input.instanceId)) {
    selectedCardInstanceIds.delete(input.instanceId);
  } else {
    selectedCardInstanceIds.add(input.instanceId);
  }
  return selectedCardInstanceIds;
}

export function createStructuredBugReport(input: {
  actual: string;
  capturedAt: string;
  expected: string;
  game: GameProjection;
  notes?: string;
  recentStates: readonly GameProjection[];
  relatedCardInstanceIds: readonly string[];
  reportId: string;
}): StructuredBugReport {
  const game = cloneViewerSafeProjection(input.game);
  const relatedCards = input.relatedCardInstanceIds.flatMap((instanceId) => {
    const card = findRelatedProjectedCard(game, instanceId);
    return card ? [card] : [];
  });
  const recentStates = input.recentStates
    .filter((entry) => entry.stateVersion !== game.stateVersion)
    .slice(-BUG_REPORT_HISTORY_LIMIT)
    .map(cloneViewerSafeProjection);

  return structuredBugReportSchema.parse({
    schemaVersion: BUG_REPORT_SCHEMA_VERSION,
    reportId: input.reportId,
    capturedAt: input.capturedAt,
    match: {
      matchId: game.matchId,
      gameId: game.id,
      gameNumber: game.gameNumber,
      stateVersion: game.stateVersion,
      viewerPlayerId: game.viewerPlayerId,
    },
    issue: {
      actual: input.actual,
      expected: input.expected,
      ...(input.notes?.trim() ? { notes: input.notes } : {}),
    },
    relatedCards,
    recentStates,
    game,
  });
}

export function serializeStructuredBugReport(report: StructuredBugReport): string {
  return JSON.stringify(report, null, 2);
}

function relatedCard(
  card: GameProjection["players"][number]["zones"][number]["cards"][number],
  location: RelatedProjectedCard["location"],
): RelatedProjectedCard {
  return {
    instanceId: card.instanceId,
    name: card.name,
    ownerPlayerId: card.ownerPlayerId,
    publicCode: card.publicCode,
    location,
  };
}
