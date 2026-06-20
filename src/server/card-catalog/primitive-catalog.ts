import type {
  DiscoveredPrimitive,
  PrimitiveAssignment,
  PrimitiveFamily
} from "./primitive-discovery";
import { gameZoneKinds, modifierDurations } from "../match/game";

export type PrimitiveParameterType =
  | "string"
  | "number"
  | "boolean"
  | "player"
  | "target"
  | "zone"
  | "duration"
  | "resource";

export type EngineSupportStatus =
  | "supported"
  | "partially_supported"
  | "requires_engine_support"
  | "ambiguous"
  | "unsupported";

export type PrimitiveParameterDefinition = {
  name: string;
  type: PrimitiveParameterType;
  required: boolean;
  description: string;
  options?: readonly string[];
};

export type PrimitiveEngineSupport = {
  status: EngineSupportStatus;
  note: string;
};

export type PrimitiveCatalogEntry = {
  id: string;
  family: PrimitiveFamily;
  name: string;
  description: string;
  parameters: PrimitiveParameterDefinition[];
  timingRequirements: string[];
  targetingRequirements: string[];
  engineSupport: PrimitiveEngineSupport;
  examples: Array<{
    cardCode: string;
    cardName: string;
    publicCode: string;
    sourceText: string;
  }>;
};

export type ParameterValidationIssue = {
  parameterName: string;
  message: string;
};

export type PrimitiveParameterValidation = {
  complete: boolean;
  missingRequired: string[];
  issues: ParameterValidationIssue[];
};

type PrimitiveCatalogSeed = Omit<PrimitiveCatalogEntry, "examples">;

