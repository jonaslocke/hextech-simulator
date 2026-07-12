import { readFile } from "node:fs/promises";
import path from "node:path";
import { getMongoClient, getMongoDatabaseName } from "../src/server/db";
import {
  buildCurrentBehaviorCatalog,
  hashCardRulesText,
  publishCanonicalCard,
  type CanonicalCardPublicationInput,
} from "../src/server/card-catalog";
import { cardSetFileSchema, type Card } from "../src/server/catalog";

if (!process.argv.includes("--confirm")) {
  throw new Error("Refusing to approve Kai'Sa deck cards without --confirm.");
}

type Assignment = {
  family: CanonicalCardPublicationInput["clauses"][number]["assignments"][number]["family"];
  primitiveId: string;
  parameters: Record<string, string | number | boolean | null>;
};

type Model = {
  sourceText?: string;
  assignments?: Assignment[];
  clauses?: Array<{ sourceText: string; assignments: Assignment[] }>;
};

function repeatedDamageAssignments(count: number, amount: number): Assignment[] {
  return [
    ...Array.from({ length: count }, (_, index) => ({
      family: "selector" as const,
      primitiveId: "selector.unit",
      parameters: {
        scope: "any",
        area: "board",
        locationRelation: "any",
        minimumCount: 1,
        maximumCount: 1,
        selectionKey: `repeatTarget${index + 1}`,
        deferred: true,
      },
    })),
    ...Array.from({ length: count }, (_, index) => ({
      family: "action" as const,
      primitiveId: "action.deal_damage",
      parameters: {
        amount,
        target: "unit",
        selectionKey: `repeatTarget${index + 1}`,
      },
    })),
  ];
}

