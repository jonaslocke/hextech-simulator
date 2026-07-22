import {
  allocateSelections,
  applyChoiceSelections,
  compileBehaviorModel,
  collectTriggeredClauses,
  createBehaviorContext,
  selectionRequirementsForClause,
  type BehaviorEvent
} from "./behavior-runtime";
import {
  createPrimitiveHandlers,
  createRuntimeCardIndex,
  definitionForInstance
} from "./primitive-handlers";
import { recordTurnEvent } from "./condition-evaluation";
import type { DeckSnapshotDocument } from "./repositories";
import type { ChainItem, GameDocument } from "./state";
import { beginEffectResolution } from "./effect-resolution";

export function dispatchBehaviorEvent(
  game: GameDocument,
  event: BehaviorEvent,
  decks: readonly DeckSnapshotDocument[]
): void {
  const index = createRuntimeCardIndex(decks, game);
  recordTurnEvent(
    game,
    event,
    event.subjectCardInstanceId
      ? index.instances.get(event.subjectCardInstanceId)?.ownerPlayerId ?? null
      : null,
  );
  for (const { items } of collectBehaviorEventItems(
    game,
    [event],
    decks,
  )) {
    queueChainItemsForTargets(game, items, decks);
  }
}

export function dispatchSimultaneousBehaviorEvents(
  game: GameDocument,
  events: readonly BehaviorEvent[],
  decks: readonly DeckSnapshotDocument[],
): void {
  const index = createRuntimeCardIndex(decks, game);
  for (const event of events) {
    recordTurnEvent(
      game,
      event,
      event.subjectCardInstanceId
        ? index.instances.get(event.subjectCardInstanceId)?.ownerPlayerId ?? null
        : null,
    );
  }
  for (const { items } of collectBehaviorEventItems(game, events, decks)) {
    queueChainItemsForTargets(game, items, decks);
  }
}

function collectBehaviorEventItems(
  game: GameDocument,
  events: readonly BehaviorEvent[],
  decks: readonly DeckSnapshotDocument[],
) {
  const index = createRuntimeCardIndex(decks, game);
  const handlers = createPrimitiveHandlers(index);
  const byController = new Map<string, ChainItem[]>();
  for (const controllerPlayerId of game.state.setup.playerIds) {
    const sources = activeSourceIds(
      game,
      controllerPlayerId,
      index,
      events,
    ).map((sourceCardInstanceId) => ({
      sourceCardInstanceId,
      label: definitionForInstance(sourceCardInstanceId, index).card.name,
      model: compileBehaviorModel(
        definitionForInstance(sourceCardInstanceId, index).behaviorModel,
        handlers,
      ),
    }));
    for (const event of events) {
      const items = collectTriggeredClauses({
        game,
        controllerPlayerId,
        sources,
        event,
        handlers,
      });
      if (items.length > 0) {
        const existing = byController.get(controllerPlayerId) ?? [];
        const uniqueItems = items.filter((item) => {
          const clause = sources
            .find(
              (source) =>
                source.sourceCardInstanceId === item.sourceCardInstanceId,
            )
            ?.model.clauses.find(
              (candidate) => candidate.id === item.behaviorClauseId,
            );
          const dedupeForBattlefieldDefend = clause?.triggers.some(
            (trigger) =>
              trigger.behaviorId === "trigger.defend_at_source_battlefield",
          );
          return (
            !dedupeForBattlefieldDefend ||
            !existing.some(
              (candidate) =>
                candidate.sourceCardInstanceId === item.sourceCardInstanceId &&
                candidate.behaviorClauseId === item.behaviorClauseId,
            )
          );
        });
        byController.set(controllerPlayerId, [
          ...existing,
          ...uniqueItems,
        ]);
      }
    }
  }
  return [...byController.entries()].map(([controllerPlayerId, items]) => ({
    controllerPlayerId,
    items,
  }));
}

