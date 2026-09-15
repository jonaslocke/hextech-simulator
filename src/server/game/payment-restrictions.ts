/** Each dimension is an allowed set; omitted dimensions accept every value.
 * Dimensions are conjunctive. New payment characteristics need no priority rank.
 * Traits can be represented as boolean dimensions (e.g. "trait:armored": ["yes"]). */
export type ResourceRestriction = Readonly<Record<string, readonly string[]>>;

export type PaymentContext = (
  | { kind: "card"; cardType: string }
  | { kind: "ability"; sourceCardType: string }
) & { characteristics?: Readonly<Record<string, string>> };

const impossible: ResourceRestriction = { kind: [] };

/** Compatibility boundary only. Unknown persisted identifiers fail closed. */
export function normalizeResourceRestriction(usage: string): ResourceRestriction {
  if (usage === "unrestricted") return {};
  if (usage === "spellsOnly") return { kind: ["card"], type: ["Spell"] };
  if (usage === "gearAndGearAbilitiesOnly") return { kind: ["card", "ability"], type: ["Gear"] };
  const match = /^(card|ability|cardOrAbility):([A-Za-z]+(?:\|[A-Za-z]+)*)$/.exec(usage);
  if (!match) return impossible;
  return {
    kind: match[1] === "cardOrAbility" ? ["card", "ability"] : [match[1]!],
    type: match[2]!.split("|"),
  };
}

export function restrictionAllowsPayment(restriction: ResourceRestriction, context: PaymentContext) {
  const dimensions: Readonly<Record<string, string>> = {
    ...context.characteristics,
    kind: context.kind,
    type: context.kind === "card" ? context.cardType : context.sourceCardType,
  };
  return Object.entries(restriction).every(([key, allowed]) =>
    dimensions[key] !== undefined && allowed.includes(dimensions[key]!),
  );
}

function isSubset(left: ResourceRestriction, right: ResourceRestriction) {
  if (Object.values(left).some((values) => values.length === 0)) return true;
  return Object.entries(right).every(([key, allowed]) =>
    left[key] !== undefined && left[key]!.every((value) => allowed.includes(value)),
  );
}

function semanticDimensions(restriction: ResourceRestriction): ResourceRestriction {
  if (!restriction.kind) return restriction;
  const { kind, ...dimensions } = restriction;
  // PaymentContext has exactly these two kinds. Accepting both places no
  // constraint on this dimension; it is equivalent to omitting it.
  const acceptedKinds = ["card", "ability"].filter((value) => kind.includes(value));
  return acceptedKinds.length === 2 ? dimensions : { ...dimensions, kind: acceptedKinds };
}

export function compareRestrictions(left: ResourceRestriction, right: ResourceRestriction) {
  const leftDimensions = semanticDimensions(left);
  const rightDimensions = semanticDimensions(right);
  const leftSubset = isSubset(leftDimensions, rightDimensions);
  const rightSubset = isSubset(rightDimensions, leftDimensions);
  if (leftSubset && rightSubset) return "equivalent";
  if (leftSubset) return "narrower";
  if (rightSubset) return "broader";
  return "incomparable";
}

export function resourceUsageAllowsPayment(usage: string, context: PaymentContext) {
  return restrictionAllowsPayment(normalizeResourceRestriction(usage), context);
}
