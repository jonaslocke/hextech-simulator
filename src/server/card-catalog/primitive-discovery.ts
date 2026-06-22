import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { cardSetFileSchema, type Card } from "../catalog";
import { deriveCardCodeFromCard } from "./identity";

export type PrimitiveFamily =
  | "ability"
  | "timing"
  | "selector"
  | "action"
  | "modifier"
  | "trigger"
  | "condition"
  | "choice"
  | "cost"
  | "replacement"
  | "prevention"
  | "keyword"
  | "unsupported";

export type PrimitiveDefinition = {
  id: string;
  family: PrimitiveFamily;
  name: string;
  description: string;
  parameterNames: string[];
};

export type PrimitiveAssignment = {
  primitiveId: string;
  family: PrimitiveFamily;
  sourceText: string;
  parameters: Record<string, string | number | boolean | null>;
  confidence: "high" | "medium" | "low";
};

export type ClauseDiscovery = {
  id: string;
  sourceText: string;
  normalizedText: string;
  assignments: PrimitiveAssignment[];
  unsupportedReason: string | null;
};

export type CardPrimitiveDiscovery = {
  cardCode: string;
  cardName: string;
  publicCode: string;
  setCode: string;
  rulesText: string;
  clauses: ClauseDiscovery[];
  primitiveIds: string[];
};

export type DiscoveredPrimitive = {
  primitive: PrimitiveDefinition;
  occurrenceCount: number;
  cardCodes: string[];
  examples: Array<{
    cardCode: string;
    cardName: string;
    publicCode: string;
    sourceText: string;
    parameters: Record<string, string | number | boolean | null>;
  }>;
};

export type UnsupportedClause = {
  cardCode: string;
  cardName: string;
  publicCode: string;
  sourceText: string;
  reason: string;
};

export type CorpusPrimitiveDiscoveryReport = {
  summary: {
    sourceFiles: string[];
    totalCards: number;
    cardsWithRulesText: number;
    discoveredPrimitiveCount: number;
    unsupportedClauseCount: number;
  };
  primitives: DiscoveredPrimitive[];
  cards: CardPrimitiveDiscovery[];
  unsupportedClauses: UnsupportedClause[];
};

type PrimitiveDetector = {
  primitive: PrimitiveDefinition;
  detect: (context: ClauseContext) => PrimitiveAssignment | null;
};

type ClauseContext = {
  sourceText: string;
  normalizedText: string;
  lowerText: string;
  rulesText: string;
  inheritedTiming: "action" | "reaction" | null;
};

const EXHAUST_FOR_RESOURCE_PRIMITIVE: PrimitiveDefinition = {
  id: "ability.exhaust_for_resource",
  family: "ability",
  name: "Exhaust for resource",
  description: "Exhaust the source to add a rune-pool resource.",
  parameterNames: ["resourceType", "amountSource", "amount", "domain", "usage"]
};

const RECYCLE_FOR_POWER_PRIMITIVE: PrimitiveDefinition = {
  id: "ability.recycle_for_power",
  family: "ability",
  name: "Recycle for Power",
  description: "Recycle the source to add Power of its domain.",
  parameterNames: ["amount", "domain", "usage"]
};

const HIDDEN_KEYWORD_PRIMITIVE: PrimitiveDefinition = {
  id: "keyword.hidden",
  family: "keyword",
  name: "Hidden",
  description: "Rules-defined Hidden keyword behavior.",
  parameterNames: []
};

