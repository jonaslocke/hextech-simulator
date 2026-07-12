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

const MODELS: Record<string, { sourceText: string; assignments: Assignment[] }> = {
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
        clauses: [
          {
            id: "clause-1",
            sourceText: model.sourceText,
            normalizedText: model.sourceText,
            unsupportedReason: null,
            assignments: model.assignments.map((assignment) => ({
              ...assignment,
              confidence: "high" as const,
              sourceText: model.sourceText,
            })),
          },
        ],
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
