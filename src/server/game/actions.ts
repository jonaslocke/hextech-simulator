import type { ProjectedAction } from "../../shared/game";
import {
  compileBehaviorModel,
  createBehaviorContext,
  executeBehaviorClause,
  selectionRequirementsForClause,
  submitTriggerOrder,
  targetRequirementsForClause,
} from "./behavior-runtime";
import {
  cleanupTurnModifiers,
  createPrimitiveHandlers,
  createRuntimeCardIndex,
  definitionForInstance,
  effectiveEnergyCost,
  placeUnitAtBattlefield,
  recordCardPlayed,
  recomputeAllMight,
  recomputeMight,
  type RuntimeCardIndex,
} from "./primitive-handlers";
import {
  clearMarkedDamage,
  clearStunned,
  cleanupBoard,
  markBattlefieldContested,
  openPendingNonCombatShowdown,
  resolveNonCombatShowdown,
  unitControllers,
} from "./board-rules";
import {
  beginCombatDamage,
  combatChoiceTargets,
  startCombat,
  submitCombatDamage,
  type DamageAssignment,
} from "./combat";
import {
  beginDelayedEffectResolution,
  dispatchBehaviorEvent,
  queueChainItemsForTargets,
  queueDelayedEffects,
  submitChainTargetSelection,
} from "./triggers";
import type { DeckSnapshotDocument } from "./repositories";
import type { GameCardDefinition } from "./schemas";
import type { ChainItem, GameDocument } from "./state";
import {
  addConsecutivePass,
  currentTiming,
  nextRelevantPlayer,
  type TurnTiming,
} from "./timing";
import {
  acceptedActionEvent,
  stateChangeEvents,
  type GameTransition,
} from "./transitions";
import {
  availableAnyPowerAfterBaseCost,
  buildPaymentPlan,
  payCardCost,
  targetDeflectCost,
} from "./payment";
import {
  beginEffectResolution,
  submitEffectSelection,
  submitBinaryChoice,
  submitTokenPlacement,
  type TokenPlacement,
} from "./effect-resolution";
import {
  isLegalUnitDestination,
  legalUnitDestinationIds,
} from "./unit-destinations";
import {
  addFacedownCard,
  facedownCardsAt,
  hasFacedownCapacity,
  removeFacedownCard,
} from "./facedown-cards";
import { applyStartOfTurn, isStartOfTurnPhase } from "./turns";

// Non-standard rules override. Disable to require normal Action/Reaction timing.
const ALLOW_ADD_ABILITIES_WHEN_PLAYER_HAS_PRIORITY = true;

export function gameplayActions(
  game: GameDocument,
  actorPlayerId: string,
  decks: readonly DeckSnapshotDocument[],
): ProjectedAction[] {
  if (game.status !== "in_progress") return [];
  const index = createRuntimeCardIndex(decks, game);
  const handlers = createPrimitiveHandlers(index);
  const player = game.state.players[actorPlayerId];
  if (!player) return [];
  const actions: ProjectedAction[] = [
    action(game, "concede", "Concede Game", null),
  ];
  if (game.state.pendingChoice) {
    const pendingChoice = game.state.pendingChoice;
    if (pendingChoice.playerId !== actorPlayerId) return actions;
    if (pendingChoice.type === "assignCombatDamage") {
      actions.push(
        action(
          game,
          "assignCombatDamage",
          `Assign ${pendingChoice.totalDamage} combat damage`,
          null,
          true,
          null,
          undefined,
          [],
          {
            kind: "combatDamage",
            totalDamage: pendingChoice.totalDamage,
            targets: combatChoiceTargets(game, index),
          },
        ),
      );
      return actions;
    }
    if (pendingChoice.type === "effectSelection") {
      actions.push(
        action(
          game,
          "submitChoice",
          pendingChoice.prompt,
          null,
          true,
          null,
          undefined,
          pendingChoice.targetRequirements?.length
            ? pendingChoice.targetRequirements
            : [
                {
                  kind: pendingChoice.optionKind,
                  label: pendingChoice.prompt,
                  sourceZone: pendingChoice.sourceZone ?? undefined,
                  legalIds: pendingChoice.legalCardIds,
                  minimum: pendingChoice.minimum,
                  maximum: pendingChoice.maximum,
                },
              ],
          {
            kind: "effectSelection",
            choiceId: pendingChoice.id,
            prompt: pendingChoice.prompt,
          },
        ),
      );
      return actions;
    }
    if (pendingChoice.type === "tokenPlacement") {
      const destinations = pendingChoice.legalDestinationIds.map((id) => ({
        id,
        label: pendingChoice.destinationLabels[id] ?? id,
      }));
      actions.push(
        action(
          game,
          "submitChoice",
          pendingChoice.prompt,
          null,
          true,
          null,
          undefined,
          [],
          {
            kind: "tokenPlacement",
            choiceId: pendingChoice.id,
            prompt: pendingChoice.prompt,
            tokenName: pendingChoice.tokenName,
            count: pendingChoice.count,
            destinations,
          },
        ),
      );
      return actions;
    }
    if (pendingChoice.type === "binary") {
      actions.push(action(game, "submitChoice", pendingChoice.prompt, null, true, null, undefined, [{ kind: "card", label: pendingChoice.prompt, legalIds: ["accept", "decline"], minimum: 1, maximum: 1 }], { kind: "binary", choiceId: pendingChoice.id, prompt: pendingChoice.prompt, acceptLabel: pendingChoice.acceptLabel, declineLabel: pendingChoice.declineLabel }));
      return actions;
    }
    actions.push(
      action(
        game,
        "submitChoice",
        "Submit trigger order",
        null,
        true,
        null,
        undefined,
        [
          {
            kind: "card",
            label: "trigger order",
            legalIds: pendingChoice.optionIds,
            minimum: pendingChoice.optionIds.length,
            maximum: pendingChoice.optionIds.length,
          },
        ],
        {
          kind: "orderedOptions",
          choiceId: pendingChoice.id,
          optionIds: pendingChoice.optionIds,
        },
      ),
    );
    return actions;
  }
  const canAct = game.state.chain
    ? game.state.chain.priorityPlayerId === actorPlayerId
    : game.state.showdown
      ? game.state.showdown.focusPlayerId === actorPlayerId
      : game.state.turn?.activePlayerId === actorPlayerId;

  if (game.state.chain || game.state.showdown) {
    if (canAct) {
      actions.push(
        action(
          game,
          "pass",
          game.state.chain ? "Pass priority" : "Pass focus",
          null,
        ),
      );
    }
    if (canAct) {
      addPlayableCardActions(
        actions,
        game,
        actorPlayerId,
        decks,
        index,
        currentTiming(game),
      );
      addHiddenPlayActions(actions, game, actorPlayerId, decks, index);
      addAbilityActions(
        actions,
        game,
        actorPlayerId,
        index,
        handlers,
        currentTiming(game),
      );
    }
    return actions;
  }
  if (!canAct) {
    addHiddenPlayActions(actions, game, actorPlayerId, decks, index);
    return actions;
  }

  actions.push(action(game, "endTurn", "End turn", null));

  addPlayableCardActions(
    actions,
    game,
    actorPlayerId,
    decks,
    index,
    "neutralOpen",
  );
  addHiddenPlayActions(actions, game, actorPlayerId, decks, index);
  addAbilityActions(
    actions,
    game,
    actorPlayerId,
    index,
    handlers,
    "neutralOpen",
  );
  const orderedBattlefields = battlefieldsInActorBoardOrder(
    game,
    actorPlayerId,
  );
  for (const cardId of player.zones.base) {
    const definition = definitionForInstance(cardId, index);
    const state = game.state.cardStates[cardId]!;
    if (definition.card.classification.type === "Unit" && !state.exhausted) {
      for (const battlefield of orderedBattlefields) {
        actions.push(
          action(
            game,
            "move",
            `Move to ${definitionForInstance(battlefield.cardInstanceId, index).card.name}`,
            cardId,
            true,
            null,
            battlefield.battlefieldId,
          ),
        );
      }
    }
  }
  for (const battlefield of game.state.battlefields) {
    for (const cardId of battlefield.units) {
      if (index.instances.get(cardId)?.ownerPlayerId !== actorPlayerId)
        continue;
      const state = game.state.cardStates[cardId];
      if (!state || state.exhausted) continue;
      if (isMoveToBaseForbidden(game, cardId, index)) continue;
      actions.push(
        action(game, "move", "Move to Base", cardId, true, null, "base"),
      );
      if (
        hasBehavior(definitionForInstance(cardId, index), "keyword.ganking")
      ) {
        for (const destination of orderedBattlefields) {
          if (destination.battlefieldId === battlefield.battlefieldId) continue;
          actions.push(
            action(
              game,
              "move",
              `Gank ${definitionForInstance(destination.cardInstanceId, index).card.name}`,
              cardId,
              true,
              null,
              destination.battlefieldId,
            ),
          );
        }
      }
    }
  }
  const readyBaseUnits = player.zones.base.filter((cardId) => {
    const definition = definitionForInstance(cardId, index);
    return (
      definition.card.classification.type === "Unit" &&
      !game.state.cardStates[cardId]?.exhausted
    );
  });
  for (const battlefield of orderedBattlefields) {
    const readyGankingUnits = game.state.battlefields
      .filter((origin) => origin.battlefieldId !== battlefield.battlefieldId)
      .flatMap((origin) => origin.units)
      .filter(
        (id) =>
          index.instances.get(id)?.ownerPlayerId === actorPlayerId &&
          !game.state.cardStates[id]?.exhausted &&
          hasBehavior(definitionForInstance(id, index), "keyword.ganking"),
      );
    const movableUnits = [...readyBaseUnits, ...readyGankingUnits];
    if (movableUnits.length < 1) continue;
    actions.push(
      action(
        game,
        "moveMany",
        `Move units to ${definitionForInstance(battlefield.cardInstanceId, index).card.name}`,
        null,
        true,
        null,
        battlefield.battlefieldId,
        [
          {
            kind: "card",
            label: "units to move",
            legalIds: movableUnits,
            minimum: 1,
            maximum: movableUnits.length,
          },
        ],
      ),
    );
  }
  return actions;
}

