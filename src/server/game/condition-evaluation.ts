import type { BehaviorEvent } from "./behavior-runtime";
import { numericConditionMatches } from "./numeric-condition";
import type { RuntimeCardIndex } from "./primitive-handlers";
import type { BehaviorBinding } from "./schemas";
import type { GameDocument } from "./state";
import { effectiveNumericValue } from "./numeric-modifiers";

type ConditionContext = {
  game: GameDocument;
  index: RuntimeCardIndex;
  controllerPlayerId: string;
  sourceCardInstanceId: string;
  event: BehaviorEvent | null;
};

export function conditionMatches(
  binding: BehaviorBinding,
  context: ConditionContext,
): boolean {
  if (binding.behaviorId === "condition.compare_numeric_value") {
    return numericConditionMatches({
      binding,
      controllerPlayerId: context.controllerPlayerId,
      eventValues: context.event?.values,
      game: context.game,
      index: context.index,
    });
  }
  if (binding.behaviorId === "condition.state") {
    return compare(
      stateValue(binding, context),
      binding.parameters.operator,
      binding.parameters.comparisonValue,
    );
  }
  if (binding.behaviorId === "condition.turn_event_count") {
    return compare(
      turnEventCount(binding, context),
      binding.parameters.operator,
      binding.parameters.comparisonValue,
    );
  }
  return false;
}

export function recordTurnEvent(
  game: GameDocument,
  event: BehaviorEvent,
  ownerPlayerId: string | null,
) {
  const subjectId = event.subjectCardInstanceId;
  if (!ownerPlayerId || !subjectId) return;
  const records = historyRecordFor(event.type, game);
  if (!records) return;
  (records[ownerPlayerId] ??= []).push(subjectId);
}

function stateValue(
  binding: BehaviorBinding,
  context: ConditionContext,
): number {
  const subject = binding.parameters.subject;
  const property = binding.parameters.property;
  const playerId = subject === "opponent"
    ? context.game.state.setup.playerIds.find(
        (id) => id !== context.controllerPlayerId,
      )
    : context.controllerPlayerId;
  const player = playerId ? context.game.state.players[playerId] : null;

  if (property === "score") return player?.points ?? 0;
  if (property === "scoreDistanceToVictory") {
    const victoryRequirement = effectiveNumericValue({
      attribute: "victoryRequirement",
      baseValue: 8,
      game: context.game,
      index: context.index,
      targetScope: "game",
    });
    return Math.max(0, victoryRequirement - (player?.points ?? 0));
  }
  if (property === "handCount") return player?.zones.hand.length ?? 0;
  if (property === "facedownCount") {
    return context.game.state.battlefields.reduce(
      (total, battlefield) =>
        total + (battlefield.facedownCards ?? []).filter(
          (entry) => entry.controllerPlayerId === playerId,
        ).length,
      0,
    );
  }
  if (property === "taggedUnitCount") {
    const tag = binding.parameters.tag;
    if (typeof tag !== "string" || !playerId) return 0;
    return allUnitIds(context.game).filter((id) => {
      const instance = context.index.instances.get(id);
      const definition = instance && context.index.definitions.get(instance.cardCode);
      return (
        instance?.ownerPlayerId === playerId &&
        definition?.card.tags.includes(tag)
      );
    }).length;
  }
  if (property === "buffed") {
    return context.game.state.cardStates[context.sourceCardInstanceId]?.buffed
      ? 1
      : 0;
  }
  if (property === "atBattlefield") {
    return context.game.state.battlefields.some((battlefield) =>
      battlefield.units.includes(context.sourceCardInstanceId),
    )
      ? 1
      : 0;
  }
  return 0;
}

function turnEventCount(
  binding: BehaviorBinding,
  context: ConditionContext,
) {
  const records = historyRecordFor(binding.parameters.eventType, context.game);
  if (!records) return 0;
  const subject = binding.parameters.subject;
  if (subject === "source") {
    return Object.values(records).flat().filter(
      (id) => id === context.sourceCardInstanceId,
    ).length;
  }
  const playerId = subject === "opponent"
    ? context.game.state.setup.playerIds.find(
        (id) => id !== context.controllerPlayerId,
      )
    : context.controllerPlayerId;
  return playerId ? (records[playerId] ?? []).length : 0;
}

function historyRecordFor(eventType: unknown, game: GameDocument) {
  switch (eventType) {
    case "discarded":
      return game.state.turnHistory.discardedCardIdsByPlayerId;
    case "died":
      return game.state.turnHistory.diedCardIdsByPlayerId;
    case "moved":
      return game.state.turnHistory.movedCardIdsByPlayerId;
    case "readied":
      return game.state.turnHistory.readiedCardIdsByPlayerId;
    case "recycled":
      return game.state.turnHistory.recycledCardIdsByPlayerId;
    default:
      return null;
  }
}

function allUnitIds(game: GameDocument) {
  return [
    ...game.state.setup.playerIds.flatMap(
      (playerId) => game.state.players[playerId]!.zones.base,
    ),
    ...game.state.battlefields.flatMap((battlefield) => battlefield.units),
  ];
}

function compare(
  value: number,
  operator: unknown,
  comparisonValue: unknown,
) {
  if (typeof comparisonValue !== "number") return false;
  switch (operator) {
    case "equal":
      return value === comparisonValue;
    case "notEqual":
      return value !== comparisonValue;
    case "greaterThan":
      return value > comparisonValue;
    case "greaterThanOrEqual":
      return value >= comparisonValue;
    case "lessThan":
      return value < comparisonValue;
    case "lessThanOrEqual":
      return value <= comparisonValue;
    default:
      return false;
  }
}
