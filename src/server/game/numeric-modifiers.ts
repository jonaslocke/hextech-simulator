import type { BehaviorBinding } from "./schemas";
import type { RuntimeCardIndex } from "./primitive-handlers";
import type { GameDocument } from "./state";
import { numericConditionMatches } from "./numeric-condition";

type NumericValueInput = {
  attribute: string;
  baseValue: number;
  cardType?: string;
  controllerPlayerId?: string;
  game: GameDocument;
  index?: RuntimeCardIndex;
  targetCardInstanceId?: string;
  targetScope: string;
};

export function effectiveNumericValue(input: NumericValueInput): number {
  let value = input.baseValue;

  for (const modifier of input.game.state.modifiers) {
    if (
      modifier.attribute !== input.attribute ||
      (!modifier.targetCardInstanceId &&
        modifier.targetScope !== input.targetScope) ||
      !modifierAppliesToInput(input, modifier)
    ) {
      continue;
    }
    value = applyNumericOperation(value, modifier);
  }

  for (const { binding, conditions, controllerPlayerId, sourceId } of input.index
    ? activeContinuousBindings(input.game, input.index)
    : []) {
    const targetsCandidate =
      binding.parameters.target === input.targetScope ||
      (binding.parameters.target === "friendly_unit" &&
        input.targetScope === "source" &&
        input.targetCardInstanceId &&
        input.controllerPlayerId === controllerPlayerId);
    if (
      binding.parameters.attribute !== input.attribute ||
      !targetsCandidate ||
      (input.controllerPlayerId &&
        controllerPlayerId !== input.controllerPlayerId) ||
      (input.targetScope === "controller_spell" &&
        input.cardType !== "Spell") ||
      (binding.parameters.target === "source" &&
        input.targetScope === "source" &&
        input.targetCardInstanceId !== sourceId)
    ) {
      continue;
    }
    if (
      !continuousConditionApplies(
        binding,
        input,
        controllerPlayerId,
        sourceId,
      )
    ) continue;
    if (
      conditions.some(
        (condition) =>
          condition.behaviorId !== "condition.compare_numeric_value" ||
          !numericConditionMatches({
            binding: condition,
            controllerPlayerId,
            game: input.game,
            index: input.index!,
          }),
      )
    ) {
      continue;
    }
    value = applyNumericOperation(value, {
      amount: numberParameter(binding, "amount"),
      minimum:
        typeof binding.parameters.minimum === "number"
          ? binding.parameters.minimum
          : null,
      operation: stringParameter(binding, "operation"),
    });
  }

  return Math.max(0, value);
}

function continuousConditionApplies(
  binding: BehaviorBinding,
  input: NumericValueInput,
  controllerPlayerId: string,
  sourceId: string,
) {
  const condition = binding.parameters.condition;
  if (typeof condition !== "string") return true;
  const targetId = input.targetCardInstanceId;
  if (!targetId || !input.index) return false;
  const role = input.game.state.cardStates[targetId]?.combatRole;
  if (condition === "sourceCombatsAlone") {
    return targetId === sourceId &&
      (role === "attacker" || role === "defender") &&
      combatRoleCount(input.game, input.index, controllerPlayerId, role) === 1;
  }
  if (condition === "friendlyDefendsAlone") {
    return role === "defender" &&
      combatRoleCount(input.game, input.index, controllerPlayerId, "defender") === 1;
  }
  return true;
}

function combatRoleCount(
  game: GameDocument,
  index: RuntimeCardIndex,
  playerId: string,
  role: "attacker" | "defender",
) {
  return Object.entries(game.state.cardStates).filter(
    ([id, state]) =>
      state.combatRole === role &&
      index.instances.get(id)?.ownerPlayerId === playerId,
  ).length;
}

export function isContinuousDuration(duration: unknown): boolean {
  return (
    duration === "whileSourceAtBattlefield" ||
    duration === "whileSourceOnBoard"
  );
}

function activeContinuousBindings(
  game: GameDocument,
  index: RuntimeCardIndex,
) {
  const sourceIds = [
    ...game.state.setup.playerIds.flatMap((playerId) => {
      const player = game.state.players[playerId]!;
      return [
        ...(player.zones.legend ? [player.zones.legend] : []),
        ...(player.zones.champion ? [player.zones.champion] : []),
        ...player.zones.base,
      ];
    }),
    ...game.state.battlefields.flatMap((battlefield) => [
      battlefield.cardInstanceId,
      ...battlefield.units,
    ]),
  ];

  return [...new Set(sourceIds)].flatMap((sourceId) => {
    const instance = index.instances.get(sourceId);
    const definition = instance && index.definitions.get(instance.cardCode);
    if (!instance || !definition) return [];
    return definition.behaviorModel.clauses.flatMap((clause) =>
      clause.effects.flatMap((binding) =>
        binding.behaviorId === "modifier.modify_numeric_value" &&
        isContinuousDuration(binding.parameters.duration) &&
        sourceIsActive(game, sourceId, binding.parameters.duration)
          ? [
              {
                binding,
                conditions: clause.conditions,
                controllerPlayerId: instance.ownerPlayerId,
                sourceId,
              },
            ]
          : [],
      ),
    );
  });
}

function sourceIsActive(
  game: GameDocument,
  sourceId: string,
  duration: unknown,
) {
  if (duration === "whileSourceAtBattlefield") {
    return game.state.battlefields.some((battlefield) =>
      battlefield.units.includes(sourceId),
    );
  }
  return (
    game.state.setup.playerIds.some((playerId) => {
      const player = game.state.players[playerId]!;
      return (
        player.zones.legend === sourceId ||
        player.zones.base.includes(sourceId)
      );
    }) ||
    game.state.battlefields.some(
      (battlefield) =>
        battlefield.cardInstanceId === sourceId ||
        battlefield.units.includes(sourceId),
    )
  );
}

function modifierAppliesToInput(
  input: NumericValueInput,
  modifier: GameDocument["state"]["modifiers"][number],
) {
  if (
    !modifier.targetCardInstanceId &&
    modifier.controllerPlayerId &&
    modifier.controllerPlayerId !== input.controllerPlayerId
  ) {
    return false;
  }
  if (
    modifier.targetCardInstanceId &&
    modifier.targetCardInstanceId !== input.targetCardInstanceId
  ) {
    return false;
  }
  return input.targetScope !== "controller_spell" || input.cardType === "Spell";
}

function applyNumericOperation(
  value: number,
  modifier: {
    amount: number;
    minimum: number | null;
    operation: string;
  },
) {
  let result = value;
  if (modifier.operation === "increase") result += modifier.amount;
  if (modifier.operation === "reduce") result -= modifier.amount;
  if (modifier.operation === "multiply") result *= modifier.amount;
  if (modifier.operation === "set") result = modifier.amount;
  if (modifier.minimum !== null) result = Math.max(result, modifier.minimum);
  return result;
}

function numberParameter(binding: BehaviorBinding, key: string) {
  const value = binding.parameters[key];
  if (typeof value !== "number")
    throw new Error(`Behavior parameter ${key} must be numeric.`);
  return value;
}

function stringParameter(binding: BehaviorBinding, key: string) {
  const value = binding.parameters[key];
  if (typeof value !== "string")
    throw new Error(`Behavior parameter ${key} must be text.`);
  return value;
}
