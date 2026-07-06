import type { BehaviorBinding } from "./schemas";
import type { RuntimeCardIndex } from "./primitive-handlers";
import type { GameDocument } from "./state";

type NumericConditionContext = {
  binding: BehaviorBinding;
  controllerPlayerId: string;
  eventValues?: Readonly<Record<string, string | number | boolean | null>>;
  game: GameDocument;
  index: RuntimeCardIndex;
};

export function numericConditionMatches({
  binding,
  controllerPlayerId,
  eventValues,
  game,
  index,
}: NumericConditionContext): boolean {
  const value = resolveNumericConditionValue({
    controllerPlayerId,
    eventValues,
    game,
    index,
    valueSource: binding.parameters.valueSource,
  });
  const comparison = binding.parameters.comparisonValue;

  if (typeof value !== "number" || typeof comparison !== "number") {
    return false;
  }

  switch (binding.parameters.operator) {
    case "equal":
      return value === comparison;
    case "notEqual":
      return value !== comparison;
    case "greaterThan":
      return value > comparison;
    case "greaterThanOrEqual":
      return value >= comparison;
    case "lessThan":
      return value < comparison;
    case "lessThanOrEqual":
      return value <= comparison;
    default:
      return false;
  }
}

function resolveNumericConditionValue({
  controllerPlayerId,
  eventValues,
  game,
  index,
  valueSource,
}: Omit<NumericConditionContext, "binding"> & {
  valueSource: unknown;
}): number | undefined {
  if (valueSource === "controller.boardRuneCount") {
    return game.state.players[controllerPlayerId]!.zones.base.filter(
      (instanceId) => {
        const cardCode = index.instances.get(instanceId)?.cardCode;
        return (
          cardCode !== undefined &&
          index.definitions.get(cardCode)?.card.classification.type === "Rune"
        );
      },
    ).length;
  }

  if (valueSource === "eventSubject.effectiveEnergyCost") {
    const value =
      eventValues?.["eventSubject.printedEnergyCost"] ??
      eventValues?.[valueSource];
    return typeof value === "number" ? value : undefined;
  }

  const value = typeof valueSource === "string"
    ? eventValues?.[valueSource]
    : undefined;
  return typeof value === "number" ? value : undefined;
}
