import type { BehaviorBinding } from "./schemas";

/** Resolve the amount produced by an exhaust-for-resource ability. */
export function effectiveExhaustForResourceAmount(
  ability: BehaviorBinding,
  empowered: boolean,
): number | null {
  const amount = empowered && typeof ability.parameters.empoweredAmount === "number"
    ? ability.parameters.empoweredAmount
    : ability.parameters.amount;
  return typeof amount === "number" && amount > 0 ? amount : null;
}