export function queueChainItemsForTargets(
  game: GameDocument,
  items: ChainItem[],
  decks: readonly DeckSnapshotDocument[],
  options: { preserveOrder?: boolean } = {},
): void {
  const parentResumeFocusPlayerId = game.state.chain?.resumeFocusPlayerId ?? null;
  const queuedItems = items.map((item) =>
    item.resumeFocusPlayerId || !parentResumeFocusPlayerId
      ? item
      : { ...item, resumeFocusPlayerId: parentResumeFocusPlayerId },
  );
  if (!options.preserveOrder && queuedItems.length > 1) {
    const controllerPlayerId = queuedItems[0]?.controllerPlayerId;
    if (controllerPlayerId) {
      game.state.queuedTriggerChoices.push({
        id: `choice:${queuedItems[0]!.id}:order`,
        playerId: controllerPlayerId,
        type: "orderTriggers",
        optionIds: queuedItems.map((item) => item.id),
        pendingItems: queuedItems,
      });
    }
  }
  game.state.queuedChainItems = [
    ...(game.state.queuedChainItems ?? []),
    ...queuedItems,
  ];
  continueQueuedChainItems(game, decks);
}

export function submitChainTargetSelection(
  game: GameDocument,
  playerId: string,
  selectedIds: string[],
  decks: readonly DeckSnapshotDocument[],
): void {
  const pending = game.state.pendingChoice;
  if (
    !pending ||
    pending.type !== "effectSelection" ||
    !pending.chainItem ||
    pending.playerId !== playerId
  ) {
    throw new Error("Chain target selection is not available.");
  }
  const requirements = pending.targetRequirements ?? [];
  const legal = new Set(requirements.flatMap((target) => target.legalIds));
  const minimum = requirements.reduce(
    (sum, target) => sum + target.minimum,
    0,
  );
  const maximum = requirements.reduce(
    (sum, target) => sum + target.maximum,
    0,
  );
  const isDecliningFinalizationChoice =
    pending.allowDecline === true &&
    Boolean(pending.optionalChoiceBindingKey) &&
    selectedIds.length === 0;
  if (
    !isDecliningFinalizationChoice &&
    (selectedIds.length < minimum ||
      selectedIds.length > maximum ||
      selectedIds.some((id) => !legal.has(id)) ||
      new Set(selectedIds).size !== selectedIds.length ||
      requirements.some((target) => {
        const selectedForTarget = selectedIds.filter((id) =>
          target.legalIds.includes(id),
        ).length;
        return (
          selectedForTarget < target.minimum ||
          selectedForTarget > target.maximum
        );
      }))
  ) {
    throw new Error("Selected chain targets are not legal.");
  }
  const item = pending.chainItem;
  if (isDecliningFinalizationChoice) {
    game.state.pendingChoice = null;
    removeQueuedTriggerItem(game, item.id);
    continueQueuedChainItems(game, decks);
    return;
  }
  if (pending.optionalChoiceBindingKey) {
    item.lockedSelectionsByBinding[pending.optionalChoiceBindingKey] = [
      "accept",
    ];
  }
  item.targetCardInstanceIds = [...selectedIds];
  item.targetObjectVersions = Object.fromEntries(
    selectedIds.map((id) => [
      id,
      game.state.cardStates[id]?.objectVersion ?? 0,
    ]),
  );
  lockChainSelectorSelections(game, item, selectedIds, decks);
  if (item.kind === "spell") {
    (game.state.queuedBehaviorEvents ??= []).push(
      ...selectedIds.map((id) => ({
        type: "card.chosen",
        actorPlayerId: playerId,
        subjectCardInstanceId: id,
        values: {
          method: "spell",
          targetBattlefieldId:
            game.state.battlefields.find((battlefield) =>
              battlefield.units.includes(id),
            )?.battlefieldId ?? "base",
        },
      })),
    );
  }
  const queuedForOrdering = updateQueuedTriggerItem(game, item);
  game.state.pendingChoice = null;
  if (!queuedForOrdering) appendChainItem(game, item);
  continueQueuedChainItems(game, decks);
}

export function submitChainOptionalChoice(
  game: GameDocument,
  playerId: string,
  selectedIds: string[],
  decks: readonly DeckSnapshotDocument[],
): void {
  const pending = game.state.pendingChoice;
  if (
    !pending ||
    pending.type !== "binary" ||
    !pending.chainItem ||
    pending.resolutionId !== null ||
    pending.playerId !== playerId ||
    selectedIds.length !== 1 ||
    !["accept", "decline"].includes(selectedIds[0]!)
  ) {
    throw new Error("Chain optional choice is not available.");
  }
  const item = pending.chainItem;
  game.state.pendingChoice = null;
  if (selectedIds[0] === "decline") {
    removeQueuedTriggerItem(game, item.id);
    continueQueuedChainItems(game, decks);
    return;
  }
  item.lockedSelectionsByBinding[pending.bindingKey] = ["accept"];
  game.state.queuedChainItems = [
    item,
    ...(game.state.queuedChainItems ?? []),
  ];
  continueQueuedChainItems(game, decks);
}

