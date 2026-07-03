import type { ProjectedAction } from "../../shared/game";
import {
  compileBehaviorModel,
  createBehaviorContext,
  executeBehaviorClause,
  executeBehaviorEffects,
  submitTriggerOrder,
  targetRequirementsForClause,
} from "./behavior-runtime";
import {
  cleanupTurnModifiers,
  createPrimitiveHandlers,
  createRuntimeCardIndex,
  definitionForInstance,
  effectiveEnergyCost,
  type RuntimeCardIndex,
} from "./primitive-handlers";
import {
  applyHoldScoring,
  cleanupBoard,
  markBattlefieldContested,
  openNonCombatShowdown,
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
  queueDelayedEffects,
} from "./triggers";
import type { DeckSnapshotDocument } from "./repositories";
import type { GameCardDefinition } from "./schemas";
import type { GameDocument } from "./state";
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

// Non-standard rules override. Disable to require normal Action/Reaction timing.
const ALLOW_ADD_ABILITIES_WHEN_PLAYER_HAS_PRIORITY = true;

export function gameplayActions(
  game: GameDocument,
  actorPlayerId: string,
  decks: readonly DeckSnapshotDocument[],
): ProjectedAction[] {
  if (game.status !== "in_progress") return [];
  const index = createRuntimeCardIndex(decks);
  const handlers = createPrimitiveHandlers(index);
  const player = game.state.players[actorPlayerId];
  if (!player) return [];
  const actions: ProjectedAction[] = [];
  if (game.state.pendingChoice) {
    const pendingChoice = game.state.pendingChoice;
    if (pendingChoice.playerId !== actorPlayerId) return [];
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
    if (pendingChoice.type === "readyCards") {
      actions.push(
        action(
          game,
          "readyCards",
          `Choose ${pendingChoice.maximum} runes to ready`,
          null,
          true,
          null,
          undefined,
          [
            {
              kind: "card",
              label: "runes to ready",
              legalIds: pendingChoice.legalCardIds,
              minimum: pendingChoice.minimum,
              maximum: pendingChoice.maximum,
            },
          ],
        ),
      );
      return actions;
    }
    for (const order of permutations(pendingChoice.optionIds)) {
      const labels = order.map(
        (id) =>
          pendingChoice.pendingItems.find((item) => item.id === id)?.label ??
          id,
      );
      actions.push(
        action(
          game,
          "orderTriggers",
          `Resolve ${labels.join(" → ")}`,
          null,
          true,
          null,
          JSON.stringify(order),
        ),
      );
    }
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
    if (readyBaseUnits.length < 1) continue;
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
            legalIds: readyBaseUnits,
            minimum: 1,
            maximum: readyBaseUnits.length,
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
      playerIds,
    });
    const rightOrder = battlefieldOwnerOrder({
      actorPlayerId,
      battlefield: right,
      fallbackPlayerOrder,
      playerIds,
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
  playerIds,
}: {
  actorPlayerId: string;
  battlefield: GameDocument["state"]["battlefields"][number];
  fallbackPlayerOrder: string[];
  playerIds: readonly string[];
}) {
  const ownerPlayerId = playerIds.find(
    (playerId) =>
      valueBelongsToPlayer(battlefield.battlefieldId, playerId) ||
      valueBelongsToPlayer(battlefield.cardInstanceId, playerId),
  );

  if (!ownerPlayerId) {
    return Number.MAX_SAFE_INTEGER;
  }

  if (ownerPlayerId === actorPlayerId) {
    return 0;
  }

  const fallbackIndex = fallbackPlayerOrder.indexOf(ownerPlayerId);

  return fallbackIndex >= 0 ? fallbackIndex + 1 : Number.MAX_SAFE_INTEGER;
}

function valueBelongsToPlayer(value: string, playerId: string) {
  return (
    value === playerId ||
    value.startsWith(`${playerId}:`) ||
    value.startsWith(`${playerId}-`)
  );
}

