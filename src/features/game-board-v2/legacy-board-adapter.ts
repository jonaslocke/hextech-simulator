import type { GameProjectionV2, ProjectedAction, ProjectedCardView } from "@/shared/game-v2";

export type BoardCatalogCard = {
  attributes: { energy: number | undefined; might: number | undefined; power: number | undefined };
  classification: { domain: string[]; supertype: string | null; type: string };
  media: { image_url: string | null };
  metadata: Record<string, never>;
  name: string;
  public_code: string;
  set: { label: string };
  text: { plain: string };
};

export type BoardZoneProjection = {
  cardInstanceIds: string[];
  count: number;
  visibility: "public" | "private" | "secret";
};

export type BoardPlayerProjection = {
  playerId: string;
  isViewer: boolean;
  runePool: {
    conditionalEnergy: Record<string, { amount: number; restriction: "spell" }>;
    energy: number;
    power: Record<string, number>;
  };
  availableAbilityIdsByCard: Record<string, string[]>;
  availablePaymentModes: Record<string, Array<{ id: string; label: string }>>;
  legalTargetsByCard: Record<string, { cardInstanceIds: string[]; battlefieldIds: string[]; playerIds: string[] }>;
  zones: Record<"legend" | "champion" | "mainDeck" | "runeDeck" | "hand" | "trash" | "banishment" | "base", BoardZoneProjection>;
};

export type LegacyBoardProjection = {
  id: string;
  matchId: string;
  gameNumber: number;
  status: GameProjectionV2["status"];
  stateVersion: number;
  viewerPlayerId: string;
  winnerPlayerId: string | null;
  setup: GameProjectionV2["setup"];
  turn: GameProjectionV2["turn"];
  showdown: GameProjectionV2["showdown"];
  chain: null | {
    items: Array<GameProjectionV2["chain"] extends infer T ? T extends { items: infer I } ? I extends Array<infer Item> ? Item & { cardInstanceId: string | null } : never : never : never>;
    relevantPlayerIds: string[];
    priorityPlayerId: string;
    passedPlayerIds: string[];
  };
  pendingChoice: null | {
    id: string;
    playerId: string;
    type: "orderTriggers";
    prompt: string;
    optionIds: string[];
    pendingChainItems: NonNullable<LegacyBoardProjection["chain"]>["items"];
  };
  players: Record<string, BoardPlayerProjection>;
  battlefields: Array<{
    battlefieldId: string;
    selectedByPlayerId: string;
    cardInstanceId: string;
    units: string[];
    facedownSlot: null;
  }>;
  cardStates: Record<string, { exhausted: boolean; damage: number; computedMight?: number }>;
};