function battlefieldsInActorBoardOrder(
  game: GameDocument,
  actorPlayerId: string,
) {
  const originalIndexByBattlefieldId = new Map(
    game.state.battlefields.map((battlefield, index) => [
      battlefield.battlefieldId,
      index,
    ]),
  );
  const playerIds = game.state.setup.playerIds;
  const fallbackPlayerOrder = playerIds.filter(
    (playerId) => playerId !== actorPlayerId,
  );

  return [...game.state.battlefields].sort((left, right) => {
    const leftOrder = battlefieldOwnerOrder({
      actorPlayerId,
      battlefield: left,
      fallbackPlayerOrder,
    });
    const rightOrder = battlefieldOwnerOrder({
      actorPlayerId,
      battlefield: right,
      fallbackPlayerOrder,
    });

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return (
      (originalIndexByBattlefieldId.get(left.battlefieldId) ?? 0) -
      (originalIndexByBattlefieldId.get(right.battlefieldId) ?? 0)
    );
  });
}

function battlefieldOwnerOrder({
  actorPlayerId,
  battlefield,
  fallbackPlayerOrder,
}: {
  actorPlayerId: string;
  battlefield: GameDocument["state"]["battlefields"][number];
  fallbackPlayerOrder: string[];
}) {
  const ownerPlayerId = battlefield.selectedByPlayerId;

  if (!ownerPlayerId) {
    return Number.MAX_SAFE_INTEGER;
  }

  if (ownerPlayerId === actorPlayerId) {
    return 0;
  }

  const fallbackIndex = fallbackPlayerOrder.indexOf(ownerPlayerId);

  return fallbackIndex >= 0 ? fallbackIndex + 1 : Number.MAX_SAFE_INTEGER;
}

export function performGameplayAction(input: {
  game: GameDocument;
  actorPlayerId: string;
  actionId: string;
  selectedIds: string[];
  allocations?: DamageAssignment[];
  tokenPlacements?: TokenPlacement[];
  decks: readonly DeckSnapshotDocument[];
  now: string;
}): GameDocument {
  const legal = gameplayActions(input.game, input.actorPlayerId, input.decks);
  const projected = legal.find((candidate) => candidate.id === input.actionId);
  if (!projected || !projected.enabled)
    throw new Error("Action is not legal for the current game state.");
  validateActionTargets(projected, input.selectedIds);
  const game = structuredClone(input.game);
  const index = createRuntimeCardIndex(input.decks, game);
  const handlers = createPrimitiveHandlers(index);
  const [, , , kind, encodedSource, encodedExtra] = input.actionId.split(":");
  const source =
    encodedSource && encodedSource !== "_"
      ? decodeURIComponent(encodedSource)
      : "";
  const extra = encodedExtra ? decodeURIComponent(encodedExtra) : "";
  const player = game.state.players[input.actorPlayerId]!;

  switch (kind) {
    case "play":
      playCard(
        game,
        input.actorPlayerId,
        source,
        extra,
        input.selectedIds,
        index,
        handlers,
        input.decks,
      );
      break;
    case "playAccelerated":
      playCard(
        game,
        input.actorPlayerId,
        source,
        extra,
        input.selectedIds,
        index,
        handlers,
        input.decks,
        true,
      );
      break;
    case "hide":
      hideCard(
        game,
        input.actorPlayerId,
        source,
        extra,
        input.selectedIds,
        index,
      );
      break;
    case "playHidden":
      playCard(
        game,
        input.actorPlayerId,
        source,
        extra,
        input.selectedIds,
        index,
        handlers,
        input.decks,
        false,
        true,
      );
      break;
    case "submitChoice":
      if (game.state.pendingChoice?.type === "orderTriggers") {
        const orderedIds = [...input.selectedIds];
        submitTriggerOrder(game, input.actorPlayerId, input.selectedIds);
        const orderedItems =
          game.state.chain?.items.filter((item) =>
            orderedIds.includes(item.id),
          ) ?? [];
        if (orderedItems.length > 0 && game.state.chain) {
          if (chainItemsNeedTargetSelection(game, orderedItems, input.decks)) {
            game.state.chain.items = game.state.chain.items.filter(
              (item) => !orderedIds.includes(item.id),
            );
            if (game.state.chain.items.length === 0) {
              game.state.chain = null;
            }
            queueChainItemsForTargets(game, orderedItems, input.decks, {
              preserveOrder: true,
            });
          } else {
            queueChainItemsForTargets(game, [], input.decks);
          }
        }
      } else if (
        game.state.pendingChoice?.type === "effectSelection" &&
        game.state.pendingChoice.chainItem
      ) {
        submitChainTargetSelection(
          game,
          input.actorPlayerId,
          input.selectedIds,
          input.decks,
        );
      } else if (game.state.pendingChoice?.type === "tokenPlacement") {
        submitTokenPlacement(
          game,
          input.actorPlayerId,
          input.tokenPlacements ?? [],
          input.decks,
        );
        queueChainItemsForTargets(game, [], input.decks);
        drainQueuedBehaviorEvents(game, input.decks);
        resetChainPriorityToTopItem(game);
        openPendingShowdown(game, index, input.decks);
        finishTurnProgressionIfReady(game, index, input.decks);
      } else if (game.state.pendingChoice?.type === "binary") {
        submitBinaryChoice(game, input.actorPlayerId, input.selectedIds, input.decks);
        queueChainItemsForTargets(game, [], input.decks);
        drainQueuedBehaviorEvents(game, input.decks);
        resetChainPriorityToTopItem(game);
        openPendingShowdown(game, index, input.decks);
        finishTurnProgressionIfReady(game, index, input.decks);
      } else {
        submitEffectSelection(
          game,
          input.actorPlayerId,
          input.selectedIds,
          input.decks,
        );
        queueChainItemsForTargets(game, [], input.decks);
        drainQueuedBehaviorEvents(game, input.decks);
        resetChainPriorityToTopItem(game);
        openPendingShowdown(game, index, input.decks);
        finishTurnProgressionIfReady(game, index, input.decks);
      }
      break;
    case "activate": {
      const [clauseId, behaviorId] = extra.split("|");
      executeActivatedAbility(
        game,
        input.actorPlayerId,
        source,
        clauseId,
        behaviorId,
        input.selectedIds,
        index,
        handlers,
      );
      break;
    }
    case "activateMany": {
      const activations = JSON.parse(extra) as Array<{
        behaviorId: string;
        clauseId: string;
      }>;
      for (const activation of activations) {
        executeActivatedAbility(
          game,
          input.actorPlayerId,
          source,
          activation.clauseId,
          activation.behaviorId,
          input.selectedIds,
          index,
          handlers,
        );
      }
      break;
    }
    case "move": {
      const cardId = source;
      if (extra === "base") {
        if (isMoveToBaseForbidden(game, cardId, index)) {
          throw new Error("This unit cannot move from its battlefield to base.");
        }
        for (const battlefield of game.state.battlefields) {
          battlefield.units = battlefield.units.filter((id) => id !== cardId);
        }
        player.zones.base.push(cardId);
        game.state.cardStates[cardId]!.exhausted = true;
        cleanupBoard(game, index);
        dispatchBehaviorEvent(
          game,
          {
            type: "unit.moved",
            actorPlayerId: input.actorPlayerId,
            subjectCardInstanceId: cardId,
            values: { destination: "base" },
          },
          input.decks,
        );
        break;
      }
      moveUnitsToBattlefield(
        game,
        input.actorPlayerId,
        [cardId],
        extra,
        index,
        input.decks,
      );
      break;
    }
    case "moveMany": {
      moveUnitsToBattlefield(
        game,
        input.actorPlayerId,
        input.selectedIds,
        extra,
        index,
        input.decks,
      );
      break;
    }
    case "assignCombatDamage":
      submitCombatDamage(
        game,
        input.actorPlayerId,
        input.allocations ?? [],
        index,
        input.decks,
      );
      // Combat cleanup can move lethal units to trash. Their Deathknell events
      // must enter the chain before this action is returned to the client.
      drainQueuedBehaviorEvents(game, input.decks);
      resetChainPriorityToTopItem(game);
      openPendingShowdown(game, index, input.decks);
      finishTurnProgressionIfReady(game, index, input.decks);
      break;
    case "pass":
      passPriority(game, input.actorPlayerId, index, handlers, input.decks);
      break;
    case "endTurn":
      endTurn(game, input.actorPlayerId, index, input.decks);
      break;
    case "concede": {
      const opponentPlayerId = otherPlayer(game, input.actorPlayerId);

      game.winnerPlayerId = opponentPlayerId;
      game.completionReason = "game_concession";
      game.status = "complete";

      game.state.pendingChoice = null;
      game.state.chain = null;
      game.state.showdown = null;
      game.state.combat = null;

      break;
    }
    default:
      throw new Error("Action kind is not implemented.");
  }
  game.stateVersion += 1;
  game.updatedAt = input.now;
  return game;
}