export function performGameplayAction(input: {
  game: GameDocument;
  actorPlayerId: string;
  actionId: string;
  selectedIds: string[];
  allocations?: DamageAssignment[];
  decks: readonly DeckSnapshotDocument[];
  now: string;
}): GameDocument {
  const legal = gameplayActions(input.game, input.actorPlayerId, input.decks);
  const projected = legal.find((candidate) => candidate.id === input.actionId);
  if (!projected || !projected.enabled)
    throw new Error("Action is not legal for the current game state.");
  validateActionTargets(projected, input.selectedIds);
  const game = structuredClone(input.game);
  const index = createRuntimeCardIndex(input.decks);
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
    case "orderTriggers":
      submitTriggerOrder(
        game,
        input.actorPlayerId,
        JSON.parse(extra) as string[],
      );
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
        cleanupBoard(game, index);
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
    case "readyCards":
      submitReadyCards(
        game,
        input.actorPlayerId,
        input.selectedIds,
        index,
        handlers,
        input.decks,
      );
      break;
    case "pass":
      passPriority(game, input.actorPlayerId, index, handlers, input.decks);
      break;
    case "endTurn":
      endTurn(game, input.actorPlayerId, index, input.decks);
      break;
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

function playCard(
  game: GameDocument,
  playerId: string,
  cardId: string,
  destinationId: string,
  selectedIds: string[],
  index: RuntimeCardIndex,
  handlers: ReturnType<typeof createPrimitiveHandlers>,
  decks: readonly DeckSnapshotDocument[],
) {
  const player = game.state.players[playerId]!;
  const definition = definitionForInstance(cardId, index);
  const isUnit = definition.card.classification.type === "Unit";
  const destinationBattlefield = isUnit && destinationId !== "base"
    ? game.state.battlefields.find(
        (battlefield) =>
          battlefield.battlefieldId === destinationId &&
          battlefield.controllerPlayerId === playerId,
      )
    : null;
  if (
    isUnit &&
    destinationId !== "base" &&
    !destinationBattlefield
  ) {
    throw new Error("Unit play destination is not controlled by the player.");
  }
  const energyCost = effectiveEnergyCost(game, playerId, definition);
  pay(game, playerId, definition, energyCost, index);
  if (game.state.showdown) game.state.showdown.passedPlayerIds = [];
  player.zones.hand = player.zones.hand.filter((id) => id !== cardId);
  if (player.zones.champion === cardId) player.zones.champion = null;
  if (isUnit) {
    if (destinationBattlefield) destinationBattlefield.units.push(cardId);
    else player.zones.base.push(cardId);
    game.state.cardStates[cardId]!.exhausted = true;
    executeImmediateClauses(
      game,
      definition,
      playerId,
      cardId,
      selectedIds,
      handlers,
    );
    dispatchBehaviorEvent(
      game,
      {
        type: "card.played",
        actorPlayerId: playerId,
        subjectCardInstanceId: cardId,
        values: { "eventSubject.effectiveEnergyCost": energyCost },
      },
      decks,
    );
    cleanupBoard(game, index);
    if (game.state.showdown) {
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
    behaviorClauseId: null,
    activatedBehaviorId: null,
    behaviorEvent: null,
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
          const clause = definition.behaviorModel.clauses.find(
            (candidate) => candidate.id === item.behaviorClauseId,
          );
          const binding = clause?.abilities.find(
            (candidate) => candidate.behaviorId === item.activatedBehaviorId,
          );
          const handler = binding ? handlers.get(binding.behaviorId) : null;
          if (!binding || !handler?.execute) {
            throw new Error(
              "Activated ability is unavailable during resolution.",
            );
          }
          handler.execute(
            binding,
            createBehaviorContext(
              game,
              controller,
              item.sourceCardInstanceId,
              null,
              item.targetCardInstanceIds,
            ),
          );
        } else if (item.behaviorClauseId) {
          const compiled = compileBehaviorModel(
            definition.behaviorModel,
            handlers,
          );
          const clause = compiled.clauses.find(
            (candidate) => candidate.id === item.behaviorClauseId,
          );
          if (clause)
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
          executeImmediateClauses(
            game,
            definition,
            controller,
            item.sourceCardInstanceId,
            item.targetCardInstanceIds,
            handlers,
          );
          if (definition.card.classification.type === "Spell") {
            game.state.players[owner]!.zones.trash.push(
              item.sourceCardInstanceId,
            );
            dispatchBehaviorEvent(
              game,
              {
                type: "card.played",
                actorPlayerId: controller,
                subjectCardInstanceId: item.sourceCardInstanceId,
                values: {
                  "eventSubject.effectiveEnergyCost": effectiveEnergyCost(
                    game,
                    controller,
                    definition,
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
        game.state.chain = null;
        if (game.state.showdown) {
          game.state.showdown.focusPlayerId = nextRelevantPlayer(
            game,
            game.state.showdown.focusPlayerId,
            game.state.showdown.relevantPlayerIds,
          );
          game.state.showdown.passedPlayerIds = [];
        }
      }
      cleanupBoard(game, index);
      finishEndTurnIfReady(game, index, decks);
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
  if (!queueDelayedEffects(game, "endOfThisTurn", decks, actor)) {
    completeEndTurn(game, actor, index, decks);
  }
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
  cleanupTurnModifiers(game, index);
  game.state.turn = {
    turnNumber: turn.turnNumber + 1,
    activePlayerId: next,
    phase: "action",
  };
  applyStartOfTurn(game, decks, index);
}

function submitReadyCards(
  game: GameDocument,
  actor: string,
  selectedIds: string[],
  index: RuntimeCardIndex,
  handlers: ReturnType<typeof createPrimitiveHandlers>,
  decks: readonly DeckSnapshotDocument[],
) {
  const pending = game.state.pendingChoice;
  if (!pending || pending.type !== "readyCards" || pending.playerId !== actor) {
    throw new Error("Ready cards choice is not available.");
  }
  const effect = game.state.delayedEffects.find(
    (candidate) => candidate.id === pending.delayedEffectId,
  );
  if (!effect) throw new Error("Delayed ready effect is unavailable.");
  const definition = definitionForInstance(effect.sourceCardInstanceId, index);
  const clause = compileBehaviorModel(
    definition.behaviorModel,
    handlers,
  ).clauses.find((candidate) => candidate.id === effect.clauseId);
  if (!clause)
    throw new Error(
      `Delayed behavior clause is unavailable: ${effect.clauseId}`,
    );

  game.state.pendingChoice = null;
  executeBehaviorEffects(
    clause,
    createBehaviorContext(
      game,
      effect.controllerPlayerId,
      effect.sourceCardInstanceId,
      null,
      selectedIds,
    ),
    handlers,
  );
  game.state.delayedEffects = game.state.delayedEffects.filter(
    (candidate) => candidate.id !== effect.id,
  );
  finishEndTurnIfReady(game, index, decks);
}

function finishEndTurnIfReady(
  game: GameDocument,
  index: RuntimeCardIndex,
  decks: readonly DeckSnapshotDocument[],
) {
  const turn = game.state.turn;
  if (turn?.phase === "end" && !game.state.chain && !game.state.pendingChoice) {
    completeEndTurn(game, turn.activePlayerId, index, decks);
  }
}

export function applyStartOfTurn(
  game: GameDocument,
  decks: readonly DeckSnapshotDocument[] = [],
  runtimeIndex?: RuntimeCardIndex,
) {
  const turn = game.state.turn;
  if (!turn)
    throw new Error("A turn is required to apply start-of-turn steps.");
  for (const candidate of Object.values(game.state.players)) {
    candidate.energy = 0;
    candidate.power = {};
    candidate.conditionalEnergy = 0;
  }
  for (const state of Object.values(game.state.cardStates)) state.damage = 0;
  const player = game.state.players[turn.activePlayerId]!;
  player.scoredBattlefieldIdsThisTurn = [];
  if (decks.length) applyHoldScoring(game, turn.activePlayerId, decks);
  const index =
    runtimeIndex ?? (decks.length ? createRuntimeCardIndex(decks) : null);
  const controlledBattlefieldUnits = game.state.battlefields
    .flatMap((battlefield) => battlefield.units)
    .filter(
      (cardId) =>
        index?.instances.get(cardId)?.ownerPlayerId === turn.activePlayerId,
    );
  for (const cardId of [...player.zones.base, ...controlledBattlefieldUnits]) {
    if (game.state.cardStates[cardId])
      game.state.cardStates[cardId]!.exhausted = false;
  }
  const isNonStartingPlayersFirstTurn =
    turn.turnNumber === 2 &&
    turn.activePlayerId !== game.state.setup.startingPlayerId;
  draw(
    player.zones.runeDeck,
    player.zones.base,
    isNonStartingPlayersFirstTurn ? 3 : 2,
  );
  draw(player.zones.mainDeck, player.zones.hand, 1);
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
    kind === "orderTriggers"
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
    choice,
    presentation: {
      surface,
      style: kind === "endTurn" || kind === "pass" ? "secondary" : "primary",
      prompt:
        kind === "orderTriggers"
          ? "Choose the order for triggered abilities."
          : null,
    },
  };
}
type PaymentPlan = {
  conditionalEnergy: number;
  pooledEnergy: number;
  energySourceIds: string[];
  generatedConditionalEnergy: number;
  generatedPooledEnergy: number;
  powerFromPool: Record<string, number>;
  powerRuneIds: string[];
};

function buildPaymentPlan(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  energyCost: number,
  index: RuntimeCardIndex,
): PaymentPlan | null {
  const player = game.state.players[playerId]!;
  let remainingEnergy = energyCost;
  const conditionalEnergy =
    definition.card.classification.type === "Spell"
      ? Math.min(player.conditionalEnergy, remainingEnergy)
      : 0;
  remainingEnergy -= conditionalEnergy;
  const pooledEnergy = Math.min(player.energy, remainingEnergy);
  remainingEnergy -= pooledEnergy;
  let remainingPower = definition.card.attributes.power ?? 0;
  const allowedDomains = definition.card.classification.domain.filter(
    (domain) => domain !== "Colorless",
  );
  if (remainingPower > 0 && allowedDomains.length === 0) return null;
  const powerFromPool: Record<string, number> = {};
  for (const domain of [...allowedDomains, "Rainbow"]) {
    const spend = Math.min(player.power[domain] ?? 0, remainingPower);
    if (spend > 0) powerFromPool[domain] = spend;
    remainingPower -= spend;
  }
  const powerRuneIds: string[] = [];
  for (const id of player.zones.base) {
    if (remainingPower === 0) break;
    if (!hasAbility(id, "ability.recycle_for_power", index)) continue;
    const runeDomain = definitionForInstance(id, index).card.classification
      .domain[0];
    if (!runeDomain || !allowedDomains.includes(runeDomain)) continue;
    powerRuneIds.push(id);
    remainingPower -= 1;
  }
  if (remainingPower > 0) return null;

  const energySourceIds: string[] = [];
  let generatedConditionalEnergy = 0;
  let generatedPooledEnergy = 0;
  const consumeEnergySource = (id: string) => {
    if (
      remainingEnergy === 0 ||
      energySourceIds.includes(id) ||
      game.state.cardStates[id]?.exhausted
    ) {
      return;
    }
    const ability = exhaustForEnergyAbility(
      id,
      definition.card.classification.type,
      index,
    );
    if (!ability) return;
    energySourceIds.push(id);
    const unusedEnergy = Math.max(0, ability.amount - remainingEnergy);
    remainingEnergy = Math.max(0, remainingEnergy - ability.amount);
    if (ability.usage === "spellsOnly")
      generatedConditionalEnergy += unusedEnergy;
    else generatedPooledEnergy += unusedEnergy;
  };
  for (const id of player.zones.base) {
    const ability = exhaustForEnergyAbility(
      id,
      definition.card.classification.type,
      index,
    );
    if (ability?.usage === "spellsOnly") consumeEnergySource(id);
  }
  powerRuneIds.forEach(consumeEnergySource);
  player.zones.base.forEach(consumeEnergySource);
  if (remainingEnergy > 0) return null;

  return remainingPower === 0
    ? {
        conditionalEnergy,
        pooledEnergy,
        energySourceIds,
        generatedConditionalEnergy,
        generatedPooledEnergy,
        powerFromPool,
        powerRuneIds,
      }
    : null;
}

function pay(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  energyCost: number,
  index: RuntimeCardIndex,
) {
  const plan = buildPaymentPlan(
    game,
    playerId,
    definition,
    energyCost,
    index,
  );
  if (!plan) throw new Error("Card costs cannot be paid.");
  const player = game.state.players[playerId]!;
  player.conditionalEnergy -= plan.conditionalEnergy;
  player.energy -= plan.pooledEnergy;
  player.conditionalEnergy += plan.generatedConditionalEnergy;
  player.energy += plan.generatedPooledEnergy;
  plan.energySourceIds.forEach((id) => {
    game.state.cardStates[id]!.exhausted = true;
  });
  for (const [domain, amount] of Object.entries(plan.powerFromPool))
    player.power[domain] = (player.power[domain] ?? 0) - amount;
  for (const id of plan.powerRuneIds) {
    player.zones.base = player.zones.base.filter(
      (candidate) => candidate !== id,
    );
    player.zones.runeDeck.push(id);
    const state = game.state.cardStates[id];
    if (state) {
      state.damage = 0;
      state.exhausted = false;
    }
  }
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
    battlefield.units.push(cardId);
    game.state.cardStates[cardId]!.exhausted = true;
  }
  markBattlefieldContested(game, battlefieldId, actorPlayerId);
  cleanupBoard(game, index);
  const controllers = unitControllers(game, battlefield.units, index);
  if (controllers.length === 2) {
    startCombat(game, battlefieldId, actorPlayerId, index, decks);
  } else if (battlefield.controllerPlayerId !== actorPlayerId) {
    openNonCombatShowdown(game, battlefieldId, actorPlayerId);
  } else {
    battlefield.contestedByPlayerId = null;
  }
}

function hasAbility(id: string, behaviorId: string, index: RuntimeCardIndex) {
  return definitionForInstance(id, index).behaviorModel.clauses.some((clause) =>
    clause.abilities.some((ability) => ability.behaviorId === behaviorId),
  );
}

function exhaustForEnergyAbility(
  id: string,
  cardType: string,
  index: RuntimeCardIndex,
): { amount: number; usage: string } | null {
  for (const clause of definitionForInstance(id, index).behaviorModel.clauses) {
    for (const ability of clause.abilities) {
      if (
        ability.behaviorId !== "ability.exhaust_for_resource" ||
        ability.parameters.resourceType !== "energy"
      ) {
        continue;
      }
      const amount = ability.parameters.amount;
      const usage = ability.parameters.usage;
      if (
        typeof amount !== "number" ||
        amount <= 0 ||
        typeof usage !== "string" ||
        (usage === "spellsOnly" && cardType !== "Spell")
      ) {
        continue;
      }
      return { amount, usage };
    }
  }
  return null;
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
    if (!["Unit", "Spell"].includes(definition.card.classification.type))
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
    const targets = compiled.clauses
      .filter((clause) => clause.triggers.length === 0)
      .flatMap((clause) =>
        targetRequirementsForClause(clause, context, handlers),
      );
    const cost = effectiveEnergyCost(game, playerId, definition);
    const paymentPlan = buildPaymentPlan(
      game,
      playerId,
      definition,
      cost,
      index,
    );
    const hasLegalTargets = canSatisfyTargetRequirements(targets);
    const enabled = paymentPlan !== null && hasLegalTargets;
    const disabledReason = !hasLegalTargets
      ? "No legal targets are available."
      : paymentPlan
        ? null
        : "Card costs cannot be paid.";
    const unitDestinations =
      definition.card.classification.type === "Unit"
        ? [
            { id: "base", name: "Base" },
            ...game.state.battlefields
              .filter(
                (battlefield) =>
                  battlefield.controllerPlayerId === playerId,
              )
              .map((battlefield) => ({
                id: battlefield.battlefieldId,
                name: definitionForInstance(
                  battlefield.cardInstanceId,
                  index,
                ).card.name,
              })),
          ]
        : null;
    for (const destination of unitDestinations ?? [{ id: undefined, name: "" }]) {
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
        ),
      );
    }
  }
  void decks;
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
        const enabled =
          ability.behaviorId === "ability.recycle_for_power" ||
          !game.state.cardStates[sourceId]!.exhausted;
        const label =
          ability.behaviorId === "ability.recycle_for_power"
            ? `Add Power [${powerDomain}]`
            : ability.parameters.usage === "spellsOnly"
              ? "Add spell Energy"
              : "Add Energy";
        actions.push(
          action(
            game,
            "activate",
            label,
            sourceId,
            enabled,
            enabled ? null : "Source is exhausted.",
            `${clause.id}|${ability.behaviorId}`,
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
  ability: ReturnType<typeof compileBehaviorModel>["clauses"][number]["abilities"][number],
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
    allowPriorityAddOverride:
      ALLOW_ADD_ABILITIES_WHEN_PLAYER_HAS_PRIORITY,
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
      input.hasActionTiming ||
      input.hasReactionTiming ||
      hasPriorityAddOverride
    );
  }
  if (
    input.timing === "neutralClosed" ||
    input.timing === "showdownClosed"
  ) {
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
  if (!binding) throw new Error("Activated ability is unavailable.");
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
  const item = {
    id: `ability:${game.stateVersion + 1}:${sourceId}:${clauseId}`,
    kind: "activatedAbility" as const,
    label: definition.card.name,
    controllerPlayerId: actorPlayerId,
    sourceCardInstanceId: sourceId,
    targetCardInstanceIds: selectedIds,
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
) {
  const compiled = compileBehaviorModel(definition.behaviorModel, handlers);
  for (const clause of compiled.clauses.filter(
    (item) => item.triggers.length === 0 && item.abilities.length === 0,
  )) {
    const clauseSelections = clause.selectors.length ? selectedIds : [];
    executeBehaviorClause({
      clause,
      context: createBehaviorContext(
        game,
        controllerId,
        sourceId,
        null,
        clauseSelections,
      ),
      handlers,
    });
  }
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
  if (
    selectedIds.length < minimum ||
    selectedIds.length > maximum ||
    selectedIds.some((id) => !legal.has(id)) ||
    new Set(selectedIds).size !== selectedIds.length
  ) {
    throw new Error("Selected targets are not legal for this action.");
  }
}
function draw(source: string[], destination: string[], count: number) {
  destination.push(...source.splice(0, Math.min(count, source.length)));
}
function otherPlayer(game: GameDocument, playerId: string) {
  return game.state.setup.playerIds.find((id) => id !== playerId)!;
}

function permutations(values: string[]): string[][] {
  if (values.length <= 1) return [[...values]];
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)]).map(
      (rest) => [value, ...rest],
    ),
  );
}
