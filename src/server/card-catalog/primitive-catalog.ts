import type {
  DiscoveredPrimitive,
  PrimitiveAssignment,
  PrimitiveFamily
} from "./primitive-discovery";
import { gameZoneKinds, runeResourceTypes } from "@/shared/game";
import { getRuntimeCoverageStatus } from "@/server/game/runtime-coverage";

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
  "currentTurnPlayer",
  "selectedCardOwner"
] as const;

export const playEventSubjectKinds = [
  "source",
  "card",
  "unit",
  "spell",
  "gear"
] as const;

export const triggerSubjectKinds = [
  "source",
  "event_subject",
  "friendly_unit",
  "another_friendly_unit",
  "enemy_unit",
] as const;

export const delayedTimingKinds = [
  "endOfThisTurn",
  "endOfPlayerTurn",
  "endOfOpponentTurn"
] as const;

export const numericComparisonValueSources = [
  "eventSubject.printedEnergyCost",
  "eventSubject.effectiveEnergyCost",
  "controller.boardRuneCount"
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
  "card.addedToHand",
  "card.revealed",
  "card.banished",
  "card.returnedToHand",
  "unit.attacks",
  "unit.defends",
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

export const selectionPlayerKinds = ["controller", "opponent"] as const;

export const unitTargetAreas = ["board", "base", "battlefield", "combat"] as const;

export const unitLocationRelations = [
  "any",
  "sourceLocation",
  "sourceBattlefield",
  "selectedTargetLocation",
  "sharedLocation",
  "currentCombat",
  "eventBattlefield"
] as const;

export const targetReferenceKinds = [
  "card",
  "controller_spell",
  "controller_effect",
  "controller_units",
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
  "thisCombat",
  "untilLeavesPlay",
  "whileSourceAtBattlefield",
  "whileSourceOnBoard"
] as const;

export const numericOperandKinds = [
  "constant",
  "controllerTrashCount",
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
  "ability.activate": primitiveSeed({
    id: "ability.activate",
    family: "ability",
    name: "Activated ability",
    description:
      "Declares a non-resource activated ability whose selected modes and targets resolve from its clause effects.",
    fixedRules: [
      "Modes and targets are chosen before the ability is finalized and put on the Chain.",
      "The ability's clause costs are paid only after all required declaration choices are made.",
    ],
    engineSupport: supported("Uses the shared activated-ability declaration and resolution flow."),
  }),
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
  "modifier.facedown_capacity": primitiveSeed({
    id: "modifier.facedown_capacity",
    family: "modifier",
    name: "Facedown capacity",
    description: "Increases the number of cards that may occupy this battlefield's facedown zone.",
    parameters: [
      required("amount", "number", "The number of additional facedown cards allowed."),
    ],
    fixedRules: [
      "The default facedown capacity is one.",
      "This modifier applies to the battlefield containing its source.",
    ],
    engineSupport: supported("The game evaluates facedown capacity from battlefield behavior bindings."),
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
  "keyword.shield": primitiveSeed({
    id: "keyword.shield",
    family: "keyword",
    name: "Shield",
    description: "Increases this unit's Might while it is a defender.",
    parameters: [
      required("amount", "number", "The Might gained while the source is a defender.")
    ],
    fixedRules: [
      "Shield applies only while the source is a defender.",
      "An unnumbered Shield keyword has an amount of 1."
    ],
    engineSupport: requiresEngineSupport(
      "Shield requires generalized defender-state modifiers during showdowns."
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
    parameters: [
      required("subject", "string", "The unit movement event that fires the trigger.", triggerSubjectKinds),
      optional("destination", "string", "Optional movement destination filter.", [
        "battlefield",
        "base"
      ])
    ],
    listensToEvents: ["unit.moved"]
  }),
  "trigger.attack": primitiveSeed({
    id: "trigger.attack",
    family: "trigger",
    name: "Attack trigger",
    description: "Creates an effect when the source attacks.",
    listensToEvents: ["unit.attacks"]
  }),
  "trigger.defend": primitiveSeed({
    id: "trigger.defend",
    family: "trigger",
    name: "Defend trigger",
    description: "Creates an effect when the source defends.",
    listensToEvents: ["unit.defends"]
  }),
  "ability.play_token": primitiveSeed({
    id: "ability.play_token",
    family: "ability",
    name: "Activate to play token",
    description: "Activates a permanent ability that creates a fixed number of tokens.",
    parameters: [
      required("tokenCardCode", "string", "The canonical source card code for the token."),
      optional("tokenName", "string", "The player-facing token name.", tokenKinds),
      required("count", "number", "The number of tokens."),
      optional("placement", "string", "How the token destination is chosen.", [
        "sourceLocation",
        "base",
        "chooseBaseOrControlledBattlefield"
      ])
    ],
    engineSupport: supported("Activated token creation uses the same shared token placement runtime as other token effects.")
  }),
  "trigger.defend_at_source_battlefield": primitiveSeed({
    id: "trigger.defend_at_source_battlefield",
    family: "trigger",
    name: "Defend at source battlefield trigger",
    description: "Creates an effect when a unit defends at the source battlefield.",
    listensToEvents: ["unit.defends"],
    engineSupport: supported("Matches the defender event's battlefield against the source battlefield."),
  }),
  "trigger.on_death": primitiveSeed({
    id: "trigger.on_death",
    family: "trigger",
    name: "On death trigger",
    description: "Creates an effect when a unit dies.",
    parameters: [required("subject", "string", "The death event that fires the trigger.", triggerSubjectKinds)],
    listensToEvents: ["unit.died"],
    engineSupport: supported("Own-death triggers are queued after the unit leaves play.")
  }),
  "trigger.on_damage": primitiveSeed({
    id: "trigger.on_damage",
    family: "trigger",
    name: "Damage trigger",
    description: "Creates an effect when a Unit takes damage.",
    parameters: [
      required("subject", "string", "The damaged Unit relationship that fires the trigger.", ["any_unit", "source", "friendly_unit", "enemy_unit"]),
    ],
    listensToEvents: ["unit.damaged"],
    engineSupport: supported("Matches the shared Unit-damage event."),
  }),
  "trigger.event": primitiveSeed({
    id: "trigger.event",
    family: "trigger",
    name: "Typed event trigger",
    description: "Creates an effect when a matching typed card or unit event occurs.",
    parameters: [
      required("eventType", "string", "The event that fires the trigger.", gameEventKinds),
      required("subject", "string", "The event subject relationship.", ["source", "friendly_card", "enemy_card", "friendly_unit", "enemy_unit", "any_unit"]),
    ],
    listensToEvents: ["card.discarded", "card.readied", "card.recycled", "unit.stunned"],
    engineSupport: supported("Matches shared queued game events against source and controller relationships."),
  }),
  "trigger.second_card_played": primitiveSeed({
    id: "trigger.second_card_played",
    family: "trigger",
    name: "Second card played trigger",
    description: "Creates an effect when its controller plays their second Main Deck card in a turn.",
    listensToEvents: ["card.played"],
    engineSupport: supported("The shared turn state records Main Deck cards played by each controller."),
  }),
  "keyword.accelerate": primitiveSeed({
    id: "keyword.accelerate",
    family: "keyword",
    name: "Accelerate",
    description: "Allows a Unit to enter ready by paying 1 Energy and 1 Power of its domain as an optional additional cost.",
    engineSupport: supported("A separate play action pays the additional domain cost and sets the entry state directly to ready."),
  }),
  "keyword.legion": primitiveSeed({
    id: "keyword.legion",
    family: "keyword",
    name: "Legion",
    description: "Applies its clause only after the controller has played another Main Deck card this turn.",
    engineSupport: supported("The turn state records prior Main Deck cards and locks the condition at play time."),
  }),
  "trigger.end_of_turn": primitiveSeed({
    id: "trigger.end_of_turn",
    family: "trigger",
    name: "End of turn trigger",
    description: "Creates an effect at the end of a turn.",
    parameters: [required("player", "player", "Which player's end of turn fires the trigger.")],
    listensToEvents: ["turn.ended"]
  }),
  "trigger.beginning": primitiveSeed({
    id: "trigger.beginning", family: "trigger", name: "Beginning Phase trigger",
    description: "Creates an effect at the start of a player's Beginning Phase.",
    parameters: [required("player", "player", "Which player's Beginning Phase fires the trigger.")],
    listensToEvents: ["turn.beginning"],
    engineSupport: supported("Beginning triggers are dispatched before scoring."),
  }),
  "trigger.first_beginning": primitiveSeed({
    id: "trigger.first_beginning", family: "trigger", name: "First Beginning Phase trigger",
    description: "Creates an effect at the start of each player's first Beginning Phase.",
    listensToEvents: ["turn.beginning"],
    engineSupport: supported("Tracks whether each player has begun a turn in the current game."),
  }),
  "trigger.conquer_battlefield": primitiveSeed({
    id: "trigger.conquer_battlefield",
    family: "trigger",
    name: "Conquer battlefield trigger",
    description: "Creates an effect when a battlefield is conquered.",
    listensToEvents: ["battlefield.conquered"]
  }),
  "trigger.conquer": primitiveSeed({
    id: "trigger.conquer",
    family: "trigger",
    name: "Conquer trigger",
    description:
      "Creates an effect when the controller conquers any battlefield.",
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
      ,optional("deferred", "boolean", "Whether selection is made during effect resolution rather than while playing the card.")
      ,optional("readyOnly", "boolean", "Whether only ready units are legal.")
      ,optional("buffedOnly", "boolean", "Whether only units with a Buff are legal.")
      ,optional("selectionKey", "string", "Stable key used to route this selection.")
      ,optional("referenceSelectionKey", "string", "Earlier selector whose location constrains this target.")
      ,optional("selectionPlayer", "player", "Player who makes this selection.", selectionPlayerKinds)
      ,optional("selectionPurpose", "string", "Selection purpose.", ["target", "optionalCost"])
      ,optional("requiresChoiceKey", "string", "Choice key that enables this selector.")
      ,optional("requiresChoiceValue", "string", "Chosen value required to enable this selector.")
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
      optional("excludesSource", "boolean", "Whether the selected unit cannot be the behavior source."),
      optional("automatic", "boolean", "Whether affected units are derived automatically."),
      optional("deferred", "boolean", "Whether selection is made during effect resolution rather than while playing the card."),
      optional("readyOnly", "boolean", "Whether only ready units are legal."),
      optional("buffedOnly", "boolean", "Whether only units with a Buff are legal."),
      optional("selectionKey", "string", "Stable key used to route this selection."),
      optional("referenceSelectionKey", "string", "Earlier selector whose location constrains this target."),
      optional("selectionPlayer", "player", "Player who makes this selection.", selectionPlayerKinds),
      optional("selectionPurpose", "string", "Selection purpose.", ["target", "optionalCost"]),
      optional("requiresChoiceKey", "string", "Choice key that enables this selector."),
      optional("requiresChoiceValue", "string", "Chosen value required to enable this selector.")
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
      optional("excludesSource", "boolean", "Whether the selected unit cannot be the behavior source."),
      optional("automatic", "boolean", "Whether affected units are derived automatically."),
      optional("deferred", "boolean", "Whether selection is made during effect resolution rather than while playing the card."),
      optional("buffedOnly", "boolean", "Whether only units with a Buff are legal."),
      optional("selectionKey", "string", "Stable key used to route this selection."),
      optional("referenceSelectionKey", "string", "Earlier selector whose location constrains this target."),
      optional("selectionPlayer", "player", "Player who makes this selection.", selectionPlayerKinds)
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
      required("cardType", "string", "The required card type.", ["any", "Spell", "Unit", "nonUnit"]),
      required("owner", "player", "The required owner relationship."),
      required("minimumCount", "number", "The minimum selection count."),
      required("maximumCount", "number", "The maximum selection count."),
      optional("maximumEnergy", "number", "Maximum printed Energy cost for legal cards."),
      optional("maximumPower", "number", "Maximum printed Power cost for legal cards."),
      optional("requiresPayablePowerCost", "boolean", "Whether only cards whose base Power cost can currently be paid are legal."),
      optional("selectionKey", "string", "Stable key used to route this selection."),
      optional("deferred", "boolean", "Whether selection is made during effect resolution rather than while playing the card."),
      optional("revealZone", "boolean", "Whether the selected owner zone is publicly revealed when this selection is made."),
      optional("requireMaximumAvailable", "boolean", "Requires selecting as many cards as possible, up to maximumCount.")
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
  "selector.gear": primitiveSeed({
    id: "selector.gear",
    family: "selector",
    name: "Select gear",
    description: "Selects Gear on the board.",
    parameters: [
      required("minimumCount", "number", "The minimum selection count."),
      required("maximumCount", "number", "The maximum selection count."),
      optional("selectionKey", "string", "Stable key used by later effects."),
      optional("requiresChoiceKey", "string", "Choice key that enables this selector."),
      optional("requiresChoiceValue", "string", "Chosen value required to enable this selector.")
    ],
    targetingRequirements: ["target must be Gear on the board"],
    engineSupport: supported("Enumerates Gear in each player's Base.")
  }),
  "action.draw_cards": primitiveSeed({
    id: "action.draw_cards",
    family: "action",
    name: "Draw cards",
    description: "Moves cards from a player's main deck to hand.",
    parameters: [
      required("player", "player", "The player who draws cards."),
      required("count", "number", "The number of cards drawn."),
      optional("selectionKey", "string", "Selected cards whose owner determines the drawing player."),
      optional("requiresChoiceKey", "string", "Choice key that enables this effect."),
      optional("requiresChoiceValue", "string", "Chosen value required to enable this effect.")
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
      required("count", "number", "The number of cards discarded."),
      optional("selectionKey", "string", "A previously selected card group to discard.")
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
      optional("count", "number", "The number of cards to ready."),
      optional("requiresChoiceKey", "string", "Choice key that enables this effect."),
      optional("requiresChoiceValue", "string", "Chosen value required to enable this effect."),
    ],
    emitsEvents: ["card.readied"],
    engineSupport: supported("Selected readyable cards become ready and emit card.readied events.")
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
    engineSupport: supported("Selected ready cards become exhausted and emit card.exhausted events.")
  }),
  "action.channel_runes": primitiveSeed({
    id: "action.channel_runes",
    family: "action",
    name: "Channel runes",
    description: "Moves runes from a rune deck to base.",
    parameters: [
      required("player", "player", "The player who channels runes."),
      required("count", "number", "The number of runes channeled."),
      optional("entryState", "string", "Whether channeled runes use the default entry state or enter exhausted.", runeEntryStates),
      optional("requiresChoiceKey", "string", "Choice key that enables this effect."),
      optional("requiresChoiceValue", "string", "Chosen value required to enable this effect."),
    ],
    emitsEvents: ["rune.channeled"],
    engineSupport: supported("The shared action handler channels the requested runes and applies their declared entry state.")
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
      ),
      optional("selectionKey", "string", "Selector key supplying affected units.")
      ,optional("requiresChoiceKey", "string", "Choice key that enables this effect.")
      ,optional("requiresChoiceValue", "string", "Chosen value required to enable this effect.")
    ],
    emitsEvents: ["unit.damaged"],
    engineSupport: supported("Selected as an initial executable action primitive for the new catalog pipeline.")
  }),
  "action.draw_by_optional_cost": primitiveSeed({
    id: "action.draw_by_optional_cost",
    family: "action",
    name: "Draw by optional cost",
    description: "Draws one of two amounts depending on whether an optional cost selection was paid.",
    parameters: [
      required("selectionKey", "string", "Optional-cost selector key."),
      required("paidCount", "number", "Cards drawn when paid."),
      required("unpaidCount", "number", "Cards drawn when declined.")
    ],
    engineSupport: supported("Resolved from the locked optional-cost selection.")
  }),
  "action.channel_or_draw": primitiveSeed({
    id: "action.channel_or_draw",
    family: "action",
    name: "Channel or draw",
    description: "Channels runes and draws only when none can be channeled.",
    parameters: [
      required("channelCount", "number", "Runes to channel."),
      required("entryState", "string", "Rune entry state.", runeEntryStates),
      required("fallbackDrawCount", "number", "Fallback cards drawn.")
    ],
    engineSupport: supported("The runtime records whether channeling completed.")
  }),
  "action.fight": primitiveSeed({
    id: "action.fight",
    family: "action",
    name: "Fight",
    description: "Two selected units simultaneously deal damage equal to their current Might to each other.",
    parameters: [
      required("firstUnitSelectionKey", "string", "Selector key for the first fighting unit."),
      required("secondUnitSelectionKey", "string", "Selector key for the second fighting unit.")
    ],
    fixedRules: [
      "Each fighting unit uses its current Might after applicable modifiers.",
      "Both units mark their damage simultaneously.",
      "Lethal processing occurs only after both units have marked damage."
    ],
    engineSupport: supported("Both damage amounts are snapshotted and marked before lethal processing.")
  }),
  "action.kill_unit": primitiveSeed({
    id: "action.kill_unit",
    family: "action",
    name: "Kill unit",
    description: "Kills a unit and moves it through the appropriate game zones.",
    parameters: [
      required("target", "target", "The unit to kill."),
      optional("selectionKey", "string", "Selector key supplying the units to kill.")
    ],
    emitsEvents: ["unit.died"],
    engineSupport: supported("Selected as an initial executable action primitive for the new catalog pipeline.")
  }),
  "action.kill_permanent": primitiveSeed({
    id: "action.kill_permanent",
    family: "action",
    name: "Kill permanent",
    description: "Kills selected permanent cards and moves them to their owner's Trash.",
    parameters: [
      optional("selectionKey", "string", "Selector key supplying the permanents to kill."),
      optional("requiresChoiceKey", "string", "Choice key that enables this effect."),
      optional("requiresChoiceValue", "string", "Chosen value required to enable this effect."),
    ],
    engineSupport: supported("Uses the shared board-to-Trash transition for non-Unit permanents.")
  }),
  "action.buff_unit": primitiveSeed({
    id: "action.buff_unit",
    family: "action",
    name: "Buff unit",
    description: "Places a Buff counter on a Unit that does not already have one.",
    parameters: [
      required("target", "target", "The Unit receiving the Buff."),
      optional("selectionKey", "string", "Selector key supplying the Unit."),
      optional("requiresChoiceKey", "string", "Choice key that enables this effect."),
      optional("requiresChoiceValue", "string", "Chosen value required to enable this effect.")
    ],
    fixedRules: [
      "A Unit can have at most one Buff counter.",
      "A Buff counter contributes +1 Might while the Unit remains on the board."
    ],
    engineSupport: supported("Buff state is tracked on the Unit and cleared when it leaves the board.")
  }),
  "trigger.conquer_source": primitiveSeed({
    id: "trigger.conquer_source",
    family: "trigger",
    name: "Source conquer trigger",
    description: "Creates an effect when the source unit is present at a battlefield its controller conquers.",
    listensToEvents: ["battlefield.conquered"],
    engineSupport: supported("The conquer event is matched against the source unit's current battlefield."),
  }),
  "keyword.temporary": primitiveSeed({
    id: "keyword.temporary", family: "keyword", name: "Temporary",
    description: "Kills the permanent at the start of its controller's Beginning Phase before scoring.",
    engineSupport: supported("Temporary is represented by its Beginning-Phase trigger model."),
  }),
  "action.banish_card": primitiveSeed({
    id: "action.banish_card",
    family: "action",
    name: "Banish card",
    description: "Moves a card to banishment.",
    parameters: [required("target", "target", "The card to banish.")],
    emitsEvents: ["card.banished"],
    engineSupport: supported("Selected cards move to their owner's Banishment.")
  }),
  "action.take_extra_turn": primitiveSeed({
    id: "action.take_extra_turn",
    family: "action",
    name: "Take extra turn",
    description: "Queues the controller to take the next turn after the current turn ends.",
    engineSupport: supported("Extra turns are stored in the shared turn queue."),
  }),
  "action.gain_points": primitiveSeed({
    id: "action.gain_points", family: "action", name: "Gain points",
    description: "Awards points to the current turn player.",
    emitsEvents: [],
    engineSupport: supported("Updates points and checks the current victory requirement."),
  }),
  "action.return_to_hand": primitiveSeed({
    id: "action.return_to_hand",
    family: "action",
    name: "Return to hand",
    description: "Moves a card to its owner's hand.",
    parameters: [required("target", "target", "The card to return.")],
    emitsEvents: ["card.returnedToHand"]
  }),
  "action.take_to_hand": primitiveSeed({
    id: "action.take_to_hand",
    family: "action",
    name: "Take looked-at card to hand",
    description: "Moves a chosen card from a private looked-at group into its controller's hand.",
    parameters: [
      required("sourceSelectionKey", "string", "The key containing the privately looked-at cards."),
      required("count", "number", "The number of looked-at cards to take."),
      optional("selectionKey", "string", "The key storing the chosen cards.")
    ],
    emitsEvents: ["card.addedToHand"],
    engineSupport: supported("The controller chooses only from the original looked-at cards, and selected cards leave the Main Deck for hand.")
  }),
  "action.recycle_cards": primitiveSeed({
    id: "action.recycle_cards",
    family: "action",
    name: "Recycle cards",
    description: "Moves cards to the bottom of a deck.",
    parameters: [
      required("target", "target", "The cards to recycle."),
      optional("count", "number", "The number of cards recycled."),
      optional("selectionKey", "string", "A previously selected card group to recycle.")
    ],
    emitsEvents: ["card.recycled"],
    engineSupport: supported("Selected cards return to the bottom of their corresponding deck.")
  }),
  "action.look": primitiveSeed({
    id: "action.look",
    family: "action",
    name: "Look at cards",
    description: "Lets a player look at hidden cards.",
    parameters: [
      optional("count", "number", "The number of cards looked at."),
      optional("selectionKey", "string", "Stable key that preserves the looked-at cards for later effects."),
    ],
    engineSupport: supported("The controller receives a private top-deck inspection choice without moving the cards.")
  }),
  "action.vision": primitiveSeed({
    id: "action.vision",
    family: "action",
    name: "Resolve Vision",
    description: "Privately looks at the top Main Deck card and may recycle it.",
    engineSupport: supported("Implemented through generic private effect selection.")
  }),
  "action.reveal": primitiveSeed({
    id: "action.reveal",
    family: "action",
    name: "Reveal cards",
    description: "Reveals hidden cards.",
    parameters: [optional("count", "number", "The number of cards revealed.")],
    emitsEvents: ["card.revealed"],
    engineSupport: supported("Revealed cards retain their zone while emitting one event per revealed card.")
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
      required("tokenCardCode", "string", "The canonical source card code for the token."),
      optional("tokenName", "string", "The player-facing token name.", tokenKinds),
      required("count", "number", "The number of tokens."),
      optional("placement", "string", "How the token destination is chosen.", [
        "sourceLocation",
        "base",
        "chooseBaseOrControlledBattlefield"
      ]),
      optional("entryState", "string", "Whether the token enters ready or exhausted.", [
        "ready",
        "exhausted"
      ])
    ],
    emitsEvents: ["card.played"]
  }),
  "action.stun_card": primitiveSeed({
    id: "action.stun_card",
    family: "action",
    name: "Stun card",
    description: "Applies stun to a card.",
    parameters: [
      required("target", "target", "The card to stun."),
      optional("requiresChoiceKey", "string", "Choice key that enables this effect."),
      optional("requiresChoiceValue", "string", "Chosen value required to enable this effect."),
    ],
    emitsEvents: ["unit.stunned"],
    engineSupport: supported("Stunned units do not contribute Might in combat and clear at the next Ending Step.")
  }),
  "action.play_selected_unit": primitiveSeed({
    id: "action.play_selected_unit",
    family: "action",
    name: "Play selected Unit",
    description: "Plays a selected Unit from a permitted zone, with a configurable base-cost treatment.",
    parameters: [
      required("sourceSelectionKey", "string", "Selector key containing the Unit to play."),
      required("selectionKey", "string", "Key storing the chosen destination."),
      optional("costMode", "string", "How the selected Unit's base costs are handled.", ["ignoreAll", "powerOnly"]),
    ],
    engineSupport: supported("Uses normal Unit placement and can either ignore all base costs or require only base Power."),
  }),
  "action.recycle_top_cards": primitiveSeed({
    id: "action.recycle_top_cards",
    family: "action",
    name: "Recycle looked-at top cards",
    description: "Lets the controller recycle any number of the top cards of their Main Deck.",
    parameters: [
      required("count", "number", "How many top cards are eligible."),
      optional("sourceSelectionKey", "string", "Key containing the previously looked-at cards."),
      optional("selectionKey", "string", "Key storing the selected recycled cards."),
      optional("recycleAllRemaining", "boolean", "Whether every looked-at card remaining in the deck must be recycled."),
    ],
    emitsEvents: ["card.recycled"],
    engineSupport: supported("Uses a private Main Deck selection during effect resolution."),
  }),
  "action.order_top_cards": primitiveSeed({
    id: "action.order_top_cards",
    family: "action",
    name: "Order top cards",
    description: "Lets the controller choose the order of the remaining top cards.",
    parameters: [
      required("count", "number", "How many top cards are ordered."),
      optional("sourceSelectionKey", "string", "Key containing the previously looked-at cards."),
      optional("recycledSelectionKey", "string", "Key containing the cards already recycled."),
    ],
    engineSupport: supported("The submitted selection order becomes the new top-to-bottom deck order."),
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
      optional("appliesToSourcePlay", "boolean", "Whether this modifier changes only the source card's cost while it is being played."),
      optional("selectionKey", "string", "Selector key supplying affected units."),
      optional("locationRelation", "locationRelation", "How affected units relate to the source location."),
      optional("excludesSource", "boolean", "Whether the source card is excluded from affected units."),
      optional("condition", "string", "Runtime predicate guarding the modifier.", [
        "friendlyDefendsAlone",
        "sourceCombatsAlone",
        "onlyFriendlyUnitAtLocation"
      ]),
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
    parameters: [
      required("target", "target", "The card that enters ready."),
      optional("duration", "duration", "How long the entry permission lasts.")
    ],
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
  "modifier.cannot_move_from_source_battlefield": primitiveSeed({
    id: "modifier.cannot_move_from_source_battlefield",
    family: "modifier",
    name: "Cannot move from source battlefield",
    description: "Prevents units at the source battlefield from moving to the specified destination.",
    parameters: [required("destination", "zone", "The prohibited movement destination.")],
    engineSupport: supported("The shared board move policy checks active battlefield restrictions before projecting or executing a move.")
  }),
  "modifier.legion_energy_discount": primitiveSeed({
    id: "modifier.legion_energy_discount",
    family: "modifier",
    name: "Legion Energy discount",
    description: "Reduces this card's Energy cost while its Legion condition is satisfied.",
    parameters: [required("amount", "number", "The Energy reduction.")],
    engineSupport: supported("The card-play cost evaluator applies the discount before payment."),
  }),
  "modifier.grant_keyword": primitiveSeed({
    id: "modifier.grant_keyword",
    family: "modifier",
    name: "Grant keyword",
    description: "Grants a keyword amount to selected units or a continuous unit scope for a defined duration.",
    parameters: [
      required("keywordId", "string", "The granted keyword behavior id."),
      optional("amount", "number", "The keyword amount."),
      required("target", "target", "The units receiving the keyword."),
      optional("selectionKey", "string", "Selector key supplying selected recipients."),
      optional("locationRelation", "locationRelation", "How recipients relate to the source location."),
      optional("excludesSource", "boolean", "Whether the source card is excluded from recipients."),
      required("duration", "duration", "How long the granted keyword lasts."),
      optional("requiresChoiceKey", "string", "Choice key that enables this effect."),
      optional("requiresChoiceValue", "string", "Chosen value required to enable this effect."),
    ],
    engineSupport: supported("Temporary and static source-location keyword grants use the shared keyword evaluator and modifier lifecycle."),
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
      "The comparison is evaluated whenever its clause is evaluated, including while a continuous modifier is active.",
      "A false comparison prevents the other behavior assignments in the same clause from resolving.",
      "Printed Energy cost is the card's Energy characteristic and is used by 'costs N or more' rules. The effective Energy cost source remains accepted for compatibility with existing behavior snapshots.",
      "Controller Board Rune count includes Rune cards that the controller has channeled to their Base."
    ],
    engineSupport: requiresEngineSupport(
      "The runtime evaluates typed numeric clause guards for event values and continuous Board Rune counts."
    )
  }),
  "condition.state": primitiveSeed({
    id: "condition.state",
    family: "condition",
    name: "Compare game state",
    description: "Guards a clause by comparing a controller, opponent, or source state value.",
    parameters: [
      required("subject", "string", "The state owner or source.", ["controller", "opponent", "source"]),
      required("property", "string", "The state value to compare.", ["score", "scoreDistanceToVictory", "handCount", "facedownCount", "taggedUnitCount", "buffed", "atBattlefield"]),
      required("operator", "string", "The comparison applied to the state value.", numericComparisonOperators),
      required("comparisonValue", "number", "The constant value used by the comparison."),
      optional("tag", "string", "Required card tag when comparing tagged-unit count."),
    ],
    engineSupport: supported("Typed controller, opponent, and source state conditions are evaluated by the shared condition runtime."),
  }),
  "action.win_game": primitiveSeed({
    id: "action.win_game",
    family: "action",
    name: "Win game",
    description: "Makes the effect controller win the game immediately.",
    engineSupport: supported("Sets the winner and completes the game."),
  }),
  "condition.turn_event_count": primitiveSeed({
    id: "condition.turn_event_count",
    family: "condition",
    name: "Compare this-turn event count",
    description: "Guards a clause by comparing recorded events from the current turn.",
    parameters: [
      required("eventType", "string", "The recorded event category.", ["discarded", "died", "moved", "readied", "recycled"]),
      required("subject", "string", "Whose matching events are counted.", ["controller", "opponent", "source"]),
      required("operator", "string", "The comparison applied to the event count.", numericComparisonOperators),
      required("comparisonValue", "number", "The constant value used by the comparison."),
    ],
    engineSupport: supported("The game state records typed event histories that reset at the beginning of each turn."),
  }),
  "condition.event_value": primitiveSeed({
    id: "condition.event_value",
    family: "condition",
    name: "Compare event boolean",
    description: "Guards a clause by requiring a boolean value recorded on its triggering event.",
    parameters: [
      required("key", "string", "The event value key to evaluate."),
      required("expectedBoolean", "boolean", "The boolean value required for the clause."),
    ],
    engineSupport: supported("Shared event metadata is evaluated when the trigger is collected."),
  }),
  "condition.event_origin_source_location": primitiveSeed({
    id: "condition.event_origin_source_location",
    family: "condition",
    name: "Event originated at source location",
    description: "Guards a clause when the moved event subject left the source battlefield.",
    engineSupport: supported("Unit-move events retain their origin battlefield for location-based triggers."),
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
  "condition.unit_presence": primitiveSeed({
    id: "condition.unit_presence",
    family: "condition",
    name: "Unit presence",
    description:
      "Checks whether a location contains enough units matching controller and ready-state filters.",
    parameters: [
      required("controller", "player", "The controller relationship for counted units."),
      required("locationRelation", "locationRelation", "The location to inspect."),
      optional("readyState", "string", "Readiness filter for counted units.", [
        "ready"
      ]),
      optional("minimumCount", "number", "The minimum matching unit count.")
    ],
    engineSupport: requiresEngineSupport(
      "The runtime evaluates source-location and event-battlefield unit presence."
    )
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
  "action.kill_on_next_damage": primitiveSeed({
    id: "action.kill_on_next_damage",
    family: "action",
    name: "Kill on next damage",
    description: "Marks selected Units to be killed the next time they take damage this turn, with an optional immediate Legion replacement.",
    parameters: [
      required("selectionKey", "string", "Selected Unit selector key."),
      required("duration", "duration", "How long the damage marker lasts."),
      optional("immediateWhenLegion", "boolean", "Whether Legion kills the selected Unit immediately instead of creating a marker."),
    ],
    fixedRules: [
      "The marker is consumed by the first later damage instance dealt to the selected object.",
      "The resulting kill follows the ordinary death and replacement flow.",
    ],
    engineSupport: supported("Tracks a turn-scoped next-damage marker across effect, fight, and combat damage."),
  }),
  "choice.choose_mode": primitiveSeed({
    id: "choice.choose_mode",
    family: "choice",
    name: "Choose mode",
    description: "Prompts a player to choose one available mode from a modal effect.",
    parameters: [
      required("player", "player", "The player who chooses the mode."),
      required("selectionKey", "string", "Stable key read by the mode-gated selections and effects."),
      required("optionIds", "string", "Pipe-delimited stable identifiers for the available modes."),
      required("optionLabels", "string", "Pipe-delimited player-facing labels for the available modes."),
      optional("prompt", "string", "The mode-selection prompt."),
    ],
    engineSupport: supported("Modal activated abilities use the shared declaration choice and source-object turn-memory contract.")
  }),
  "choice.optional": primitiveSeed({
    id: "choice.optional",
    family: "choice",
    name: "Optional choice",
    description: "Lets a player decide whether to apply an optional behavior.",
    parameters: [
      required("player", "player", "The player who may choose to apply the behavior."),
      required("selectionKey", "string", "Stable key read by the optional behavior branch."),
      optional("prompt", "string", "The optional effect prompt."),
    ],
    engineSupport: supported("The runtime records an explicit Accept or Decline decision before executing effects gated by the choice key.")
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
  "keyword.ganking": primitiveSeed({
    id: "keyword.ganking",
    family: "keyword",
    name: "Ganking",
    description: "Allows a Standard Move between battlefields.",
    parameters: [optional("keyword", "string", "Printed keyword name.")],
    engineSupport: supported("Movement projection and execution honor battlefield origins.")
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
  "cost.exhaust_selected_unit": primitiveSeed({
    id: "cost.exhaust_selected_unit",
    family: "cost",
    name: "Exhaust selected unit",
    description: "Exhausts a selected ready unit as a non-standard play cost.",
    parameters: [
      required("selectionKey", "string", "Cost selector key."),
      optional("optional", "boolean", "Whether the cost may be declined.")
    ],
    engineSupport: supported("Paid during the card-play process before resolution.")
  }),
  "replacement.recall_on_next_death": primitiveSeed({
    id: "replacement.recall_on_next_death",
    family: "replacement",
    name: "Recall on next death",
    description: "Replaces the selected unit's next death this turn with an exhausted recall.",
    parameters: [
      required("selectionKey", "string", "Protected-unit selector key."),
      required("duration", "duration", "Replacement duration."),
      optional("exhausted", "boolean", "Whether the recalled unit becomes exhausted.")
    ],
    engineSupport: supported("Stored as a consumable ongoing replacement effect.")
  }),
  "replacement.instead": primitiveSeed({
    id: "replacement.instead",
    family: "replacement",
    name: "Instead replacement",
    description: "Replaces an event or result before it happens."
  }),
  "cost.spend_buff": primitiveSeed({
    id: "cost.spend_buff",
    family: "cost",
    name: "Spend Buff cost",
    description: "Removes a Buff from a selected Unit as an optional additional cost.",
    parameters: [
      required("selectionKey", "string", "Cost selector key."),
      optional("optional", "boolean", "Whether the cost may be declined."),
      optional("ignoreBaseCost", "boolean", "Whether paying this cost ignores the card's normal cost."),
    ],
    engineSupport: supported("Paid during the card-play process before resolution."),
  }),
  "cost.spend_source_buff": primitiveSeed({
    id: "cost.spend_source_buff",
    family: "cost",
    name: "Spend source Buff cost",
    description: "Removes a Buff from the activating source as an ability cost.",
    fixedRules: [
      "The source must have a Buff when the ability is declared.",
      "The Buff is removed only after all required modes and targets are chosen.",
    ],
    engineSupport: supported("The shared activated-ability cost flow validates and spends the source Buff."),
  }),
  "condition.non_token": primitiveSeed({
    id: "condition.non_token",
    family: "condition",
    name: "Event subject is not a token",
    description: "Requires the event's subject card not to be a token.",
    fixedRules: [
      "A token is identified from its canonical card supertype or runtime token source.",
      "The condition is evaluated against the event subject before the clause enters the Chain."
    ],
    engineSupport: supported("Uses the shared runtime card identity for the event subject.")
  }),
  "modifier.cannot_play_cards": primitiveSeed({
    id: "modifier.cannot_play_cards",
    family: "modifier",
    name: "Cannot play cards",
    description: "Prevents opponents from playing cards for the stated duration.",
    parameters: [required("duration", "duration", "How long the restriction lasts.")],
    engineSupport: supported("Card-play action generation respects active player restrictions."),
  }),
  "modifier.enable_source_triggers": primitiveSeed({
    id: "modifier.enable_source_triggers",
    family: "modifier",
    name: "Enable source triggers",
    description: "Keeps the source card's triggered clauses active for a duration after it leaves normal play zones.",
    parameters: [required("duration", "duration", "How long the source triggers remain active.")],
    engineSupport: supported("Registers the source as an active trigger provider for the stated duration."),
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
    const runtimeStatus = getRuntimeCoverageStatus(id);

    return {
      ...seed,
      ...(runtimeStatus === "executable"
        ? { engineSupport: supported("Executable in the gameplay runtime.") }
        : {}),
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
  const seed =
    CATALOG_SEEDS[primitiveId] ??
    buildFallbackSeed(undefined, primitiveId, family);
  return {
    ...seed,
    ...(getRuntimeCoverageStatus(primitiveId) === "executable"
      ? { engineSupport: supported("Executable in the gameplay runtime.") }
      : {}),
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
