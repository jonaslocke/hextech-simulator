import type { BehaviorBinding } from "./schemas";
import type { RuntimeCardIndex } from "./primitive-handlers";
import type { GameDocument } from "./state";

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

  for (const { binding, controllerPlayerId, sourceId } of input.index
    ? activeContinuousBindings(input.game, input.index)
    : []) {
    if (
      binding.parameters.attribute !== input.attribute ||
      binding.parameters.target !== input.targetScope ||
      (input.controllerPlayerId &&
        controllerPlayerId !== input.controllerPlayerId) ||
      (input.targetScope === "controller_spell" &&
        input.cardType !== "Spell") ||
      (input.targetScope === "source" &&
        input.targetCardInstanceId !== sourceId)
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
  return game.state.battlefields.some(
    (battlefield) =>
      battlefield.cardInstanceId === sourceId ||
      battlefield.units.includes(sourceId),
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
