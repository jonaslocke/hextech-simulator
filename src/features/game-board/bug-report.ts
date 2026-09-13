import {
  BUG_REPORT_HISTORY_LIMIT,
  BUG_REPORT_MAX_RELATED_CARDS,
  BUG_REPORT_SCHEMA_VERSION,
  structuredBugReportSchema,
  type RelatedProjectedCard,
  type StructuredBugReport,
} from "@/shared/bug-report";
import type { GameProjection } from "@/shared/game";

export function cloneViewerSafeProjection(
  projection: GameProjection,
): GameProjection {
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
      if (card) {
        return relatedCard(card, {
          kind: "zone",
          playerId: player.playerId,
          zoneKind: zone.kind,
        });
      }
    }
  }
  for (const battlefield of projection.battlefields) {
    if (battlefield.card.instanceId === instanceId) {
      return relatedCard(battlefield.card, {
        kind: "battlefield",
        battlefieldId: battlefield.battlefieldId,
        role: "battlefield",
      });
    }
    const unit = battlefield.units.find((card) => card.instanceId === instanceId);
    if (unit) {
      return relatedCard(unit, {
        kind: "battlefield",
        battlefieldId: battlefield.battlefieldId,
        role: "unit",
      });
    }
    const attachment = battlefield.attachedCards?.find(
      (card) => card.instanceId === instanceId,
    );
    if (attachment) {
      return relatedCard(attachment, {
        kind: "battlefield",
        battlefieldId: battlefield.battlefieldId,
        role: "attachment",
      });
    }
    if (battlefield.facedownCard?.instanceId === instanceId) {
      return relatedCard(battlefield.facedownCard, {
        kind: "battlefield",
        battlefieldId: battlefield.battlefieldId,
        role: "facedown",
      });
    }
  }
  const setupCard = projection.setup.battlefieldPool.find(
    (card) => card.instanceId === instanceId,
  );
  if (setupCard) return relatedCard(setupCard, { kind: "setupBattlefieldPool" });
  const chainItem = projection.chain?.items.find(
    (item) => item.card?.instanceId === instanceId,
  );
  if (chainItem?.card) {
    return relatedCard(chainItem.card, {
      kind: "chain",
      chainItemId: chainItem.id,
    });
  }
  const pendingChoice = projection.pendingChoice;
  if (pendingChoice?.type === "orderTriggers") {
    const item = pendingChoice.pendingChainItems.find(
      (entry) => entry.card?.instanceId === instanceId,
    );
    if (item?.card) {
      return relatedCard(item.card, {
        kind: "pendingChoice",
        choiceId: pendingChoice.id,
      });
    }
  }
  if (pendingChoice?.type === "effectSelection") {
    const card = [
      ...pendingChoice.revealedCards,
      ...(pendingChoice.visibleCards ?? []),
    ].find((entry) => entry.instanceId === instanceId);
    if (card) {
      return relatedCard(card, {
        kind: "pendingChoice",
        choiceId: pendingChoice.id,
      });
    }
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
  } else if (selectedCardInstanceIds.size < BUG_REPORT_MAX_RELATED_CARDS) {
    selectedCardInstanceIds.add(input.instanceId);
  }
  return selectedCardInstanceIds;
}

export function routeReportCardInteraction(input: {
  instanceId?: string;
  isReportMode: boolean;
  onDiagnosticToggle: (instanceId: string) => void;
  onGameplayInteraction: () => void;
}): "diagnostic" | "gameplay" | "ignored" {
  if (!input.isReportMode) {
    input.onGameplayInteraction();
    return "gameplay";
  }

  if (!input.instanceId) {
    return "ignored";
  }

  input.onDiagnosticToggle(input.instanceId);
  return "diagnostic";
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