const CATALOG_SEEDS: Record<string, PrimitiveCatalogSeed> = {
  "timing.action": primitiveSeed({
    id: "timing.action",
    family: "timing",
    name: "Action timing",
    description: "The card or ability can be played at action timing.",
    engineSupport: supported("Declared as a foundational timing primitive for the new catalog pipeline; not inherited from legacy runtime code."),
    timingRequirements: ["action phase", "showdown when allowed"]
  }),
  "timing.reaction": primitiveSeed({
    id: "timing.reaction",
    family: "timing",
    name: "Reaction timing",
    description: "The card or ability can be played while players have reaction priority.",
    engineSupport: supported("Declared as a foundational timing primitive for the new catalog pipeline; not inherited from legacy runtime code."),
    timingRequirements: ["open chain priority"]
  }),
  "trigger.on_play": primitiveSeed({
    id: "trigger.on_play",
    family: "trigger",
    name: "On play trigger",
    description: "Creates an effect when a card is played.",
    parameters: [required("subject", "string", "The played card or player event that fires the trigger.")],
    engineSupport: partiallySupported("Recurring corpus primitive; executable support must be validated per event source.")
  }),
  "trigger.on_move": primitiveSeed({
    id: "trigger.on_move",
    family: "trigger",
    name: "On move trigger",
    description: "Creates an effect when a unit moves.",
    parameters: [required("subject", "string", "The unit movement event that fires the trigger.")]
  }),
  "trigger.on_death": primitiveSeed({
    id: "trigger.on_death",
    family: "trigger",
    name: "On death trigger",
    description: "Creates an effect when a unit dies.",
    parameters: [required("subject", "string", "The death event that fires the trigger.")]
  }),
  "trigger.end_of_turn": primitiveSeed({
    id: "trigger.end_of_turn",
    family: "trigger",
    name: "End of turn trigger",
    description: "Creates an effect at the end of a turn.",
    parameters: [required("player", "player", "Which player's end of turn fires the trigger.")]
  }),
  "trigger.conquer_battlefield": primitiveSeed({
    id: "trigger.conquer_battlefield",
    family: "trigger",
    name: "Conquer battlefield trigger",
    description: "Creates an effect when a battlefield is conquered."
  }),
  "trigger.hold_battlefield": primitiveSeed({
    id: "trigger.hold_battlefield",
    family: "trigger",
    name: "Hold battlefield trigger",
    description: "Creates an effect when a player holds a battlefield."
  }),
  "selector.unit": primitiveSeed({
    id: "selector.unit",
    family: "selector",
    name: "Select unit",
    description: "Constrains a choice or effect to units.",
    parameters: [
      optional("scope", "string", "Whether the unit scope is any, each, friendly, or enemy."),
      optional("count", "number", "How many units are selected when the text says a fixed count."),
      optional("zone", "zone", "Where the unit must be, when stated.", gameZoneKinds),
      optional("excludesSource", "boolean", "Whether the selected unit cannot be the behavior source.")
    ],
    engineSupport: supported("Declared as a foundational selector primitive for the new catalog pipeline; not inherited from legacy runtime code."),
    targetingRequirements: ["target must be a unit"]
  }),
  "selector.friendly_unit": primitiveSeed({
    id: "selector.friendly_unit",
    family: "selector",
    name: "Select friendly unit",
    description: "Constrains a choice or effect to units controlled by the acting player.",
    parameters: [
      optional("count", "number", "How many friendly units are selected."),
      optional("zone", "zone", "Where the unit must be, when stated.", gameZoneKinds),
      optional("controller", "player", "The required controller relationship."),
      optional("excludesSource", "boolean", "Whether the selected unit cannot be the behavior source.")
    ],
    engineSupport: supported("Declared as a foundational selector primitive for the new catalog pipeline; not inherited from legacy runtime code."),
    targetingRequirements: ["target must be a controlled unit"]
  }),
  "selector.enemy_unit": primitiveSeed({
    id: "selector.enemy_unit",
    family: "selector",
    name: "Select enemy unit",
    description: "Constrains a choice or effect to units controlled by an opponent.",
    parameters: [
      optional("count", "number", "How many enemy units are selected."),
      optional("zone", "zone", "Where the unit must be, when stated.", gameZoneKinds),
      optional("controller", "player", "The required controller relationship."),
      optional("excludesSource", "boolean", "Whether the selected unit cannot be the behavior source.")
    ],
    engineSupport: supported("Declared as a foundational selector primitive for the new catalog pipeline; not inherited from legacy runtime code."),
    targetingRequirements: ["target must be an opponent-controlled unit"]
  }),
  "selector.up_to": primitiveSeed({
    id: "selector.up_to",
    family: "selector",
    name: "Select up to count",
    description: "Constrains a choice to zero through a maximum number of targets.",
    parameters: [required("count", "number", "The maximum number of targets.")],
    engineSupport: supported("Declared as a foundational selector primitive for the new catalog pipeline; not inherited from legacy runtime code."),
    targetingRequirements: ["target count may be zero through the maximum"]
  }),
  "action.draw_cards": primitiveSeed({
    id: "action.draw_cards",
    family: "action",
    name: "Draw cards",
    description: "Moves cards from a player's main deck to hand.",
    parameters: [
      required("player", "player", "The player who draws cards."),
      required("count", "number", "The number of cards drawn.")
    ],
    engineSupport: supported("Selected as an initial executable action primitive for the new catalog pipeline.")
  }),
  "action.discard_cards": primitiveSeed({
    id: "action.discard_cards",
    family: "action",
    name: "Discard cards",
    description: "Moves cards from hand to trash.",
    parameters: [
      required("player", "player", "The player who discards cards."),
      required("count", "number", "The number of cards discarded.")
    ]
  }),
  "action.move_unit": primitiveSeed({
    id: "action.move_unit",
    family: "action",
    name: "Move unit",
    description: "Moves a unit between board zones or battlefields.",
    parameters: [
      required("destination", "zone", "The destination zone or battlefield."),
      optional("count", "number", "The number of units moved.")
    ],
    engineSupport: partiallySupported("Movement is recurring in the corpus; destination and timing variants require additional validation.")
  }),
  "action.ready_cards": primitiveSeed({
    id: "action.ready_cards",
    family: "action",
    name: "Ready cards",
    description: "Readies exhausted cards.",
    parameters: [
      required("target", "target", "The cards to ready."),
      optional("count", "number", "The number of cards to ready.")
    ],
    engineSupport: requiresEngineSupport("Ready effects are recurring in the corpus and need generalized card-driven execution.")
  }),
  "action.exhaust_cards": primitiveSeed({
    id: "action.exhaust_cards",
    family: "action",
    name: "Exhaust cards",
    description: "Exhausts ready cards.",
    parameters: [
      required("target", "target", "The cards to exhaust."),
      optional("count", "number", "The number of cards to exhaust.")
    ],
    engineSupport: partiallySupported("Exhaustion appears both as a cost and effect; arbitrary target exhaustion still needs validation.")
  }),
  "action.channel_runes": primitiveSeed({
    id: "action.channel_runes",
    family: "action",
    name: "Channel runes",
    description: "Moves runes from a rune deck to base.",
    parameters: [
      required("player", "player", "The player who channels runes."),
      required("count", "number", "The number of runes channeled."),
      optional("entryState", "string", "Whether channeled runes enter ready or exhausted.")
    ],
    engineSupport: requiresEngineSupport("Channel effects are recurring in the corpus and need generalized card-driven execution.")
  }),
  "action.deal_damage": primitiveSeed({
    id: "action.deal_damage",
    family: "action",
    name: "Deal damage",
    description: "Marks damage on one or more units.",
    parameters: [
      required("amount", "number", "The amount of damage."),
      required("target", "target", "The damaged target.")
    ],
    engineSupport: supported("Selected as an initial executable action primitive for the new catalog pipeline.")
  }),
  "action.kill_unit": primitiveSeed({
    id: "action.kill_unit",
    family: "action",
    name: "Kill unit",
    description: "Kills a unit and moves it through the appropriate game zones.",
    parameters: [required("target", "target", "The unit to kill.")],
    engineSupport: supported("Selected as an initial executable action primitive for the new catalog pipeline.")
  }),
  "action.banish_card": primitiveSeed({
    id: "action.banish_card",
    family: "action",
    name: "Banish card",
    description: "Moves a card to banishment.",
    parameters: [required("target", "target", "The card to banish.")]
  }),
  "action.return_to_hand": primitiveSeed({
    id: "action.return_to_hand",
    family: "action",
    name: "Return to hand",
    description: "Moves a card to its owner's hand.",
    parameters: [required("target", "target", "The card to return.")]
  }),
  "action.recycle_cards": primitiveSeed({
    id: "action.recycle_cards",
    family: "action",
    name: "Recycle cards",
    description: "Moves cards to the bottom of a deck.",
    parameters: [
      required("target", "target", "The cards to recycle."),
      optional("count", "number", "The number of cards recycled.")
    ],
    engineSupport: requiresEngineSupport("Recycle effects are recurring in the corpus and need generalized card-driven execution.")
  }),
  "action.look": primitiveSeed({
    id: "action.look",
    family: "action",
    name: "Look at cards",
    description: "Lets a player look at hidden cards.",
    parameters: [optional("count", "number", "The number of cards looked at.")]
  }),
  "action.reveal": primitiveSeed({
    id: "action.reveal",
    family: "action",
    name: "Reveal cards",
    description: "Reveals hidden cards.",
    parameters: [optional("count", "number", "The number of cards revealed.")]
  }),
  "action.attach_equipment": primitiveSeed({
    id: "action.attach_equipment",
    family: "action",
    name: "Attach equipment",
    description: "Attaches equipment to a legal unit.",
    parameters: [required("target", "target", "The unit receiving the equipment.")]
  }),
  "action.detach_equipment": primitiveSeed({
    id: "action.detach_equipment",
    family: "action",
    name: "Detach equipment",
    description: "Detaches equipment from a unit.",
    parameters: [required("target", "target", "The equipment to detach.")]
  }),
  "action.play_token": primitiveSeed({
    id: "action.play_token",
    family: "action",
    name: "Play token",
    description: "Creates or plays a token.",
    parameters: [
      required("tokenName", "string", "The token to create or play."),
      required("count", "number", "The number of tokens.")
    ]
  }),
  "action.stun_card": primitiveSeed({
    id: "action.stun_card",
    family: "action",
    name: "Stun card",
    description: "Applies stun to a card.",
    parameters: [required("target", "target", "The card to stun.")]
  }),
  "modifier.modify_might": primitiveSeed({
    id: "modifier.modify_might",
    family: "modifier",
    name: "Modify Might",
    description: "Changes a unit's Might.",
    parameters: [
      required("amount", "number", "The Might delta."),
      required("target", "target", "The modified unit."),
      optional("duration", "duration", "How long the modifier lasts.", modifierDurations),
      optional("minimum", "number", "The minimum resulting Might.")
    ],
    engineSupport: supported("Selected as an initial executable modifier primitive for the new catalog pipeline.")
  }),
  "modifier.modify_cost": primitiveSeed({
    id: "modifier.modify_cost",
    family: "modifier",
    name: "Modify cost",
    description: "Changes a card or ability cost.",
    parameters: [
      required("amount", "number", "The cost delta."),
      required("costType", "resource", "The resource being modified."),
      optional("minimum", "number", "The minimum resulting cost.")
    ],
    engineSupport: partiallySupported("Cost modification is recurring in the corpus; resource and scope variants require additional validation.")
  }),
  "modifier.enter_ready": primitiveSeed({
    id: "modifier.enter_ready",
    family: "modifier",
    name: "Enter ready",
    description: "Makes a card enter ready instead of exhausted.",
    parameters: [required("target", "target", "The card that enters ready.")],
    engineSupport: partiallySupported("Entry-state changes are recurring in the corpus; target/source variants require additional validation.")
  }),
  "modifier.victory_requirement": primitiveSeed({
    id: "modifier.victory_requirement",
    family: "modifier",
    name: "Modify victory requirement",
    description: "Changes the points needed to win.",
    parameters: [required("amount", "number", "The victory requirement delta.")]
  }),
  "modifier.targeting_restriction": primitiveSeed({
    id: "modifier.targeting_restriction",
    family: "modifier",
    name: "Targeting restriction",
    description: "Changes which cards can be chosen or targeted.",
    engineSupport: requiresEngineSupport("Targeting restrictions are recurring in the corpus and need generalized legality hooks.")
  }),
  "condition.if": primitiveSeed({
    id: "condition.if",
    family: "condition",
    name: "If condition",
    description: "Applies behavior only when a condition is true.",
    engineSupport: ambiguous("The condition expression must be reviewed before implementation support can be determined.")
  }),
  "condition.while": primitiveSeed({
    id: "condition.while",
    family: "condition",
    name: "While condition",
    description: "Applies behavior while a condition is true.",
    engineSupport: ambiguous("The condition expression must be reviewed before implementation support can be determined.")
  }),
  "condition.minimum": primitiveSeed({
    id: "condition.minimum",
    family: "condition",
    name: "Minimum value condition",
    description: "Constrains a value so it cannot go below a minimum.",
    parameters: [required("minimum", "number", "The minimum allowed value.")],
    engineSupport: supported("Declared as a foundational condition primitive for the new catalog pipeline; not inherited from legacy runtime code.")
  }),
  "condition.fallback_cannot": primitiveSeed({
    id: "condition.fallback_cannot",
    family: "condition",
    name: "Fallback if cannot",
    description: "Runs fallback behavior if the primary behavior cannot be completed."
  }),
  "choice.choose_target": primitiveSeed({
    id: "choice.choose_target",
    family: "choice",
    name: "Choose target",
    description: "Prompts a player to choose one or more targets.",
    parameters: [
      required("player", "player", "The player who makes the choice."),
      optional("count", "number", "The number of targets chosen."),
      required("target", "target", "The kind of target chosen.")
    ],
    engineSupport: supported("Declared as a foundational choice primitive for the new catalog pipeline; not inherited from legacy runtime code."),
    targetingRequirements: ["chosen targets must satisfy the attached selector primitives"]
  }),
  "choice.choose_mode": primitiveSeed({
    id: "choice.choose_mode",
    family: "choice",
    name: "Choose mode",
    description: "Prompts a player to choose one available mode from a modal effect.",
    parameters: [required("player", "player", "The player who chooses the mode.")],
    engineSupport: requiresEngineSupport("Mode choice support requires explicit option modeling and per-effect memory where applicable.")
  }),
  "choice.optional": primitiveSeed({
    id: "choice.optional",
    family: "choice",
    name: "Optional choice",
    description: "Lets a player decide whether to apply an optional behavior.",
    parameters: [required("player", "player", "The player who may choose to apply the behavior.")],
    engineSupport: requiresEngineSupport("Optional effect support requires player prompts and declined-choice logging.")
  }),
  "cost.pay": primitiveSeed({
    id: "cost.pay",
    family: "cost",
    name: "Pay cost",
    description: "Requires an additional or alternate cost.",
    parameters: [
      required("amount", "number", "The cost amount."),
      required("resource", "resource", "The resource paid.")
    ],
    engineSupport: partiallySupported("Cost payment is foundational, but arbitrary additional and alternate costs need per-primitive validation.")
  }),
  "cost.exhaust_source": primitiveSeed({
    id: "cost.exhaust_source",
    family: "cost",
    name: "Exhaust source cost",
    description: "Exhausts the source as a cost.",
    engineSupport: partiallySupported("Source exhaustion is foundational, but activation context needs per-card validation.")
  }),
  "replacement.instead": primitiveSeed({
    id: "replacement.instead",
    family: "replacement",
    name: "Instead replacement",
    description: "Replaces an event or result before it happens."
  }),
  "prevention.prevent": primitiveSeed({
    id: "prevention.prevent",
    family: "prevention",
    name: "Prevent effect",
    description: "Prevents damage, movement, choice, or another event."
  })
};