function continueQueuedChainItems(
  game: GameDocument,
  decks: readonly DeckSnapshotDocument[],
) {
  if (game.state.pendingChoice) return;
  const index = createRuntimeCardIndex(decks, game);
  const handlers = createPrimitiveHandlers(index);
  while ((game.state.queuedChainItems?.length ?? 0) > 0) {
    const item = game.state.queuedChainItems!.shift()!;
    const waitingForOrder = isQueuedForOrdering(game, item.id);
    if (!item.sourceCardInstanceId || !item.behaviorClauseId) {
      if (!waitingForOrder) appendChainItem(game, item);
      continue;
    }
    const definition = definitionForInstance(
      item.sourceCardInstanceId,
      index,
    );
    const clause = compileBehaviorModel(
      definition.behaviorModel,
      handlers,
    ).clauses.find((candidate) => candidate.id === item.behaviorClauseId);
    const context = createBehaviorContext(
      game,
      item.controllerPlayerId,
      item.sourceCardInstanceId,
      item.behaviorEvent,
      [],
    );
    if (clause) {
      applyChoiceSelections(clause, item.lockedSelectionsByBinding, context);
    }
    const finalizationChoice = clause?.choices.find((choice) =>
      choice.behaviorId === "choice.optional" &&
      choice.parameters.decisionTiming === "triggerFinalization" &&
      !Object.hasOwn(
        item.lockedSelectionsByBinding,
        `${clause.id}:choices:${choice.order}`,
      ),
    );
    if (clause && finalizationChoice) {
      const selectionKey = finalizationChoice.parameters.selectionKey;
      if (typeof selectionKey !== "string") {
        throw new Error("Trigger-finalization choice selection key is missing.");
      }
      const choiceBindingKey = `${clause.id}:choices:${finalizationChoice.order}`;
      const acceptedContext = {
        ...context,
        selectedBySelector: {
          ...context.selectedBySelector,
          [selectionKey]: ["accept"],
        },
      };
      const choiceTargets = selectionRequirementsForClause(
        clause,
        acceptedContext,
        handlers,
      ).filter(({ binding }) => binding.parameters.deferred !== true);
      if (
        choiceTargets.some(
          ({ requirement }) =>
            new Set(requirement.legalIds).size < requirement.minimum,
        )
      ) {
        removeQueuedTriggerItem(game, item.id);
        continue;
      }
      if (choiceTargets.length > 0) {
        const requirements = choiceTargets.map(({ requirement }) => requirement);
        game.state.pendingChoice = chainTargetChoice(
          game,
          item,
          requirements,
          choiceBindingKey,
        );
        return;
      }
      const requirement = handlers
        .get(finalizationChoice.behaviorId)
        ?.choice?.(finalizationChoice, context);
      if (!requirement || requirement.kind !== "binary") {
        throw new Error("Trigger-finalization optional choice is unavailable.");
      }
      game.state.pendingChoice = {
        id: `choice:${game.stateVersion}:${item.id}:optional`,
        playerId: item.controllerPlayerId,
        type: "binary",
        resolutionId: null,
        bindingKey: choiceBindingKey,
        prompt: requirement.prompt,
        acceptLabel: requirement.acceptLabel ?? "Accept",
        declineLabel: requirement.declineLabel ?? "Decline",
        chainItem: item,
      };
      return;
    }
    const requirements = clause
      ? selectionRequirementsForClause(clause, context, handlers)
          .filter(({ binding }) => binding.parameters.deferred !== true)
          .map(({ requirement }) => requirement)
      : [];
    if (
      requirements.length === 0 ||
      requirements.some(
        (requirement) =>
          new Set(requirement.legalIds).size < requirement.minimum,
      )
    ) {
      if (!waitingForOrder) appendChainItem(game, item);
      else updateQueuedTriggerItem(game, item);
      continue;
    }
    if (item.targetCardInstanceIds.length > 0) {
      if (!waitingForOrder) appendChainItem(game, item);
      else updateQueuedTriggerItem(game, item);
      continue;
    }
    game.state.pendingChoice = chainTargetChoice(game, item, requirements);
    return;
  }
  queueNextTriggerOrderChoice(game);
}