export function performGameplayTransition(input: {
  game: GameDocument;
  actorPlayerId: string;
  actionId: string;
  selectedIds: string[];
  allocations?: DamageAssignment[];
  tokenPlacements?: TokenPlacement[];
  decks: readonly DeckSnapshotDocument[];
  now: string;
}): GameTransition {
  const projected = gameplayActions(
    input.game,
    input.actorPlayerId,
    input.decks,
  ).find((candidate) => candidate.id === input.actionId);
  const game = performGameplayAction(input);
  const revealEvents = projected
    ? publicZoneRevealEvents(input.game, projected, input.decks)
    : [];
  return {
    game,
    events: projected
        ? [
            acceptedActionEvent(input.actorPlayerId, projected),
            ...revealEvents,
            ...stateChangeEvents(input.game, game),
        ]
      : [],
  };
}

function publicZoneRevealEvents(
  game: GameDocument,
  action: ProjectedAction,
  decks: readonly DeckSnapshotDocument[],
) {
  const index = createRuntimeCardIndex(decks, game);
  const revealedOwners = new Set<string>();
  return action.targets.flatMap((target) => {
    if (
      target.kind !== "card" ||
      target.sourceZone !== "hand" ||
      target.revealZone !== true
    ) {
      return [];
    }
    const owner = target.legalIds
      .map((id) => index.instances.get(id)?.ownerPlayerId)
      .find((id): id is string => Boolean(id));
    if (!owner || revealedOwners.has(owner)) return [];
    revealedOwners.add(owner);
    const hand = game.state.players[owner]?.zones.hand ?? [];
    const cardNames = hand.map((id) => definitionForInstance(id, index).card.name);
    return [{
      type: "hand.revealed",
      actorPlayerId: owner,
      message: `${owner} revealed their Hand: ${cardNames.join(", ") || "(empty)"}.`,
      payload: {
        playerId: owner,
        count: cardNames.length,
      },
    }];
  });
}

function playCard(
  game: GameDocument,
  playerId: string,
  cardId: string,
  destinationId: string,
  selectedIds: string[],
  index: RuntimeCardIndex,
  handlers: ReturnType<typeof createPrimitiveHandlers>,
  decks: readonly DeckSnapshotDocument[],
  accelerated = false,
  ignoreBaseCost = false,
) {
  const player = game.state.players[playerId]!;
  const definition = definitionForInstance(cardId, index);
  const isUnit = definition.card.classification.type === "Unit";
  const isGear = definition.card.classification.type === "Gear";
  const showdownAtPlayStart = game.state.showdown;
  const destinationBattlefield =
    isUnit && destinationId !== "base"
      ? game.state.battlefields.find(
          (battlefield) => battlefield.battlefieldId === destinationId,
        )
      : null;
  if (
    isUnit &&
    !isLegalUnitDestination(game, playerId, definition, destinationId)
  ) {
    throw new Error("Unit play destination is not legal for this card.");
  }
  validateLockedPlaySelections(
    game,
    playerId,
    cardId,
    selectedIds,
    definition,
    handlers,
  );
  const optionalPlayCost = payOptionalPlayCosts(
    game,
    playerId,
    definition,
    selectedIds,
    index,
  );
  const ignoresBaseCost = ignoreBaseCost || optionalPlayCost.ignoreBaseCost;
  const energyCost =
    (ignoresBaseCost ? 0 : effectiveEnergyCost(game, playerId, definition, index)) +
    (accelerated ? 1 : 0);
  const playEvent = {
    type: "card.played",
    actorPlayerId: playerId,
    subjectCardInstanceId: cardId,
    values: {
      "eventSubject.printedEnergyCost": definition.card.attributes.energy ?? 0,
      "eventSubject.effectiveEnergyCost": energyCost,
    },
  };
  const paymentDefinition = ignoresBaseCost
    ? {
        ...definition,
        card: {
          ...definition.card,
          attributes: { ...definition.card.attributes, power: 0 },
        },
      }
    : definition;
  payCardCost(
    game,
    playerId,
    paymentDefinition,
    energyCost,
    index,
    targetDeflectCost(playerId, selectedIds, index),
    accelerated ? 1 : 0,
  );
  recordCardPlayed(game, playerId, cardId);
  if (game.state.showdown) game.state.showdown.passedPlayerIds = [];
  player.zones.hand = player.zones.hand.filter((id) => id !== cardId);
  if (player.zones.champion === cardId) player.zones.champion = null;
  for (const battlefield of game.state.battlefields) {
    removeFacedownCard(battlefield, cardId);
  }
  if (isUnit || isGear) {
    if (destinationBattlefield) {
      placeUnitAtBattlefield(game, {
        battlefieldId: destinationBattlefield.battlefieldId,
        controllerPlayerId: playerId,
        unitId: cardId,
        index,
      });
    } else player.zones.base.push(cardId);
    if (
      destinationBattlefield &&
      destinationBattlefield.controllerPlayerId == null
    ) {
      markBattlefieldContested(game, destinationId, playerId);
    }
    game.state.cardStates[cardId]!.exhausted = isGear ? false : !accelerated;
    executeImmediateClauses(
      game,
      definition,
      playerId,
      cardId,
      selectedIds,
      handlers,
    );
    if (
      game.state.ongoingEffects.some(
        (effect) =>
          effect.behaviorId === "modifier.enter_ready" &&
          effect.controllerPlayerId === playerId,
      )
    ) {
      game.state.cardStates[cardId]!.exhausted = false;
    }
    dispatchBehaviorEvent(game, playEvent, decks);
    cleanupBoard(game, index);
    openPendingShowdown(game, index, decks);
    if (showdownAtPlayStart && game.state.showdown) {
      game.state.showdown.focusPlayerId = nextRelevantPlayer(
        game,
        playerId,
        game.state.showdown.relevantPlayerIds,
      );
      game.state.showdown.passedPlayerIds = [];
    }
    return;
  }
  const item = {
    id: `chain:${game.stateVersion + 1}:${cardId}`,
    kind: "spell" as const,
    label: definition.card.name,
    controllerPlayerId: playerId,
    sourceCardInstanceId: cardId,
    targetCardInstanceIds: selectedIds,
    targetObjectVersions: captureTargetObjectVersions(game, selectedIds),
    lockedSelectionsByBinding: lockedPlaySelectionsByBinding(
      definition,
      selectedIds,
    ),
    behaviorClauseId: spellResolutionClauseId(definition, handlers),
    activatedBehaviorId: null,
    behaviorEvent: playEvent,
  };
  if (game.state.chain) {
    game.state.chain.items.push(item);
    game.state.chain.priorityPlayerId = playerId;
    game.state.chain.passedPlayerIds = [];
  } else {
    game.state.chain = {
      items: [item],
      relevantPlayerIds: game.state.showdown?.relevantPlayerIds ?? [
        ...game.state.setup.playerIds,
      ],
      priorityPlayerId: playerId,
      passedPlayerIds: [],
      resumeFocusPlayerId: game.state.showdown
        ? nextRelevantPlayer(
            game,
            playerId,
            game.state.showdown.relevantPlayerIds,
          )
        : null,
    };
  }
}

function spellResolutionClauseId(
  definition: GameCardDefinition,
  handlers: ReturnType<typeof createPrimitiveHandlers>,
) {
  const clauses = compileBehaviorModel(definition.behaviorModel, handlers)
    .clauses.filter(
      (clause) => clause.triggers.length === 0 && clause.abilities.length === 0,
    );
  return clauses.length === 1 ? clauses[0]!.id : null;
}