export function buildPrimitiveCatalog(
  discoveredPrimitives: DiscoveredPrimitive[] = []
): PrimitiveCatalogEntry[] {
  const discoveredById = new Map(
    discoveredPrimitives.map((entry) => [entry.primitive.id, entry])
  );
  const ids = [...new Set([...Object.keys(CATALOG_SEEDS), ...discoveredById.keys()])].sort();

  return ids.map((id) => {
    const discovered = discoveredById.get(id);
    const seed = CATALOG_SEEDS[id] ?? buildFallbackSeed(discovered, id);

    return {
      ...seed,
      examples:
        discovered?.examples.map((example) => ({
          cardCode: example.cardCode,
          cardName: example.cardName,
          publicCode: example.publicCode,
          sourceText: example.sourceText
        })) ?? []
    };
  });
}

export function getPrimitiveCatalogEntry(
  primitiveId: string,
  family: PrimitiveFamily
): PrimitiveCatalogEntry {
  return {
    ...(CATALOG_SEEDS[primitiveId] ?? buildFallbackSeed(undefined, primitiveId, family)),
    examples: []
  };
}

export function validatePrimitiveAssignmentParameters(
  assignment: PrimitiveAssignment,
  entry = getPrimitiveCatalogEntry(assignment.primitiveId, assignment.family)
): PrimitiveParameterValidation {
  const missingRequired: string[] = [];
  const issues: ParameterValidationIssue[] = [];

  for (const parameter of entry.parameters) {
    const value = assignment.parameters[parameter.name];

    if (parameter.required && isMissingParameterValue(value)) {
      missingRequired.push(parameter.name);
      issues.push({
        parameterName: parameter.name,
        message: `Required parameter "${parameter.name}" is missing.`
      });
      continue;
    }

    if (!isMissingParameterValue(value) && !isParameterTypeValid(value, parameter.type)) {
      issues.push({
        parameterName: parameter.name,
        message: `Parameter "${parameter.name}" must be ${parameter.type}.`
      });
      continue;
    }

    if (
      !isMissingParameterValue(value) &&
      parameter.options &&
      !parameter.options.includes(String(value))
    ) {
      issues.push({
        parameterName: parameter.name,
        message: `Parameter "${parameter.name}" must be one of: ${parameter.options.join(", ")}.`
      });
    }
  }

  return {
    complete: missingRequired.length === 0 && issues.length === 0,
    missingRequired,
    issues
  };
}

