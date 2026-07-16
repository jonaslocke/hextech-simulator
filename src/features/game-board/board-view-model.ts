import type {
  GameProjection,
  ProjectedAction,
  ProjectedCardView,
} from "@/shared/game";

export type BoardCatalogCard = {
  activeModifiers: NonNullable<ProjectedCardView["activeModifiers"]>;
  attributes: {
    energy: number | undefined;
    might: number | undefined;
    power: number | undefined;
  };
  classification: { domain: string[]; supertype: string | null; type: string };
  media: { image_url: string | null };
  metadata: Record<string, never>;
  name: string;
  ownerPlayerId: string;
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
  displayName: string;
  isViewer: boolean;
  points: number;
  runePool: {
    conditionalEnergy: Record<string, { amount: number; restriction: "spell" }>;
    energy: number;
    power: Record<string, number>;
  };
  availableAbilityIdsByCard: Record<string, string[]>;
  availablePaymentModes: Record<
    string,
    Array<{
      boardLocation: ProjectedAction["presentation"]["boardLocation"];
      disabledReason: string | null;
      enabled: boolean;
      id: string;
      label: string;
    }>
  >;
  legalTargetsByCard: Record<
    string,
    { cardInstanceIds: string[]; battlefieldIds: string[]; playerIds: string[] }
  >;
  zones: Record<
    | "legend"
    | "champion"
    | "mainDeck"
    | "runeDeck"
    | "hand"
    | "trash"
    | "banishment"
    | "base",
    BoardZoneProjection
  >;
};

export type BoardProjection = {
  id: string;
  matchId: string;
  gameNumber: number;
  status: GameProjection["status"];
  stateVersion: number;
  viewerPlayerId: string;
  winnerPlayerId: string | null;
  victoryScore: number;
  setup: GameProjection["setup"];
  turn: GameProjection["turn"];
  showdown: GameProjection["showdown"];
  combat: GameProjection["combat"];
  chain: null | {
    items: Array<
      GameProjection["chain"] extends infer T
        ? T extends { items: infer I }
          ? I extends Array<infer Item>
            ? Item & { cardInstanceId: string | null }
            : never
          : never
        : never
    >;
    relevantPlayerIds: string[];
    priorityPlayerId: string;
    passedPlayerIds: string[];
  };
  pendingChoice:
    | null
    | {
        id: string;
        playerId: string;
        type: "orderTriggers";
        prompt: string;
        optionIds: string[];
        pendingChainItems: NonNullable<BoardProjection["chain"]>["items"];
      }
    | {
        id: string;
        playerId: string;
        type: "effectSelection";
        prompt: string;
        title: string;
        waitingMessage: string;
        sourceZone: "hand" | "trash" | "mainDeck" | null;
        presentation: "cardSelection" | "vision";
        visionAction: "recycle" | "keep";
        revealedCards: ProjectedCardView[];
        minimum: number;
        maximum: number;
      }
    | {
        id: string;
        playerId: string;
        type: "assignCombatDamage";
        totalDamage: number;
      }
    | {
        id: string;
        playerId: string;
        type: "tokenPlacement";
        prompt: string;
        title: string;
        waitingMessage: string;
        tokenName: string;
        placementKind?: "token" | "unit";
        count: number;
        destinations: Array<{ id: string; label: string }>;
      }
    | {
        id: string;
        playerId: string;
        type: "binary";
        prompt: string;
        acceptLabel: string;
        declineLabel: string;
      }
    | {
        id: string;
        playerId: string;
        type: "mode";
        prompt: string;
        waitingMessage: string;
        options: Array<{ id: string; label: string }>;
      };
  players: Record<string, BoardPlayerProjection>;
  battlefields: Array<{
    battlefieldId: string;
    selectedByPlayerId: string;
    controllerPlayerId: string | null;
    contestedByPlayerId: string | null;
    cardInstanceId: string;
    units: string[];
    facedownCardInstanceIds: string[];
    facedownCardCount: number;
  }>;
  cardStates: Record<
    string,
    { exhausted: boolean; stunned: boolean; damage: number; computedMight?: number }
  >;
};