function passPriority(
  game: GameDocument,
  actor: string,
  index: RuntimeCardIndex,
  handlers: ReturnType<typeof createPrimitiveHandlers>,
  decks: readonly DeckSnapshotDocument[],
) {
  if (game.state.chain) {
    const passed = addConsecutivePass(game.state.chain.passedPlayerIds, actor);
    if (passed.length === game.state.chain.relevantPlayerIds.length) {
      const item = game.state.chain.items.pop();
      if (item?.sourceCardInstanceId) {
        const controller = item.controllerPlayerId;
        const owner = index.instances.get(
          item.sourceCardInstanceId,
        )!.ownerPlayerId;
        const definition = definitionForInstance(
          item.sourceCardInstanceId,
          index,
        );
        if (item.behaviorEvent?.type === "delayed.effect") {
          const delayedEffectId = item.behaviorEvent.values.delayedEffectId;
          const endingPlayerId = item.behaviorEvent?.values.endingPlayerId;
          if (
            typeof delayedEffectId !== "string" ||
            typeof endingPlayerId !== "string"
          ) {
            throw new Error("Delayed effect context is unavailable.");
          }
          beginDelayedEffectResolution(
            game,
            delayedEffectId,
            decks,
            endingPlayerId,
          );
        } else if (
          item.kind === "activatedAbility" &&
          item.activatedBehaviorId
        ) {
          const clause = compileBehaviorModel(
            definition.behaviorModel,
            handlers,
          ).clauses.find((candidate) => candidate.id === item.behaviorClauseId);
          if (!clause) {
            throw new Error(
              "Activated ability is unavailable during resolution.",
            );
          }
          beginEffectResolution({
            game,
            controllerPlayerId: controller,
            sourceCardInstanceId: item.sourceCardInstanceId,
            clauseId: clause.id,
            activatedBehaviorId: item.activatedBehaviorId,
            selectedIds: validLockedTargets(
              game,
              clause,
              item,
              controller,
              handlers,
            ),
            targetsLocked: true,
            decks,
          });
        } else if (item.behaviorClauseId) {
          const compiled = compileBehaviorModel(
            definition.behaviorModel,
            handlers,
          );
          const clause = compiled.clauses.find(
            (candidate) => candidate.id === item.behaviorClauseId,
          );
          if (clause) {
            if (
              clause.timings.some(
                (timing) => timing.behaviorId === "timing.delayed",
              )
            ) {
              executeBehaviorClause({
                clause,
                context: createBehaviorContext(
                  game,
                  controller,
                  item.sourceCardInstanceId,
                  item.behaviorEvent,
                  item.targetCardInstanceIds,
                ),
                handlers,
              });
            } else {
              beginEffectResolution({
                game,
                controllerPlayerId: controller,
                sourceCardInstanceId: item.sourceCardInstanceId,
                clauseId: clause.id,
                selectedIds:
                  Object.keys(item.lockedSelectionsByBinding).length > 0
                    ? item.targetCardInstanceIds
                    : validLockedTargets(
                        game,
                        clause,
                        item,
                        controller,
                        handlers,
                      ),
                targetsLocked: !clause.selectors.some(
                  (selector) => selector.parameters.deferred === true,
                ),
                lockedSelectionsByBinding: item.lockedSelectionsByBinding,
                targetObjectVersions: item.targetObjectVersions,
                behaviorEvent: item.behaviorEvent,
                decks,
              });
              if (definition.card.classification.type === "Spell") {
                if (!isCardInAnyZone(game, item.sourceCardInstanceId)) {
                  game.state.players[owner]!.zones.trash.push(
                    item.sourceCardInstanceId,
                  );
                }
                dispatchBehaviorEvent(
                  game,
                  item.behaviorEvent?.type === "card.played"
                    ? item.behaviorEvent
                    : {
                        type: "card.played",
                        actorPlayerId: controller,
                        subjectCardInstanceId: item.sourceCardInstanceId,
                        values: {
                          "eventSubject.printedEnergyCost":
                            definition.card.attributes.energy ?? 0,
                          "eventSubject.effectiveEnergyCost":
                            effectiveEnergyCost(
                              game,
                              controller,
                              definition,
                              index,
                            ),
                        },
                      },
                  decks,
                );
              }
            }
          }
        } else {
          executeImmediateClauses(
            game,
            definition,
            controller,
            item.sourceCardInstanceId,
            item.targetCardInstanceIds,
            handlers,
            item.targetObjectVersions,
          );
          if (
            definition.card.classification.type === "Spell" &&
            !isCardInAnyZone(game, item.sourceCardInstanceId)
          ) {
            game.state.players[owner]!.zones.trash.push(
              item.sourceCardInstanceId,
            );
            dispatchBehaviorEvent(
              game,
              item.behaviorEvent?.type === "card.played"
                ? item.behaviorEvent
                : {
                    type: "card.played",
                    actorPlayerId: controller,
                    subjectCardInstanceId: item.sourceCardInstanceId,
                    values: {
                      "eventSubject.printedEnergyCost":
                        definition.card.attributes.energy ?? 0,
                      "eventSubject.effectiveEnergyCost": effectiveEnergyCost(
                        game,
                        controller,
                        definition,
                        index,
                      ),
                    },
                  },
              decks,
            );
          }
        }
      }
      if (game.state.chain.items.length) {
        game.state.chain = {
          ...game.state.chain,
          priorityPlayerId: game.state.chain.items.at(-1)!.controllerPlayerId,
          passedPlayerIds: [],
        };
      } else {
        const resumeFocusPlayerId = game.state.chain.resumeFocusPlayerId;
        game.state.chain = null;
        if (game.state.showdown) {
          game.state.showdown.focusPlayerId =
            resumeFocusPlayerId
              ? resumeFocusPlayerId
              : item?.kind === "trigger"
                ? item.controllerPlayerId
                : nextRelevantPlayer(
                  game,
                  game.state.showdown.focusPlayerId,
                  game.state.showdown.relevantPlayerIds,
                );
          game.state.showdown.passedPlayerIds = [];
        }
      }
      cleanupBoard(game, index);
      drainQueuedBehaviorEvents(game, decks);
      resetChainPriorityToTopItem(game);
      openPendingShowdown(game, index, decks);
      finishTurnProgressionIfReady(game, index, decks);
    } else {
      game.state.chain.passedPlayerIds = passed;
      game.state.chain.priorityPlayerId = nextRelevantPlayer(
        game,
        actor,
        game.state.chain.relevantPlayerIds,
      );
    }
    return;
  }
  if (game.state.showdown) {
    const passed = addConsecutivePass(
      game.state.showdown.passedPlayerIds,
      actor,
    );
    if (passed.length === game.state.showdown.relevantPlayerIds.length) {
      const showdown = game.state.showdown;
      game.state.showdown = null;
      if (showdown.kind === "nonCombat") {
        resolveNonCombatShowdown(game, showdown.battlefieldId, index, decks);
      } else {
        beginCombatDamage(game, index, decks);
      }
      drainQueuedBehaviorEvents(game, decks);
      resetChainPriorityToTopItem(game);
      openPendingShowdown(game, index, decks);
      finishTurnProgressionIfReady(game, index, decks);
    } else {
      game.state.showdown.passedPlayerIds = passed;
      game.state.showdown.focusPlayerId = nextRelevantPlayer(
        game,
        actor,
        game.state.showdown.relevantPlayerIds,
      );
    }
  }
}

function endTurn(
  game: GameDocument,
  actor: string,
  index: RuntimeCardIndex,
  decks: readonly DeckSnapshotDocument[],
) {
  if (game.state.turn?.activePlayerId !== actor)
    throw new Error("Only the active player can end the turn.");
  game.state.turn.phase = "end";
  continueEndTurn(game, actor, index, decks);
}

function continueEndTurn(
  game: GameDocument,
  actor: string,
  index: RuntimeCardIndex,
  decks: readonly DeckSnapshotDocument[],
) {
  const turn = game.state.turn;
  if (!turn || turn.activePlayerId !== actor || turn.phase !== "end") return;
  if (!turn.stunsCleared) {
    clearStunned(game);
    turn.stunsCleared = true;
  }
  if (!turn.endTriggersQueued) {
    turn.endTriggersQueued = true;
    turn.endDelayedEffectsQueued = true;
    dispatchBehaviorEvent(
      game,
      {
        type: "turn.ended",
        actorPlayerId: actor,
        subjectCardInstanceId: null,
        values: {},
      },
      decks,
    );
    queueDelayedEffects(game, "endOfThisTurn", decks, actor);
    if (game.state.chain || game.state.pendingChoice) return;
  }
  completeEndTurn(game, actor, index, decks);
}

function completeEndTurn(
  game: GameDocument,
  actor: string,
  index: RuntimeCardIndex,
  decks: readonly DeckSnapshotDocument[],
) {
  const turn = game.state.turn;
  if (!turn || turn.activePlayerId !== actor) {
    throw new Error("The ending turn is no longer active.");
  }
  const next = game.state.extraTurnPlayerIds?.shift() ?? otherPlayer(game, actor);
  clearMarkedDamage(game);
  cleanupTurnModifiers(game, index);
  for (const player of Object.values(game.state.players)) {
    player.playedCardIdsThisTurn = [];
    player.playedMainDeckCardIdsThisTurn = [];
    player.legionSatisfiedCardIdsThisTurn = [];
  }
  game.state.turn = {
    turnNumber: turn.turnNumber + 1,
    activePlayerId: next,
    phase: "awaken",
  };
  applyStartOfTurn(game, decks, index);
}

function finishTurnProgressionIfReady(
  game: GameDocument,
  index: RuntimeCardIndex,
  decks: readonly DeckSnapshotDocument[],
) {
  const turn = game.state.turn;
  if (!turn || game.state.chain || game.state.pendingChoice) return;
  if (turn.phase === "end") {
    continueEndTurn(game, turn.activePlayerId, index, decks);
  } else if (isStartOfTurnPhase(turn.phase)) {
    applyStartOfTurn(game, decks, index);
  }
}

function action(
  game: GameDocument,
  kind: string,
  label: string,
  source: string | null,
  enabled = true,
  disabledReason: string | null = null,
  extra?: string,
  targets: ProjectedAction["targets"] = [],
  choice?: ProjectedAction["choice"],
  costPreview?: ProjectedAction["costPreview"],
): ProjectedAction {
  const parts = [
    "game",
    String(game.stateVersion),
    "action",
    kind,
    source === null ? "_" : encodeURIComponent(source),
  ];
  if (extra !== undefined) parts.push(encodeURIComponent(extra));
  const surface =
    kind === "submitChoice"
      ? "choice-dialog"
      : source
        ? "card-menu"
        : "action-rail";
  return {
    id: parts.join(":"),
    label,
    sourceCardInstanceId: source,
    enabled,
    disabledReason,
    targets,
    costPreview,
    choice,
    presentation: {
      surface,
      style:
        kind === "concede"
          ? "danger"
          : kind === "endTurn" || kind === "pass"
            ? "secondary"
            : "primary",
      prompt:
        kind === "submitChoice"
          ? "Choose the order for triggered abilities."
          : null,
      boardLocation:
        (kind === "play" || kind === "move" || kind === "moveMany") && extra
          ? extra === "base"
            ? { kind: "base" as const }
            : { kind: "battlefield" as const, battlefieldId: extra }
          : null,
    },
  };
}
function moveUnitsToBattlefield(
  game: GameDocument,
  actorPlayerId: string,
  cardIds: string[],
  battlefieldId: string,
  index: RuntimeCardIndex,
  decks: readonly DeckSnapshotDocument[],
) {
  const battlefield = game.state.battlefields.find(
    (candidate) => candidate.battlefieldId === battlefieldId,
  );
  if (!battlefield) throw new Error("Battlefield is unavailable.");
  const player = game.state.players[actorPlayerId]!;
  for (const cardId of cardIds) {
    player.zones.base = player.zones.base.filter((id) => id !== cardId);
    for (const origin of game.state.battlefields) {
      origin.units = origin.units.filter((id) => id !== cardId);
    }
    placeUnitAtBattlefield(game, {
      battlefieldId,
      controllerPlayerId: actorPlayerId,
      unitId: cardId,
      index,
    });
    game.state.cardStates[cardId]!.exhausted = true;
  }
  markBattlefieldContested(game, battlefieldId, actorPlayerId);
  cleanupBoard(game, index);
  for (const cardId of cardIds) {
    dispatchBehaviorEvent(
      game,
      {
        type: "unit.moved",
        actorPlayerId,
        subjectCardInstanceId: cardId,
        values: { destination: battlefieldId },
      },
      decks,
    );
  }
  openPendingShowdown(game, index, decks);
}