export function combineSupportStatuses(
  statuses: EngineSupportStatus[]
): EngineSupportStatus {
  if (statuses.includes("unsupported")) {
    return "unsupported";
  }

  if (statuses.includes("ambiguous")) {
    return "ambiguous";
  }

  if (statuses.includes("requires_engine_support")) {
    return "requires_engine_support";
  }

  if (statuses.includes("partially_supported")) {
    return "partially_supported";
  }

  return "supported";
}

function primitiveSeed(input: Partial<PrimitiveCatalogSeed> & Pick<PrimitiveCatalogSeed, "id" | "family" | "name" | "description">): PrimitiveCatalogSeed {
  return {
    parameters: [],
    timingRequirements: [],
    targetingRequirements: [],
    engineSupport: requiresEngineSupport("No generalized implementation support has been declared for this primitive in the new catalog pipeline."),
    ...input
  };
}

function buildFallbackSeed(
  discovered: DiscoveredPrimitive | undefined,
  id: string,
  family: PrimitiveFamily = discovered?.primitive.family ?? inferPrimitiveFamily(id)
): PrimitiveCatalogSeed {
  return primitiveSeed({
    id,
    family,
    name: discovered?.primitive.name ?? toDisplayName(id),
    description:
      discovered?.primitive.description ??
      "Primitive discovered from card text and awaiting catalog definition.",
    parameters:
      discovered?.primitive.parameterNames.map((name) =>
        optional(name, "string", "Parameter discovered from the raw primitive detector.")
      ) ?? [],
    engineSupport: id.startsWith("keyword.")
      ? requiresEngineSupport("Keyword behavior must be reviewed and mapped to engine behavior.")
      : requiresEngineSupport("This primitive needs catalog definition and engine support review.")
  });
}