const MODELS: Record<string, Model> = {
  "OGN-096": {
    sourceText: "[Deathknell] — Draw 1. (When I die, get the effect.)",
    assignments: [
      { family: "trigger", primitiveId: "trigger.on_death", parameters: { subject: "source" } },
      { family: "action", primitiveId: "action.draw_cards", parameters: { player: "controller", count: 1 } },
    ],
  },
  "OGN-024": {
    sourceText: "[Action] (Play on your turn or in showdowns.)Deal 4 to a unit at a battlefield. Draw 1.",
    assignments: [
      { family: "timing", primitiveId: "timing.action", parameters: {} },
      { family: "selector", primitiveId: "selector.unit", parameters: { scope: "any", minimumCount: 1, maximumCount: 1, area: "battlefield", locationRelation: "any", excludesSource: false } },
      { family: "action", primitiveId: "action.deal_damage", parameters: { amount: 4, target: "unit" } },
      { family: "action", primitiveId: "action.draw_cards", parameters: { player: "controller", count: 1 } },
    ],
  },
  "OGN-009": {
    sourceText: "[Action] (Play on your turn or in showdowns.)Deal 3 to a unit at a battlefield.",
    assignments: [
      { family: "timing", primitiveId: "timing.action", parameters: {} },
      { family: "selector", primitiveId: "selector.unit", parameters: { scope: "any", minimumCount: 1, maximumCount: 1, area: "battlefield", locationRelation: "any", excludesSource: false } },
      { family: "action", primitiveId: "action.deal_damage", parameters: { amount: 3, target: "unit" } },
    ],
  },
  "OGN-093": {
    sourceText: "[Reaction] (Play any time, even before spells and abilities resolve.)Give a unit -4 :rb_might: this turn, to a minimum of 1 :rb_might:.",
    assignments: [
      { family: "timing", primitiveId: "timing.reaction", parameters: {} },
      { family: "selector", primitiveId: "selector.unit", parameters: { scope: "any", minimumCount: 1, maximumCount: 1, area: "board", locationRelation: "any", excludesSource: false } },
      { family: "modifier", primitiveId: "modifier.modify_numeric_value", parameters: { attribute: "might", operation: "reduce", operand: "constant", amount: 4, target: "unit", duration: "thisTurn", minimum: 1 } },
    ],
  },
  "OGN-104": {
    sourceText: "[Reaction] (Play any time, even before spells and abilities resolve.)Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted.",
    assignments: [
      { family: "timing", primitiveId: "timing.reaction", parameters: {} },
      { family: "selector", primitiveId: "selector.friendly_unit", parameters: { minimumCount: 1, maximumCount: 1, area: "board", locationRelation: "any", controller: "controller", excludesSource: false } },
      { family: "action", primitiveId: "action.return_to_hand", parameters: { target: "unit" } },
      { family: "action", primitiveId: "action.channel_runes", parameters: { player: "controller", count: 1, entryState: "exhausted" } },
    ],
  },
  "OGN-039": {
    sourceText: "[Accelerate] (You may pay :rb_energy_1::rb_rune_fury: as an additional cost to have me enter ready.)When I conquer, draw 1.",
    assignments: [
      { family: "keyword", primitiveId: "keyword.accelerate", parameters: {} },
      { family: "trigger", primitiveId: "trigger.conquer_source", parameters: {} },
      { family: "action", primitiveId: "action.draw_cards", parameters: { player: "controller", count: 1 } },
    ],
  },
  "OGN-012": {
    sourceText: "[Legion] — I cost :rb_energy_2: less. (Get the effect if you've played another card this turn.)",
    assignments: [
      { family: "keyword", primitiveId: "keyword.legion", parameters: {} },
      { family: "modifier", primitiveId: "modifier.legion_energy_discount", parameters: { amount: 2 } },
    ],
  },
  "OGN-027": {
    sourceText: "When you play your second card in a turn, give me +2 :rb_might: this turn and ready me.",
    assignments: [
      { family: "trigger", primitiveId: "trigger.second_card_played", parameters: {} },
      { family: "modifier", primitiveId: "modifier.modify_numeric_value", parameters: { attribute: "might", operation: "increase", operand: "constant", amount: 2, target: "source", duration: "thisTurn" } },
      { family: "action", primitiveId: "action.ready_cards", parameters: { player: "controller", target: "source", count: 1 } },
    ],
  },
  "OGN-116": {
    sourceText: "[Accelerate] (You may pay :rb_energy_1::rb_rune_mind: as an additional cost to have me enter ready.)When you play me, give enemy units -3 :rb_might: this turn, to a minimum of 1 :rb_might:.",
    assignments: [
      { family: "keyword", primitiveId: "keyword.accelerate", parameters: {} },
      { family: "trigger", primitiveId: "trigger.on_play", parameters: { actor: "controller", subject: "source" } },
      { family: "selector", primitiveId: "selector.enemy_unit", parameters: { area: "board", locationRelation: "any", minimumCount: 0, automatic: true } },
      { family: "modifier", primitiveId: "modifier.modify_numeric_value", parameters: { attribute: "might", operation: "reduce", operand: "constant", amount: 3, target: "enemy_unit", duration: "thisTurn", minimum: 1 } },
    ],
  },
  "OGN-285": {
    sourceText: "When you defend here, you may move a friendly unit here to base.",
    assignments: [
      { family: "trigger", primitiveId: "trigger.defend_at_source_battlefield", parameters: {} },
      { family: "selector", primitiveId: "selector.friendly_unit", parameters: { area: "battlefield", locationRelation: "sourceBattlefield", controller: "controller", minimumCount: 0, maximumCount: 1 } },
      { family: "action", primitiveId: "action.move_unit", parameters: { destination: "base", count: 1 } },
    ],
  },
  "OGN-123": {
    sourceText: "Exhaust all friendly units, then deal 12 to ALL units at battlefields.",
    assignments: [
      { family: "selector", primitiveId: "selector.friendly_unit", parameters: { area: "board", locationRelation: "any", controller: "controller", minimumCount: 0, automatic: true } },
      { family: "selector", primitiveId: "selector.unit", parameters: { scope: "each", area: "battlefield", locationRelation: "any", minimumCount: 0, automatic: true } },
      { family: "action", primitiveId: "action.exhaust_cards", parameters: { target: "friendly_unit" } },
      { family: "action", primitiveId: "action.deal_damage", parameters: { amount: 12, target: "unit" } },
    ],
  },
  "OGN-299": {
    sourceText: ":rb_exhaust:: [Reaction] â€” [Add] :rb_rune_rainbow:. Use only to play spells. (Abilities that add resources can't be reacted to.)",
    assignments: [
      { family: "ability", primitiveId: "ability.exhaust_for_resource", parameters: { resourceType: "power", amountSource: "constant", amount: 1, domain: "rainbow", usage: "spellsOnly" } },
      { family: "timing", primitiveId: "timing.reaction", parameters: {} },
    ],
  },
  "OGN-004": {
    sourceText: "[Action] (Play on your turn or in showdowns.)Give a unit [Assault 3] this turn. (+3 :rb_might: while it's an attacker.)",
    assignments: [
      { family: "timing", primitiveId: "timing.action", parameters: {} },
      { family: "selector", primitiveId: "selector.unit", parameters: { scope: "any", area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1 } },
      { family: "modifier", primitiveId: "modifier.grant_keyword", parameters: { keywordId: "keyword.assault", amount: 3, target: "unit", duration: "thisTurn" } },
    ],
  },
  "OGN-109": {
    clauses: [
      {
        sourceText: "My Might is increased by the number of cards in your trash.",
        assignments: [
          { family: "modifier", primitiveId: "modifier.modify_numeric_value", parameters: { attribute: "might", operation: "increase", operand: "controllerTrashCount", target: "source", duration: "whileSourceOnBoard" } },
        ],
      },
      {
        sourceText: "At the start of your Beginning Phase, recycle 3 from your trash.",
        assignments: [
          { family: "trigger", primitiveId: "trigger.beginning", parameters: { player: "controller" } },
          { family: "selector", primitiveId: "selector.card", parameters: { zone: "trash", cardType: "any", owner: "controller", minimumCount: 0, maximumCount: 3 } },
          { family: "action", primitiveId: "action.recycle_cards", parameters: { target: "card", count: 3 } },
        ],
      },
    ],
  },
  "OGN-026": {
    sourceText: "When you play me, opponents can't play cards this turn.",
    assignments: [
      { family: "trigger", primitiveId: "trigger.on_play", parameters: { actor: "controller", subject: "source" } },
      { family: "modifier", primitiveId: "modifier.cannot_play_cards", parameters: { duration: "thisTurn" } },
    ],
  },
  "OGN-029": {
    sourceText: "Do this twice:Deal 3 to a unit. (You can choose different units.)",
    assignments: [
      { family: "selector", primitiveId: "selector.unit", parameters: { scope: "any", area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1, selectionKey: "firstTarget", deferred: true } },
      { family: "selector", primitiveId: "selector.unit", parameters: { scope: "any", area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1, selectionKey: "secondTarget", deferred: true } },
      { family: "action", primitiveId: "action.deal_damage", parameters: { amount: 3, target: "unit", selectionKey: "firstTarget" } },
      { family: "action", primitiveId: "action.deal_damage", parameters: { amount: 3, target: "unit", selectionKey: "secondTarget" } },
    ],
  },
  "OGN-248": {
    sourceText: "Do this 6 times:Deal 2 to a unit. (You can choose different units.)",
    assignments: repeatedDamageAssignments(6, 2),
  },
};

