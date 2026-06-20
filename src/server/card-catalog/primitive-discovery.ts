import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { cardSetFileSchema, type Card } from "../catalog";
import { deriveCardCodeFromCard } from "./identity";

export type PrimitiveFamily =
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

const primitiveDetectors: PrimitiveDetector[] = [
  primitive("timing.action", "timing", "Action timing", "Card can be played at action timing.", [], (context) =>
    context.lowerText.includes("[action]") ? assignment(context, "timing.action", "timing", {}, "high") : null
  ),
  primitive("timing.reaction", "timing", "Reaction timing", "Card can be played at reaction timing.", [], (context) =>
    context.lowerText.includes("[reaction]") ? assignment(context, "timing.reaction", "timing", {}, "high") : null
  ),
  primitive("trigger.on_play", "trigger", "On play trigger", "Behavior triggers when a card is played.", ["subject"], (context) =>
    /\bwhen (you play|i'm played|you play me|i enter|i'm played)\b/.test(context.rulesText)
      ? assignment(context, "trigger.on_play", "trigger", { subject: readTriggerSubject(context.rulesText) }, "medium")
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
    /\bat the end of (your|this|each|an opponent's) turn\b/.test(context.rulesText)
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
  primitive("selector.unit", "selector", "Select unit", "Behavior requires or affects a unit.", ["scope"], (context) =>
    /\b(a|each|target|chosen) unit\b|\bunits\b/.test(context.rulesText)
      ? assignment(context, "selector.unit", "selector", { scope: readUnitScope(context.rulesText), count: readUnitCount(context.rulesText), zone: readTargetZone(context.rulesText), excludesSource: context.rulesText.includes("another") }, "medium")
      : null
  ),
  primitive("selector.friendly_unit", "selector", "Select friendly unit", "Behavior requires or affects friendly units.", ["count"], (context) =>
    /\bfriendly units?\b/.test(context.rulesText)
      ? assignment(context, "selector.friendly_unit", "selector", { count: readUnitCount(context.rulesText), zone: readTargetZone(context.rulesText), controller: "player", excludesSource: context.rulesText.includes("another") }, "high")
      : null
  ),
  primitive("selector.enemy_unit", "selector", "Select enemy unit", "Behavior requires or affects enemy units.", ["count"], (context) =>
    /\benemy units?\b/.test(context.rulesText)
      ? assignment(context, "selector.enemy_unit", "selector", { count: readUnitCount(context.rulesText), zone: readTargetZone(context.rulesText), controller: "opponent", excludesSource: context.rulesText.includes("another") }, "high")
      : null
  ),
  primitive("selector.up_to", "selector", "Select up to count", "Behavior allows selecting up to a maximum count.", ["count"], (context) =>
    /\bup to\b/.test(context.rulesText)
      ? assignment(context, "selector.up_to", "selector", { count: readUpToCount(context.rulesText) }, "high")
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
    /\bmove\b|\bmoved\b/.test(context.rulesText)
      ? assignment(context, "action.move_unit", "action", { destination: readMoveDestination(context.rulesText), count: readFirstNumber(context.rulesText) }, "medium")
      : null
  ),
  primitive("action.ready_cards", "action", "Ready cards", "Ready exhausted cards.", ["target", "count"], (context) =>
    /\bready\b/.test(context.rulesText)
      ? assignment(context, "action.ready_cards", "action", { target: readReadyTarget(context.rulesText), count: readNumberAfter(context.rulesText, "ready") }, "high")
      : null
  ),
  primitive("action.exhaust_cards", "action", "Exhaust cards", "Exhaust ready cards.", ["target", "count"], (context) =>
    /\bexhaust\b|:rb_exhaust:/.test(context.rulesText)
      ? assignment(context, "action.exhaust_cards", "action", { target: readGenericTarget(context.rulesText), count: readNumberAfter(context.rulesText, "exhaust") }, "medium")
      : null
  ),
  primitive("action.channel_runes", "action", "Channel runes", "Move runes from rune deck to base.", ["player", "count", "entryState"], (context) =>
    /\bchannel\b/.test(context.rulesText)
      ? assignment(context, "action.channel_runes", "action", { player: readPlayer(context.rulesText), count: readNumberAfter(context.rulesText, "channel") ?? 1, entryState: context.rulesText.includes("exhausted") ? "exhausted" : "default" }, "high")
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
  primitive("modifier.modify_might", "modifier", "Modify Might", "Modify a unit's Might.", ["amount", "duration", "minimum", "target"], (context) =>
    /\bmight\b|:rb_might:/.test(context.rulesText)
      ? assignment(context, "modifier.modify_might", "modifier", { amount: readMightAmount(context.rulesText), duration: readDuration(context.rulesText), minimum: readMinimum(context.rulesText), target: readGenericTarget(context.rulesText) }, "high")
      : null
  ),
  primitive("modifier.modify_cost", "modifier", "Modify cost", "Modify a card or ability cost.", ["amount", "costType", "minimum"], (context) =>
    /\bcosts?\b|\breduced\b|\bincreased\b/.test(context.rulesText)
      ? assignment(context, "modifier.modify_cost", "modifier", { amount: readSignedNumber(context.rulesText), costType: readCostType(context.rulesText), minimum: readMinimum(context.rulesText) }, "medium")
      : null
  ),
  primitive("modifier.enter_ready", "modifier", "Enter ready", "Card or token enters ready.", ["target"], (context) =>
    /\benter ready\b|\benters ready\b/.test(context.rulesText)
      ? assignment(context, "modifier.enter_ready", "modifier", { target: readGenericTarget(context.rulesText) }, "high")
      : null
  ),
  primitive("modifier.victory_requirement", "modifier", "Modify victory requirement", "Modify points needed to win.", ["amount"], (context) =>
    /\bpoints needed to win\b/.test(context.rulesText)
      ? assignment(context, "modifier.victory_requirement", "modifier", { amount: readSignedNumber(context.rulesText) ?? readFirstNumber(context.rulesText) }, "high")
      : null
  ),
  primitive("modifier.targeting_restriction", "modifier", "Targeting restriction", "Change what can be chosen or targeted.", [], (context) =>
    /\bchoose me\b|\bchosen by\b|\bcan't be chosen\b|\bcannot be chosen\b/.test(context.rulesText)
      ? assignment(context, "modifier.targeting_restriction", "modifier", {}, "medium")
      : null
  ),
  primitive("condition.if", "condition", "If condition", "Behavior applies only if a condition is true.", [], (context) =>
    /\bif\b/.test(context.rulesText) ? assignment(context, "condition.if", "condition", {}, "medium") : null
  ),
  primitive("condition.while", "condition", "While condition", "Behavior applies while a condition is true.", [], (context) =>
    /\bwhile\b/.test(context.rulesText) ? assignment(context, "condition.while", "condition", {}, "medium") : null
  ),
  primitive("condition.minimum", "condition", "Minimum value condition", "A value cannot go below a minimum.", ["minimum"], (context) =>
    /\bminimum of\b/.test(context.rulesText)
      ? assignment(context, "condition.minimum", "condition", { minimum: readMinimum(context.rulesText) }, "high")
      : null
  ),
  primitive("condition.fallback_cannot", "condition", "Fallback if cannot", "Use fallback behavior if primary behavior cannot happen.", [], (context) =>
    /\bif you can't\b|\bif you cannot\b/.test(context.rulesText)
      ? assignment(context, "condition.fallback_cannot", "condition", {}, "high")
      : null
  ),
  primitive("choice.choose_target", "choice", "Choose target", "Player chooses one or more targets.", ["player", "count", "target"], (context) =>
    /\bchoose\b/.test(context.rulesText)
      ? assignment(context, "choice.choose_target", "choice", { player: "player", count: readChoiceCount(context.rulesText), target: readGenericTarget(context.rulesText) }, "high")
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
    /:rb_exhaust:/.test(context.lowerText)
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
  const discoveredCards = cards
    .filter((card) => card.text.plain.trim().length > 0)
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
      cardsWithRulesText: discoveredCards.length,
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
  const clauses = splitRulesTextIntoClauses(card.text.plain).map(
    (sourceText, index) => {
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
    }
  );
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
  primitiveDetectors.map((detector) => [detector.primitive.id, detector.primitive])
);

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
  return [...context.normalizedText.matchAll(/\[([^\]]+)\]/g)]
    .map((match) => match[1]!.trim())
    .filter((keyword) => !["Action", "Reaction"].includes(keyword))
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
  return text
    .replace(/\r/g, "")
    .split(/\n+|(?<=\.)\s+|(?<=\])\s*(?=\[)/)
    .map((clause) => normalizeText(clause).replace(/\.$/, ""))
    .filter((clause) => clause.length > 0);
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

function readChoiceCount(rulesText: string): number | null {
  const chooseMatch = rulesText.match(
    /\bchoose\s+(?:up to\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\b/
  );

  if (!chooseMatch) {
    return readUnitCount(rulesText);
  }

  return chooseMatch[1] === "a" || chooseMatch[1] === "an"
    ? 1
    : readNumberToken(chooseMatch[1]!);
}

function readUpToCount(rulesText: string): number | null {
  const match = rulesText.match(
    /\bup to\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/
  );

  return match ? readNumberToken(match[1]!) : null;
}

function readTargetZone(rulesText: string): string | null {
  if (rulesText.includes("at a battlefield") || rulesText.includes("at the same location")) {
    return "battlefield";
  }

  if (rulesText.includes("in your base") || rulesText.includes("to base")) {
    return "base";
  }

  if (rulesText.includes("from your trash") || rulesText.includes("from trashes")) {
    return "trash";
  }

  if (rulesText.includes("in their hands") || rulesText.includes("to your hand")) {
    return "hand";
  }

  return null;
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

function readDuration(rulesText: string): string | null {
  if (rulesText.includes("this turn")) {
    return "thisTurn";
  }

  if (rulesText.includes("while") && rulesText.includes("battlefield")) {
    return "whileSourceAtBattlefield";
  }

  return null;
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