function required(
  name: string,
  type: PrimitiveParameterType,
  description: string
): PrimitiveParameterDefinition {
  return {
    name,
    type,
    required: true,
    description
  };
}

function optional(
  name: string,
  type: PrimitiveParameterType,
  description: string,
  options?: readonly string[]
): PrimitiveParameterDefinition {
  return {
    name,
    type,
    required: false,
    description,
    ...(options ? { options } : {})
  };
}

function supported(note: string): PrimitiveEngineSupport {
  return {
    status: "supported",
    note
  };
}

function partiallySupported(note: string): PrimitiveEngineSupport {
  return {
    status: "partially_supported",
    note
  };
}

function requiresEngineSupport(note: string): PrimitiveEngineSupport {
  return {
    status: "requires_engine_support",
    note
  };
}

function ambiguous(note: string): PrimitiveEngineSupport {
  return {
    status: "ambiguous",
    note
  };
}

function isMissingParameterValue(
  value: PrimitiveAssignment["parameters"][string] | undefined
): boolean {
  return value === undefined || value === null || value === "";
}

function isParameterTypeValid(
  value: PrimitiveAssignment["parameters"][string] | undefined,
  type: PrimitiveParameterType
): boolean {
  if (value === undefined || value === null) {
    return true;
  }

  switch (type) {
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "string":
    case "player":
    case "target":
    case "zone":
    case "duration":
    case "resource":
      return typeof value === "string";
  }
}

function inferPrimitiveFamily(id: string): PrimitiveFamily {
  const family = id.split(".")[0];

  if (
    family === "timing" ||
    family === "selector" ||
    family === "action" ||
    family === "modifier" ||
    family === "trigger" ||
    family === "condition" ||
    family === "choice" ||
    family === "cost" ||
    family === "replacement" ||
    family === "prevention" ||
    family === "keyword"
  ) {
    return family;
  }

  return "unsupported";
}

function toDisplayName(id: string): string {
  return id
    .split(".")
    .at(-1)!
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