function appendChainItem(game: GameDocument, item: ChainItem) {
  const chain = game.state.chain ?? {
    items: [],
    relevantPlayerIds:
      game.state.showdown?.relevantPlayerIds ??
      [...game.state.setup.playerIds],
    priorityPlayerId: item.controllerPlayerId,
    passedPlayerIds: [],
    resumeFocusPlayerId:
      item.resumeFocusPlayerId ?? game.state.showdown?.focusPlayerId ?? null,
  };
  chain.items.push(item);
  chain.priorityPlayerId = item.controllerPlayerId;
  chain.passedPlayerIds = [];
  game.state.chain = chain;
}

function isQueuedForOrdering(game: GameDocument, itemId: string) {
  return game.state.queuedTriggerChoices.some((choice) =>
    choice.pendingItems.some((item) => item.id === itemId),
  );
}

function updateQueuedTriggerItem(game: GameDocument, item: ChainItem) {
  let updated = false;
  game.state.queuedTriggerChoices = game.state.queuedTriggerChoices.map(
    (choice) => ({
      ...choice,
      pendingItems: choice.pendingItems.map((candidate) => {
        if (candidate.id !== item.id) return candidate;
        updated = true;
        return item;
      }),
    }),
  );
  return updated;
}

function queueNextTriggerOrderChoice(game: GameDocument) {
  if (game.state.pendingChoice) return;
  let nextChoice = game.state.queuedTriggerChoices.shift() ?? null;
  while (nextChoice) {
    const pendingItems = nextChoice.pendingItems;
    if (pendingItems.length === 0) {
      nextChoice = game.state.queuedTriggerChoices.shift() ?? null;
      continue;
    }
    if (pendingItems.length === 1) {
      appendChainItem(game, pendingItems[0]!);
      nextChoice = game.state.queuedTriggerChoices.shift() ?? null;
      continue;
    }
    game.state.pendingChoice = {
      ...nextChoice,
      optionIds: pendingItems.map((item) => item.id),
      pendingItems,
    };
    return;
  }
}

export function queueDelayedEffects(
  game: GameDocument,
  point: string,
  decks: readonly DeckSnapshotDocument[],
  endingPlayerId: string
): boolean {
  const index = createRuntimeCardIndex(decks, game);
  const due = game.state.delayedEffects.filter(
    (effect) => effect.point === point
  );
  if (due.length === 0) return false;
  const items = [
    ...takeQueuedTriggerItems(game),
    ...due.map((effect): ChainItem => ({
    id: `delayed-trigger:${effect.id}`,
    kind: "trigger",
    label: definitionForInstance(effect.sourceCardInstanceId, index).card.name,
    controllerPlayerId: effect.controllerPlayerId,
    sourceCardInstanceId: effect.sourceCardInstanceId,
    targetCardInstanceIds: [],
    targetObjectVersions: {},
    lockedSelectionsByBinding: {},
    behaviorClauseId: effect.clauseId,
    activatedBehaviorId: null,
    behaviorEvent: {
      type: "delayed.effect",
      actorPlayerId: effect.controllerPlayerId,
      subjectCardInstanceId: effect.sourceCardInstanceId,
      values: { delayedEffectId: effect.id, endingPlayerId }
    }
    })),
  ];
  queueSimultaneousTriggerItems(game, items, endingPlayerId);
  return true;
}

function takeQueuedTriggerItems(game: GameDocument): ChainItem[] {
  const items = [
    ...(game.state.chain?.items ?? []),
    ...(game.state.pendingChoice?.type === "orderTriggers"
      ? game.state.pendingChoice.pendingItems
      : []),
    ...game.state.queuedTriggerChoices.flatMap((choice) => choice.pendingItems),
  ];
  game.state.chain = null;
  if (game.state.pendingChoice?.type === "orderTriggers") {
    game.state.pendingChoice = null;
  }
  game.state.queuedTriggerChoices = [];
  return items;
}

