import {
  compileBehaviorModel,
  createBehaviorContext,
  queueTriggeredClauses,
  targetRequirementsForClause,
  type BehaviorEvent
} from "./behavior-runtime";
import {
  createPrimitiveHandlers,
  createRuntimeCardIndex,
  definitionForInstance
} from "./primitive-handlers";
import type { DeckSnapshotDocument } from "./repositories";
import type { ChainItem, GameDocument } from "./state";
import { beginEffectResolution } from "./effect-resolution";

export function dispatchBehaviorEvent(
  game: GameDocument,
  event: BehaviorEvent,
  decks: readonly DeckSnapshotDocument[]
): void {
  const index = createRuntimeCardIndex(decks);
  const handlers = createPrimitiveHandlers(index);
  for (const controllerPlayerId of game.state.setup.playerIds) {
    const sources = activeSourceIds(game, controllerPlayerId, index).map((sourceCardInstanceId) => ({
      sourceCardInstanceId,
      label: definitionForInstance(sourceCardInstanceId, index).card.name,
      model: compileBehaviorModel(
        definitionForInstance(sourceCardInstanceId, index).behaviorModel,
        handlers
      )
    }));
    queueTriggeredClauses({
      game,
      controllerPlayerId,
      sources,
      event,
      handlers,
      enqueueItems: (items) =>
        queueChainItemsForTargets(game, items, decks),
    });
  }
}

export function queueChainItemsForTargets(
  game: GameDocument,
  items: ChainItem[],
  decks: readonly DeckSnapshotDocument[],
): void {
  game.state.queuedChainItems = [
    ...(game.state.queuedChainItems ?? []),
    ...items,
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
  if (
    selectedIds.length < minimum ||
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
    })
  ) {
    throw new Error("Selected chain targets are not legal.");
  }
  const item = pending.chainItem;
  item.targetCardInstanceIds = [...selectedIds];
  item.targetObjectVersions = Object.fromEntries(
    selectedIds.map((id) => [
      id,
      game.state.cardStates[id]?.objectVersion ?? 0,
    ]),
  );
  game.state.pendingChoice = null;
  appendChainItem(game, item);
  continueQueuedChainItems(game, decks);
}

function continueQueuedChainItems(
  game: GameDocument,
  decks: readonly DeckSnapshotDocument[],
) {
  if (game.state.pendingChoice) return;
  const index = createRuntimeCardIndex(decks);
  const handlers = createPrimitiveHandlers(index);
  while ((game.state.queuedChainItems?.length ?? 0) > 0) {
    const item = game.state.queuedChainItems!.shift()!;
    if (!item.sourceCardInstanceId || !item.behaviorClauseId) {
      appendChainItem(game, item);
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
    const requirements = clause
      ? targetRequirementsForClause(
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
      : [];
    if (
      requirements.length === 0 ||
      requirements.some(
        (requirement) =>
          new Set(requirement.legalIds).size < requirement.minimum,
      )
    ) {
      appendChainItem(game, item);
      continue;
    }
    const sourceZones = new Set(
      requirements.map((requirement) => requirement.sourceZone),
    );
    game.state.pendingChoice = {
      id: `choice:${game.stateVersion}:${item.id}:targets`,
      playerId: item.controllerPlayerId,
      type: "effectSelection",
      resolutionId: null,
      bindingKey: "chain-targets",
      prompt: `Choose targets for ${item.label}`,
      optionKind: requirements.some(
        (requirement) => requirement.kind === "battlefield",
      )
        ? "battlefield"
        : "card",
      sourceZone:
        sourceZones.size === 1 ? ([...sourceZones][0] ?? null) : null,
      presentation: "cardSelection",
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
      chainItem: item,
      targetRequirements: requirements,
    };
    return;
  }
}

function appendChainItem(game: GameDocument, item: ChainItem) {
  const chain = game.state.chain ?? {
    items: [],
    relevantPlayerIds:
      game.state.showdown?.relevantPlayerIds ??
      [...game.state.setup.playerIds],
    priorityPlayerId: item.controllerPlayerId,
    passedPlayerIds: [],
  };
  chain.items.push(item);
  chain.priorityPlayerId = item.controllerPlayerId;
  chain.passedPlayerIds = [];
  game.state.chain = chain;
}

export function queueDelayedEffects(
  game: GameDocument,
  point: string,
  decks: readonly DeckSnapshotDocument[],
  endingPlayerId: string
): boolean {
  const index = createRuntimeCardIndex(decks);
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
      passedPlayerIds: []
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
  index: ReturnType<typeof createRuntimeCardIndex>
): string[] {
  const player = game.state.players[controllerPlayerId]!;
  return [...new Set([
    ...(player.zones.legend ? [player.zones.legend] : []),
    ...(player.zones.champion ? [player.zones.champion] : []),
    ...player.zones.base,
    ...game.state.battlefields
      .filter((battlefield) =>
        (battlefield.controllerPlayerId ?? battlefield.selectedByPlayerId)
          === controllerPlayerId
      )
      .map((battlefield) => battlefield.cardInstanceId),
    ...game.state.battlefields.flatMap((battlefield) => battlefield.units)
      .filter((id) => index.instances.get(id)?.ownerPlayerId === controllerPlayerId)
  ])];
}