export function adaptProjectionToBoard(projection: GameProjection): {
  cardsByInstanceId: Record<string, BoardCatalogCard>;
  projection: BoardProjection;
} {
  const visibleCards = allVisibleCards(projection);
  const cardsByInstanceId = Object.fromEntries(
    visibleCards.map((card) => [card.instanceId, toCatalogCard(card)]),
  );
  const cardStates = Object.fromEntries(
    visibleCards.map((card) => [
      card.instanceId,
      {
        exhausted: card.exhausted,
        stunned: card.stunned ?? false,
        damage: card.damage,
        ...(card.computedMight === null
          ? {}
          : { computedMight: card.computedMight }),
      },
    ]),
  );
  const players: Record<string, BoardPlayerProjection> = Object.fromEntries(
    projection.players.map((player) => {
      const actions = projection.actions.filter(
        (action) => action.sourceCardInstanceId !== null && action.enabled,
      );
      const bySource = groupActionsBySource(actions);
      const zones = Object.fromEntries(
        player.zones.map((zone) => [
          zone.kind,
          {
            cardInstanceIds: zone.cards.map((card) => card.instanceId),
            count: zone.count,
            visibility: zone.visibility,
          },
        ]),
      ) as BoardPlayerProjection["zones"];
      const availablePaymentModes = Object.fromEntries(
        Object.entries(bySource).map(([sourceId, sourceActions]) => [
          sourceId,
          sourceActions.map((action) => ({
            boardLocation: action.presentation.boardLocation ?? null,
            disabledReason: action.disabledReason,
            enabled: action.enabled,
            id: action.id,
            label: action.label,
          })),
        ]),
      );
      const legalTargetsByCard = Object.fromEntries(
        Object.entries(bySource).map(([sourceId, sourceActions]) => {
          const requirements = sourceActions.flatMap(
            (action) => action.targets,
          );
          return [
            sourceId,
            {
              cardInstanceIds: requirements
                .filter((item) => item.kind === "card")
                .flatMap((item) => item.legalIds),
              battlefieldIds: requirements
                .filter((item) => item.kind === "battlefield")
                .flatMap((item) => item.legalIds),
              playerIds: requirements
                .filter((item) => item.kind === "player")
                .flatMap((item) => item.legalIds),
            },
          ];
        }),
      );
      return [
        player.playerId,
        {
          playerId: player.playerId,
          displayName: player.displayName ?? player.playerId,
          isViewer: player.isViewer,
          points: player.points,
          runePool: {
            conditionalEnergy:
              player.conditionalEnergy > 0
                ? {
                    spell: {
                      amount: player.conditionalEnergy,
                      restriction: "spell" as const,
                    },
                  }
                : ({} as Record<
                    string,
                    { amount: number; restriction: "spell" }
                  >),
            energy: player.energy,
            power: player.power,
          },
          availableAbilityIdsByCard: Object.fromEntries(
            Object.entries(bySource).map(([sourceId, sourceActions]) => [
              sourceId,
              sourceActions.map((action) => action.id),
            ]),
          ),
          availablePaymentModes,
          legalTargetsByCard,
          zones,
        } satisfies BoardPlayerProjection,
      ];
    }),
  );
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
      victoryScore: projection.victoryScore,
      setup: projection.setup,
      turn: projection.turn,
      showdown: projection.showdown,
      combat: projection.combat,
      chain: projection.chain
        ? {
            ...projection.chain,
            items: projection.chain.items.map((item) => ({
              ...item,
              cardInstanceId:
                item.kind === "spell" || item.kind === "unit"
                  ? item.sourceCardInstanceId
                  : null,
            })),
          }
        : null,
      pendingChoice:
        projection.pendingChoice?.type === "orderTriggers"
          ? {
              ...projection.pendingChoice,
              pendingChainItems: projection.pendingChoice.pendingChainItems.map(
                (item) => ({
                  ...item,
                  cardInstanceId:
                    item.kind === "spell" || item.kind === "unit"
                      ? item.sourceCardInstanceId
                      : null,
                }),
              ),
            }
          : projection.pendingChoice,
      players,
      battlefields: projection.battlefields.map((battlefield) => ({
        battlefieldId: battlefield.battlefieldId,
        selectedByPlayerId: battlefield.selectedByPlayerId,
        controllerPlayerId: battlefield.controllerPlayerId,
        contestedByPlayerId: battlefield.contestedByPlayerId,
        cardInstanceId: battlefield.card.instanceId,
        units: battlefield.units.map((unit) => unit.instanceId),
        facedownCardInstanceIds: battlefield.facedownCards.map(
          (card) => card.instanceId,
        ),
        facedownCardCount: battlefield.facedownCardCount,
      })),
      cardStates,
    },
  };
}

function allVisibleCards(projection: GameProjection): ProjectedCardView[] {
  const cards = [
    ...projection.players.flatMap((player) =>
      player.zones.flatMap((zone) => zone.cards),
    ),
    ...projection.battlefields.flatMap((battlefield) => [
      battlefield.card,
      ...battlefield.units,
      ...battlefield.facedownCards,
    ]),
    ...(projection.chain?.items.flatMap((item) =>
      item.card ? [item.card] : [],
    ) ?? []),
    ...(projection.pendingChoice?.type === "orderTriggers"
      ? projection.pendingChoice.pendingChainItems.flatMap((item) =>
          item.card ? [item.card] : [],
        )
      : []),
    ...(projection.pendingChoice?.type === "effectSelection"
      ? projection.pendingChoice.revealedCards
      : []),
    ...(projection.selectionCards ?? []),
  ];
  return [...new Map(cards.map((card) => [card.instanceId, card])).values()];
}

function toCatalogCard(card: ProjectedCardView): BoardCatalogCard {
  return {
    activeModifiers: card.activeModifiers ?? [],
    attributes: {
      energy: card.energy ?? undefined,
      might: card.might ?? undefined,
      power: card.power ?? undefined,
    },
    classification: {
      domain: card.domains,
      supertype: card.supertype,
      type: card.type,
    },
    media: { image_url: card.imageUrl },
    metadata: {},
    name: card.name,
    ownerPlayerId: card.ownerPlayerId,
    public_code: card.publicCode,
    set: { label: "" },
    text: { plain: card.rulesText },
  };
}

function groupActionsBySource(
  actions: ProjectedAction[],
): Record<string, ProjectedAction[]> {
  const grouped: Record<string, ProjectedAction[]> = {};
  for (const action of actions) {
    if (!action.sourceCardInstanceId) continue;
    (grouped[action.sourceCardInstanceId] ??= []).push(action);
  }
  return grouped;
}