function openPendingShowdown(
  game: GameDocument,
  index: RuntimeCardIndex,
  decks: readonly DeckSnapshotDocument[],
) {
  if (
    game.state.chain ||
    game.state.pendingChoice ||
    game.state.showdown ||
    game.state.combat
  ) {
    return false;
  }
  const pendingCombat = game.state.battlefields.find((battlefield) => {
    const actorPlayerId = battlefield.contestedByPlayerId;
    return (
      actorPlayerId != null &&
      unitControllers(game, battlefield.units, index).length === 2
    );
  });
  if (pendingCombat?.contestedByPlayerId) {
    return startCombat(
      game,
      pendingCombat.battlefieldId,
      pendingCombat.contestedByPlayerId,
      index,
      decks,
    );
  }
  return openPendingNonCombatShowdown(game, index);
}

function drainQueuedBehaviorEvents(
  game: GameDocument,
  decks: readonly DeckSnapshotDocument[],
) {
  const events = game.state.queuedBehaviorEvents ?? [];
  game.state.queuedBehaviorEvents = [];
  for (const event of events) {
    dispatchBehaviorEvent(game, event, decks);
  }
}

function resetChainPriorityToTopItem(game: GameDocument) {
  const chain = game.state.chain;
  const topItem = chain?.items.at(-1);
  if (!chain || !topItem) return;
  chain.priorityPlayerId = topItem.controllerPlayerId;
  chain.passedPlayerIds = [];
}

function addPlayableCardActions(
  actions: ProjectedAction[],
  game: GameDocument,
  playerId: string,
  decks: readonly DeckSnapshotDocument[],
  index: RuntimeCardIndex,
  timing: TurnTiming,
) {
  if (isCardPlayRestricted(game, playerId)) return;
  const player = game.state.players[playerId]!;
  const handlers = createPrimitiveHandlers(index);
  for (const cardId of [
    ...player.zones.hand,
    ...(player.zones.champion ? [player.zones.champion] : []),
  ]) {
    const definition = definitionForInstance(cardId, index);
    if (!["Unit", "Spell", "Gear"].includes(definition.card.classification.type))
      continue;
    const compiled = compileBehaviorModel(definition.behaviorModel, handlers);
    const timings = compiled.playTimings.map((binding) => binding.behaviorId);
    const hasAction = timings.includes("timing.action");
    const hasReaction = timings.includes("timing.reaction");
    if (timing === "showdownOpen" && !hasAction && !hasReaction) continue;
    if (
      (timing === "neutralClosed" || timing === "showdownClosed") &&
      !hasReaction
    )
      continue;
    const context = createBehaviorContext(game, playerId, cardId, null, []);
    const projectedTargets = playSelectionRequirements(
      definition,
      compiled,
      context,
      handlers,
    );
    const cost = effectiveEnergyCost(game, playerId, definition, index);
    const paymentPlan = buildPaymentPlan(
      game,
      playerId,
      definition,
      cost,
      index,
    );
    const acceleratedPaymentPlan = hasBehavior(definition, "keyword.accelerate")
      ? buildPaymentPlan(game, playerId, definition, cost + 1, index, 0, 1)
      : null;
    const targets = projectedTargets;
    const hasLegalTargets = canSatisfyTargetRequirements(targets);
    const canPayAlternateCost = hasPayableAlternateCost(
      definition,
      projectedTargets,
    );
    const enabled =
      (paymentPlan !== null || canPayAlternateCost) && hasLegalTargets;
    const disabledReason = !hasLegalTargets
      ? "No legal targets are available."
      : paymentPlan || canPayAlternateCost
        ? null
        : "Card costs cannot be paid.";
    const targetAdditionalPower = targets
      .flatMap((requirement) => requirement.legalIds)
      .filter((id, position, ids) => ids.indexOf(id) === position)
      .map((targetId) => ({
        targetId,
        amount: targetDeflectCost(playerId, [targetId], index),
      }))
      .filter((entry) => entry.amount > 0);
    const costPreview =
      paymentPlan && targetAdditionalPower.length > 0
        ? {
            energy: cost,
            basePower: definition.card.attributes.power ?? 0,
            availableAnyPower: availableAnyPowerAfterBaseCost(
              game,
              playerId,
              paymentPlan,
            ),
            reservedResourceSourceIds: [
              ...new Set([
                ...paymentPlan.energySourceIds,
                ...paymentPlan.powerAbilityIds,
                ...paymentPlan.powerRuneIds,
              ]),
            ],
            targetAdditionalPower,
          }
        : undefined;
    const unitDestinations =
      definition.card.classification.type === "Unit"
        ? legalUnitDestinationIds(game, playerId, definition).map((id) => ({
            id,
            name:
              id === "base"
                ? "Base"
                : definitionForInstance(
                    game.state.battlefields.find(
                      (battlefield) => battlefield.battlefieldId === id,
                    )!.cardInstanceId,
                    index,
                  ).card.name,
          }))
        : null;
    for (const destination of unitDestinations ?? [
      { id: undefined, name: "" },
    ]) {
      actions.push(
        action(
          game,
          "play",
          unitDestinations
            ? `Play ${definition.card.name} to ${destination.name}`
            : `Play ${definition.card.name}`,
          cardId,
          enabled,
          disabledReason,
          destination.id,
          targets,
          undefined,
          costPreview,
        ),
      );
      if (unitDestinations && hasBehavior(definition, "keyword.accelerate")) {
        actions.push(
          action(
            game,
            "playAccelerated",
            `Play accelerated ${definition.card.name} to ${destination.name}`,
            cardId,
            acceleratedPaymentPlan !== null && hasLegalTargets,
            !hasLegalTargets
              ? "No legal targets are available."
              : acceleratedPaymentPlan
                ? null
                : "Accelerate costs cannot be paid.",
            destination.id,
            targets,
          ),
        );
      }
    }
    if (hasBehavior(definition, "keyword.hidden")) {
      const canHideThisTurn = game.state.turn?.activePlayerId === playerId;
      const powerSourceIds = hidePowerSourceIds(game, playerId, index);
      const pooledPowerAvailable = Object.values(player.power).some(
        (amount) => amount > 0,
      );
      const hideTargets: ProjectedAction["targets"] = powerSourceIds.length > 0
        ? [{
          kind: "card",
            label: "Hide payment source",
            legalIds: powerSourceIds,
            minimum: pooledPowerAvailable ? 0 : 1,
            maximum: 1,
          }]
        : [];
      for (const battlefield of game.state.battlefields) {
        const isControlled = battlefield.controllerPlayerId === playerId;
        const hasCapacity = hasFacedownCapacity(battlefield, index);
        actions.push(
          action(
            game,
            "hide",
            `Hide ${definition.card.name} at ${definitionForInstance(battlefield.cardInstanceId, index).card.name}`,
            cardId,
            canHideThisTurn && isControlled && hasCapacity && (pooledPowerAvailable || powerSourceIds.length > 0),
            !canHideThisTurn
              ? "You can hide a card only on your turn."
              : !isControlled
              ? "You do not control this battlefield."
              : !hasCapacity
                ? "That battlefield has no facedown capacity."
                : "Choose a Power source or channel Power first.",
            battlefield.battlefieldId,
            hideTargets,
          ),
        );
      }
    }
  }
  void decks;
}

function addHiddenPlayActions(
  actions: ProjectedAction[],
  game: GameDocument,
  playerId: string,
  decks: readonly DeckSnapshotDocument[],
  index: RuntimeCardIndex,
) {
  if (isCardPlayRestricted(game, playerId)) return;
  const turn = game.state.turn;
  if (!turn || turn.activePlayerId === playerId) return;
  for (const battlefield of game.state.battlefields) {
    for (const facedownCard of facedownCardsAt(battlefield)) {
      const cardId = facedownCard.cardInstanceId;
      if (
        facedownCard.controllerPlayerId !== playerId ||
        facedownCard.hiddenAtTurnNumber === turn.turnNumber
      ) {
        continue;
      }
      const definition = definitionForInstance(cardId, index);
      if (!hasBehavior(definition, "keyword.hidden")) continue;
      const isUnit = definition.card.classification.type === "Unit";
      const handlers = createPrimitiveHandlers(index);
      const hiddenTargets = playSelectionRequirements(
        definition,
        compileBehaviorModel(definition.behaviorModel, handlers),
        createBehaviorContext(game, playerId, cardId, null, []),
        handlers,
      )
        .map((requirement) => ({
          ...requirement,
          legalIds: requirement.legalIds.filter((id) =>
            requirement.kind === "battlefield"
              ? id === battlefield.battlefieldId
              : battlefield.units.includes(id),
          ),
        }));
      const hasLegalTargets = canSatisfyTargetRequirements(hiddenTargets);
      actions.push(
        action(
          game,
          "playHidden",
          `Play Hidden ${definition.card.name}`,
          cardId,
          (!isUnit || isLegalUnitDestination(game, playerId, definition, battlefield.battlefieldId)) && hasLegalTargets,
          !hasLegalTargets
            ? "No legal targets are available at the associated battlefield."
            : isUnit
              ? "The associated battlefield is no longer a legal destination."
              : null,
          isUnit ? battlefield.battlefieldId : undefined,
          hiddenTargets,
        ),
      );
    }
  }
  void decks;
}

