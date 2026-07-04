import {
  compileBehaviorModel,
  queueTriggeredClauses,
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
    queueTriggeredClauses({ game, controllerPlayerId, sources, event, handlers });
  }
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
  const items = due.map((effect): ChainItem => ({
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
  }));
  const playerIds = game.state.setup.playerIds;
  const startIndex = playerIds.indexOf(endingPlayerId);
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
  return true;
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