export function adaptProjectionToLegacyBoard(projection: GameProjectionV2): {
  cardsByInstanceId: Record<string, BoardCatalogCard>;
  projection: LegacyBoardProjection;
} {
  const visibleCards = allVisibleCards(projection);
  const cardsByInstanceId = Object.fromEntries(visibleCards.map((card) => [card.instanceId, toCatalogCard(card)]));
  const cardStates = Object.fromEntries(visibleCards.map((card) => [card.instanceId, {
    exhausted: card.exhausted,
    damage: card.damage,
    ...(card.computedMight === null ? {} : { computedMight: card.computedMight })
  }]));
  const players: Record<string, BoardPlayerProjection> = Object.fromEntries(projection.players.map((player) => {
    const actions = projection.actions.filter((action) => action.sourceCardInstanceId !== null);
    const bySource = groupActionsBySource(actions);
    const zones = Object.fromEntries(player.zones.map((zone) => [zone.kind, {
      cardInstanceIds: zone.cards.map((card) => card.instanceId),
      count: zone.count,
      visibility: zone.visibility
    }])) as BoardPlayerProjection["zones"];
    const availablePaymentModes = Object.fromEntries(Object.entries(bySource).map(([sourceId, sourceActions]) => [sourceId,
      sourceActions.map((action) => ({ id: action.id, label: action.label }))
    ]));
    const legalTargetsByCard = Object.fromEntries(Object.entries(bySource).map(([sourceId, sourceActions]) => {
      const requirements = sourceActions.flatMap((action) => action.targets);
      return [sourceId, {
        cardInstanceIds: requirements.filter((item) => item.kind === "card").flatMap((item) => item.legalIds),
        battlefieldIds: requirements.filter((item) => item.kind === "battlefield").flatMap((item) => item.legalIds),
        playerIds: requirements.filter((item) => item.kind === "player").flatMap((item) => item.legalIds)
      }];
    }));
    return [player.playerId, {
      playerId: player.playerId,
      isViewer: player.isViewer,
      runePool: {
        conditionalEnergy: player.conditionalEnergy > 0
          ? { spell: { amount: player.conditionalEnergy, restriction: "spell" as const } }
          : {} as Record<string, { amount: number; restriction: "spell" }>,
        energy: player.energy,
        power: player.power
      },
      availableAbilityIdsByCard: Object.fromEntries(Object.entries(bySource).map(([sourceId, sourceActions]) => [sourceId, sourceActions.map((action) => action.id)])),
      availablePaymentModes,
      legalTargetsByCard,
      zones
    } satisfies BoardPlayerProjection];
  }));
  return {
    cardsByInstanceId,
    projection: {
      id: projection.id,
      matchId: projection.matchId,
      gameNumber: projection.gameNumber,
      status: projection.status,
      stateVersion: projection.stateVersion,
      viewerPlayerId: projection.viewerPlayerId,
      winnerPlayerId: projection.winnerPlayerId,
      setup: projection.setup,
      turn: projection.turn,
      showdown: projection.showdown,
      chain: projection.chain ? {
        ...projection.chain,
        items: projection.chain.items.map((item) => ({ ...item, cardInstanceId: item.kind === "spell" || item.kind === "unit" ? item.sourceCardInstanceId : null }))
      } : null,
      pendingChoice: projection.pendingChoice ? {
        ...projection.pendingChoice,
        type: "orderTriggers",
        pendingChainItems: projection.chain?.items
          .filter((item) => projection.pendingChoice?.optionIds.includes(item.id))
          .map((item) => ({ ...item, cardInstanceId: item.kind === "spell" || item.kind === "unit" ? item.sourceCardInstanceId : null })) ?? []
      } : null,
      players,
      battlefields: projection.battlefields.map((battlefield) => ({
        battlefieldId: battlefield.battlefieldId,
        selectedByPlayerId: battlefield.selectedByPlayerId,
        cardInstanceId: battlefield.card.instanceId,
        units: battlefield.units.map((unit) => unit.instanceId),
        facedownSlot: null
      })),
      cardStates
    }
  };
}

function allVisibleCards(projection: GameProjectionV2): ProjectedCardView[] {
  const cards = [
    ...projection.players.flatMap((player) => player.zones.flatMap((zone) => zone.cards)),
    ...projection.battlefields.flatMap((battlefield) => [battlefield.card, ...battlefield.units, ...(battlefield.facedownCard ? [battlefield.facedownCard] : [])])
  ];
  return [...new Map(cards.map((card) => [card.instanceId, card])).values()];
}

function toCatalogCard(card: ProjectedCardView): BoardCatalogCard {
  return {
    attributes: {
      energy: card.energy ?? undefined,
      might: card.might ?? undefined,
      power: card.power ?? undefined
    },
    classification: { domain: card.domains, supertype: card.supertype, type: card.type },
    media: { image_url: card.imageUrl },
    metadata: {},
    name: card.name,
    public_code: card.publicCode,
    set: { label: "" },
    text: { plain: card.rulesText }
  };
}

function groupActionsBySource(actions: ProjectedAction[]): Record<string, ProjectedAction[]> {
  const grouped: Record<string, ProjectedAction[]> = {};
  for (const action of actions) {
    if (!action.sourceCardInstanceId) continue;
    (grouped[action.sourceCardInstanceId] ??= []).push(action);
  }
  return grouped;
}