function hideCard(
  game: GameDocument,
  playerId: string,
  cardId: string,
  battlefieldId: string,
  selectedIds: readonly string[],
  index: RuntimeCardIndex,
) {
  const player = game.state.players[playerId]!;
  const battlefield = game.state.battlefields.find(
    (candidate) => candidate.battlefieldId === battlefieldId,
  );
  const definition = definitionForInstance(cardId, index);
  if (
    !battlefield ||
    battlefield.controllerPlayerId !== playerId ||
    !hasFacedownCapacity(battlefield, index) ||
    !player.zones.hand.includes(cardId) ||
    !hasBehavior(definition, "keyword.hidden") ||
    game.state.turn?.activePlayerId !== playerId
  ) {
    throw new Error("Hidden card cannot be placed there.");
  }
  payHidePower(game, playerId, selectedIds, index);
  player.zones.hand = player.zones.hand.filter((id) => id !== cardId);
  addFacedownCard(battlefield, {
    cardInstanceId: cardId,
    controllerPlayerId: playerId,
    hiddenAtTurnNumber: game.state.turn?.turnNumber ?? 1,
  });
}

function hidePowerSourceIds(
  game: GameDocument,
  playerId: string,
  index: RuntimeCardIndex,
) {
  return game.state.players[playerId]!.zones.base.filter((id) => {
    if (hasBehavior(definitionForInstance(id, index), "ability.recycle_for_power")) {
      return true;
    }
    return (
      !game.state.cardStates[id]?.exhausted &&
      definitionForInstance(id, index).behaviorModel.clauses.some((clause) =>
        clause.abilities.some(
          (ability) =>
            ability.behaviorId === "ability.exhaust_for_resource" &&
            ability.parameters.resourceType === "power",
        ),
      )
    );
  });
}

function payHidePower(
  game: GameDocument,
  playerId: string,
  selectedIds: readonly string[],
  index: RuntimeCardIndex,
) {
  if (selectedIds.length > 1) {
    throw new Error("Choose at most one Power source to hide a card.");
  }
  const [sourceId] = selectedIds;
  if (sourceId) {
    if (!hidePowerSourceIds(game, playerId, index).includes(sourceId)) {
      throw new Error("Selected Power source cannot pay to hide this card.");
    }
    if (hasBehavior(definitionForInstance(sourceId, index), "ability.recycle_for_power")) {
      const player = game.state.players[playerId]!;
      player.zones.base = player.zones.base.filter((id) => id !== sourceId);
      player.zones.runeDeck.push(sourceId);
      const state = game.state.cardStates[sourceId];
      if (state) {
        state.damage = 0;
        state.exhausted = false;
      }
      recomputeAllMight(game, index);
      return;
    }
    game.state.cardStates[sourceId]!.exhausted = true;
    return;
  }

  const player = game.state.players[playerId]!;
  const domain = Object.keys(player.power)
    .filter((candidate) => (player.power[candidate] ?? 0) > 0)
    .sort()[0];
  if (!domain) throw new Error("A selected Power source is required to hide this card.");
  player.power[domain]! -= 1;
}

function canSatisfyTargetRequirements(
  requirements: ProjectedAction["targets"],
): boolean {
  if (
    requirements.some(
      (requirement) => new Set(requirement.legalIds).size < requirement.minimum,
    )
  ) {
    return false;
  }
  const minimumSelections = requirements.reduce(
    (total, requirement) => total + requirement.minimum,
    0,
  );
  const legalSelections = new Set(
    requirements.flatMap((requirement) => requirement.legalIds),
  );
  return legalSelections.size >= minimumSelections;
}

function addAbilityActions(
  actions: ProjectedAction[],
  game: GameDocument,
  playerId: string,
  index: RuntimeCardIndex,
  handlers: ReturnType<typeof createPrimitiveHandlers>,
  timing: TurnTiming,
) {
  const player = game.state.players[playerId]!;
  const controlled = [
    ...player.zones.base,
    ...(player.zones.legend ? [player.zones.legend] : []),
    ...game.state.battlefields.flatMap((battlefield) =>
      battlefield.units.filter(
        (id) => index.instances.get(id)?.ownerPlayerId === playerId,
      ),
    ),
  ];
  for (const sourceId of controlled) {
    const definition = definitionForInstance(sourceId, index);
    const compiled = compileBehaviorModel(definition.behaviorModel, handlers);
    const activations = compiled.clauses.flatMap((clause) =>
      clause.abilities.map((ability) => ({
        ability,
        clause,
        clauseId: clause.id,
      })),
    );
    const powerDomain =
      definition.card.classification.domain.find(
        (domain) => domain !== "Colorless",
      ) ?? "Universal";
    for (const clause of compiled.clauses) {
      for (const ability of clause.abilities) {
        if (!abilityAvailableAtTiming(compiled, clause, ability, timing))
          continue;
        const targets = targetRequirementsForClause(
          clause,
          createBehaviorContext(game, playerId, sourceId, null, []),
          handlers,
        );
        const sourceReady =
          ability.behaviorId === "ability.recycle_for_power" ||
          !game.state.cardStates[sourceId]!.exhausted;
        const costStatus = activatedAbilityCostStatus(
          game,
          playerId,
          sourceId,
          clause,
          index,
        );
        const hasLegalTargets = canSatisfyTargetRequirements(targets);
        const enabled =
          sourceReady && costStatus.enabled && hasLegalTargets;
        const label =
          ability.behaviorId === "ability.recycle_for_power"
            ? `Add Power [${powerDomain}]`
            : ability.behaviorId === "ability.exhaust_for_resource"
              ? ability.parameters.resourceType === "power"
                ? ability.parameters.usage === "spellsOnly"
                  ? `Add spell Power [${ability.parameters.domain}]`
                  : `Add Power [${ability.parameters.domain}]`
                : ability.parameters.usage === "spellsOnly"
                  ? "Add spell Energy"
                  : "Add Energy"
              : `${definition.card.name} ability`;
        actions.push(
          action(
            game,
            "activate",
            label,
            sourceId,
            enabled,
            enabled
              ? null
              : !sourceReady
                ? "Source is exhausted."
                : !costStatus.enabled
                  ? costStatus.reason
                  : "No legal targets are available.",
            `${clause.id}|${ability.behaviorId}`,
            targets,
          ),
        );
      }
    }
    const energyActivation = activations.find(
      ({ ability }) =>
        ability.behaviorId === "ability.exhaust_for_resource" &&
        ability.parameters.resourceType === "energy",
    );
    const powerActivation = activations.find(
      ({ ability }) => ability.behaviorId === "ability.recycle_for_power",
    );
    if (
      energyActivation &&
      powerActivation &&
      abilityAvailableAtTiming(
        compiled,
        energyActivation.clause,
        energyActivation.ability,
        timing,
      ) &&
      energyActivation.clause.costs.length === 0 &&
      powerActivation.clause.costs.length === 0 &&
      abilityAvailableAtTiming(
        compiled,
        powerActivation.clause,
        powerActivation.ability,
        timing,
      )
    ) {
      const enabled = !game.state.cardStates[sourceId]!.exhausted;
      actions.push(
        action(
          game,
          "activateMany",
          "Add Energy and Power",
          sourceId,
          enabled,
          enabled ? null : "Source is exhausted.",
          JSON.stringify([
            {
              clauseId: energyActivation.clauseId,
              behaviorId: energyActivation.ability.behaviorId,
            },
            {
              clauseId: powerActivation.clauseId,
              behaviorId: powerActivation.ability.behaviorId,
            },
          ]),
        ),
      );
    }
  }
}

function abilityAvailableAtTiming(
  compiled: ReturnType<typeof compileBehaviorModel>,
  clause: ReturnType<typeof compileBehaviorModel>["clauses"][number],
  ability: ReturnType<
    typeof compileBehaviorModel
  >["clauses"][number]["abilities"][number],
  timing: TurnTiming,
) {
  const timingIds = [...compiled.playTimings, ...clause.timings].map(
    (candidate) => candidate.behaviorId,
  );
  const hasReactionTiming =
    timingIds.includes("timing.reaction") ||
    /\[Reaction\]/i.test(`${clause.sourceText} ${clause.normalizedText}`);
  return isAbilityTimingAllowed({
    hasActionTiming: timingIds.includes("timing.action"),
    hasReactionTiming,
    isAddAbility: isAddResourceAbility(ability.behaviorId),
    allowPriorityAddOverride: ALLOW_ADD_ABILITIES_WHEN_PLAYER_HAS_PRIORITY,
    timing,
  });
}

