import type {
  DiscoveredPrimitive,
  PrimitiveAssignment,
  PrimitiveFamily
} from "./primitive-discovery";
import { gameZoneKinds, runeResourceTypes } from "@/shared/game";

export type PrimitiveParameterType =
  | "string"
  | "number"
  | "boolean"
  | "player"
  | "target"
  | "unitTarget"
  | "area"
  | "locationRelation"
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
  fixedRules: string[];
  listensToEvents: GameEventKind[];
  emitsEvents: GameEventKind[];
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

export const playerReferenceKinds = [
  "controller",
  "player",
  "opponent",
  "eachPlayer",
  "anyPlayer",
  "currentTurnPlayer"
] as const;

export const playEventSubjectKinds = [
  "source",
  "card",
  "unit",
  "spell",
  "gear"
] as const;

export const triggerSubjectKinds = ["source", "event_subject"] as const;

export const delayedTimingKinds = [
  "endOfThisTurn",
  "endOfPlayerTurn",
  "endOfOpponentTurn"
] as const;

export const numericComparisonValueSources = [
  "eventSubject.printedEnergyCost",
  "eventSubject.effectiveEnergyCost"
] as const;

export const numericComparisonOperators = [
  "equal",
  "notEqual",
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual"
] as const;

export const gameEventKinds = [
  "turn.awaken",
  "turn.beginning",
  "turn.channel",
  "turn.draw",
  "turn.ended",
  "card.played",
  "card.chosen",
  "card.readied",
  "card.exhausted",
  "card.drawn",
  "card.discarded",
  "card.recycled",
  "card.revealed",
  "card.banished",
  "card.returnedToHand",
  "unit.moved",
  "unit.died",
  "unit.damaged",
  "unit.stunned",
  "rune.channeled",
  "resource.added",
  "equipment.attached",
  "equipment.detached",
  "battlefield.conquered",
  "battlefield.held"
] as const;

export type GameEventKind = (typeof gameEventKinds)[number];

export const unitScopeKinds = ["any", "each", "friendly", "enemy"] as const;

export const unitTargetAreas = ["board", "base", "battlefield"] as const;

export const unitLocationRelations = [
  "any",
  "sourceLocation",
  "sharedLocation"
] as const;

export const targetReferenceKinds = [
  "card",
  "controller_spell",
  "controller_effect",
  "enemy_unit",
  "equipment",
  "event_subject",
  "friendly_unit",
  "game",
  "rune",
  "runes",
  "source",
  "unit"
] as const;

export const unitTargetReferenceKinds = [
  "unit",
  "friendly_unit",
  "enemy_unit"
] as const;

export const runeEntryStates = ["default", "exhausted"] as const;

export const costResourceTypes = ["energy", "rune"] as const;

export const resourceAmountSources = ["constant", "paidAmount"] as const;

export const resourceUsageKinds = [
  "unrestricted",
  "spellsOnly",
  "gearAndGearAbilitiesOnly"
] as const;

export const resourceDomainKinds = [
  "sourceDomain",
  "body",
  "calm",
  "chaos",
  "fury",
  "mind",
  "order",
  "rainbow"
] as const;

export const numericValueKinds = [
  "might",
  "mightBonus",
  "energyCost",
  "powerCost",
  "victoryRequirement",
  "resourceAmount"
  ,"damage"
] as const;

export const numericModifierOperations = [
  "increase",
  "reduce",
  "multiply",
  "set"
] as const;

export const behaviorDurationKinds = [
  "thisTurn",
  "whileSourceAtBattlefield",
  "whileSourceOnBoard"
] as const;

export const numericOperandKinds = [
  "constant",
  "sourceMight",
  "selectedUnitMight",
  "highestControlledUnitMight",
  "recycledUnitMight",
  "cardEnergyCost",
  "eventAmount"
] as const;

export const tokenKinds = [
  "1 :rb_might: Recruit unit",
  "2 :rb_might: Sand Soldier unit",
  "3 :rb_might: Mech unit",
  "Gold gear",
  "ready 3 :rb_might: Sprite unit"
] as const;

