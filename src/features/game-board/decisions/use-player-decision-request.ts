"use client";

import type { GameProjection, ProjectedCardView } from "@/shared/game";
import { useMemo } from "react";
import type { BoardCatalogCard } from "../board-view-model";
import type {
  PlayerDecisionCard,
  PlayerDecisionRequest,
} from "./player-decision-types";

export type PlayerDecisionRequestInput = {
  activeTargetSelection?: {
    actionId: string;
    legalTargetIds: string[];
    maxTargets: number;
    minTargets: number;
    targetKind: "battlefield" | "card" | "location" | "chainItem";
  } | null;
  sourceProjection: GameProjection;
  cardsByInstanceId: Record<string, BoardCatalogCard>;
  playerNames?: Partial<Record<string, string>>;
};

export function usePlayerDecisionRequest(
  input: PlayerDecisionRequestInput,
): PlayerDecisionRequest | null {
  const {
    activeTargetSelection,
    cardsByInstanceId,
    playerNames,
    sourceProjection,
  } = input;

  return useMemo(
    () =>
      buildPlayerDecisionRequest({
        activeTargetSelection,
        cardsByInstanceId,
        playerNames,
        sourceProjection,
      }),
    [
      activeTargetSelection,
      cardsByInstanceId,
      playerNames,
      sourceProjection,
    ],
  );
}