const client = await getMongoClient();
try {
  const cards = await loadCards();
  const catalog = await buildCurrentBehaviorCatalog();
  for (const [cardCode, model] of Object.entries(MODELS)) {
    const card = cards.get(cardCode);
    if (!card) throw new Error(`Missing local card data: ${cardCode}`);
    const document = await publishCanonicalCard(
      client.db(getMongoDatabaseName()),
      {
        adminNotes: "OGN Kai'Sa deck: exact executable batch.",
        card,
        cardCode,
        modelingStatus: "approved",
        sourceTextHash: hashCardRulesText(card),
        clauses: (model.clauses ?? [
          {
            sourceText: model.sourceText ?? "",
            assignments: model.assignments ?? [],
          },
        ]).map((clause, clauseIndex) => ({
            id: `clause-${clauseIndex + 1}`,
            sourceText: clause.sourceText,
            normalizedText: clause.sourceText,
            unsupportedReason: null,
            assignments: clause.assignments.map((assignment) => ({
              ...assignment,
              confidence: "high" as const,
              sourceText: clause.sourceText,
            })),
          })),
      },
      new Date().toISOString(),
      catalog,
    );
    console.log(`Approved ${document.cardCode} ${document.card.name}`);
  }
} finally {
  await client.close();
}

async function loadCards() {
  const raw = await readFile(path.join(process.cwd(), "data/sets/ogn.json"), "utf8");
  return new Map(
    cardSetFileSchema.parse(JSON.parse(raw)).map((card: Card) => [
      card.public_code.split("/")[0]!,
      card,
    ]),
  );
}