type PrimitiveCatalogSeed = Omit<PrimitiveCatalogEntry, "examples">;

const CATALOG_SEEDS: Record<string, PrimitiveCatalogSeed> = {
  "ability.exhaust_for_resource": primitiveSeed({
    id: "ability.exhaust_for_resource",
    family: "ability",
    name: "Exhaust for resource",
    description:
      "Exhausts the source to add Energy or domain Power to its controller's rune pool.",
    parameters: [
      required("resourceType", "resource", "The produced rune-pool resource.", runeResourceTypes),
      required("amountSource", "string", "How the produced amount is determined.", resourceAmountSources),
      optional("amount", "number", "The produced amount when amountSource is constant."),
      optional("domain", "string", "The produced Power domain.", resourceDomainKinds),
      required("usage", "string", "What the generated resource may pay for.", resourceUsageKinds)
    ],
    fixedRules: [
      "Exhausting the source is the activation cost.",
      "The ability has Reaction timing.",
      "Abilities that add resources cannot be reacted to."
    ],
    emitsEvents: ["card.exhausted", "resource.added"],
    engineSupport: requiresEngineSupport(
      "The catalog contract is reusable; generalized activated resource abilities remain future engine work."
    )
  }),
  "ability.recycle_for_power": primitiveSeed({
    id: "ability.recycle_for_power",
    family: "ability",
    name: "Recycle for Power",
    description:
      "Recycles the source to add Power of its domain to its controller's rune pool.",
    parameters: [
      required("amount", "number", "The amount of Power produced."),
      required("domain", "string", "The produced Power domain.", resourceDomainKinds),
      required("usage", "string", "What the generated Power may pay for.", resourceUsageKinds)
    ],
    fixedRules: [
      "Recycling the source is the activation cost.",
      "The ability has Reaction timing.",
      "Abilities that add resources cannot be reacted to."
    ],
    emitsEvents: ["card.recycled", "resource.added"],
    engineSupport: requiresEngineSupport(
      "The catalog contract is reusable; generalized activated resource abilities remain future engine work."
    )
  }),
  "keyword.hidden": primitiveSeed({
    id: "keyword.hidden",
    family: "keyword",
    name: "Hidden",
    description:
      "Allows a card to be hidden instead of played and later played from its Facedown Zone.",
    fixedRules: [
      "Rather than play this card, its controller may pay 1 deck-domain Power to hide it.",
      "The destination must be an empty Facedown Zone at a Battlefield controlled by that player.",
      "Hiding is not playing and does not open a chain.",
      "Beginning on the next player's turn, the hidden card gains Reaction and may be played ignoring its base cost.",
      "When played from Hidden, every choice is restricted to valid targets at the associated Battlefield.",
      "The card may still be played normally with its normal timing, cost, and targeting restrictions."
    ],
    timingRequirements: [
      "play from Hidden is available beginning on the next player's turn",
      "play from Hidden gains Reaction timing"
    ],
    targetingRequirements: [
      "when played from Hidden, choices must be at the associated Battlefield"
    ],
    engineSupport: requiresEngineSupport(
      "Hidden requires facedown-zone state, play-origin context, conditional timing, cost replacement, and inherited targeting restrictions."
    )
  }),
  "keyword.assault": primitiveSeed({
    id: "keyword.assault",
    family: "keyword",
    name: "Assault",
    description: "Increases this unit's Might while it is an attacker.",
    parameters: [
      required("amount", "number", "The Might gained while the source is an attacker.")
    ],
    fixedRules: [
      "Assault applies only while the source is an attacker.",
      "An unnumbered Assault keyword has an amount of 1."
    ],
    engineSupport: requiresEngineSupport(
      "Assault requires generalized attacker-state modifiers during showdowns."
    )
  }),
  "keyword.tank": primitiveSeed({
    id: "keyword.tank",
    family: "keyword",
    name: "Tank",
    description: "Requires this unit to be assigned combat damage first.",
    fixedRules: [
      "When assigning combat damage, Tank units must be assigned damage before non-Tank units."
    ],
    engineSupport: requiresEngineSupport(
      "Tank requires generalized combat-damage assignment priority."
    )
  }),
  "timing.action": primitiveSeed({
    id: "timing.action",
    family: "timing",
    name: "Action timing",
    description: "The card or ability can be played at action timing.",
    engineSupport: supported("Declared as a foundational timing primitive for the catalog pipeline."),
    timingRequirements: ["action phase", "showdown when allowed"]
  }),
  "timing.reaction": primitiveSeed({
    id: "timing.reaction",
    family: "timing",
    name: "Reaction timing",
    description: "The card or ability can be played while players have reaction priority.",
    engineSupport: supported("Declared as a foundational timing primitive for the catalog pipeline."),
    timingRequirements: ["open chain priority"]
  }),
  "timing.delayed": primitiveSeed({
    id: "timing.delayed",
    family: "timing",
    name: "Delayed timing",
    description: "Schedules the clause effect for a later turn boundary.",
    parameters: [
      required(
        "point",
        "string",
        "The turn boundary when the scheduled effect resolves.",
        delayedTimingKinds
      )
    ],
    engineSupport: requiresEngineSupport(
      "Delayed effects require future engine scheduling and source tracking."
    )
  }),
  "trigger.on_play": primitiveSeed({
    id: "trigger.on_play",
    family: "trigger",
    name: "On play trigger",
    description: "Creates an effect when a card is played.",
    parameters: [
      required("actor", "player", "Who played the card."),
      required(
        "subject",
        "string",
        "The kind of played card that fires the trigger.",
        playEventSubjectKinds
      )
    ],
    listensToEvents: ["card.played"],
    engineSupport: partiallySupported("Recurring corpus primitive; executable support must be validated per event source.")
  }),
  "trigger.on_move": primitiveSeed({
    id: "trigger.on_move",
    family: "trigger",
    name: "On move trigger",
    description: "Creates an effect when a unit moves.",
    parameters: [required("subject", "string", "The unit movement event that fires the trigger.", triggerSubjectKinds)],
    listensToEvents: ["unit.moved"]
  }),
  "trigger.on_death": primitiveSeed({
    id: "trigger.on_death",
    family: "trigger",
    name: "On death trigger",
    description: "Creates an effect when a unit dies.",
    parameters: [required("subject", "string", "The death event that fires the trigger.", triggerSubjectKinds)],
    listensToEvents: ["unit.died"]
  }),
  "trigger.end_of_turn": primitiveSeed({
    id: "trigger.end_of_turn",
    family: "trigger",
    name: "End of turn trigger",
    description: "Creates an effect at the end of a turn.",
    parameters: [required("player", "player", "Which player's end of turn fires the trigger.")],
    listensToEvents: ["turn.ended"]
  }),
  "trigger.conquer_battlefield": primitiveSeed({
    id: "trigger.conquer_battlefield",
    family: "trigger",
    name: "Conquer battlefield trigger",
    description: "Creates an effect when a battlefield is conquered.",
    listensToEvents: ["battlefield.conquered"]
  }),
  "trigger.hold_battlefield": primitiveSeed({
    id: "trigger.hold_battlefield",
    family: "trigger",
    name: "Hold battlefield trigger",
    description: "Creates an effect when a player holds a battlefield.",
    listensToEvents: ["battlefield.held"]
  }),
  "trigger.on_choose": primitiveSeed({
    id: "trigger.on_choose",
    family: "trigger",
    name: "Choose trigger",
    description: "Creates an effect when a card or game object is chosen.",
    parameters: [
      required("actor", "player", "Who made the choice."),
      required(
        "subject",
        "string",
        "What relationship the chosen object has to this source.",
        triggerSubjectKinds
      )
    ],
    listensToEvents: ["card.chosen"]
  }),
  "trigger.on_ready": primitiveSeed({
    id: "trigger.on_ready",
    family: "trigger",
    name: "Ready trigger",
    description: "Creates an effect when a card or game object becomes ready.",
    parameters: [
      required("actor", "player", "Who readied the object."),
      required(
        "subject",
        "string",
        "What relationship the readied object has to this source.",
        triggerSubjectKinds
      )
    ],
    listensToEvents: ["card.readied"]
  }),
  "selector.unit": primitiveSeed({
    id: "selector.unit",
    family: "selector",
    name: "Select unit",
    description: "Constrains a choice or effect to units.",
    parameters: [
      optional("scope", "string", "Whether the unit scope is any, each, friendly, or enemy.", unitScopeKinds),
      optional("minimumCount", "number", "The minimum number of units in the selection."),
      optional("maximumCount", "number", "The maximum number of units in the selection."),
      optional("maximumMight", "number", "The maximum computed Might allowed for a selected unit."),
      required("area", "area", "The board area containing legal unit targets."),
      required("locationRelation", "locationRelation", "How target locations relate to the behavior source or other targets."),
      optional("excludesSource", "boolean", "Whether the selected unit cannot be the behavior source.")
      ,optional("automatic", "boolean", "Whether the affected units are derived automatically.")
    ],
    engineSupport: supported("Declared as a foundational selector primitive for the catalog pipeline."),
    targetingRequirements: ["target must be a unit"]
  }),
  "selector.friendly_unit": primitiveSeed({
    id: "selector.friendly_unit",
    family: "selector",
    name: "Select friendly unit",
    description: "Constrains a choice or effect to units controlled by the acting player.",
    parameters: [
      optional("minimumCount", "number", "The minimum number of friendly units in the selection."),
      optional("maximumCount", "number", "The maximum number of friendly units in the selection."),
      required("area", "area", "The board area containing legal friendly unit targets."),
      required("locationRelation", "locationRelation", "How target locations relate to the behavior source or other targets."),
      optional("controller", "player", "The required controller relationship."),
      optional("excludesSource", "boolean", "Whether the selected unit cannot be the behavior source.")
    ],
    engineSupport: supported("Declared as a foundational selector primitive for the catalog pipeline."),
    targetingRequirements: ["target must be a controlled unit"]
  }),
  "selector.enemy_unit": primitiveSeed({
    id: "selector.enemy_unit",
    family: "selector",
    name: "Select enemy unit",
    description: "Constrains a choice or effect to units controlled by an opponent.",
    parameters: [
      optional("minimumCount", "number", "The minimum number of enemy units in the selection."),
      optional("maximumCount", "number", "The maximum number of enemy units in the selection."),
      required("area", "area", "The board area containing legal enemy unit targets."),
      required("locationRelation", "locationRelation", "How target locations relate to the behavior source or other targets."),
      optional("controller", "player", "The required controller relationship."),
      optional("excludesSource", "boolean", "Whether the selected unit cannot be the behavior source.")
    ],
    engineSupport: supported("Declared as a foundational selector primitive for the catalog pipeline."),
    targetingRequirements: ["target must be an opponent-controlled unit"]
  }),
  "selector.card": primitiveSeed({
    id: "selector.card",
    family: "selector",
    name: "Select card",
    description: "Selects cards from a specified owner zone.",
    parameters: [
      required("zone", "zone", "The zone containing legal cards."),
      required("cardType", "string", "The required card type.", ["any", "Spell", "Unit"]),
      required("owner", "player", "The required owner relationship."),
      required("minimumCount", "number", "The minimum selection count."),
      required("maximumCount", "number", "The maximum selection count.")
    ],
    engineSupport: requiresEngineSupport("Zone-aware selection requires stable runtime targets.")
  }),
  "selector.battlefield": primitiveSeed({
    id: "selector.battlefield",
    family: "selector",
    name: "Select battlefield",
    description: "Selects a battlefield for a location-scoped effect.",
    parameters: [
      required("minimumCount", "number", "The minimum selection count."),
      required("maximumCount", "number", "The maximum selection count.")
    ],
    engineSupport: requiresEngineSupport("Battlefield effect selection requires runtime projection support.")
  }),
  "selector.token": primitiveSeed({
    id: "selector.token",
    family: "selector",
    name: "Select token",
    description: "Constrains a behavior to a known token kind.",
    parameters: [
      required("tokenName", "string", "The token kind.", tokenKinds),
      required("controller", "player", "The token controller relationship.")
    ],
    targetingRequirements: ["target must be the selected token kind"]
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
    emitsEvents: ["card.drawn"],
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
    ],
    emitsEvents: ["card.discarded"]
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
    emitsEvents: ["unit.moved"],
    engineSupport: partiallySupported("Movement is recurring in the corpus; destination and timing variants require additional validation.")
  }),
  "action.ready_cards": primitiveSeed({
    id: "action.ready_cards",
    family: "action",
    name: "Ready cards",
    description: "Readies exhausted cards.",
    parameters: [
      required("player", "player", "The controller of the cards to ready."),
      required("target", "target", "The cards to ready."),
      optional("count", "number", "The number of cards to ready.")
    ],
    emitsEvents: ["card.readied"],
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
    emitsEvents: ["card.exhausted"],
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
      optional("entryState", "string", "Whether channeled runes use the default entry state or enter exhausted.", runeEntryStates)
    ],
    emitsEvents: ["rune.channeled"],
    engineSupport: requiresEngineSupport("Channel effects are recurring in the corpus and need generalized card-driven execution.")
  }),
  "action.add_rune_resource": primitiveSeed({
    id: "action.add_rune_resource",
    family: "action",
    name: "Add rune resource",
    description: "Adds Energy or Power from a rune to the player's rune pool.",
    parameters: [
      required("player", "player", "The player who receives the rune-pool resource."),
      required("resourceType", "resource", "The rune-pool resource produced.", runeResourceTypes),
      required("amount", "number", "The amount of resource produced."),
      optional("source", "target", "The rune card producing the resource.")
    ],
    emitsEvents: ["resource.added"],
    engineSupport: supported("The current engine exposes rune resource actions for Energy and Power.")
  }),
  "action.deal_damage": primitiveSeed({
    id: "action.deal_damage",
    family: "action",
    name: "Deal damage",
    description: "Marks damage on one or more units.",
    parameters: [
      required("amount", "number", "The amount of damage."),
      required(
        "target",
        "unitTarget",
        "The unit receiving damage.",
        unitTargetReferenceKinds
      )
    ],
    emitsEvents: ["unit.damaged"],
    engineSupport: supported("Selected as an initial executable action primitive for the new catalog pipeline.")
  }),
  "action.kill_unit": primitiveSeed({
    id: "action.kill_unit",
    family: "action",
    name: "Kill unit",
    description: "Kills a unit and moves it through the appropriate game zones.",
    parameters: [required("target", "target", "The unit to kill.")],
    emitsEvents: ["unit.died"],
    engineSupport: supported("Selected as an initial executable action primitive for the new catalog pipeline.")
  }),
  "action.banish_card": primitiveSeed({
    id: "action.banish_card",
    family: "action",
    name: "Banish card",
    description: "Moves a card to banishment.",
    parameters: [required("target", "target", "The card to banish.")],
    emitsEvents: ["card.banished"]
  }),
  "action.return_to_hand": primitiveSeed({
    id: "action.return_to_hand",
    family: "action",
    name: "Return to hand",
    description: "Moves a card to its owner's hand.",
    parameters: [required("target", "target", "The card to return.")],
    emitsEvents: ["card.returnedToHand"]
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
    emitsEvents: ["card.recycled"],
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
    parameters: [optional("count", "number", "The number of cards revealed.")],
    emitsEvents: ["card.revealed"]
  }),
  "action.attach_equipment": primitiveSeed({
    id: "action.attach_equipment",
    family: "action",
    name: "Attach equipment",
    description: "Attaches equipment to a legal unit.",
    parameters: [required("target", "target", "The unit receiving the equipment.")],
    emitsEvents: ["equipment.attached"]
  }),
  "action.detach_equipment": primitiveSeed({
    id: "action.detach_equipment",
    family: "action",
    name: "Detach equipment",
    description: "Detaches equipment from a unit.",
    parameters: [required("target", "target", "The equipment to detach.")],
    emitsEvents: ["equipment.detached"]
  }),
  "action.play_token": primitiveSeed({
    id: "action.play_token",
    family: "action",
    name: "Play token",
    description: "Creates or plays a token.",
    parameters: [
      required("tokenName", "string", "The token to create or play.", tokenKinds),
      required("count", "number", "The number of tokens.")
    ],
    emitsEvents: ["card.played"]
  }),
  "action.stun_card": primitiveSeed({
    id: "action.stun_card",
    family: "action",
    name: "Stun card",
    description: "Applies stun to a card.",
    parameters: [required("target", "target", "The card to stun.")],
    emitsEvents: ["unit.stunned"]
  }),
  "modifier.modify_numeric_value": primitiveSeed({
    id: "modifier.modify_numeric_value",
    family: "modifier",
    name: "Modify numeric value",
    description:
      "Adds a typed operation to the modifier chain for a numeric game or card value.",
    parameters: [
      required(
        "attribute",
        "string",
        "The numeric value being modified.",
        numericValueKinds
      ),
      required(
        "operation",
        "string",
        "How the modifier changes the base or current value.",
        numericModifierOperations
      ),
      required(
        "operand",
        "string",
        "Where the operation value comes from.",
        numericOperandKinds
      ),
      optional("amount", "number", "The constant operand when operand is constant."),
      required("target", "target", "The object or game value being modified."),
      optional(
        "duration",
        "duration",
        "How long the modifier lasts.",
        behaviorDurationKinds
      ),
      optional("minimum", "number", "The minimum resulting value.")
    ],
    fixedRules: [
      "Every numeric game or card value starts from its printed or rules-defined base value.",
      "Active numeric modifiers are applied by the future engine as an ordered modifier chain.",
      "A set operation replaces the value at its rules-defined chain position; multiply, increase, and reduce operations then use their own rules-defined ordering.",
      "Minimum is a floor on the result of this modifier and is not a separate condition."
    ],
    engineSupport: requiresEngineSupport(
      "The catalog defines the modifier contract; ordered runtime evaluation remains future engine work."
    )
  }),
  "modifier.enter_ready": primitiveSeed({
    id: "modifier.enter_ready",
    family: "modifier",
    name: "Enter ready",
    description: "Makes a card enter ready instead of exhausted.",
    parameters: [required("target", "target", "The card that enters ready.")],
    engineSupport: partiallySupported("Entry-state changes are recurring in the corpus; target/source variants require additional validation.")
  }),
  "modifier.targeting_restriction": primitiveSeed({
    id: "modifier.targeting_restriction",
    family: "modifier",
    name: "Targeting restriction",
    description: "Changes which cards can be chosen or targeted.",
    engineSupport: requiresEngineSupport("Targeting restrictions are recurring in the corpus and need generalized legality hooks.")
  }),
  "modifier.play_unit_destination": primitiveSeed({
    id: "modifier.play_unit_destination",
    family: "modifier",
    name: "Play unit destination",
    description: "Adds a card-driven legal destination for playing a unit.",
    parameters: [
      required("destination", "string", "The additional destination kind.", ["openBattlefield"])
    ],
    engineSupport: requiresEngineSupport("Unit destination permissions require a generalized legality policy.")
  }),
  "condition.if": primitiveSeed({
    id: "condition.if",
    family: "condition",
    name: "If condition",
    description: "Applies behavior only when a condition is true.",
    engineSupport: ambiguous("The condition expression must be reviewed before implementation support can be determined.")
  }),
  "condition.compare_numeric_value": primitiveSeed({
    id: "condition.compare_numeric_value",
    family: "condition",
    name: "Compare numeric value",
    description: "Guards a clause by comparing a numeric event or game value.",
    parameters: [
      required(
        "valueSource",
        "string",
        "The numeric value evaluated when the clause trigger fires.",
        numericComparisonValueSources
      ),
      required(
        "operator",
        "string",
        "The comparison applied to the resolved value.",
        numericComparisonOperators
      ),
      required("comparisonValue", "number", "The constant value used by the comparison.")
    ],
    fixedRules: [
      "The comparison is evaluated after the clause trigger fires and before its effects resolve.",
      "A false comparison prevents the other behavior assignments in the same clause from resolving.",
      "Printed Energy cost is the card's Energy characteristic and is used by 'costs N or more' rules. The effective Energy cost source remains accepted for compatibility with existing behavior snapshots."
    ],
    engineSupport: requiresEngineSupport(
      "The catalog defines typed numeric clause guards; generalized runtime condition evaluation remains future engine work."
    )
  }),
  "condition.effect_killed_target": primitiveSeed({
    id: "condition.effect_killed_target",
    family: "condition",
    name: "Effect killed target",
    description: "Checks whether a related damage effect killed its target.",
    parameters: [
      required("effectRelation", "string", "The related effect result.", ["previousClause"])
    ],
    engineSupport: requiresEngineSupport("Effect outcomes must be retained by the resolution frame.")
  }),
  "condition.while": primitiveSeed({
    id: "condition.while",
    family: "condition",
    name: "While condition",
    description: "Applies behavior while a condition is true.",
    engineSupport: ambiguous("The condition expression must be reviewed before implementation support can be determined.")
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
      required("player", "player", "The player who makes the choice.")
    ],
    engineSupport: supported("Declared as a foundational choice primitive for the catalog pipeline."),
    targetingRequirements: [
      "candidate legality and count bounds come from selector primitives in the same behavior clause"
    ]
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
  "keyword.vision": primitiveSeed({
    id: "keyword.vision",
    family: "keyword",
    name: "Vision",
    description: "Looks at the top Main Deck card on play and may recycle it.",
    engineSupport: requiresEngineSupport("Vision requires a private optional effect selection.")
  }),
  "keyword.deflect": primitiveSeed({
    id: "keyword.deflect",
    family: "keyword",
    name: "Deflect",
    description: "Adds an any-domain Power cost when an opponent chooses this object.",
    parameters: [
      required("amount", "number", "The Deflect value.")
    ],
    engineSupport: requiresEngineSupport("Deflect requires target-derived additional payment.")
  }),
  "cost.pay": primitiveSeed({
    id: "cost.pay",
    family: "cost",
    name: "Pay cost",
    description: "Requires an additional or alternate cost.",
    parameters: [
      required("amount", "number", "The cost amount."),
      required("resource", "resource", "The resource paid.", costResourceTypes)
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

  if (entry.id.startsWith("selector.") && entry.id.endsWith("unit")) {
    validateSelectorCountBounds(assignment, issues);
  }

  if (entry.id === "modifier.modify_numeric_value") {
    validateNumericModifier(assignment, issues);
  }

  if (entry.id === "ability.exhaust_for_resource") {
    validateExhaustForResource(assignment, issues);
  }

  return {
    complete: missingRequired.length === 0 && issues.length === 0,
    missingRequired,
    issues
  };
}

function validateExhaustForResource(
  assignment: PrimitiveAssignment,
  issues: ParameterValidationIssue[]
): void {
  const resourceType = assignment.parameters.resourceType;
  const amountSource = assignment.parameters.amountSource;
  const amount = assignment.parameters.amount;
  const domain = assignment.parameters.domain;

  if (amountSource === "constant" && typeof amount !== "number") {
    issues.push({
      parameterName: "amount",
      message: 'Parameter "amount" is required for a constant amount source.'
    });
  }

  if (resourceType === "power" && typeof domain !== "string") {
    issues.push({
      parameterName: "domain",
      message: 'Parameter "domain" is required when producing Power.'
    });
  }
}

function validateNumericModifier(
  assignment: PrimitiveAssignment,
  issues: ParameterValidationIssue[]
): void {
  const operand = assignment.parameters.operand;
  const amount = assignment.parameters.amount;

  if (operand === "constant" && typeof amount !== "number") {
    issues.push({
      parameterName: "amount",
      message: 'Parameter "amount" is required for a constant operand.'
    });
  }

  if (typeof amount === "number" && amount < 0) {
    issues.push({
      parameterName: "amount",
      message: 'Parameter "amount" cannot be negative; use the reduce operation.'
    });
  }
}

function validateSelectorCountBounds(
  assignment: PrimitiveAssignment,
  issues: ParameterValidationIssue[]
): void {
  const minimumCount = assignment.parameters.minimumCount;
  const maximumCount = assignment.parameters.maximumCount;

  if (typeof minimumCount === "number" && minimumCount < 0) {
    issues.push({
      parameterName: "minimumCount",
      message: 'Parameter "minimumCount" cannot be negative.'
    });
  }

  if (typeof maximumCount === "number" && maximumCount < 0) {
    issues.push({
      parameterName: "maximumCount",
      message: 'Parameter "maximumCount" cannot be negative.'
    });
  }

  if (
    typeof minimumCount === "number" &&
    typeof maximumCount === "number" &&
    minimumCount > maximumCount
  ) {
    issues.push({
      parameterName: "maximumCount",
      message: 'Parameter "maximumCount" cannot be less than "minimumCount".'
    });
  }
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
    fixedRules: [],
    listensToEvents: [],
    emitsEvents: [],
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
    parameters: buildFallbackParameters(discovered),
    engineSupport: id.startsWith("keyword.")
      ? requiresEngineSupport("Keyword behavior must be reviewed and mapped to engine behavior.")
      : requiresEngineSupport("This primitive needs catalog definition and engine support review.")
  });
}

function buildFallbackParameters(
  discovered: DiscoveredPrimitive | undefined
): PrimitiveParameterDefinition[] {
  return (
    discovered?.primitive.parameterNames.map((name) =>
      optional(
        name,
        "string",
        "Parameter discovered from the raw primitive detector.",
        exactDiscoveredStringOptions(discovered, name)
      )
    ) ?? []
  );
}

function exactDiscoveredStringOptions(
  discovered: DiscoveredPrimitive,
  parameterName: string
): readonly string[] | undefined {
  const values = [
    ...new Set(
      discovered.examples
        .map((example) => example.parameters[parameterName])
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  ].sort();

  return values.length > 0 ? values : undefined;
}

function required(
  name: string,
  type: PrimitiveParameterType,
  description: string,
  options?: readonly string[]
): PrimitiveParameterDefinition {
  return {
    name,
    type,
    required: true,
    description,
    ...parameterOptions(type, options)
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
    ...parameterOptions(type, options)
  };
}

function parameterOptions(
  type: PrimitiveParameterType,
  options: readonly string[] | undefined
): Pick<PrimitiveParameterDefinition, "options"> {
  if (options) {
    return { options };
  }

  if (type === "player") {
    return { options: playerReferenceKinds };
  }

  if (type === "target") {
    return { options: targetReferenceKinds };
  }

  if (type === "unitTarget") {
    return { options: unitTargetReferenceKinds };
  }

  if (type === "area") {
    return { options: unitTargetAreas };
  }

  if (type === "locationRelation") {
    return { options: unitLocationRelations };
  }

  if (type === "zone") {
    return { options: gameZoneKinds };
  }

  if (type === "duration") {
    return { options: behaviorDurationKinds };
  }

  return {};
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
    case "unitTarget":
    case "area":
    case "locationRelation":
    case "zone":
    case "duration":
    case "resource":
      return typeof value === "string";
  }
}

function inferPrimitiveFamily(id: string): PrimitiveFamily {
  const family = id.split(".")[0];

  if (
    family === "ability" ||
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