export function isAbilityTimingAllowed(input: {
  allowPriorityAddOverride: boolean;
  hasActionTiming: boolean;
  hasReactionTiming: boolean;
  isAddAbility: boolean;
  timing: TurnTiming;
}) {
  const hasPriorityAddOverride =
    input.allowPriorityAddOverride && input.isAddAbility;
  if (input.timing === "showdownOpen") {
    return (
      input.hasActionTiming || input.hasReactionTiming || hasPriorityAddOverride
    );
  }
  if (input.timing === "neutralClosed" || input.timing === "showdownClosed") {
    return input.hasReactionTiming || hasPriorityAddOverride;
  }
  return true;
}

function executeActivatedAbility(
  game: GameDocument,
  actorPlayerId: string,
  sourceId: string,
  clauseId: string,
  behaviorId: string,
  selectedIds: string[],
  index: RuntimeCardIndex,
  handlers: ReturnType<typeof createPrimitiveHandlers>,
) {
  const definition = definitionForInstance(sourceId, index);
  const clause = definition.behaviorModel.clauses.find(
    (item) => item.id === clauseId,
  );
  const binding = clause?.abilities.find(
    (item) => item.behaviorId === behaviorId,
  );
  if (!clause || !binding) throw new Error("Activated ability is unavailable.");
  const handler = handlers.get(binding.behaviorId);
  if (!handler?.execute) {
    throw new Error(`Behavior handler cannot execute: ${binding.behaviorId}`);
  }
  payActivatedAbilityCosts(game, actorPlayerId, sourceId, clause, index);
  const resolvesImmediately = isAddResourceAbility(binding.behaviorId);
  if (resolvesImmediately) {
    handler.execute(
      binding,
      createBehaviorContext(game, actorPlayerId, sourceId, null, selectedIds),
    );
    if (game.state.chain) {
      game.state.chain.priorityPlayerId = actorPlayerId;
      game.state.chain.passedPlayerIds = [];
    }
    if (game.state.showdown) {
      game.state.showdown.passedPlayerIds = [];
    }
    return;
  }
  const item = {
    id: `ability:${game.stateVersion + 1}:${sourceId}:${clauseId}`,
    kind: "activatedAbility" as const,
    label: definition.card.name,
    controllerPlayerId: actorPlayerId,
    sourceCardInstanceId: sourceId,
    targetCardInstanceIds: selectedIds,
    targetObjectVersions: captureTargetObjectVersions(game, selectedIds),
    lockedSelectionsByBinding: {},
    behaviorClauseId: clauseId,
    activatedBehaviorId: behaviorId,
    behaviorEvent: null,
  };
  game.state.chain = game.state.chain ?? {
    items: [],
    relevantPlayerIds: game.state.showdown?.relevantPlayerIds ?? [
      ...game.state.setup.playerIds,
    ],
    priorityPlayerId: actorPlayerId,
    passedPlayerIds: [],
    resumeFocusPlayerId: game.state.showdown
      ? nextRelevantPlayer(
          game,
          actorPlayerId,
          game.state.showdown.relevantPlayerIds,
        )
      : null,
  };
  game.state.chain.items.push(item);
  game.state.chain.priorityPlayerId = actorPlayerId;
  game.state.chain.passedPlayerIds = [];
}

function activatedAbilityCostStatus(
  game: GameDocument,
  playerId: string,
  sourceId: string,
  clause: GameCardDefinition["behaviorModel"]["clauses"][number],
  index: RuntimeCardIndex,
): { enabled: boolean; reason: string | null } {
  let energyCost = 0;
  for (const cost of clause.costs) {
    if (cost.behaviorId === "cost.exhaust_source") {
      if (game.state.cardStates[sourceId]?.exhausted) {
        return { enabled: false, reason: "Source is exhausted." };
      }
      continue;
    }
    if (cost.behaviorId !== "cost.pay") {
      return {
        enabled: false,
        reason: "This ability's cost is not implemented.",
      };
    }
    const amount = cost.parameters.amount;
    if (
      cost.parameters.resource !== "energy" ||
      typeof amount !== "number" ||
      !Number.isInteger(amount) ||
      amount < 0
    ) {
      return {
        enabled: false,
        reason: "This ability's cost is not implemented.",
      };
    }
    energyCost += amount;
  }
  const paymentDefinition = activatedAbilityPaymentDefinition(
    definitionForInstance(sourceId, index),
  );
  if (
    buildPaymentPlan(
      game,
      playerId,
      paymentDefinition,
      energyCost,
      index,
    ) === null
  ) {
    return { enabled: false, reason: "Ability costs cannot be paid." };
  }
  return { enabled: true, reason: null };
}

function payActivatedAbilityCosts(
  game: GameDocument,
  playerId: string,
  sourceId: string,
  clause: GameCardDefinition["behaviorModel"]["clauses"][number],
  index: RuntimeCardIndex,
) {
  const status = activatedAbilityCostStatus(
    game,
    playerId,
    sourceId,
    clause,
    index,
  );
  if (!status.enabled) throw new Error(status.reason ?? "Ability costs cannot be paid.");

  const energyCost = clause.costs.reduce(
    (total, cost) =>
      cost.behaviorId === "cost.pay" ? total + (cost.parameters.amount as number) : total,
    0,
  );
  payCardCost(
    game,
    playerId,
    activatedAbilityPaymentDefinition(definitionForInstance(sourceId, index)),
    energyCost,
    index,
  );
  for (const cost of clause.costs) {
    if (cost.behaviorId === "cost.exhaust_source") {
      game.state.cardStates[sourceId]!.exhausted = true;
      continue;
    }
  }
}

function activatedAbilityPaymentDefinition(definition: GameCardDefinition) {
  return {
    ...definition,
    card: {
      ...definition.card,
      attributes: {
        ...definition.card.attributes,
        power: 0,
      },
    },
  };
}

function isAddResourceAbility(behaviorId: string) {
  return (
    behaviorId === "ability.exhaust_for_resource" ||
    behaviorId === "ability.recycle_for_power"
  );
}

function executeImmediateClauses(
  game: GameDocument,
  definition: GameCardDefinition,
  controllerId: string,
  sourceId: string,
  selectedIds: string[],
  handlers: ReturnType<typeof createPrimitiveHandlers>,
  targetObjectVersions?: Record<string, number>,
) {
  const compiled = compileBehaviorModel(definition.behaviorModel, handlers);
  const effectOutcomes: Record<string, boolean | number | string | string[]> =
    {};
  for (const clause of compiled.clauses.filter((item) =>
    clauseCanResolveImmediately(definition, item),
  )) {
    const availableSelections = targetObjectVersions
      ? selectedIds.filter(
          (id) =>
            (game.state.cardStates[id]?.objectVersion ?? 0) ===
            targetObjectVersions[id],
        )
      : selectedIds;
    const clauseSelections = clause.selectors.length ? availableSelections : [];
    executeBehaviorClause({
      clause,
      context: createBehaviorContext(
        game,
        controllerId,
        sourceId,
        null,
        clauseSelections,
        effectOutcomes,
      ),
      handlers,
      allowUnavailableSelections: targetObjectVersions !== undefined,
    });
  }
}

function chainItemsNeedTargetSelection(
  game: GameDocument,
  items: ChainItem[],
  decks: readonly DeckSnapshotDocument[],
) {
  const index = createRuntimeCardIndex(decks, game);
  const handlers = createPrimitiveHandlers(index);
  return items.some((item) => {
    if (
      !item.sourceCardInstanceId ||
      !item.behaviorClauseId ||
      item.targetCardInstanceIds.length > 0
    ) {
      return false;
    }
    const definition = definitionForInstance(item.sourceCardInstanceId, index);
    const clause = compileBehaviorModel(
      definition.behaviorModel,
      handlers,
    ).clauses.find((candidate) => candidate.id === item.behaviorClauseId);
    if (!clause) return false;
    const requirements = selectionRequirementsForClause(
      clause,
      createBehaviorContext(
        game,
        item.controllerPlayerId,
        item.sourceCardInstanceId,
        item.behaviorEvent,
        [],
      ),
      handlers,
    )
      .filter(({ binding }) => binding.parameters.deferred !== true)
      .map(({ requirement }) => requirement);
    return requirements.some((requirement) => requirement.maximum > 0);
  });
}

function clauseCanRequirePlaySelections(
  definition: GameCardDefinition,
  clause: ReturnType<typeof compileBehaviorModel>["clauses"][number],
) {
  if (clause.triggers.length > 0 || clause.abilities.length > 0) return false;
  if (clause.selectors.some((selector) => selector.parameters.deferred === true)) return false;
  if (definition.card.classification.type !== "Unit") return true;
  return !looksLikeNonPlayUnitText(clause.sourceText);
}

function clauseCanResolveImmediately(
  definition: GameCardDefinition,
  clause: ReturnType<typeof compileBehaviorModel>["clauses"][number],
) {
  if (clause.triggers.length > 0 || clause.abilities.length > 0) return false;
  if (definition.card.classification.type !== "Unit") return true;
  return !looksLikeNonPlayUnitText(clause.sourceText);
}

function looksLikeNonPlayUnitText(sourceText: string) {
  const text = sourceText.trim().toLowerCase();
  return (
    /^when\b/.test(text) ||
    /^while\b/.test(text) ||
    /\b(?:units?|friendly units?|enemy units?)\b[^.]{0,50}\bhave\b/.test(text)
  );
}

function captureTargetObjectVersions(
  game: GameDocument,
  selectedIds: readonly string[],
) {
  return Object.fromEntries(
    selectedIds.map((id) => [
      id,
      game.state.cardStates[id]?.objectVersion ?? 0,
    ]),
  );
}