function queueSimultaneousTriggerItems(
  game: GameDocument,
  items: ChainItem[],
  startingPlayerId: string,
) {
  const playerIds = game.state.setup.playerIds;
  const startIndex = playerIds.indexOf(startingPlayerId);
  const turnOrder = startIndex < 0
    ? [...playerIds]
    : [...playerIds.slice(startIndex), ...playerIds.slice(0, startIndex)];
  let waitingForOrder = game.state.pendingChoice !== null;
  for (const controllerPlayerId of turnOrder) {
    const controlledItems = items.filter(
      (item) => item.controllerPlayerId === controllerPlayerId
    );
    if (controlledItems.length === 0) continue;
    if (controlledItems.length > 1 || waitingForOrder) {
      const choice = {
        id: `choice:${game.stateVersion}:${controllerPlayerId}:delayed-triggers`,
        playerId: controllerPlayerId,
        type: "orderTriggers" as const,
        optionIds: controlledItems.map((item) => item.id),
        pendingItems: controlledItems
      };
      if (game.state.pendingChoice) {
        game.state.queuedTriggerChoices.push(choice);
      } else {
        game.state.pendingChoice = choice;
      }
      waitingForOrder = true;
      continue;
    }
    const chain = game.state.chain ?? {
      items: [],
      relevantPlayerIds: [...game.state.setup.playerIds],
      priorityPlayerId: controllerPlayerId,
      passedPlayerIds: [],
      resumeFocusPlayerId: game.state.showdown?.focusPlayerId ?? null,
    };
    chain.items.push(controlledItems[0]!);
    game.state.chain = chain;
  }
  if (game.state.chain?.items.length) {
    game.state.chain.priorityPlayerId =
      game.state.chain.items.at(-1)!.controllerPlayerId;
    game.state.chain.passedPlayerIds = [];
  }
}

export function beginDelayedEffectResolution(
  game: GameDocument,
  effectId: string,
  decks: readonly DeckSnapshotDocument[],
  endingPlayerId: string
): boolean {
  const effect = game.state.delayedEffects.find(
    (candidate) => candidate.id === effectId
  );
  if (!effect) throw new Error("Delayed effect is unavailable.");
  return beginEffectResolution({
    game,
    controllerPlayerId: effect.controllerPlayerId,
    sourceCardInstanceId: effect.sourceCardInstanceId,
    clauseId: effect.clauseId,
    delayedEffectId: effect.id,
    endingPlayerId,
    selectedIds: effect.selectedIds,
    targetsLocked: true,
    decks,
  });
}

function activeSourceIds(
  game: GameDocument,
  controllerPlayerId: string,
  index: ReturnType<typeof createRuntimeCardIndex>,
  events: readonly BehaviorEvent[],
): string[] {
  const player = game.state.players[controllerPlayerId]!;
  const justDiedSources = events.flatMap((event) => {
    if (event.type !== "unit.died" || !event.subjectCardInstanceId) return [];
    return index.instances.get(event.subjectCardInstanceId)?.ownerPlayerId ===
      controllerPlayerId
      ? [event.subjectCardInstanceId]
      : [];
  });
  const activeTrashSources = player.zones.trash.filter((id) => {
    const instance = index.instances.get(id);
    const definition = instance && index.definitions.get(instance.cardCode);
    return definition?.behaviorModel.clauses.some((clause) =>
      clause.effects.some(
        (binding) =>
          binding.behaviorId === "modifier.active_in_zone" &&
          binding.parameters.zone === "trash",
      ),
    );
  });
  const activeEventSources = events.flatMap((event) => {
    const id = event.subjectCardInstanceId;
    if (!id || !player.zones.mainDeck.includes(id)) return [];
    const instance = index.instances.get(id);
    const definition = instance && index.definitions.get(instance.cardCode);
    return definition?.behaviorModel.clauses.some((clause) =>
      clause.effects.some(
        (binding) =>
          binding.behaviorId === "modifier.active_in_zone" &&
          binding.parameters.zone === "mainDeck",
      ),
    ) ? [id] : [];
  });
  return [
    ...new Set([
      ...(player.zones.legend ? [player.zones.legend] : []),
      ...player.zones.base,
      ...game.state.battlefields
        .filter(
          (battlefield) =>
            (battlefield.controllerPlayerId ?? battlefield.selectedByPlayerId) ===
            controllerPlayerId,
        )
        .map((battlefield) => battlefield.cardInstanceId),
      ...game.state.battlefields
        .flatMap((battlefield) => battlefield.units)
        .filter(
          (id) => index.instances.get(id)?.ownerPlayerId === controllerPlayerId,
        ),
      ...game.state.ongoingEffects
        .filter(
          (effect) =>
            effect.behaviorId === "modifier.enable_source_triggers" &&
            effect.controllerPlayerId === controllerPlayerId,
        )
        .map((effect) => effect.sourceCardInstanceId),
      ...justDiedSources,
      ...activeTrashSources,
      ...activeEventSources,
    ]),
  ].filter((id) =>
    sourceMatchesDeclaredActiveZone(
      game,
      controllerPlayerId,
      id,
      index,
    ),
  );
}

