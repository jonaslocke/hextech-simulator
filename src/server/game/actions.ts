import type { ProjectedAction } from "../../shared/game";
import {
  compileBehaviorModel,
  createBehaviorContext,
  executeBehaviorClause,
  submitTriggerOrder,
  targetRequirementsForClause,
} from "./behavior-runtime";
import {
  cleanupTurnModifiers,
  createPrimitiveHandlers,
  createRuntimeCardIndex,
  definitionForInstance,
  effectiveEnergyCost,
  effectivePowerCost,
  submitDeathReplacementOrder,
  type RuntimeCardIndex,
} from "./primitive-handlers";
import {
  clearMarkedDamage,
  cleanupBoard,
  markBattlefieldContested,
  openPendingNonCombatShowdown,
  resolveNonCombatShowdown,
  unitControllers,
} from "./board-rules";
import { moveAttachedCardsWithTopMost } from "./attachment-lifecycle";
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
import type { BehaviorBinding, BehaviorClause, GameCardDefinition } from "./schemas";
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
  buildAnyPowerPaymentPlan,
  buildAbilityPaymentPlan,
  buildPaymentPlan,
  canPayCardCosts,
  payAbilityCost,
  payAnyPowerCost,
  payCardCosts,
  targetDeflectCost,
  type AdditionalCardCost,
} from "./payment";
import {
  beginEffectResolution,
  submitEffectOption,
  submitEffectSelection,
  submitTokenPlacement,
  type TokenPlacement,
} from "./effect-resolution";
import {
  isLegalUnitDestination,
  legalUnitDestinationIds,
} from "./unit-destinations";
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
    if (pendingChoice.type === "effectOption") {
      const optionIds = pendingChoice.options.map((option) => option.id);
      actions.push(
        action(
          game,
          "submitChoice",
          pendingChoice.prompt,
          null,
          true,
          null,
          undefined,
          [
            {
              kind: "card",
              label: pendingChoice.prompt,
              legalIds: optionIds,
              minimum: 1,
              maximum: 1,
            },
          ],
          {
            kind: "effectOption",
            choiceId: pendingChoice.id,
            prompt: pendingChoice.prompt,
            options: pendingChoice.options,
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
    const optionIds =
      pendingChoice.type === "orderReplacements"
        ? pendingChoice.options.map((option) => option.id)
        : pendingChoice.optionIds;
    actions.push(
      action(
        game,
        "submitChoice",
        pendingChoice.type === "orderReplacements"
          ? "Submit replacement order"
          : "Submit trigger order",
        null,
        true,
        null,
        undefined,
        [
          {
            kind: "card",
            label:
              pendingChoice.type === "orderReplacements"
                ? "replacement order"
                : "trigger order",
            legalIds: optionIds,
            minimum: optionIds.length,
            maximum: optionIds.length,
          },
        ],
        {
          kind: "orderedOptions",
          choiceId: pendingChoice.id,
          optionIds,
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
      addHiddenCardActions(actions, game, actorPlayerId, index);
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
  if (!canAct) return actions;

  actions.push(action(game, "endTurn", "End turn", null));

  addPlayableCardActions(
    actions,
    game,
    actorPlayerId,
    decks,
    index,
    "neutralOpen",
  );
  addHiddenCardActions(actions, game, actorPlayerId, index);
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
  // Public card reveals are an informational presentation, not a decision.
  // A later accepted game action replaces the transient presentation.
  game.state.publicReveals = [];
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
    case "hide":
      hideCard(game, input.actorPlayerId, source, extra, index);
      break;
    case "playHidden":
      playHiddenCard(
        game,
        input.actorPlayerId,
        source,
        extra,
        input.selectedIds,
        index,
        handlers,
      );
      break;
    case "submitChoice":
      if (game.state.pendingChoice?.type === "orderReplacements") {
        submitDeathReplacementOrder(
          game,
          input.actorPlayerId,
          input.selectedIds,
          index,
        );
        completeChainResolution(game, index, input.decks);
        cleanupBoard(game, index);
      } else if (game.state.pendingChoice?.type === "orderTriggers") {
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
      } else if (game.state.pendingChoice?.type === "effectOption") {
        submitEffectOption(
          game,
          input.actorPlayerId,
          input.selectedIds,
          input.decks,
        );
        completeChainResolution(game, index, input.decks);
        queueChainItemsForTargets(game, [], input.decks);
        drainQueuedBehaviorEvents(game, input.decks);
        resetChainPriorityToTopItem(game);
        openPendingShowdown(game, index, input.decks);
        finishTurnProgressionIfReady(game, index, input.decks);
      } else if (game.state.pendingChoice?.type === "tokenPlacement") {
        submitTokenPlacement(
          game,
          input.actorPlayerId,
          input.tokenPlacements ?? [],
          input.decks,
        );
        completeChainResolution(game, index, input.decks);
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
        completeChainResolution(game, index, input.decks);
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
        for (const battlefield of game.state.battlefields) {
          battlefield.units = battlefield.units.filter((id) => id !== cardId);
        }
        player.zones.base.push(cardId);
        game.state.cardStates[cardId]!.exhausted = true;
        moveAttachedCardsWithTopMost(game, cardId, index);
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
  return {
    game,
    events: projected
      ? [
          acceptedActionEvent(input.actorPlayerId, projected),
          ...stateChangeEvents(input.game, game),
        ]
      : [],
  };
}

function playTargetRequirements(input: {
  game: GameDocument;
  definition: GameCardDefinition;
  playerId: string;
  cardId: string;
  selectedIds: string[];
  handlers: ReturnType<typeof createPrimitiveHandlers>;
  selectionOverrides?: Record<string, string[]>;
  hiddenBattlefieldId?: string | null;
}) {
  const compiled = compileBehaviorModel(input.definition.behaviorModel, input.handlers);
  return compiled.clauses
    .filter((clause) => clauseCanRequirePlaySelections(input.definition, clause))
    .flatMap((clause) =>
      targetRequirementsForClause(
        clause,
        createBehaviorContext(
          input.game,
          input.playerId,
          input.cardId,
          null,
          input.selectedIds,
          {},
          input.selectionOverrides ?? {},
          input.hiddenBattlefieldId ?? null,
        ),
        input.handlers,
      ),
    );
}

function playCard(
  game: GameDocument,
  playerId: string,
  cardId: string,
  playExtra: string,
  selectedIds: string[],
  index: RuntimeCardIndex,
  handlers: ReturnType<typeof createPrimitiveHandlers>,
  decks: readonly DeckSnapshotDocument[],
) {
  const player = game.state.players[playerId]!;
  const definition = definitionForInstance(cardId, index);
  const { destinationId, optionalCostKeys } = decodePlayExtra(playExtra);
  const optionalSourceCosts = optionalSourcePlayCosts(definition);
  const optionalSourceCostKeys = new Set(
    optionalSourceCosts.map((payment) => payment.selectionKey),
  );
  if (optionalCostKeys.some((key) => !optionalSourceCostKeys.has(key))) {
    throw new Error("Optional play cost is not available for this card.");
  }
  const optionalCosts = optionalSourceCosts
    .filter((payment) => optionalCostKeys.includes(payment.selectionKey))
    .flatMap((payment) => payment.costs);
  const selectionOverrides = Object.fromEntries(
    optionalSourceCosts.map((payment) => [
      payment.selectionKey,
      optionalCostKeys.includes(payment.selectionKey) ? [cardId] : [],
    ]),
  );
  // The source id permits canonical selector validation while the keyed
  // overrides retain which individual optional costs were actually chosen.
  const allSelectedIds =
    optionalCostKeys.length > 0 ? [...selectedIds, cardId] : selectedIds;
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
  const dynamicTargets = playTargetRequirements({
    game,
    definition,
    playerId,
    cardId,
    selectedIds: allSelectedIds,
    handlers,
    selectionOverrides,
  });
  if (dynamicTargets.some((target) => target.kind === "location")) {
    validateTargetRequirements(dynamicTargets, selectedIds);
  }
  const energyCost = effectiveEnergyCost(game, playerId, definition, index, cardId);
  const playEvent = {
    type: "card.played",
    actorPlayerId: playerId,
    subjectCardInstanceId: cardId,
    values: {
      "eventSubject.printedEnergyCost": definition.card.attributes.energy ?? 0,
      "eventSubject.effectiveEnergyCost": energyCost,
    },
  };
  const additionalAnyPower = targetDeflectCost(
    playerId,
    selectedIds,
    index,
    ignoresDeflect(definition),
  );
  payCardCosts(
    game,
    playerId,
    definition,
    energyCost,
    index,
    additionalAnyPower,
    optionalCosts,
    cardId,
  );
  payOptionalNonResourcePlayCosts(
    game,
    playerId,
    definition,
    selectedIds,
    index,
  );
  if (game.state.turn) {
    game.state.turn.playedCardInstanceIds ??= [];
    game.state.turn.playedCardInstanceIds.push(cardId);
  }
  if (game.state.showdown) game.state.showdown.passedPlayerIds = [];
  player.zones.hand = player.zones.hand.filter((id) => id !== cardId);
  if (player.zones.champion === cardId) player.zones.champion = null;
  if (isGear) {
    // Rules 143.1.a.1, 144.1, and 563.1.d: Gear enters ready at its
    // controller's Base and does not use a Unit play destination.
    player.zones.base.push(cardId);
    game.state.cardStates[cardId]!.exhausted = false;
    executeImmediateClauses(
      game,
      definition,
      playerId,
      cardId,
      allSelectedIds,
      handlers,
      undefined,
      selectionOverrides,
    );
    dispatchBehaviorEvent(game, playEvent, decks);
    cleanupBoard(game, index);
    return;
  }
  if (isUnit) {
    if (destinationBattlefield) destinationBattlefield.units.push(cardId);
    else player.zones.base.push(cardId);
    if (
      destinationBattlefield &&
      destinationBattlefield.controllerPlayerId == null
    ) {
      markBattlefieldContested(game, destinationId, playerId);
    }
    game.state.cardStates[cardId]!.exhausted = true;
    executeImmediateClauses(
      game,
      definition,
      playerId,
      cardId,
      allSelectedIds,
      handlers,
      undefined,
      selectionOverrides,
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
    targetCardInstanceIds: allSelectedIds,
    initialSelectionOverrides: selectionOverrides,
    targetObjectVersions: captureTargetObjectVersions(game, allSelectedIds),
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

/** Hide is a discretionary action, not a card play and therefore never opens a Chain. */
function hideCard(
  game: GameDocument,
  playerId: string,
  cardId: string,
  battlefieldId: string,
  index: RuntimeCardIndex,
) {
  const player = game.state.players[playerId]!;
  const turn = game.state.turn;
  const definition = definitionForInstance(cardId, index);
  const battlefield = game.state.battlefields.find(
    (candidate) => candidate.battlefieldId === battlefieldId,
  );
  if (
    !turn ||
    turn.activePlayerId !== playerId ||
    game.state.chain ||
    !hasBehavior(definition, "keyword.hidden") ||
    !(player.zones.hand.includes(cardId) || player.zones.champion === cardId) ||
    !battlefield ||
    battlefield.controllerPlayerId !== playerId ||
    battlefield.facedownCardInstanceId
  ) {
    throw new Error("Hide is not legal for this card or battlefield.");
  }
  payAnyPowerCost(game, playerId, index);
  player.zones.hand = player.zones.hand.filter((id) => id !== cardId);
  if (player.zones.champion === cardId) player.zones.champion = null;
  battlefield.facedownCardInstanceId = cardId;
  game.state.cardStates[cardId]!.hiddenAtTurnNumber = turn.turnNumber;
}

function playHiddenCard(
  game: GameDocument,
  playerId: string,
  cardId: string,
  extra: string,
  selectedIds: string[],
  index: RuntimeCardIndex,
  handlers: ReturnType<typeof createPrimitiveHandlers>,
) {
  const { battlefieldId, optionalCostKeys } = decodeHiddenPlayExtra(extra);
  const turn = game.state.turn;
  const definition = definitionForInstance(cardId, index);
  const battlefield = game.state.battlefields.find(
    (candidate) => candidate.battlefieldId === battlefieldId,
  );
  const hiddenAtTurnNumber = game.state.cardStates[cardId]?.hiddenAtTurnNumber;
  if (
    !turn ||
    hiddenAtTurnNumber == null ||
    turn.turnNumber <= hiddenAtTurnNumber ||
    !battlefield ||
    battlefield.facedownCardInstanceId !== cardId ||
    battlefield.controllerPlayerId !== playerId ||
    !hasBehavior(definition, "keyword.hidden")
  ) {
    throw new Error("Hidden card is not playable.");
  }
  const optionalSourceCosts = optionalSourcePlayCosts(definition);
  const optionalSourceCostKeys = new Set(
    optionalSourceCosts.map((payment) => payment.selectionKey),
  );
  if (optionalCostKeys.some((key) => !optionalSourceCostKeys.has(key))) {
    throw new Error("Optional play cost is not available for this card.");
  }
  const optionalCosts = optionalSourceCosts
    .filter((payment) => optionalCostKeys.includes(payment.selectionKey))
    .flatMap((payment) => payment.costs);
  const selectionOverrides = Object.fromEntries(
    optionalSourceCosts.map((payment) => [
      payment.selectionKey,
      optionalCostKeys.includes(payment.selectionKey) ? [cardId] : [],
    ]),
  );
  const allSelectedIds =
    optionalCostKeys.length > 0 ? [...selectedIds, cardId] : selectedIds;
  const targets = playTargetRequirements({
    game,
    definition,
    playerId,
    cardId,
    selectedIds: allSelectedIds,
    handlers,
    selectionOverrides,
    hiddenBattlefieldId: battlefieldId,
  });
  validateTargetRequirements(targets, selectedIds);
  const additionalAnyPower = targetDeflectCost(
    playerId,
    selectedIds,
    index,
    ignoresDeflect(definition),
  );
  // Rule 811.1.b ignores a Hidden card's base cost, but not optional and
  // applied costs. The generic payment planner commits the combined payment.
  payCardCosts(
    game,
    playerId,
    definition,
    0,
    index,
    additionalAnyPower,
    optionalCosts,
    cardId,
    0,
  );
  payOptionalNonResourcePlayCosts(
    game,
    playerId,
    definition,
    selectedIds,
    index,
  );
  if (game.state.turn) {
    game.state.turn.playedCardInstanceIds ??= [];
    game.state.turn.playedCardInstanceIds.push(cardId);
  }
  if (game.state.showdown) game.state.showdown.passedPlayerIds = [];
  const item = {
    id: `hidden:${game.stateVersion + 1}:${cardId}`,
    kind:
      definition.card.classification.type === "Spell"
        ? ("spell" as const)
        : ("permanent" as const),
    label: definition.card.name,
    controllerPlayerId: playerId,
    sourceCardInstanceId: cardId,
    targetCardInstanceIds: allSelectedIds,
    initialSelectionOverrides: selectionOverrides,
    hiddenBattlefieldId: battlefieldId,
    targetObjectVersions: captureTargetObjectVersions(game, allSelectedIds),
    behaviorClauseId:
      definition.card.classification.type === "Spell"
        ? spellResolutionClauseId(definition, handlers)
        : null,
    activatedBehaviorId: null,
    behaviorEvent: {
      type: "card.played",
      actorPlayerId: playerId,
      subjectCardInstanceId: cardId,
      values: {
        "eventSubject.printedEnergyCost": definition.card.attributes.energy ?? 0,
        "eventSubject.effectiveEnergyCost": 0,
        hiddenBattlefieldId: battlefieldId,
      },
    },
  };
  appendPlayerCardToChain(game, item);
}

function appendPlayerCardToChain(
  game: GameDocument,
  item: NonNullable<GameDocument["state"]["chain"]>["items"][number],
) {
  if (game.state.chain) {
    game.state.chain.items.push(item);
    game.state.chain.priorityPlayerId = item.controllerPlayerId;
    game.state.chain.passedPlayerIds = [];
    return;
  }
  game.state.chain = {
    items: [item],
    relevantPlayerIds: game.state.showdown?.relevantPlayerIds ?? [
      ...game.state.setup.playerIds,
    ],
    priorityPlayerId: item.controllerPlayerId,
    passedPlayerIds: [],
  };
}

function resolveHiddenPermanent(
  game: GameDocument,
  item: NonNullable<GameDocument["state"]["chain"]>["items"][number],
  definition: GameCardDefinition,
  index: RuntimeCardIndex,
  handlers: ReturnType<typeof createPrimitiveHandlers>,
  decks: readonly DeckSnapshotDocument[],
) {
  const battlefield = game.state.battlefields.find(
    (candidate) => candidate.battlefieldId === item.hiddenBattlefieldId,
  );
  if (
    !battlefield ||
    battlefield.facedownCardInstanceId !== item.sourceCardInstanceId ||
    battlefield.controllerPlayerId !== item.controllerPlayerId
  ) {
    return;
  }
  const cardId = item.sourceCardInstanceId!;
  battlefield.facedownCardInstanceId = null;
  game.state.cardStates[cardId]!.hiddenAtTurnNumber = null;
  if (definition.card.classification.type === "Gear") {
    const cards = (battlefield.attachedCardInstanceIds ??= []);
    if (!cards.includes(cardId)) cards.push(cardId);
    game.state.cardStates[cardId]!.exhausted = false;
  } else {
    if (!battlefield.units.includes(cardId)) battlefield.units.push(cardId);
    game.state.cardStates[cardId]!.exhausted = true;
  }
  executeImmediateClauses(
    game,
    definition,
    item.controllerPlayerId,
    cardId,
    item.targetCardInstanceIds,
    handlers,
    item.targetObjectVersions,
    item.initialSelectionOverrides ?? {},
    item.hiddenBattlefieldId ?? null,
  );
  dispatchBehaviorEvent(
    game,
    item.behaviorEvent ?? {
      type: "card.played",
      actorPlayerId: item.controllerPlayerId,
      subjectCardInstanceId: cardId,
      values: { hiddenBattlefieldId: item.hiddenBattlefieldId ?? null },
    },
    decks,
  );
}

function clearHiddenCardLocation(
  game: GameDocument,
  cardId: string,
  battlefieldId: string | undefined,
) {
  const battlefield = game.state.battlefields.find(
    (candidate) => candidate.battlefieldId === battlefieldId,
  );
  if (battlefield?.facedownCardInstanceId === cardId) {
    battlefield.facedownCardInstanceId = null;
  }
  const state = game.state.cardStates[cardId];
  if (state) state.hiddenAtTurnNumber = null;
}

/** Finish the same persisted resolution after either Priority or a choice.
 * No Chain removal, Cleanup, or Focus transfer may occur while it is paused.
 */
function completeChainResolution(
  game: GameDocument,
  index: RuntimeCardIndex,
  decks: readonly DeckSnapshotDocument[],
) {
  const chain = game.state.chain;
  if (!chain?.resolvingItemId || game.state.effectResolutions.length || game.state.pendingChoice) return;
  const item = chain.items.find((candidate) => candidate.id === chain.resolvingItemId);
  if (!item) throw new Error("Resolving Chain item is unavailable.");
  chain.items = chain.items.filter((candidate) => candidate.id !== item.id);
  delete chain.resolvingItemId;
  if (item.kind === "spell" && item.sourceCardInstanceId) {
    const definition = definitionForInstance(item.sourceCardInstanceId, index);
    const owner = index.instances.get(item.sourceCardInstanceId)!.ownerPlayerId;
    clearHiddenCardLocation(
      game,
      item.sourceCardInstanceId,
      item.hiddenBattlefieldId,
    );
    game.state.players[owner]!.zones.trash.push(item.sourceCardInstanceId);
    dispatchBehaviorEvent(game, item.behaviorEvent?.type === "card.played"
      ? item.behaviorEvent
      : {
          type: "card.played",
          actorPlayerId: item.controllerPlayerId,
          subjectCardInstanceId: item.sourceCardInstanceId,
          values: {
            "eventSubject.printedEnergyCost": definition.card.attributes.energy ?? 0,
            "eventSubject.effectiveEnergyCost": effectiveEnergyCost(game, item.controllerPlayerId, definition, index),
          },
        }, decks);
  }
  cleanupBoard(game, index);
  if (chain.items.length) {
    chain.priorityPlayerId = chain.items.at(-1)!.controllerPlayerId;
    chain.passedPlayerIds = [];
  } else if (!game.state.pendingChoice && !(game.state.queuedChainItems?.length)) {
    game.state.chain = null;
    if (game.state.showdown) {
      if (chain.openedBy !== "triggeredAbility" && chain.openedBy !== "addAbility") {
        game.state.showdown.focusPlayerId = nextRelevantPlayer(game, game.state.showdown.focusPlayerId, game.state.showdown.relevantPlayerIds);
      }
      game.state.showdown.passedPlayerIds = [];
    }
  }
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
      const item = game.state.chain.items.at(-1);
      if (item) game.state.chain.resolvingItemId = item.id;
      if (item?.sourceCardInstanceId) {
        const controller = item.controllerPlayerId;
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
          item.kind === "permanent" &&
          item.hiddenBattlefieldId
        ) {
          resolveHiddenPermanent(game, item, definition, index, handlers, decks);
        } else if (
          item.kind === "activatedAbility" &&
          item.activatedBehaviorId
        ) {
          const clause = compileBehaviorModel(
            definition.behaviorModel,
            handlers,
          ).clauses.find((candidate) => candidate.id === item.behaviorClauseId);
          const binding = clause?.abilities.find(
            (candidate) => candidate.behaviorId === item.activatedBehaviorId,
          );
          const handler = binding ? handlers.get(binding.behaviorId) : null;
          if (!clause || !binding || !handler?.execute) {
            throw new Error(
              "Activated ability is unavailable during resolution.",
            );
          }
          if (binding.behaviorId === "ability.activated_effect") {
            beginEffectResolution({
              game,
              controllerPlayerId: controller,
              sourceCardInstanceId: item.sourceCardInstanceId,
              clauseId: clause.id,
              selectedIds: validLockedTargets(
                game,
                clause,
                item,
                controller,
                handlers,
              ),
              selectionOverrides: item.initialSelectionOverrides,
              hiddenBattlefieldId: item.hiddenBattlefieldId,
              targetsLocked: true,
              decks,
            });
          } else {
            handler.execute(
              binding,
              createBehaviorContext(
                game,
                controller,
                item.sourceCardInstanceId,
                null,
                validLockedTargets(game, clause, item, controller, handlers),
                {},
                item.initialSelectionOverrides ?? {},
                item.hiddenBattlefieldId ?? null,
              ),
            );
          }
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
                  {},
                  item.initialSelectionOverrides ?? {},
                  item.hiddenBattlefieldId ?? null,
                ),
                handlers,
              });
            } else {
              beginEffectResolution({
                game,
                controllerPlayerId: controller,
                sourceCardInstanceId: item.sourceCardInstanceId,
                clauseId: clause.id,
                selectedIds: validLockedTargets(
                  game,
                  clause,
                  item,
                  controller,
                  handlers,
                ),
                selectionOverrides: item.initialSelectionOverrides,
                hiddenBattlefieldId: item.hiddenBattlefieldId,
                targetsLocked: true,
                event: item.behaviorEvent,
                decks,
              });
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
            item.initialSelectionOverrides ?? {},
            item.hiddenBattlefieldId ?? null,
          );
        }
      }
      completeChainResolution(game, index, decks);
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
  const next = otherPlayer(game, actor);
  clearMarkedDamage(game);
  cleanupTurnModifiers(game, index);
  game.state.turn = {
    turnNumber: turn.turnNumber + 1,
    activePlayerId: next,
    phase: "awaken",
    playedCardInstanceIds: [],
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
  const boardDestination =
    kind === "play" && extra
      ? decodePlayExtra(extra).destinationId
      : kind === "playHidden" && extra
        ? decodeHiddenPlayExtra(extra).battlefieldId
        : extra;
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
        (kind === "play" || kind === "playHidden" || kind === "hide" || kind === "move" || kind === "moveMany") &&
        boardDestination
          ? boardDestination === "base"
            ? { kind: "base" as const }
            : {
                kind: "battlefield" as const,
                battlefieldId: boardDestination,
              }
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
    battlefield.units.push(cardId);
    game.state.cardStates[cardId]!.exhausted = true;
    moveAttachedCardsWithTopMost(game, cardId, index);
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

type OptionalSourcePlayCost = {
  selectionKey: string;
  costs: AdditionalCardCost[];
};

function optionalSourcePlayCosts(
  definition: GameCardDefinition,
): OptionalSourcePlayCost[] {
  const sourceSelectionKeys = new Set(
    definition.behaviorModel.clauses.flatMap((clause) =>
      clause.selectors.flatMap((selector) =>
        selector.behaviorId === "selector.source" &&
        selector.parameters.selectionPurpose === "optionalCost" &&
        typeof selector.parameters.selectionKey === "string"
          ? [selector.parameters.selectionKey]
          : [],
      ),
    ),
  );
  return [...sourceSelectionKeys].sort().flatMap((selectionKey) => {
    const costs = definition.behaviorModel.clauses.flatMap((clause) =>
      clause.costs
        .filter(
          (cost) =>
            cost.behaviorId === "cost.pay" &&
            cost.parameters.optional === true &&
            cost.parameters.selectionKey === selectionKey,
        )
        .map(optionalPaymentCost),
    );
    return costs.length ? [{ selectionKey, costs }] : [];
  });
}

function optionalPaymentCost(binding: BehaviorBinding): AdditionalCardCost {
  const amount = binding.parameters.amount;
  const resource = binding.parameters.resource;
  if (
    typeof amount !== "number" ||
    amount < 0 ||
    (resource !== "energy" && resource !== "rune")
  ) {
    throw new Error("Optional card payment cost is malformed.");
  }
  return {
    energy: resource === "energy" ? amount : 0,
    power: resource === "rune" ? amount : 0,
    ...(typeof binding.parameters.domain === "string"
      ? { powerDomain: binding.parameters.domain }
      : {}),
  };
}

function optionalPlayCostModes(
  payments: readonly OptionalSourcePlayCost[],
): string[][] {
  return payments.reduce<string[][]>(
    (modes, payment) => [
      ...modes,
      ...modes.map((mode) => [...mode, payment.selectionKey]),
    ],
    [[]],
  );
}

function encodePlayExtra(
  destinationId: string | undefined,
  optionalCostKeys: readonly string[],
) {
  if (optionalCostKeys.length === 0) return destinationId;
  return `play:${JSON.stringify({
    destinationId: destinationId ?? null,
    optionalCostKeys,
  })}`;
}

function decodePlayExtra(extra: string): {
  destinationId: string;
  optionalCostKeys: string[];
} {
  if (!extra.startsWith("play:")) {
    return { destinationId: extra, optionalCostKeys: [] };
  }
  try {
    const parsed: unknown = JSON.parse(extra.slice("play:".length));
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray((parsed as { optionalCostKeys?: unknown }).optionalCostKeys)
    ) {
      throw new Error();
    }
    const destinationId = (parsed as { destinationId?: unknown }).destinationId;
    const optionalCostKeys = (parsed as { optionalCostKeys: unknown[] })
      .optionalCostKeys;
    if (
      (destinationId !== null && typeof destinationId !== "string") ||
      optionalCostKeys.some((key) => typeof key !== "string") ||
      new Set(optionalCostKeys).size !== optionalCostKeys.length
    ) {
      throw new Error();
    }
    return {
      destinationId: destinationId ?? "",
      optionalCostKeys: optionalCostKeys as string[],
    };
  } catch {
    throw new Error("Play mode is malformed.");
  }
}

function encodeHiddenPlayExtra(
  battlefieldId: string,
  optionalCostKeys: readonly string[],
) {
  return `hidden:${JSON.stringify({ battlefieldId, optionalCostKeys })}`;
}

function decodeHiddenPlayExtra(extra: string): {
  battlefieldId: string;
  optionalCostKeys: string[];
} {
  if (!extra.startsWith("hidden:")) {
    throw new Error("Hidden play mode is malformed.");
  }
  try {
    const parsed: unknown = JSON.parse(extra.slice("hidden:".length));
    if (!parsed || typeof parsed !== "object") throw new Error();
    const battlefieldId = (parsed as { battlefieldId?: unknown }).battlefieldId;
    const optionalCostKeys = (
      parsed as { optionalCostKeys?: unknown }
    ).optionalCostKeys;
    if (
      typeof battlefieldId !== "string" ||
      !Array.isArray(optionalCostKeys) ||
      optionalCostKeys.some((key) => typeof key !== "string") ||
      new Set(optionalCostKeys).size !== optionalCostKeys.length
    ) {
      throw new Error();
    }
    return { battlefieldId, optionalCostKeys: optionalCostKeys as string[] };
  } catch {
    throw new Error("Hidden play mode is malformed.");
  }
}

function playActionLabel(input: {
  definition: GameCardDefinition;
  destinationName: string;
  energyCost: number;
  effectivePower: number;
  additionalCosts: readonly AdditionalCardCost[];
  hasOptionalModes: boolean;
}) {
  const base = input.destinationName
    ? `Play ${input.definition.card.name} to ${input.destinationName}`
    : `Play ${input.definition.card.name}`;
  if (!input.hasOptionalModes) return base;
  const costs = [
    `${input.energyCost} Energy`,
    ...(input.effectivePower > 0 ? [`${input.effectivePower} Power`] : []),
    ...input.additionalCosts.flatMap((cost) => [
      ...(cost.energy > 0 ? [`${cost.energy} Energy`] : []),
      ...(cost.power > 0
        ? [
            `${cost.power}${
              cost.powerDomain
                ? ` ${displayPowerDomain(cost.powerDomain)}`
                : ""
            } Power`,
          ]
        : []),
    ]),
  ];
  return `${base} (${costs.join(" + ")})`;
}

function displayPowerDomain(domain: string) {
  return `${domain.slice(0, 1).toUpperCase()}${domain.slice(1).toLowerCase()}`;
}

function addPlayableCardActions(
  actions: ProjectedAction[],
  game: GameDocument,
  playerId: string,
  decks: readonly DeckSnapshotDocument[],
  index: RuntimeCardIndex,
  timing: TurnTiming,
) {
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
    const hasReaction =
      timings.includes("timing.reaction") ||
      hasBehavior(definition, "keyword.quick_draw");
    if (timing === "showdownOpen" && !hasAction && !hasReaction) continue;
    if (
      (timing === "neutralClosed" || timing === "showdownClosed") &&
      !hasReaction
    )
      continue;
    const optionalSourceCosts = optionalSourcePlayCosts(definition);
    const optionalSourceCostKeys = new Set(
      optionalSourceCosts.map((payment) => payment.selectionKey),
    );
    const projectedTargets = playTargetRequirements({
      game,
      definition,
      playerId,
      cardId,
      selectedIds: [],
      handlers,
    });
    const cost = effectiveEnergyCost(game, playerId, definition, index, cardId);
    const effectivePower = effectivePowerCost(
      game,
      playerId,
      definition,
      index,
      cardId,
    );
    const paymentPlan = buildPaymentPlan(
      game,
      playerId,
      definition,
      cost,
      index,
      0,
      cardId,
    );
    // Source-selected resource costs are committed by a play mode, not a
    // target prompt. Other optional selectors (for example, exhaust a unit)
    // stay as their existing player-decision flow.
    const targets = projectedTargets.filter(
      (target) =>
        !(
          target.selectionPurpose === "optionalCost" &&
          target.selectionKey &&
          optionalSourceCostKeys.has(target.selectionKey)
        ),
    );
    const hasLegalTargets = canSatisfyTargetRequirements(targets);
    const targetAdditionalPower = targets
      .flatMap((requirement) => requirement.legalIds)
      .filter((id, position, ids) => ids.indexOf(id) === position)
      .map((targetId) => ({
        targetId,
        amount: targetDeflectCost(
          playerId,
          [targetId],
          index,
          ignoresDeflect(definition),
        ),
      }))
      .filter((entry) => entry.amount > 0);
    // This is projection only: payment remains server-owned. Publishing both
    // printed and evaluated costs lets the client explain modifiers before a
    // player commits a play, including for disabled actions.
    const costPreview = {
      energy: cost,
      basePower: definition.card.attributes.power ?? 0,
      effectivePower,
      printedEnergy: definition.card.attributes.energy ?? 0,
      printedPower: definition.card.attributes.power ?? 0,
      availableAnyPower: paymentPlan
        ? availableAnyPowerAfterBaseCost(game, playerId, paymentPlan)
        : Object.values(player.power).reduce((total, amount) => total + amount, 0),
      targetAdditionalPower,
    };
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
    for (const destination of unitDestinations ?? [{ id: undefined, name: "" }]) {
      for (const optionalCostKeys of optionalPlayCostModes(optionalSourceCosts)) {
        const additionalCosts = optionalSourceCosts
          .filter((payment) => optionalCostKeys.includes(payment.selectionKey))
          .flatMap((payment) => payment.costs);
        const costsPayable = canPayCardCosts(
          game,
          playerId,
          definition,
          cost,
          index,
          0,
          additionalCosts,
          cardId,
        );
        const enabled = costsPayable && hasLegalTargets;
        const disabledReason = !hasLegalTargets
          ? "No legal targets are available."
          : costsPayable
            ? null
            : "Card costs cannot be paid.";
        actions.push(
          action(
            game,
            "play",
            playActionLabel({
              definition,
              destinationName: destination.name,
              energyCost: cost,
              effectivePower,
              additionalCosts,
              hasOptionalModes: optionalSourceCosts.length > 0,
            }),
            cardId,
            enabled,
            disabledReason,
            encodePlayExtra(destination.id, optionalCostKeys),
            targets,
            undefined,
            costPreview,
          ),
        );
      }
    }
  }
  void decks;
}

function addHiddenCardActions(
  actions: ProjectedAction[],
  game: GameDocument,
  playerId: string,
  index: RuntimeCardIndex,
) {
  const player = game.state.players[playerId]!;
  const turn = game.state.turn;
  if (!turn) return;
  const handlers = createPrimitiveHandlers(index);
  const controlledOpenBattlefields = game.state.battlefields.filter(
    (battlefield) =>
      battlefield.controllerPlayerId === playerId &&
      !battlefield.facedownCardInstanceId,
  );

  // Hiding is allowed only during the owner's own Open turn. It is not a Play,
  // so no Chain is created and no Play timing is consulted (811.1.b--811.1.c.3).
  if (!game.state.chain && turn.activePlayerId === playerId) {
    const canPayHide = buildAnyPowerPaymentPlan(game, playerId, index) !== null;
    for (const cardId of [
      ...player.zones.hand,
      ...(player.zones.champion ? [player.zones.champion] : []),
    ]) {
      const definition = definitionForInstance(cardId, index);
      if (!hasBehavior(definition, "keyword.hidden")) continue;
      for (const battlefield of controlledOpenBattlefields) {
        actions.push(
          action(
            game,
            "hide",
            `Hide ${definition.card.name} at ${definitionForInstance(battlefield.cardInstanceId, index).card.name} (1 Any Power)`,
            cardId,
            canPayHide,
            canPayHide ? null : "1 Any Power is required to hide this card.",
            battlefield.battlefieldId,
          ),
        );
      }
    }
  }

  for (const battlefield of game.state.battlefields) {
    const cardId = battlefield.facedownCardInstanceId;
    if (!cardId || battlefield.controllerPlayerId !== playerId) continue;
    const hiddenAtTurnNumber = game.state.cardStates[cardId]?.hiddenAtTurnNumber;
    if (hiddenAtTurnNumber == null || turn.turnNumber <= hiddenAtTurnNumber) continue;
    const definition = definitionForInstance(cardId, index);
    if (!hasBehavior(definition, "keyword.hidden")) continue;
    const optionalSourceCosts = optionalSourcePlayCosts(definition);
    const optionalSourceCostKeys = new Set(
      optionalSourceCosts.map((payment) => payment.selectionKey),
    );
    const projectedTargets = playTargetRequirements({
      game,
      definition,
      playerId,
      cardId,
      selectedIds: [],
      handlers,
      hiddenBattlefieldId: battlefield.battlefieldId,
    });
    const targets = projectedTargets.filter(
      (target) =>
        !(
          target.selectionPurpose === "optionalCost" &&
          target.selectionKey &&
          optionalSourceCostKeys.has(target.selectionKey)
        ),
    );
    const hasLegalTargets = canSatisfyTargetRequirements(targets);
    for (const optionalCostKeys of optionalPlayCostModes(optionalSourceCosts)) {
      const additionalCosts = optionalSourceCosts
        .filter((payment) => optionalCostKeys.includes(payment.selectionKey))
        .flatMap((payment) => payment.costs);
      const costsPayable = canPayCardCosts(
        game,
        playerId,
        definition,
        0,
        index,
        0,
        additionalCosts,
        cardId,
        0,
      );
      const enabled = costsPayable && hasLegalTargets;
      actions.push(
        action(
          game,
          "playHidden",
          hiddenPlayActionLabel({
            definition,
            battlefieldName: definitionForInstance(battlefield.cardInstanceId, index).card.name,
            additionalCosts,
          }),
          cardId,
          enabled,
          !hasLegalTargets
            ? "No legal targets are available at this battlefield."
            : costsPayable
              ? null
              : "Card costs cannot be paid.",
          encodeHiddenPlayExtra(battlefield.battlefieldId, optionalCostKeys),
          targets,
        ),
      );
    }
  }
}

function hiddenPlayActionLabel(input: {
  definition: GameCardDefinition;
  battlefieldName: string;
  additionalCosts: readonly AdditionalCardCost[];
}) {
  const extras = input.additionalCosts.flatMap((cost) => [
    ...(cost.energy > 0 ? [`${cost.energy} Energy`] : []),
    ...(cost.power > 0
      ? [
          `${cost.power}${
            cost.powerDomain ? ` ${displayPowerDomain(cost.powerDomain)}` : ""
          } Power`,
        ]
      : []),
  ]);
  return `Play ${input.definition.card.name} from Hidden at ${input.battlefieldName} (${extras.length ? `Base cost ignored + ${extras.join(" + ")}` : "Base cost ignored"})`;
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
    if (game.state.cardStates[sourceId]?.attachedToCardInstanceId) continue;
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
        const abilityCosts = activationCosts(clause);
        const costsPayable =
          buildAbilityPaymentPlan(
            game,
            playerId,
            definition,
            abilityCosts,
            index,
          ) !== null;
        const alreadyEmpowered =
          ability.behaviorId === "ability.empower" &&
          game.state.cardStates[sourceId]?.empowered === true;
        const enabled =
          sourceReady &&
          !alreadyEmpowered &&
          costsPayable &&
          canSatisfyTargetRequirements(targets);
        const label =
          ability.behaviorId === "ability.recycle_for_power"
            ? `Add Power [${powerDomain}]`
            : ability.behaviorId === "ability.exhaust_for_resource"
              ? ability.parameters.resourceType === "power"
                ? `Add Power [${String(ability.parameters.domain ?? powerDomain)}]`
                : ability.parameters.usage === "spellsOnly" ||
                    ability.parameters.usage === "card:Spell"
                ? "Add spell Energy"
                : "Add Energy"
              : ability.behaviorId === "ability.equip"
                ? "Equip"
              : ability.behaviorId === "ability.empower"
                ? "Empower"
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
                : sourceReady
                ? alreadyEmpowered
                  ? "Source is already Empowered."
                  : costsPayable
                  ? "No legal targets are available."
                  : "Ability costs cannot be paid."
                : "Source is exhausted.",
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
  if (!binding || !clause) throw new Error("Activated ability is unavailable.");
  const handler = handlers.get(binding.behaviorId);
  if (!handler?.execute) {
    throw new Error(`Behavior handler cannot execute: ${binding.behaviorId}`);
  }
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
  const costs = activationCosts(clause);
  if (
    clause.costs.some((cost) => cost.behaviorId === "cost.exhaust_source")
  ) {
    const state = game.state.cardStates[sourceId];
    if (!state || state.exhausted) {
      throw new Error("Ability source is exhausted.");
    }
    state.exhausted = true;
  }
  if (costs.energy > 0 || costs.power > 0) {
    payAbilityCost(game, actorPlayerId, definition, costs, index);
  }
  const item = {
    id: `ability:${game.stateVersion + 1}:${sourceId}:${clauseId}`,
    kind: "activatedAbility" as const,
    label: definition.card.name,
    controllerPlayerId: actorPlayerId,
    sourceCardInstanceId: sourceId,
    targetCardInstanceIds: selectedIds,
    targetObjectVersions: captureTargetObjectVersions(game, selectedIds),
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
  };
  game.state.chain.items.push(item);
  game.state.chain.priorityPlayerId = actorPlayerId;
  game.state.chain.passedPlayerIds = [];
}

function activationCosts(clause: BehaviorClause) {
  return clause.costs.reduce(
    (total, cost) => {
      if (cost.behaviorId !== "cost.pay") return total;
      const amount = cost.parameters.amount;
      const resource = cost.parameters.resource;
      if (typeof amount !== "number" || amount < 0 || typeof resource !== "string") {
        throw new Error("Activated ability payment cost is malformed.");
      }
      if (resource === "energy") total.energy += amount;
      else if (resource === "rune") total.power += amount;
      else throw new Error(`Unsupported activated ability cost resource: ${resource}`);
      return total;
    },
    { energy: 0, power: 0 },
  );
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
  selectionOverrides: Record<string, string[]> = {},
  hiddenBattlefieldId: string | null = null,
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
        selectionOverrides,
        hiddenBattlefieldId,
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
    const requirements = targetRequirementsForClause(
      clause,
      createBehaviorContext(
        game,
        item.controllerPlayerId,
        item.sourceCardInstanceId,
        item.behaviorEvent,
        [],
        {},
        {},
        item.hiddenBattlefieldId ?? null,
      ),
      handlers,
    );
    return requirements.some((requirement) => requirement.maximum > 0);
  });
}

function clauseCanRequirePlaySelections(
  definition: GameCardDefinition,
  clause: ReturnType<typeof compileBehaviorModel>["clauses"][number],
) {
  if (
    clause.triggers.length > 0 ||
    (clause.abilities.length > 0 &&
      !(definition.card.classification.type === "Gear" &&
        clause.keywords.some(
          (binding) => binding.behaviorId === "keyword.quick_draw",
        )))
  ) {
    return false;
  }
  if (definition.card.classification.type !== "Unit") return true;
  return !looksLikeNonPlayUnitText(clause.sourceText);
}

function clauseCanResolveImmediately(
  definition: GameCardDefinition,
  clause: ReturnType<typeof compileBehaviorModel>["clauses"][number],
) {
  if (
    clause.triggers.length > 0 ||
    (clause.abilities.length > 0 &&
      !(definition.card.classification.type === "Gear" &&
        clause.keywords.some(
          (binding) => binding.behaviorId === "keyword.quick_draw",
        )))
  ) {
    return false;
  }
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

function payOptionalNonResourcePlayCosts(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  selectedIds: string[],
  index: RuntimeCardIndex,
) {
  const hasExhaustCost = definition.behaviorModel.clauses.some((clause) =>
    clause.costs.some(
      (cost) => cost.behaviorId === "cost.exhaust_selected_unit",
    ),
  );
  if (hasExhaustCost && selectedIds.length > 0) {
    const selected = selectedIds.find(
      (id) =>
        definitionForInstance(id, index).card.classification.type === "Unit" &&
        !game.state.cardStates[id]?.exhausted,
    );
    if (selected) game.state.cardStates[selected]!.exhausted = true;
  }

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
  const requirements = targetRequirementsForClause(
    clause,
    createBehaviorContext(
      game,
      controllerPlayerId,
      item.sourceCardInstanceId!,
      item.behaviorEvent,
      item.targetCardInstanceIds,
      {},
      item.initialSelectionOverrides ?? {},
      item.hiddenBattlefieldId ?? null,
    ),
    handlers,
  );
  const currentlyLegal = new Set(requirements.flatMap((requirement) => requirement.legalIds));
  const chainItemTargets = new Set(
    requirements
      .filter((requirement) => requirement.kind === "chainItem")
      .flatMap((requirement) => requirement.legalIds),
  );
  return item.targetCardInstanceIds.filter(
    (id) =>
      currentlyLegal.has(id) &&
      (chainItemTargets.has(id) ||
        (game.state.cardStates[id]?.objectVersion ?? 0) ===
          item.targetObjectVersions[id]),
  );
}

function ignoresDeflect(definition: GameCardDefinition) {
  return definition.behaviorModel.clauses.some((clause) =>
    clause.effects.some(
      (binding) => binding.behaviorId === "modifier.ignore_deflect",
    ),
  );
}

function validateActionTargets(action: ProjectedAction, selectedIds: string[]) {
  validateTargetRequirements(action.targets, selectedIds);
}

function validateTargetRequirements(
  targets: readonly ProjectedAction["targets"][number][],
  selectedIds: string[],
) {
  if (targets.length === 0) {
    if (selectedIds.length)
      throw new Error("This action does not accept selected targets.");
    return;
  }
  const legal = new Set(targets.flatMap((target) => target.legalIds));
  const minimum = targets.reduce(
    (sum, target) => sum + target.minimum,
    0,
  );
  const maximum = targets.reduce(
    (sum, target) => sum + target.maximum,
    0,
  );
  if (
    selectedIds.length < minimum ||
    selectedIds.length > maximum ||
    selectedIds.some((id) => !legal.has(id)) ||
    new Set(selectedIds).size !== selectedIds.length ||
    targets.some((target) => {
      const selectedForTarget = selectedIds.filter((id) =>
        target.legalIds.includes(id),
      ).length;
      return (
        selectedForTarget < target.minimum || selectedForTarget > target.maximum
      );
    })
  ) {
    throw new Error("Selected targets are not legal for this action.");
  }
}
function otherPlayer(game: GameDocument, playerId: string) {
  return game.state.setup.playerIds.find((id) => id !== playerId)!;
}