function payOptionalPlayCosts(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  selectedIds: string[],
  index: RuntimeCardIndex,
) {
  let ignoreBaseCost = false;
  const selectionsByKey = preplaySelectionsByKey(definition, selectedIds);
  for (const clause of definition.behaviorModel.clauses) {
    for (const cost of clause.costs) {
      const selectionKey = cost.parameters.selectionKey;
      const selected =
        typeof selectionKey === "string"
          ? selectionsByKey[selectionKey]?.[0]
          : undefined;
      if (cost.behaviorId === "cost.exhaust_selected_unit") {
        if (
          selected &&
          definitionForInstance(selected, index).card.classification.type ===
            "Unit" &&
          !game.state.cardStates[selected]?.exhausted
        ) {
          game.state.cardStates[selected]!.exhausted = true;
        }
        continue;
      }
      if (cost.behaviorId !== "cost.spend_buff") continue;
      if (
        !selected ||
        index.instances.get(selected)?.ownerPlayerId !== playerId ||
        game.state.cardStates[selected]?.buffed !== true
      ) {
        continue;
      }
      game.state.cardStates[selected]!.buffed = false;
      recomputeMight(game, selected, index);
      if (cost.parameters.ignoreBaseCost === true) ignoreBaseCost = true;
    }
  }
  return { ignoreBaseCost };
}

function preplaySelectionsByKey(
  definition: GameCardDefinition,
  selectedIds: readonly string[],
) {
  const selectionsByKey: Record<string, string[]> = {};
  let cursor = 0;
  for (const clause of definition.behaviorModel.clauses) {
    for (const selector of clause.selectors) {
      if (selector.parameters.deferred === true) continue;
      const maximum =
        typeof selector.parameters.maximumCount === "number"
          ? selector.parameters.maximumCount
          : 1;
      const selected = selectedIds.slice(cursor, cursor + maximum);
      cursor += selected.length;
      if (typeof selector.parameters.selectionKey === "string") {
        selectionsByKey[selector.parameters.selectionKey] = selected;
      }
    }
  }
  return selectionsByKey;
}

function lockedPlaySelectionsByBinding(
  definition: GameCardDefinition,
  selectedIds: readonly string[],
) {
  const selectionsByBinding: Record<string, string[]> = {};
  let cursor = 0;
  for (const clause of definition.behaviorModel.clauses) {
    for (const selector of clause.selectors) {
      const isOptionalCost = selector.parameters.selectionPurpose === "optionalCost";
      if (
        selector.parameters.deferred === true ||
        ((clause.triggers.length > 0 || clause.abilities.length > 0) &&
          !isOptionalCost)
      ) {
        continue;
      }
      const automatic =
        selector.parameters.automatic === true ||
        (selector.parameters.scope === "each" &&
          typeof selector.parameters.maximumCount !== "number");
      if (automatic) continue;
      const maximum =
        typeof selector.parameters.maximumCount === "number"
          ? selector.parameters.maximumCount
          : 1;
      const selected = selectedIds.slice(cursor, cursor + maximum);
      cursor += selected.length;
      selectionsByBinding[`${clause.id}:selectors:${selector.order}`] = selected;
    }
  }
  return selectionsByBinding;
}

function playSelectionRequirements(
  definition: GameCardDefinition,
  compiled: ReturnType<typeof compileBehaviorModel>,
  context: ReturnType<typeof createBehaviorContext>,
  handlers: ReturnType<typeof createPrimitiveHandlers>,
) {
  return compiled.clauses.flatMap((clause) =>
    selectionRequirementsForClause(clause, context, handlers)
      .filter(({ binding }) =>
        (binding.parameters.deferred !== true &&
          clauseCanRequirePlaySelections(definition, clause)) ||
        binding.parameters.selectionPurpose === "optionalCost",
      )
      .map(({ requirement }) => requirement),
  );
}

function validateLockedPlaySelections(
  game: GameDocument,
  playerId: string,
  cardId: string,
  selectedIds: readonly string[],
  definition: GameCardDefinition,
  handlers: ReturnType<typeof createPrimitiveHandlers>,
) {
  const compiled = compileBehaviorModel(definition.behaviorModel, handlers);
  const clauses = compiled.clauses.filter((clause) =>
    clauseCanRequirePlaySelections(definition, clause),
  );
  if (clauses.length === 0) return;
  let cursor = 0;
  for (const clause of clauses) {
    const context = createBehaviorContext(game, playerId, cardId, null, []);
    for (const selector of clause.selectors) {
      if (selector.parameters.deferred === true) continue;
      const handler = handlers.get(selector.behaviorId);
      if (!handler?.targets) {
        throw new Error(`Behavior handler cannot project targets: ${selector.behaviorId}`);
      }
      const requirement = handler.targets(selector, context);
      const selected = requirement.maximum === 0
        ? requirement.legalIds
        : selectedIds.slice(cursor, cursor + requirement.maximum);
      if (requirement.maximum > 0) cursor += selected.length;
      if (
        selected.length < requirement.minimum ||
        selected.some((id) => !requirement.legalIds.includes(id))
      ) {
        throw new Error("Selected targets do not satisfy linked requirements.");
      }
      const selectionKey = `${clause.id}:selectors:${selector.order}`;
      context.selectedBySelector[selectionKey] = selected;
      if (typeof selector.parameters.selectionKey === "string") {
        context.selectedBySelector[selector.parameters.selectionKey] = selected;
      }
    }
  }
  if (cursor !== selectedIds.length) {
    throw new Error("Selected targets do not satisfy linked requirements.");
  }
}

function hasPayableAlternateCost(
  definition: GameCardDefinition,
  targets: readonly ReturnType<typeof targetRequirementsForClause>[number][],
) {
  const selectionKeys = new Set(
    definition.behaviorModel.clauses.flatMap((clause) =>
      clause.costs
        .filter((cost) => cost.behaviorId === "cost.spend_buff")
        .map((cost) => cost.parameters.selectionKey)
        .filter((key): key is string => typeof key === "string"),
    ),
  );
  return targets.some(
    (target) =>
      target.selectionKey !== undefined &&
      selectionKeys.has(target.selectionKey) &&
      target.legalIds.length > 0,
  );
}

function hasBehavior(definition: GameCardDefinition, behaviorId: string) {
  return definition.behaviorModel.clauses.some((clause) =>
    [...clause.keywords, ...clause.effects, ...clause.abilities].some(
      (binding) => binding.behaviorId === behaviorId,
    ),
  );
}

function validLockedTargets(
  game: GameDocument,
  clause: ReturnType<typeof compileBehaviorModel>["clauses"][number],
  item: NonNullable<GameDocument["state"]["chain"]>["items"][number],
  controllerPlayerId: string,
  handlers: ReturnType<typeof createPrimitiveHandlers>,
) {
  const currentlyLegal = new Set(
    targetRequirementsForClause(
      clause,
      createBehaviorContext(
        game,
        controllerPlayerId,
        item.sourceCardInstanceId!,
        item.behaviorEvent,
        [],
      ),
      handlers,
    ).flatMap((requirement) => requirement.legalIds),
  );
  return item.targetCardInstanceIds.filter(
    (id) =>
      currentlyLegal.has(id) &&
      (game.state.cardStates[id]?.objectVersion ?? 0) ===
        item.targetObjectVersions[id],
  );
}

function validateActionTargets(action: ProjectedAction, selectedIds: string[]) {
  if (action.targets.length === 0) {
    if (selectedIds.length)
      throw new Error("This action does not accept selected targets.");
    return;
  }
  const legal = new Set(action.targets.flatMap((target) => target.legalIds));
  const minimum = action.targets.reduce(
    (sum, target) => sum + target.minimum,
    0,
  );
  const maximum = action.targets.reduce(
    (sum, target) => sum + target.maximum,
    0,
  );
  const actionKind = action.id.split(":")[3];
  if (
    selectedIds.length < minimum ||
    selectedIds.length > maximum ||
    selectedIds.some((id) => !legal.has(id)) ||
    (actionKind === "moveMany" && new Set(selectedIds).size !== selectedIds.length)
  ) {
    throw new Error("Selected targets are not legal for this action.");
  }
}
function isCardPlayRestricted(game: GameDocument, playerId: string) {
  return game.state.ongoingEffects.some(
    (effect) =>
      effect.behaviorId === "modifier.cannot_play_cards" &&
      effect.controllerPlayerId !== playerId &&
      effect.duration === "thisTurn",
  );
}

function isMoveToBaseForbidden(
  game: GameDocument,
  cardId: string,
  index: RuntimeCardIndex,
) {
  const battlefield = game.state.battlefields.find((candidate) =>
    candidate.units.includes(cardId),
  );
  if (!battlefield) return false;
  return definitionForInstance(battlefield.cardInstanceId, index)
    .behaviorModel.clauses.some((clause) =>
      clause.effects.some(
        (effect) =>
          effect.behaviorId === "modifier.cannot_move_from_source_battlefield" &&
          effect.parameters.destination === "base",
      ),
    );
}

function isCardInAnyZone(game: GameDocument, cardId: string) {
  return (
    Object.values(game.state.players).some((player) =>
      Object.values(player.zones).some((zone) =>
        Array.isArray(zone) ? zone.includes(cardId) : zone === cardId,
      ),
    ) ||
    game.state.battlefields.some(
      (battlefield) =>
        battlefield.cardInstanceId === cardId ||
        battlefield.units.includes(cardId) ||
        facedownCardsAt(battlefield).some(
          (card) => card.cardInstanceId === cardId,
        ),
    )
  );
}

function otherPlayer(game: GameDocument, playerId: string) {
  return game.state.setup.playerIds.find((id) => id !== playerId)!;
}