export function buildPlayerDecisionRequest({
  activeTargetSelection,
  cardsByInstanceId,
  playerNames = {},
  sourceProjection,
}: PlayerDecisionRequestInput): PlayerDecisionRequest | null {
  const pendingChoice = sourceProjection.pendingChoice;
  const viewerPlayerId = sourceProjection.viewerPlayerId;

  if (pendingChoice?.playerId === viewerPlayerId) {
    if (pendingChoice.type === "assignCombatDamage") {
      const action = sourceProjection.actions.find(
        (candidate) => candidate.choice?.kind === "combatDamage",
      );

      if (action?.choice?.kind === "combatDamage") {
        return {
          actionId: action.id,
          choice: action.choice,
          decisionKey: pendingChoice.id,
          inspection: "publicGameState",
          kind: "combatDamage",
        };
      }
    }

    if (pendingChoice.type === "effectSelection") {
      const action = sourceProjection.actions.find(
        (candidate) =>
          candidate.choice?.kind === "effectSelection" &&
          candidate.choice.choiceId === pendingChoice.id,
      );

      if (action && pendingChoice.presentation === "vision") {
        return {
          actionId: action.id,
          cards: pendingChoice.revealedCards.map(toDecisionCard),
          confirmLabel: visionConfirmLabel,
          decisionKey: createDecisionKey({
            actorPlayerId: pendingChoice.playerId,
            decisionId: pendingChoice.id,
            kind: pendingChoice.type,
            maximum: pendingChoice.maximum,
            minimum: pendingChoice.minimum,
            selectableIds: pendingChoice.revealedCards.map(
              (card) => card.instanceId,
            ),
            source: pendingChoice.presentation,
          }),
          description:
            "Choose cards to recycle. Unselected cards stay on top.",
          inspection: "publicGameState",
          kind: "cardSelection",
          maxSelected: pendingChoice.revealedCards.length,
          minSelected: 0,
          selectionMode: "multiple",
          title: "Vision",
        };
      }

      if (
        action &&
        pendingChoice.presentation === "cardSelection" &&
        pendingChoice.sourceZone
      ) {
        const requirement = action.targets.find(
          (target) => target.kind === "card",
        );
        const visibleCardById = visibleCardsById(sourceProjection);
        const legalIds = requirement?.legalIds ?? [];
        const visibleCards =
          (pendingChoice.visibleCards?.length ?? 0) > 0
            ? pendingChoice.visibleCards ?? []
            : legalIds.map((id) =>
                visibleCardById.get(id) ??
                toProjectedCardPlaceholder(id, cardsByInstanceId[id]),
              );

        return {
          actionId: action.id,
          cards: visibleCards.map((card) => ({
            ...toDecisionCardFromSources(
              card.instanceId,
              card,
              cardsByInstanceId[card.instanceId],
            ),
            disabled: !legalIds.includes(card.instanceId),
          })),
          confirmLabel:
            pendingChoice.sourceZone === "hand"
              ? "Discard selected card"
              : "Choose card",
          decisionKey: createDecisionKey({
            actorPlayerId: pendingChoice.playerId,
            decisionId: pendingChoice.id,
            kind: pendingChoice.type,
            maximum: pendingChoice.maximum,
            minimum: pendingChoice.minimum,
            selectableIds: legalIds,
            source: pendingChoice.sourceZone,
          }),
          description: pendingChoice.prompt,
          inspection: "publicGameState",
          kind: "cardSelection",
          maxSelected: pendingChoice.maximum,
          minSelected: pendingChoice.minimum,
          selectionMode:
            pendingChoice.maximum === 1 ? "single" : "multiple",
          title:
            pendingChoice.sourceZone === "hand"
              ? "Discard from Hand"
              : pendingChoice.sourceZone === "trash"
                ? "Choose from Trash"
                : pendingChoice.title,
        };
      }
    }

    if (pendingChoice.type === "tokenPlacement") {
      const action = sourceProjection.actions.find(
        (candidate) =>
          candidate.choice?.kind === "tokenPlacement" &&
          candidate.choice.choiceId === pendingChoice.id,
      );

      if (action?.choice?.kind === "tokenPlacement") {
        return {
          actionId: action.id,
          confirmLabel: "Place tokens",
          count: pendingChoice.count,
          decisionKey: createDecisionKey({
            actorPlayerId: pendingChoice.playerId,
            decisionId: pendingChoice.id,
            kind: pendingChoice.type,
            maximum: pendingChoice.count,
            minimum: pendingChoice.count,
            selectableIds: pendingChoice.destinations.map(
              (destination) => destination.id,
            ),
            source: "token-placement",
          }),
          description: pendingChoice.prompt,
          destinations: pendingChoice.destinations,
          kind: "tokenPlacement",
          title: pendingChoice.title,
          tokenName: pendingChoice.tokenName,
        };
      }
    }

    if (pendingChoice.type === "orderTriggers") {
      const action = sourceProjection.actions.find(
        (candidate) =>
          candidate.choice?.kind === "orderedOptions" &&
          candidate.choice.choiceId === pendingChoice.id,
      );

      if (action) {
        const itemById = new Map(
          pendingChoice.pendingChainItems.map((item) => [item.id, item]),
        );

        return {
          actionId: action.id,
          confirmLabel: "Submit order",
          decisionKey: createDecisionKey({
            actorPlayerId: pendingChoice.playerId,
            decisionId: pendingChoice.id,
            kind: pendingChoice.type,
            maximum: pendingChoice.optionIds.length,
            minimum: pendingChoice.optionIds.length,
            selectableIds: pendingChoice.optionIds,
            source: "trigger-order",
          }),
          description:
            "Move triggered effects into the order they should resolve.",
          inspection: "publicGameState",
          kind: "orderedDecision",
          options: pendingChoice.optionIds.map((id) => {
            const item = itemById.get(id);
            const cardInstanceId = item?.sourceCardInstanceId;

            return {
              description: item ? formatChainItemKind(item.kind) : undefined,
              id,
              imageUrl:
                item?.card?.imageUrl ??
                (cardInstanceId
                  ? cardsByInstanceId[cardInstanceId]?.media.image_url ??
                    undefined
                  : undefined),
              label: item?.label ?? id,
            };
          }),
          title: pendingChoice.prompt,
        };
      }
    }

    if (pendingChoice.type === "effectOption") {
      const action = sourceProjection.actions.find(
        (candidate) =>
          candidate.choice?.kind === "effectOption" &&
          candidate.choice.choiceId === pendingChoice.id,
      );

      if (action?.choice?.kind === "effectOption") {
        return {
          actionId: action.id,
          confirmLabel: "Confirm",
          decisionKey: createDecisionKey({
            actorPlayerId: pendingChoice.playerId,
            decisionId: pendingChoice.id,
            kind: pendingChoice.type,
            maximum: 1,
            minimum: 1,
            selectableIds: pendingChoice.options.map((option) => option.id),
            source: "effect-option",
          }),
          description: pendingChoice.prompt,
          inspection: "none",
          kind: "optionDecision",
          options: pendingChoice.options.map((option) => ({
            id: option.id,
            label: option.label,
          })),
          revealedCards: pendingChoice.revealedCards.map(toDecisionCard),
          title: pendingChoice.title,
        };
      }
    }

    if (pendingChoice.type === "orderReplacements") {
      const action = sourceProjection.actions.find(
        (candidate) =>
          candidate.choice?.kind === "orderedOptions" &&
          candidate.choice.choiceId === pendingChoice.id,
      );

      if (action) {
        const visibleCardById = visibleCardsById(sourceProjection);
        return {
          actionId: action.id,
          confirmLabel: "Submit order",
          decisionKey: createDecisionKey({
            actorPlayerId: pendingChoice.playerId,
            decisionId: pendingChoice.id,
            kind: pendingChoice.type,
            maximum: pendingChoice.options.length,
            minimum: pendingChoice.options.length,
            selectableIds: pendingChoice.options.map((option) => option.id),
            source: "replacement-order",
          }),
          description:
            "Order replacement effects. The first applicable effect is applied first.",
          inspection: "publicGameState",
          kind: "orderedDecision",
          options: pendingChoice.options.map((option) => {
            const card = visibleCardById.get(option.sourceCardInstanceId);
            const catalogCard = cardsByInstanceId[option.sourceCardInstanceId];
            return {
              id: option.id,
              imageUrl: card?.imageUrl ?? catalogCard?.media.image_url ?? undefined,
              label: card?.name ?? catalogCard?.name ?? option.sourceCardInstanceId,
            };
          }),
          title: pendingChoice.prompt,
        };
      }
    }
  }

  const combatDamageAction = sourceProjection.actions.find(
    (action) => action.choice?.kind === "combatDamage",
  );

  if (combatDamageAction?.choice?.kind === "combatDamage") {
    return {
      actionId: combatDamageAction.id,
      choice: combatDamageAction.choice,
      decisionKey: combatDamageAction.id,
      inspection: "publicGameState",
      kind: "combatDamage",
    };
  }

  const activeNonBoardCardDecision = activeTargetSelection
    ? mapActiveNonBoardCardDecision({
        activeTargetSelection,
        cardsByInstanceId,
        sourceProjection,
      })
    : null;

  if (activeNonBoardCardDecision) {
    return activeNonBoardCardDecision;
  }

  if (pendingChoice && pendingChoice.playerId !== viewerPlayerId) {
    const playerName = playerNames[pendingChoice.playerId] ?? pendingChoice.playerId;

    switch (pendingChoice.type) {
      case "assignCombatDamage":
        return {
          inspection: "none",
          kind: "pendingDecision",
          message: `Waiting for ${playerName} to assign combat damage.`,
          title: "Combat Damage",
          tone: "amber",
        };
      case "effectSelection":
        return {
          inspection: "none",
          kind: "pendingDecision",
          message: pendingChoice.waitingMessage,
          title: pendingChoice.title,
        };
      case "effectOption":
        return {
          inspection: "none",
          kind: "pendingDecision",
          message: pendingChoice.waitingMessage,
          revealedCards: pendingChoice.revealedCards.map(toDecisionCard),
          title: pendingChoice.title,
        };
      case "tokenPlacement":
        return {
          kind: "pendingDecision",
          message: pendingChoice.waitingMessage,
          title: pendingChoice.title,
        };
      case "orderTriggers":
        return {
          inspection: "none",
          kind: "pendingDecision",
          message: `Waiting for ${playerName} to choose the order of triggered abilities.`,
          title: "Triggered abilities",
          tone: "amber",
        };
      case "orderReplacements":
        return {
          inspection: "none",
          kind: "pendingDecision",
          message: `Waiting for ${playerName} to choose the order of replacement effects.`,
          title: "Replacement effects",
          tone: "amber",
        };
    }
  }

  return null;
}