const primitiveDetectors: PrimitiveDetector[] = [
  primitive("ability.exhaust_for_resource", "ability", "Exhaust for resource", "Exhaust the source to add a rune-pool resource.", ["resourceType", "amountSource", "amount", "domain", "usage"], (context) =>
    isExhaustForResourceAbility(context.rulesText)
      ? assignment(context, "ability.exhaust_for_resource", "ability", readExhaustForResourceParameters(context.rulesText), "high")
      : null
  ),
  primitive("timing.action", "timing", "Action timing", "Card can be played at action timing.", [], (context) =>
    context.lowerText.includes("[action]") ? assignment(context, "timing.action", "timing", {}, "high") : null
  ),
  primitive("timing.reaction", "timing", "Reaction timing", "Card can be played at reaction timing.", [], (context) =>
    context.lowerText.includes("[reaction]") ? assignment(context, "timing.reaction", "timing", {}, "high") : null
  ),
  primitive("timing.delayed", "timing", "Delayed timing", "Behavior resolves at a later turn boundary.", ["point"], (context) =>
    /\bat the end of (this|your|an opponent's) turn\b/.test(context.rulesText)
      ? assignment(context, "timing.delayed", "timing", { point: readDelayedTiming(context.rulesText) }, "high")
      : null
  ),
  primitive("trigger.on_play", "trigger", "On play trigger", "Behavior triggers when a card is played.", ["actor", "subject"], (context) =>
    /\bwhen (you play|a player plays|an opponent plays|i'm played|you play me|i enter)\b/.test(context.rulesText)
      ? assignment(context, "trigger.on_play", "trigger", { actor: readEventActor(context.rulesText), subject: readPlayEventSubject(context.rulesText) }, "high")
      : null
  ),
  primitive("trigger.on_move", "trigger", "On move trigger", "Behavior triggers when a unit moves.", ["subject"], (context) =>
    /\bwhen (i move|.+ moves?)\b/.test(context.rulesText)
      ? assignment(context, "trigger.on_move", "trigger", { subject: readTriggerSubject(context.rulesText) }, "medium")
      : null
  ),
  primitive("trigger.on_death", "trigger", "On death trigger", "Behavior triggers when a unit dies.", ["subject"], (context) =>
    /\bwhen (i die|.+ dies?|.+ is killed)\b/.test(context.rulesText)
      ? assignment(context, "trigger.on_death", "trigger", { subject: readTriggerSubject(context.rulesText) }, "medium")
      : null
  ),
  primitive("trigger.end_of_turn", "trigger", "End of turn trigger", "Behavior triggers at end of turn.", ["player"], (context) =>
    /\bat the end of (your|each|an opponent's) turn\b/.test(context.rulesText) &&
    !/^when\b/.test(context.rulesText)
      ? assignment(context, "trigger.end_of_turn", "trigger", { player: readTurnPlayer(context.rulesText) }, "high")
      : null
  ),
  primitive("trigger.conquer_battlefield", "trigger", "Conquer battlefield trigger", "Behavior triggers when a battlefield is conquered.", [], (context) =>
    /\bwhen you conquer here\b/.test(context.rulesText)
      ? assignment(context, "trigger.conquer_battlefield", "trigger", {}, "high")
      : null
  ),
  primitive("trigger.hold_battlefield", "trigger", "Hold battlefield trigger", "Behavior triggers when a player holds a battlefield.", [], (context) =>
    /\bwhen you hold here\b/.test(context.rulesText)
      ? assignment(context, "trigger.hold_battlefield", "trigger", {}, "high")
      : null
  ),
  primitive("trigger.on_choose", "trigger", "Choose trigger", "Behavior triggers when a card or object is chosen.", ["actor", "subject"], (context) =>
    isChoiceEventTrigger(context.rulesText)
      ? assignment(context, "trigger.on_choose", "trigger", { actor: readEventActor(context.rulesText), subject: readChooseEventSubject(context.rulesText) }, "high")
      : null
  ),
  primitive("trigger.on_ready", "trigger", "Ready trigger", "Behavior triggers when a card or object becomes ready.", ["actor", "subject"], (context) =>
    /\bwhen (you|i) (?:choose or )?ready\b|\bwhen .*\bbecomes ready\b/.test(context.rulesText)
      ? assignment(context, "trigger.on_ready", "trigger", { actor: readEventActor(context.rulesText), subject: readTriggerSubject(context.rulesText) }, "high")
      : null
  ),
  primitive("selector.unit", "selector", "Select unit", "Behavior requires or affects a unit.", ["scope", "minimumCount", "maximumCount"], (context) =>
    /\b(a|each|target|chosen) unit\b|\bunits\b/.test(context.rulesText)
      ? assignment(context, "selector.unit", "selector", { scope: readUnitScope(context.rulesText), ...readUnitCountBounds(context.rulesText), area: readUnitTargetArea(context.rulesText), locationRelation: readUnitLocationRelation(context.rulesText), excludesSource: context.rulesText.includes("another") }, "medium")
      : null
  ),
  primitive("selector.friendly_unit", "selector", "Select friendly unit", "Behavior requires or affects friendly units.", ["minimumCount", "maximumCount"], (context) =>
    /\bfriendly units?\b/.test(context.rulesText)
      ? assignment(context, "selector.friendly_unit", "selector", { ...readUnitCountBounds(context.rulesText), area: readUnitTargetArea(context.rulesText), locationRelation: readUnitLocationRelation(context.rulesText), controller: "player", excludesSource: context.rulesText.includes("another") }, "high")
      : null
  ),
  primitive("selector.enemy_unit", "selector", "Select enemy unit", "Behavior requires or affects enemy units.", ["minimumCount", "maximumCount"], (context) =>
    /\benemy units?\b/.test(context.rulesText)
      ? assignment(context, "selector.enemy_unit", "selector", { ...readUnitCountBounds(context.rulesText), area: readUnitTargetArea(context.rulesText), locationRelation: readUnitLocationRelation(context.rulesText), controller: "opponent", excludesSource: context.rulesText.includes("another") }, "high")
      : null
  ),
  primitive("selector.token", "selector", "Select token", "Behavior applies to a known token kind.", ["tokenName", "controller"], (context) =>
    /\byour gold\b/.test(context.rulesText)
      ? assignment(context, "selector.token", "selector", { tokenName: "Gold gear", controller: "player" }, "high")
      : null
  ),
  primitive("action.draw_cards", "action", "Draw cards", "Move cards from deck to player hand.", ["player", "count"], (context) =>
    /\bdraw\b/.test(context.rulesText)
      ? assignment(context, "action.draw_cards", "action", { player: "player", count: readNumberAfter(context.rulesText, "draw") ?? 1 }, "high")
      : null
  ),
  primitive("action.discard_cards", "action", "Discard cards", "Move cards from hand to trash.", ["player", "count"], (context) =>
    /\bdiscard\b/.test(context.rulesText)
      ? assignment(context, "action.discard_cards", "action", { player: "player", count: readNumberAfter(context.rulesText, "discard") ?? 1 }, "high")
      : null
  ),
  primitive("action.move_unit", "action", "Move unit", "Move a unit between zones or battlefields.", ["destination", "count"], (context) =>
    /\bmove\b|\bmoved\b/.test(readInstructionText(context.rulesText))
      ? assignment(context, "action.move_unit", "action", { destination: readMoveDestination(context.rulesText), count: readFirstNumber(context.rulesText) }, "medium")
      : null
  ),
  primitive("action.ready_cards", "action", "Ready cards", "Ready exhausted cards.", ["target", "count"], (context) =>
    /\bready\b/.test(readInstructionText(context.rulesText))
      ? assignment(context, "action.ready_cards", "action", { target: readReadyTarget(context.rulesText), count: readNumberAfter(context.rulesText, "ready") }, "high")
      : null
  ),
  primitive("action.exhaust_cards", "action", "Exhaust cards", "Exhaust ready cards.", ["target", "count"], (context) =>
    /\bexhaust\b/.test(context.rulesText)
      ? assignment(context, "action.exhaust_cards", "action", { target: readGenericTarget(context.rulesText), count: readNumberAfter(context.rulesText, "exhaust") }, "medium")
      : null
  ),
  primitive("action.channel_runes", "action", "Channel runes", "Move runes from rune deck to base.", ["player", "count", "entryState"], (context) =>
    /\bchannel\b/.test(context.rulesText)
      ? assignment(context, "action.channel_runes", "action", { player: readPlayer(context.rulesText), count: readNumberAfter(context.rulesText, "channel") ?? 1, entryState: context.rulesText.includes("exhausted") ? "exhausted" : "default" }, "high")
      : null
  ),
  primitive("action.add_rune_resource", "action", "Add rune resource", "Add Energy or Power to a player's rune pool.", ["player", "resourceType", "amount", "source"], (context) =>
    isAddResourceInstruction(context.rulesText) &&
    !context.rulesText.includes("an additional") &&
    !isExhaustForResourceAbility(context.rulesText)
      ? assignment(context, "action.add_rune_resource", "action", readAddResourceParameters(context.rulesText), "high")
      : null
  ),
  primitive("action.deal_damage", "action", "Deal damage", "Apply damage to one or more targets.", ["amount", "target"], (context) =>
    /\bdeal\b/.test(context.rulesText)
      ? assignment(context, "action.deal_damage", "action", { amount: readNumberAfter(context.rulesText, "deal"), target: readGenericTarget(context.rulesText) }, "high")
      : null
  ),
  primitive("action.kill_unit", "action", "Kill unit", "Move a unit to trash through kill rules.", ["target"], (context) =>
    /\bkill\b/.test(context.rulesText)
      ? assignment(context, "action.kill_unit", "action", { target: readGenericTarget(context.rulesText) }, "high")
      : null
  ),
  primitive("action.banish_card", "action", "Banish card", "Move a card to banishment.", ["target"], (context) =>
    /\bbanish\b/.test(context.rulesText)
      ? assignment(context, "action.banish_card", "action", { target: readGenericTarget(context.rulesText) }, "high")
      : null
  ),
  primitive("action.return_to_hand", "action", "Return to hand", "Move a card to its owner's hand.", ["target"], (context) =>
    /\breturn\b.*\bhand\b/.test(context.rulesText)
      ? assignment(context, "action.return_to_hand", "action", { target: readGenericTarget(context.rulesText) }, "high")
      : null
  ),
  primitive("action.recycle_cards", "action", "Recycle cards", "Move cards to bottom of a deck.", ["target", "count"], (context) =>
    /\brecycle\b/.test(context.rulesText)
      ? assignment(context, "action.recycle_cards", "action", { target: readGenericTarget(context.rulesText), count: readFirstNumber(context.rulesText) }, "high")
      : null
  ),
  primitive("action.look", "action", "Look at cards", "Look at hidden cards without revealing them to all players.", ["count"], (context) =>
    /\blook at\b/.test(context.rulesText)
      ? assignment(context, "action.look", "action", { count: readFirstNumber(context.rulesText) }, "medium")
      : null
  ),
  primitive("action.reveal", "action", "Reveal cards", "Reveal hidden cards.", ["count"], (context) =>
    /\breveal\b/.test(context.rulesText)
      ? assignment(context, "action.reveal", "action", { count: readFirstNumber(context.rulesText) }, "medium")
      : null
  ),
  primitive("action.attach_equipment", "action", "Attach equipment", "Attach equipment to a unit.", ["target"], (context) =>
    /\battach\b|\[equip\]/.test(context.rulesText)
      ? assignment(context, "action.attach_equipment", "action", { target: "friendly_unit" }, "medium")
      : null
  ),
  primitive("action.detach_equipment", "action", "Detach equipment", "Detach equipment from a unit.", ["target"], (context) =>
    /\bdetach\b/.test(context.rulesText)
      ? assignment(context, "action.detach_equipment", "action", { target: "equipment" }, "medium")
      : null
  ),
  primitive("action.play_token", "action", "Play token", "Create or play a token.", ["tokenName", "count"], (context) =>
    /\btokens?\b/.test(context.rulesText)
      ? assignment(context, "action.play_token", "action", { tokenName: readTokenName(context.normalizedText), count: readFirstNumber(context.rulesText) ?? 1 }, "medium")
      : null
  ),
  primitive("action.stun_card", "action", "Stun card", "Apply stun to a card.", ["target"], (context) =>
    /\bstun\b/.test(context.rulesText)
      ? assignment(context, "action.stun_card", "action", { target: readGenericTarget(context.rulesText) }, "high")
      : null
  ),
  primitive("modifier.modify_numeric_value", "modifier", "Modify numeric value", "Modify a numeric game or card value.", ["attribute", "operation", "operand", "amount", "target", "duration", "minimum"], (context) =>
    isNonCostNumericModifier(context.rulesText)
      ? assignment(context, "modifier.modify_numeric_value", "modifier", readNumericModifier(context.rulesText, readNonCostNumericAttribute(context.rulesText)), "high")
      : null
  ),
  primitive("modifier.modify_numeric_value", "modifier", "Modify numeric value", "Modify a numeric game or card value.", ["attribute", "operation", "operand", "amount", "target", "duration", "minimum"], (context) =>
    isEnergyCostModifier(context.rulesText)
      ? assignment(context, "modifier.modify_numeric_value", "modifier", readNumericModifier(context.rulesText, "energyCost"), "high")
      : null
  ),
  primitive("modifier.modify_numeric_value", "modifier", "Modify numeric value", "Modify a numeric game or card value.", ["attribute", "operation", "operand", "amount", "target", "duration", "minimum"], (context) =>
    isPowerCostModifier(context.rulesText)
      ? assignment(context, "modifier.modify_numeric_value", "modifier", readNumericModifier(context.rulesText, "powerCost"), "high")
      : null
  ),
  primitive("modifier.enter_ready", "modifier", "Enter ready", "Card or token enters ready.", ["target"], (context) =>
    /\benter ready\b|\benters ready\b/.test(context.rulesText)
      ? assignment(context, "modifier.enter_ready", "modifier", { target: readGenericTarget(context.rulesText) }, "high")
      : null
  ),
  primitive("modifier.targeting_restriction", "modifier", "Targeting restriction", "Change what can be chosen or targeted.", [], (context) =>
    /\bchoose me\b|\bchosen by\b|\bcan't be chosen\b|\bcannot be chosen\b/.test(context.rulesText)
      ? assignment(context, "modifier.targeting_restriction", "modifier", {}, "medium")
      : null
  ),
  primitive("condition.compare_numeric_value", "condition", "Compare numeric value", "Guard a clause by comparing a numeric event or game value.", ["valueSource", "operator", "comparisonValue"], (context) => {
    const comparisonValue = readPlayedCardEnergyCostThreshold(context.rulesText);

    return comparisonValue === null
      ? null
      : assignment(context, "condition.compare_numeric_value", "condition", {
          valueSource: "eventSubject.effectiveEnergyCost",
          operator: "greaterThanOrEqual",
          comparisonValue
        }, "high");
  }),
  primitive("condition.if", "condition", "If condition", "Behavior applies only if a condition is true.", [], (context) =>
    /\bif\b/.test(context.rulesText) ? assignment(context, "condition.if", "condition", {}, "medium") : null
  ),
  primitive("condition.while", "condition", "While condition", "Behavior applies while a condition is true.", [], (context) =>
    /\bwhile\b/.test(context.rulesText) && !isSourceAtBattlefieldDuration(context.rulesText)
      ? assignment(context, "condition.while", "condition", {}, "medium")
      : null
  ),
  primitive("condition.fallback_cannot", "condition", "Fallback if cannot", "Use fallback behavior if primary behavior cannot happen.", [], (context) =>
    /\bif you can't\b|\bif you cannot\b/.test(context.rulesText)
      ? assignment(context, "condition.fallback_cannot", "condition", {}, "high")
      : null
  ),
  primitive("choice.choose_target", "choice", "Choose target", "Player chooses one or more targets.", ["player"], (context) =>
    /\bchoose\b/.test(context.rulesText) && !isChoiceEventTrigger(context.rulesText)
      ? assignment(context, "choice.choose_target", "choice", { player: "player" }, "high")
      : null
  ),
  primitive("choice.choose_mode", "choice", "Choose mode", "Player chooses one mode from a modal effect.", ["player"], (context) =>
    /\bchoose one\b|\bdo one of the following\b/.test(context.rulesText)
      ? assignment(context, "choice.choose_mode", "choice", { player: "player" }, "high")
      : null
  ),
  primitive("choice.optional", "choice", "Optional choice", "Player may choose whether to apply a behavior.", ["player"], (context) =>
    /\byou may\b|\bi may\b|\beach player may\b/.test(context.rulesText)
      ? assignment(context, "choice.optional", "choice", { player: readPlayer(context.rulesText) }, "medium")
      : null
  ),
  primitive("cost.pay", "cost", "Pay cost", "Pay an additional or alternate cost.", ["amount", "resource"], (context) =>
    /\bpay\b/.test(context.rulesText)
      ? assignment(context, "cost.pay", "cost", { amount: readFirstNumber(context.rulesText), resource: readCostType(context.rulesText) }, "medium")
      : null
  ),
  primitive("cost.exhaust_source", "cost", "Exhaust source cost", "Exhaust source as a cost.", [], (context) =>
    /:rb_exhaust:/.test(context.lowerText) &&
    !isExhaustForResourceAbility(context.rulesText)
      ? assignment(context, "cost.exhaust_source", "cost", {}, "high")
      : null
  ),
  primitive("replacement.instead", "replacement", "Instead replacement", "Replace an event or result with another.", [], (context) =>
    /\binstead\b|\bwould\b/.test(context.rulesText)
      ? assignment(context, "replacement.instead", "replacement", {}, "medium")
      : null
  ),
  primitive("prevention.prevent", "prevention", "Prevent effect", "Prevent damage, movement, or another event.", [], (context) =>
    /\bprevent\b/.test(context.rulesText)
      ? assignment(context, "prevention.prevent", "prevention", {}, "medium")
      : null
  )
];

export async function analyzeLocalCardSetCorpus(
  setsDirectory = path.join(process.cwd(), "data", "sets")
): Promise<CorpusPrimitiveDiscoveryReport> {
  const filenames = (await readdir(setsDirectory))
    .filter((filename) => filename.endsWith(".json"))
    .sort();
  const cardSets = await Promise.all(
    filenames.map(async (filename) =>
      cardSetFileSchema.parse(
        JSON.parse(await readFile(path.join(setsDirectory, filename), "utf8"))
      )
    )
  );

  return analyzeCardCorpus(cardSets.flat(), filenames);
}

export function analyzeCardCorpus(
  cards: Card[],
  sourceFiles: string[] = []
): CorpusPrimitiveDiscoveryReport {
  const cardsWithRulesText = cards.filter(
    (card) => card.text.plain.trim().length > 0
  );
  const discoveredCards = cards
    .filter(
      (card) =>
        card.text.plain.trim().length > 0 || hasIntrinsicCardBehavior(card)
    )
    .map(discoverCardPrimitives);
  const primitiveMap = new Map<string, DiscoveredPrimitive>();
  const unsupportedClauses: UnsupportedClause[] = [];

  for (const card of discoveredCards) {
    for (const clause of card.clauses) {
      if (clause.unsupportedReason) {
        unsupportedClauses.push({
          cardCode: card.cardCode,
          cardName: card.cardName,
          publicCode: card.publicCode,
          sourceText: clause.sourceText,
          reason: clause.unsupportedReason
        });
      }

      for (const assignment of clause.assignments) {
        const definition = primitiveDefinitionsById.get(assignment.primitiveId);

        if (!definition) {
          continue;
        }

        const current = primitiveMap.get(definition.id) ?? {
          primitive: definition,
          occurrenceCount: 0,
          cardCodes: [],
          examples: []
        };

        current.occurrenceCount += 1;

        if (!current.cardCodes.includes(card.cardCode)) {
          current.cardCodes.push(card.cardCode);
        }

        if (current.examples.length < 12) {
          current.examples.push({
            cardCode: card.cardCode,
            cardName: card.cardName,
            publicCode: card.publicCode,
            sourceText: clause.sourceText,
            parameters: assignment.parameters
          });
        }

        primitiveMap.set(definition.id, current);
      }
    }
  }

  const primitives = [...primitiveMap.values()].sort(
    (left, right) =>
      left.primitive.family.localeCompare(right.primitive.family) ||
      left.primitive.id.localeCompare(right.primitive.id)
  );

  return {
    summary: {
      sourceFiles,
      totalCards: cards.length,
      cardsWithRulesText: cardsWithRulesText.length,
      discoveredPrimitiveCount: primitives.length,
      unsupportedClauseCount: unsupportedClauses.length
    },
    primitives,
    cards: discoveredCards,
    unsupportedClauses
  };
}

export function discoverCardPrimitives(card: Card): CardPrimitiveDiscovery {
  let inheritedTiming: "action" | "reaction" | null = null;
  const clauses = [
    ...discoverIntrinsicCardClauses(card),
    ...splitRulesTextIntoClauses(card.text.plain).map((sourceText, index) => {
      const context = createClauseContext(sourceText, inheritedTiming);
      const assignments = [
        ...primitiveDetectors.flatMap((detector) => detector.detect(context) ?? []),
        ...detectKeywordAssignments(context)
      ];
      const hasActionOrRulePrimitive = assignments.some(
        (candidate) =>
          candidate.family !== "timing" &&
          candidate.family !== "selector" &&
          candidate.family !== "condition"
      );

      if (assignments.some((candidate) => candidate.primitiveId === "timing.action")) {
        inheritedTiming = "action";
      }

      if (assignments.some((candidate) => candidate.primitiveId === "timing.reaction")) {
        inheritedTiming = "reaction";
      }

      return {
        id: `clause-${index + 1}`,
        sourceText,
        normalizedText: context.normalizedText,
        assignments,
        unsupportedReason: hasActionOrRulePrimitive
          ? null
          : "No action, modifier, trigger, cost, replacement, prevention, or keyword primitive matched this clause."
      } satisfies ClauseDiscovery;
    })
  ];
  const primitiveIds = [
    ...new Set(clauses.flatMap((clause) => clause.assignments.map((assignment) => assignment.primitiveId)))
  ].sort();

  return {
    cardCode: deriveCardCodeFromCard(card),
    cardName: card.name,
    publicCode: card.public_code,
    setCode: card.set.set_id,
    rulesText: card.text.plain,
    clauses,
    primitiveIds
  };
}

function primitive(
  id: string,
  family: PrimitiveFamily,
  name: string,
  description: string,
  parameterNames: string[],
  detect: PrimitiveDetector["detect"]
): PrimitiveDetector {
  return {
    primitive: {
      id,
      family,
      name,
      description,
      parameterNames
    },
    detect
  };
}

const primitiveDefinitionsById = new Map(
  [
    EXHAUST_FOR_RESOURCE_PRIMITIVE,
    RECYCLE_FOR_POWER_PRIMITIVE,
    HIDDEN_KEYWORD_PRIMITIVE,
    ...primitiveDetectors.map((detector) => detector.primitive)
  ].map((primitiveDefinition) => [
    primitiveDefinition.id,
    primitiveDefinition
  ])
);

function discoverIntrinsicCardClauses(card: Card): ClauseDiscovery[] {
  if (!isBasicRune(card)) {
    return [];
  }

  const sourceText = "Basic Rune intrinsic abilities (Core Rules 157.2)";

  return [
    {
      id: "intrinsic-basic-rune-abilities",
      sourceText,
      normalizedText: sourceText,
      assignments: [
        {
          primitiveId: EXHAUST_FOR_RESOURCE_PRIMITIVE.id,
          family: EXHAUST_FOR_RESOURCE_PRIMITIVE.family,
          sourceText,
          parameters: {
            resourceType: "energy",
            amountSource: "constant",
            amount: 1,
            usage: "unrestricted"
          },
          confidence: "high"
        },
        {
          primitiveId: RECYCLE_FOR_POWER_PRIMITIVE.id,
          family: RECYCLE_FOR_POWER_PRIMITIVE.family,
          sourceText,
          parameters: {
            amount: 1,
            domain: "sourceDomain",
            usage: "unrestricted"
          },
          confidence: "high"
        }
      ],
      unsupportedReason: null
    }
  ];
}

function hasIntrinsicCardBehavior(card: Card): boolean {
  return isBasicRune(card);
}

function isBasicRune(card: Card): boolean {
  return (
    card.classification.type === "Rune" &&
    card.classification.supertype === "Basic"
  );
}

function assignment(
  context: ClauseContext,
  primitiveId: string,
  family: PrimitiveFamily,
  parameters: PrimitiveAssignment["parameters"],
  confidence: PrimitiveAssignment["confidence"]
): PrimitiveAssignment {
  return {
    primitiveId,
    family,
    sourceText: context.sourceText,
    parameters: normalizeParameters(parameters),
    confidence
  };
}

function detectKeywordAssignments(context: ClauseContext): PrimitiveAssignment[] {
  const hiddenAssignments = isHiddenDeclaration(context.normalizedText)
    ? [assignment(context, "keyword.hidden", "keyword", {}, "high")]
    : [];
  const genericAssignments = [...context.normalizedText.matchAll(/\[([^\]]+)\]/g)]
    .map((match) => match[1]!.trim())
    .filter(
      (keyword) => !["Action", "Reaction", "Hidden", "Add"].includes(keyword)
    )
    .map((keyword) => {
      const primitiveId = `keyword.${toPrimitiveKey(keyword)}`;
      const definition: PrimitiveDefinition = {
        id: primitiveId,
        family: "keyword",
        name: `${keyword} keyword`,
        description: `Keyword behavior for ${keyword}.`,
        parameterNames: ["keyword"]
      };

      primitiveDefinitionsById.set(primitiveId, definition);

      return assignment(
        context,
        primitiveId,
        "keyword",
        {
          keyword
        },
        "high"
      );
    });

  return [...hiddenAssignments, ...genericAssignments];
}

function isHiddenDeclaration(normalizedText: string): boolean {
  return /^\[Hidden\]|^Hidden\s*\(/i.test(normalizedText);
}

function createClauseContext(
  sourceText: string,
  inheritedTiming: "action" | "reaction" | null
): ClauseContext {
  const normalizedText = normalizeText(sourceText);
  const lowerText = normalizedText.toLowerCase();

  return {
    sourceText,
    normalizedText,
    lowerText,
    rulesText: stripReminderText(lowerText),
    inheritedTiming
  };
}

function splitRulesTextIntoClauses(text: string): string[] {
  const clauses = text
    .replace(/\r/g, "")
    .split(/\n+|(?<=\.)\s+|(?<=\])\s*(?=\[)/)
    .map((clause) => normalizeText(clause).replace(/\.$/, ""))
    .filter((clause) => clause.length > 0);

  return clauses.reduce<string[]>((merged, clause) => {
    if (/^(Use only\b|\(Abilities that add resources)/i.test(clause)) {
      const previousIndex = merged.length - 1;

      if (previousIndex >= 0) {
        merged[previousIndex] = `${merged[previousIndex]} ${clause}`;
        return merged;
      }
    }

    merged.push(clause);
    return merged;
  }, []);
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripReminderText(lowerText: string): string {
  return lowerText.replace(/\([^)]*\)/g, " ");
}

function normalizeParameters(
  parameters: PrimitiveAssignment["parameters"]
): PrimitiveAssignment["parameters"] {
  return Object.fromEntries(
    Object.entries(parameters).filter(
      ([, value]) => value !== undefined && value !== null
    )
  ) as PrimitiveAssignment["parameters"];
}

function readTriggerSubject(rulesText: string): string {
  if (rulesText.includes(" i ") || rulesText.includes(" me")) {
    return "source";
  }

  if (rulesText.includes("you play")) {
    return "controller";
  }

  return "event_subject";
}

function readEventActor(rulesText: string): string {
  if (rulesText.includes("opponent")) {
    return "opponent";
  }

  if (rulesText.includes("a player")) {
    return "anyPlayer";
  }

  return "player";
}

function readPlayEventSubject(rulesText: string): string {
  if (/\bplay (?:me|this)\b|\bthis is played\b|\bi'm played\b/.test(rulesText)) {
    return "source";
  }

  if (/\bplay (?:a |another )?spell\b/.test(rulesText)) {
    return "spell";
  }

  if (/\bplay (?:a |another )?unit\b/.test(rulesText)) {
    return "unit";
  }

  if (/\bplay (?:a |another )?gear\b/.test(rulesText)) {
    return "gear";
  }

  return "card";
}

function isChoiceEventTrigger(rulesText: string): boolean {
  return /\bwhen (you|i) choose\b/.test(rulesText);
}

function readChooseEventSubject(rulesText: string): string {
  return /\bwhen (you|i) choose(?: or ready)? me\b/.test(rulesText)
    ? "source"
    : "event_subject";
}

function readDelayedTiming(rulesText: string): string {
  if (rulesText.includes("an opponent's turn")) {
    return "endOfOpponentTurn";
  }

  if (rulesText.includes("your turn")) {
    return "endOfPlayerTurn";
  }

  return "endOfThisTurn";
}

function readInstructionText(rulesText: string): string {
  return rulesText.replace(/^when\b[^,]*,\s*/, "");
}

function readTurnPlayer(rulesText: string): string {
  if (rulesText.includes("your turn")) {
    return "player";
  }

  if (rulesText.includes("opponent")) {
    return "opponent";
  }

  if (rulesText.includes("each")) {
    return "eachPlayer";
  }

  return "currentTurnPlayer";
}

function readUnitScope(rulesText: string): string {
  if (rulesText.includes("each")) {
    return "each";
  }

  if (rulesText.includes("friendly")) {
    return "friendly";
  }

  if (rulesText.includes("enemy")) {
    return "enemy";
  }

  return "any";
}

function readPlayer(rulesText: string): string {
  if (rulesText.includes("each player")) {
    return "eachPlayer";
  }

  if (rulesText.includes("opponent")) {
    return "opponent";
  }

  return "player";
}

function readMoveDestination(rulesText: string): string | null {
  if (rulesText.includes("to base")) {
    return "base";
  }

  if (rulesText.includes("to a battlefield") || rulesText.includes("to an open battlefield")) {
    return "battlefield";
  }

  if (rulesText.includes("to your hand") || rulesText.includes("owner's hand")) {
    return "hand";
  }

  return null;
}

function readReadyTarget(rulesText: string): string {
  if (rulesText.includes("rune")) {
    return "runes";
  }

  return readGenericTarget(rulesText);
}

function readGenericTarget(rulesText: string): string {
  if (rulesText.includes("friendly unit")) {
    return "friendly_unit";
  }

  if (rulesText.includes("enemy unit")) {
    return "enemy_unit";
  }

  if (rulesText.includes("unit")) {
    return "unit";
  }

  if (rulesText.includes("rune")) {
    return "rune";
  }

  if (rulesText.includes("me") || rulesText.includes(" i ")) {
    return "source";
  }

  return "unspecified";
}

function readNumberAfter(rulesText: string, word: string): number | null {
  const match = rulesText.match(
    new RegExp(`\\b${word}\\s+(\\d+|one|two|three|four|five|six|seven|eight|nine|ten)\\b`)
  );

  return match ? readNumberToken(match[1]!) : null;
}

function readFirstNumber(rulesText: string): number | null {
  const match = rulesText.match(
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/
  );

  return match ? readNumberToken(match[1]!) : null;
}

function readUnitCount(rulesText: string): number | null {
  const unitMatch = rulesText.match(
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:friendly |enemy |other |buffed )?units?\b/
  );

  if (unitMatch) {
    return readNumberToken(unitMatch[1]!);
  }

  if (/\beach\b|\ball\b|\bALL\b/.test(rulesText)) {
    return null;
  }

  return /\b(a|an)\s+(?:friendly |enemy |other |buffed )?unit\b/.test(rulesText)
    ? 1
    : null;
}

function readUnitCountBounds(rulesText: string): {
  minimumCount: number | null;
  maximumCount: number | null;
} {
  const match = rulesText.match(
    /\bup to\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/
  );

  if (match) {
    return {
      minimumCount: 0,
      maximumCount: readNumberToken(match[1]!)
    };
  }

  if (/\bany number of\b/.test(rulesText)) {
    return {
      minimumCount: 0,
      maximumCount: null
    };
  }

  const exactCount = readUnitCount(rulesText);

  return {
    minimumCount: exactCount,
    maximumCount: exactCount
  };
}

function readUnitTargetArea(rulesText: string): string {
  if (
    rulesText.includes("same battlefield") ||
    unitNearArea(rulesText, "battlefields?")
  ) {
    return "battlefield";
  }

  if (unitNearArea(rulesText, "bases?")) {
    return "base";
  }

  return "board";
}

function readUnitLocationRelation(rulesText: string): string {
  if (rulesText.includes("same location") || rulesText.includes("same battlefield")) {
    return "sharedLocation";
  }

  if (
    /\bunits?\b[^.]{0,60}\bhere\b|\bhere\b[^.]{0,60}\bunits?\b/.test(rulesText) ||
    rulesText.includes("my location") ||
    rulesText.includes("my battlefield")
  ) {
    return "sourceLocation";
  }

  return "any";
}

function unitNearArea(rulesText: string, areaPattern: string): boolean {
  const unitPattern = "(?:friendly\\s+|enemy\\s+|other\\s+|buffed\\s+)?units?";
  const qualifierPattern = "(?:a\\s+|an\\s+|the\\s+|my\\s+|your\\s+|their\\s+|same\\s+)?";
  const forward = new RegExp(
    `\\b${unitPattern}\\b[^.]{0,60}\\b(?:at|in|from)\\s+${qualifierPattern}${areaPattern}\\b`
  );
  const reverse = new RegExp(
    `\\b(?:at|in|from)\\s+${qualifierPattern}${areaPattern}\\b[^.]{0,60}\\b${unitPattern}\\b`
  );

  return forward.test(rulesText) || reverse.test(rulesText);
}

function readNumberToken(token: string): number | null {
  const lowerToken = token.toLowerCase();
  const wordNumbers: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10
  };

  return wordNumbers[lowerToken] ?? Number(lowerToken);
}

function isAddResourceInstruction(rulesText: string): boolean {
  return /\[add\]|:rb_add:/.test(rulesText);
}

function isExhaustForResourceAbility(rulesText: string): boolean {
  return /:rb_exhaust:/.test(rulesText) && isAddResourceInstruction(rulesText);
}

function readExhaustForResourceParameters(
  rulesText: string
): PrimitiveAssignment["parameters"] {
  const resourceType = readProducedResourceType(rulesText);
  const amountSource = rulesText.includes("that much")
    ? "paidAmount"
    : "constant";

  return {
    resourceType,
    amountSource,
    amount:
      amountSource === "constant"
        ? readProducedResourceAmount(rulesText, resourceType)
        : null,
    domain:
      resourceType === "power" ? readProducedPowerDomain(rulesText) : null,
    usage: readResourceUsage(rulesText)
  };
}

function readAddResourceParameters(
  rulesText: string
): PrimitiveAssignment["parameters"] {
  const resourceType = readProducedResourceType(rulesText);

  return {
    player: "player",
    resourceType,
    amount: readProducedResourceAmount(rulesText, resourceType),
    source: "source"
  };
}

function readProducedResourceType(rulesText: string): string {
  const outputText = rulesText.split(/\[add\]|:rb_add:/).at(-1) ?? rulesText;
  return /\benergy\b|:rb_energy_\d+:/.test(outputText) ? "energy" : "power";
}

function readProducedResourceAmount(
  rulesText: string,
  resourceType: string
): number | null {
  if (resourceType === "energy") {
    const match = rulesText.match(/:rb_energy_(\d+):/);
    return match ? Number(match[1]) : null;
  }

  return [...rulesText.matchAll(/:rb_rune_[a-z_]+:/g)].length || null;
}

function readProducedPowerDomain(rulesText: string): string | null {
  const match = rulesText.match(/:rb_rune_([a-z_]+):/);
  return match?.[1] ?? null;
}

function readResourceUsage(rulesText: string): string {
  if (rulesText.includes("use only to play spells")) {
    return "spellsOnly";
  }

  if (rulesText.includes("use only to play gear or use gear abilities")) {
    return "gearAndGearAbilitiesOnly";
  }

  return "unrestricted";
}

function isNonCostNumericModifier(rulesText: string): boolean {
  return (
    /[+-]\s*\d+\s*:rb_might:/.test(rulesText) ||
    /\bdouble\b[^.]*\bmight\b/.test(rulesText) ||
    /\bmight becomes\b/.test(rulesText) ||
    /\bbase might bonus\b/.test(rulesText) ||
    /\bpoints needed to win\b/.test(rulesText) ||
    /\[add\]\s+an additional\b|:rb_add:\s+an additional\b/.test(rulesText)
  );
}

function isEnergyCostModifier(rulesText: string): boolean {
  return (
    /\benergy costs?\b[^.]*\b(reduced|increased)\b/.test(rulesText) ||
    /\benergy costs?\b[^.]*:rb_energy_\d+:\s+(less|more)\b/.test(rulesText) ||
    /\bcosts?\s+:rb_energy_\d+:\s+(less|more)\b/.test(rulesText) ||
    /\breduce its energy cost\b/.test(rulesText)
  );
}

function readPlayedCardEnergyCostThreshold(rulesText: string): number | null {
  const match = rulesText.match(
    /\b(?:spell|card|unit|gear)\s+that costs\s+:rb_energy_(\d+):\s+or more\b/
  );

  return match ? Number(match[1]) : null;
}

function isPowerCostModifier(rulesText: string): boolean {
  return (
    /\bpower costs?\b[^.]*\b(reduced|less|more|increased)\b/.test(rulesText) ||
    /\bcosts?\b[^.]*:rb_rune_[a-z_]+:\s+(less|more)\b/.test(rulesText)
  );
}

function readNonCostNumericAttribute(rulesText: string): string {
  if (rulesText.includes("points needed to win")) {
    return "victoryRequirement";
  }

  if (/\[add\]\s+an additional\b|:rb_add:\s+an additional\b/.test(rulesText)) {
    return "resourceAmount";
  }

  if (rulesText.includes("base might bonus")) {
    return "mightBonus";
  }

  return "might";
}

function readNumericModifier(
  rulesText: string,
  attribute: string
): PrimitiveAssignment["parameters"] {
  const operation = readNumericOperation(rulesText);
  const operand = readNumericOperand(rulesText);

  return {
    attribute,
    operation,
    operand,
    amount: readNumericAmount(rulesText, attribute, operation, operand),
    target: readNumericTarget(rulesText, attribute),
    duration: readDuration(rulesText, attribute),
    minimum: readMinimum(rulesText)
  };
}

function readNumericOperation(rulesText: string): string {
  if (/\bdouble\b/.test(rulesText)) {
    return "multiply";
  }

  if (/\bbecomes?\b/.test(rulesText)) {
    return "set";
  }

  if (/\breduced?\b|\bless\b|-\s*\d+/.test(rulesText)) {
    return "reduce";
  }

  return "increase";
}

function readNumericOperand(rulesText: string): string {
  if (rulesText.includes("highest might")) {
    return "highestControlledUnitMight";
  }

  if (rulesText.includes("might of the unit you recycled")) {
    return "recycledUnitMight";
  }

  if (rulesText.includes("becomes the might of")) {
    return "selectedUnitMight";
  }

  if (rulesText.includes("equal to my might")) {
    return "sourceMight";
  }

  if (rulesText.includes("energy cost") && rulesText.includes("equal to")) {
    return "cardEnergyCost";
  }

  if (rulesText.includes("that much")) {
    return "eventAmount";
  }

  return "constant";
}

function readNumericAmount(
  rulesText: string,
  attribute: string,
  operation: string,
  operand: string
): number | null {
  if (operand !== "constant") {
    return null;
  }

  if (operation === "multiply" && rulesText.includes("double")) {
    return 2;
  }

  if (attribute === "energyCost" || attribute === "resourceAmount") {
    const energy = rulesText.match(/:rb_energy_(\d+):/);
    return energy ? Number(energy[1]) : readFirstNumber(rulesText);
  }

  if (attribute === "powerCost") {
    return [...rulesText.matchAll(/:rb_rune_[a-z_]+:/g)].length || null;
  }

  if (attribute === "victoryRequirement") {
    return readFirstNumber(rulesText);
  }

  const mightAmount = readMightAmount(rulesText);
  return mightAmount === null ? null : Math.abs(mightAmount);
}

function readNumericTarget(rulesText: string, attribute: string): string {
  if (attribute === "victoryRequirement") {
    return "game";
  }

  if (attribute === "resourceAmount") {
    return "event_subject";
  }

  if (attribute === "mightBonus") {
    return "equipment";
  }

  if (attribute === "energyCost" || attribute === "powerCost") {
    if (/\bspells you play\b/.test(rulesText)) {
      return "controller_spell";
    }

    return "card";
  }

  if (/\b(my|me|i)\b/.test(rulesText)) {
    return "source";
  }

  const target = readGenericTarget(rulesText);
  return target === "unspecified" ? "unit" : target;
}

function readMightAmount(rulesText: string): number | null {
  const mightMatch = rulesText.match(/([+-])\s*(\d+)\s*:rb_might:/);

  if (mightMatch) {
    return mightMatch[1] === "-" ? -Number(mightMatch[2]) : Number(mightMatch[2]);
  }

  return readSignedNumber(rulesText);
}

function readSignedNumber(rulesText: string): number | null {
  const signedMatch = rulesText.match(/([+-])\s*(\d+)/);

  if (signedMatch) {
    return signedMatch[1] === "-" ? -Number(signedMatch[2]) : Number(signedMatch[2]);
  }

  return readFirstNumber(rulesText);
}

function readMinimum(rulesText: string): number | null {
  const match = rulesText.match(/minimum of (?:\D+)?(\d+)/);

  return match ? Number(match[1]) : null;
}

function readDuration(rulesText: string, attribute: string): string | null {
  if (rulesText.includes("this turn")) {
    return "thisTurn";
  }

  if (isSourceAtBattlefieldDuration(rulesText)) {
    return "whileSourceAtBattlefield";
  }

  if (attribute === "victoryRequirement" || rulesText.includes("while")) {
    return "whileSourceOnBoard";
  }

  return null;
}

function isSourceAtBattlefieldDuration(rulesText: string): boolean {
  return /\bwhile (?:i'm|i am|this card is) at a battlefield\b/.test(rulesText);
}

function readCostType(rulesText: string): string | null {
  if (rulesText.includes("energy") || rulesText.includes(":rb_energy")) {
    return "energy";
  }

  if (rulesText.includes("rune") || rulesText.includes(":rb_rune")) {
    return "rune";
  }

  if (rulesText.includes("power")) {
    return "power";
  }

  return null;
}

function readTokenName(normalizedText: string): string | null {
  const matches = [
    ...normalizedText.matchAll(
      /\bplay\s+(?:(?:a|an|one|two|three|four)\s+)?([^,.;]*?)\s+tokens?\b/gi
    )
  ];
  const match = matches.at(-1);

  return match?.[1]?.trim() || null;
}

function toPrimitiveKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
