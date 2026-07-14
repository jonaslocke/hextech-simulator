import { readFile } from "node:fs/promises";
import path from "node:path";
import { getMongoClient, getMongoDatabaseName } from "../src/server/db";
import {
  applyOfficialErrata,
  buildCurrentBehaviorCatalog,
  hashCardRulesText,
  loadOfficialErrata,
  publishCanonicalCard,
} from "../src/server/card-catalog";
import { deriveCardCodeFromCard } from "../src/server/card-catalog/identity";
import { selectPreferredPrinting } from "../src/server/card-catalog/printing-selection";
import { cardSetFileSchema, type Card } from "../src/server/catalog";
import type { CanonicalCardPublicationInput } from "../src/server/card-catalog";

if (!process.argv.includes("--confirm")) {
  throw new Error("Refusing to approve the OGN top-deck family without --confirm.");
}

type Assignment = {
  family: CanonicalCardPublicationInput["clauses"][number]["assignments"][number]["family"];
  primitiveId: string;
  parameters: Record<string, string | number | boolean | null>;
};

const MODELS: Record<string, Array<{ sourceText: string; assignments: Assignment[] }>> = {
  "OGN-183": [
    {
      sourceText: "[Action] Look at the top 3 cards of your Main Deck. Put 1 into your hand and recycle the rest.",
      assignments: [
        { family: "timing", primitiveId: "timing.action", parameters: {} },
        { family: "action", primitiveId: "action.look", parameters: { count: 3, selectionKey: "lookedCards" } },
        { family: "action", primitiveId: "action.take_to_hand", parameters: { sourceSelectionKey: "lookedCards", count: 1, selectionKey: "cardToHand" } },
        { family: "action", primitiveId: "action.recycle_top_cards", parameters: { count: 3, sourceSelectionKey: "lookedCards", selectionKey: "recycledCards", recycleAllRemaining: true } },
      ],
    },
  ],
};

const client = await getMongoClient();
try {
  const cards = await loadCards();
  const behaviorCatalog = await buildCurrentBehaviorCatalog();
  const db = client.db(getMongoDatabaseName());
  for (const [cardCode, clauses] of Object.entries(MODELS)) {
    const overlay = cards.get(cardCode);
    if (!overlay) throw new Error(`Missing local card data: ${cardCode}`);
    const card = overlay.effectiveCard;
    const document = await publishCanonicalCard(db, {
      adminNotes: "OGN top-deck inspection family: executable shared-primitives batch.",
      card,
      printedCard: overlay.printedCard,
      printedSourceTextHash: hashCardRulesText(overlay.printedCard),
      appliedErrata: overlay.appliedErrata,
      cardCode,
      modelingStatus: "approved",
      sourceTextHash: hashCardRulesText(card),
      clauses: clauses.map((clause, index) => ({
        id: `clause-${index + 1}`,
        sourceText: clause.sourceText,
        normalizedText: clause.sourceText,
        unsupportedReason: null,
        assignments: clause.assignments.map((assignment) => ({
          ...assignment,
          confidence: "high" as const,
          sourceText: clause.sourceText,
        })),
      })),
    }, new Date().toISOString(), behaviorCatalog);
    console.log(`Approved ${document.cardCode} ${document.card.name}`);
  }
} finally {
  await client.close();
}

async function loadCards() {
  const printedSets = await Promise.all(
    ["ogn", "ogs", "sfd", "unl"].map(async (setName) =>
      cardSetFileSchema.parse(JSON.parse(await readFile(path.join(process.cwd(), "data/sets", `${setName}.json`), "utf8"))),
    ),
  );
  const releases = await loadOfficialErrata(printedSets.flat());
  const printingsByName = new Map<string, Card[]>();
  for (const card of printedSets[0]!) {
    printingsByName.set(card.name, [...(printingsByName.get(card.name) ?? []), card]);
  }
  return new Map(
    [...printingsByName.values()].map((printings) => {
      const printedCard = selectPreferredPrinting(printings);
      const effective = applyOfficialErrata(printedCard, releases);
      return [deriveCardCodeFromCard(printedCard), {
        printedCard,
        effectiveCard: effective.effectiveCard,
        appliedErrata: effective.appliedErrata,
      }];
    }),
  );
}