function mapActiveNonBoardCardDecision({
  activeTargetSelection,
  cardsByInstanceId,
  sourceProjection,
}: Pick<
  PlayerDecisionRequestInput,
  "activeTargetSelection" | "cardsByInstanceId" | "sourceProjection"
>): PlayerDecisionRequest | null {
  if (
    !activeTargetSelection ||
    activeTargetSelection.targetKind !== "card" ||
    activeTargetSelection.legalTargetIds.length === 0
  ) {
    return null;
  }

  const action = sourceProjection.actions.find(
    (candidate) => candidate.id === activeTargetSelection.actionId,
  );

  if (!action) {
    return null;
  }

  const cardLocationById = cardLocationsById(sourceProjection);
  const locations = activeTargetSelection.legalTargetIds.map((id) =>
    cardLocationById.get(id),
  );

  if (
    locations.some(
      (location) => !location || !isNonBoardSelectionZone(location.zoneKind),
    )
  ) {
    return null;
  }

  const zoneKinds = new Set(locations.map((location) => location!.zoneKind));
  const zoneKind = zoneKinds.size === 1 ? locations[0]!.zoneKind : null;
  const requirement = action.targets.find(
    (target) =>
      target.kind === "card" &&
      target.minimum === activeTargetSelection.minTargets &&
      target.maximum === activeTargetSelection.maxTargets &&
      arraysEqual(target.legalIds, activeTargetSelection.legalTargetIds),
  );

  return {
    actionId: action.id,
    canCancel: true,
    cards: activeTargetSelection.legalTargetIds.map((id) => {
      const location = cardLocationById.get(id)!;

      return toDecisionCardFromSources(
        id,
        location.card,
        cardsByInstanceId[id],
      );
    }),
    confirmLabel: "Choose card",
    decisionKey: createDecisionKey({
      actorPlayerId: sourceProjection.viewerPlayerId,
      decisionId: action.id,
      kind: "activeTargetSelection",
      maximum: activeTargetSelection.maxTargets,
      minimum: activeTargetSelection.minTargets,
      selectableIds: activeTargetSelection.legalTargetIds,
      source: activeTargetSelection.targetKind,
    }),
    description: `Choose ${requirement?.label ?? "card"}`,
    inspection: "publicGameState",
    kind: "cardSelection",
    maxSelected: activeTargetSelection.maxTargets,
    minSelected: activeTargetSelection.minTargets,
    selectionMode:
      activeTargetSelection.maxTargets === 1 &&
      activeTargetSelection.minTargets > 0
        ? "single"
        : "multiple",
    title: zoneKind ? selectionTitleForZone(zoneKind) : "Choose Cards",
  };
}