function chainTargetChoice(
  game: GameDocument,
  item: ChainItem,
  requirements: ReturnType<typeof selectionRequirementsForClause>[number]["requirement"][],
  optionalChoiceBindingKey?: string,
): Extract<NonNullable<GameDocument["state"]["pendingChoice"]>, { type: "effectSelection" }> {
  const sourceZones = new Set(
    requirements.map((requirement) => requirement.sourceZone),
  );
  const allowDecline = Boolean(optionalChoiceBindingKey) || requirements.every(
    (requirement) => requirement.minimum === 0,
  );
  return {
    id: `choice:${game.stateVersion}:${item.id}:targets`,
    playerId: item.controllerPlayerId,
    type: "effectSelection",
    resolutionId: null,
    bindingKey: "chain-targets",
    prompt: allowDecline
      ? `Choose targets for ${item.label}, or decline.`
      : `Choose targets for ${item.label}`,
    title: item.label,
    optionKind: requirements.some(
      (requirement) => requirement.kind === "battlefield",
    )
      ? "battlefield"
      : "card",
    sourceZone: sourceZones.size === 1 ? ([...sourceZones][0] ?? null) : null,
    presentation: "cardSelection",
    visionAction: "recycle",
    legalCardIds: [
      ...new Set(requirements.flatMap((requirement) => requirement.legalIds)),
    ],
    minimum: requirements.reduce(
      (sum, requirement) => sum + requirement.minimum,
      0,
    ),
    maximum: requirements.reduce(
      (sum, requirement) => sum + requirement.maximum,
      0,
    ),
    allowDecline,
    optionalChoiceBindingKey,
    chainItem: item,
    targetRequirements: requirements,
  };
}

function lockChainSelectorSelections(
  game: GameDocument,
  item: ChainItem,
  selectedIds: string[],
  decks: readonly DeckSnapshotDocument[],
) {
  if (!item.sourceCardInstanceId || !item.behaviorClauseId) return;
  const index = createRuntimeCardIndex(decks, game);
  const handlers = createPrimitiveHandlers(index);
  const clause = compileBehaviorModel(
    definitionForInstance(item.sourceCardInstanceId, index).behaviorModel,
    handlers,
  ).clauses.find((candidate) => candidate.id === item.behaviorClauseId);
  if (!clause) return;
  const context = createBehaviorContext(
    game,
    item.controllerPlayerId,
    item.sourceCardInstanceId,
    item.behaviorEvent,
    [],
  );
  applyChoiceSelections(clause, item.lockedSelectionsByBinding, context);
  const requirements = selectionRequirementsForClause(
    clause,
    context,
    handlers,
  ).filter(({ binding }) => binding.parameters.deferred !== true);
  const selections = allocateSelections(
    requirements.map(({ requirement }) => requirement),
    selectedIds,
  );
  requirements.forEach(({ binding }, index) => {
    item.lockedSelectionsByBinding[
      `${clause.id}:selectors:${binding.order}`
    ] = selections[index] ?? [];
  });
}

function removeQueuedTriggerItem(game: GameDocument, itemId: string) {
  game.state.queuedChainItems = (game.state.queuedChainItems ?? []).filter(
    (item) => item.id !== itemId,
  );
  game.state.queuedTriggerChoices = game.state.queuedTriggerChoices.map(
    (choice) => ({
      ...choice,
      optionIds: choice.optionIds.filter((id) => id !== itemId),
      pendingItems: choice.pendingItems.filter((item) => item.id !== itemId),
    }),
  );
}

function sourceMatchesDeclaredActiveZone(
  game: GameDocument,
  controllerPlayerId: string,
  sourceCardInstanceId: string,
  index: ReturnType<typeof createRuntimeCardIndex>,
) {
  const definition = definitionForInstance(sourceCardInstanceId, index);
  const declaredZones = definition.behaviorModel.clauses.flatMap((clause) =>
    clause.effects.flatMap((binding) =>
      binding.behaviorId === "modifier.active_in_zone" &&
      typeof binding.parameters.zone === "string"
        ? [binding.parameters.zone]
        : [],
    ),
  );
  if (declaredZones.length === 0) return true;
  const zones = game.state.players[controllerPlayerId]!.zones;
  return declaredZones.some((zone) => {
    switch (zone) {
      case "trash":
        return zones.trash.includes(sourceCardInstanceId);
      case "mainDeck":
        return zones.mainDeck.includes(sourceCardInstanceId);
      default:
        return false;
    }
  });
}