function visibleCardsById(projection: GameProjection) {
  return new Map(
    projection.players
      .flatMap((player) => player.zones)
      .flatMap((zone) => zone.cards)
      .concat(
        projection.pendingChoice?.type === "effectSelection"
          ? [
              ...projection.pendingChoice.revealedCards,
              ...(projection.pendingChoice.visibleCards ?? []),
            ]
          : projection.pendingChoice?.type === "effectOption"
            ? projection.pendingChoice.revealedCards
            : [],
      )
      .map((card) => [card.instanceId, card]),
  );
}

type ProjectedZoneKind =
  GameProjection["players"][number]["zones"][number]["kind"];

function cardLocationsById(projection: GameProjection) {
  return new Map(
    projection.players.flatMap((player) =>
      player.zones.flatMap((zone) =>
        zone.cards.map((card) => [
          card.instanceId,
          { card, zoneKind: zone.kind },
        ] as const),
      ),
    ),
  );
}

function isNonBoardSelectionZone(zoneKind: ProjectedZoneKind) {
  return (
    zoneKind === "hand" ||
    zoneKind === "trash" ||
    zoneKind === "mainDeck" ||
    zoneKind === "runeDeck" ||
    zoneKind === "banishment"
  );
}

function selectionTitleForZone(zoneKind: ProjectedZoneKind) {
  switch (zoneKind) {
    case "trash":
      return "Choose from Trash";
    case "hand":
      return "Choose from Hand";
    case "mainDeck":
      return "Choose from Main Deck";
    case "runeDeck":
      return "Choose from Rune Deck";
    case "banishment":
      return "Choose from Banishment";
    default:
      return "Choose Cards";
  }
}

function arraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function toDecisionCard(card: ProjectedCardView): PlayerDecisionCard {
  return {
    description: card.type,
    id: card.instanceId,
    imageUrl: card.imageUrl ?? undefined,
    label: card.name,
  };
}

function toDecisionCardFromSources(
  id: string,
  card: ProjectedCardView | undefined,
  catalogCard: BoardCatalogCard | undefined,
): PlayerDecisionCard {
  if (card) {
    return toDecisionCard(card);
  }

  return {
    description: catalogCard?.classification.type,
    id,
    imageUrl: catalogCard?.media.image_url ?? undefined,
    label: catalogCard?.name ?? id,
  };
}

function toProjectedCardPlaceholder(
  instanceId: string,
  card: BoardCatalogCard | undefined,
): ProjectedCardView {
  return {
    instanceId,
    ownerPlayerId: "",
    name: card?.name ?? instanceId,
    imageUrl: card?.media.image_url ?? null,
    rulesText: card?.text.plain ?? "",
    publicCode: card?.public_code ?? instanceId,
    type: card?.classification.type ?? "Card",
    supertype: card?.classification.supertype ?? null,
    domains: card?.classification.domain ?? [],
    energy: card?.attributes.energy ?? null,
    might: card?.attributes.might ?? null,
    power: card?.attributes.power ?? null,
    computedMight: null,
    damage: 0,
    exhausted: false,
    empowered: false,
    attachedToCardInstanceId: null,
  };
}

function visionConfirmLabel(selectedIds: string[]) {
  if (selectedIds.length === 0) {
    return "Keep on top";
  }

  return selectedIds.length === 1
    ? "Recycle selected card"
    : `Recycle ${selectedIds.length} cards`;
}

function createDecisionKey(input: {
  actorPlayerId: string;
  decisionId: string;
  kind: string;
  maximum?: number;
  minimum?: number;
  selectableIds?: string[];
  source: string | null;
}) {
  // This key identifies the logical decision draft only. Do not include legal
  // option ids or min/max constraints here: those can change after a projection
  // refresh while the player is still making the same decision.
  return JSON.stringify([
    input.kind,
    input.decisionId,
    input.actorPlayerId,
    input.source,
  ]);
}

function formatChainItemKind(kind: string) {
  switch (kind) {
    case "ability":
      return "Ability";
    case "spell":
      return "Spell";
    case "trigger":
      return "Triggered ability";
    case "unit":
      return "Unit";
    default:
      return undefined;
  }
}
