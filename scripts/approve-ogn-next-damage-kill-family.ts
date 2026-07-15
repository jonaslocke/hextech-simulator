import { readFile } from "node:fs/promises";
import path from "node:path";
import { getMongoClient, getMongoDatabaseName } from "../src/server/db";
import {
  applyOfficialErrata,
  buildCurrentBehaviorCatalog,
  hashCardRulesText,
  loadOfficialErrata,
  publishCanonicalCard,
  type CanonicalCardPublicationInput,
} from "../src/server/card-catalog";
import { deriveCardCodeFromCard } from "../src/server/card-catalog/identity";
import { selectPreferredPrinting } from "../src/server/card-catalog/printing-selection";
import { cardSetFileSchema, type Card } from "../src/server/catalog";

if (!process.argv.includes("--confirm")) {
  throw new Error("Refusing to approve the OGN next-damage kill family without --confirm.");
}

type Assignment = {
  family: CanonicalCardPublicationInput["clauses"][number]["assignments"][number]["family"];
  primitiveId: string;
  parameters: Record<string, string | number | boolean | null>;
};

const MODELS: Record<string, Assignment[]> = {
  "OGN-254": [
    { family: "timing", primitiveId: "timing.action", parameters: {} },
    {
      family: "selector",
      primitiveId: "selector.unit",
      parameters: {
        scope: "any",
        area: "board",
        locationRelation: "any",
        minimumCount: 1,
        maximumCount: 1,
        selectionKey: "targetUnit",
      },
    },
    {
      family: "action",
      primitiveId: "action.kill_on_next_damage",
      parameters: {
        selectionKey: "targetUnit",
        duration: "thisTurn",
        immediateWhenLegion: true,
      },
    },
  ],
};

const client = await getMongoClient();
try {
  const cards = await loadEffectiveCards();
  const behaviorCatalog = await buildCurrentBehaviorCatalog();
  const db = client.db(getMongoDatabaseName());

  for (const [cardCode, assignments] of Object.entries(MODELS)) {
    const overlay = cards.get(cardCode);
    if (!overlay) throw new Error(`Missing local card data: ${cardCode}`);
    const card = overlay.effectiveCard;
    const document = await publishCanonicalCard(
      db,
      {
        adminNotes: "OGN M2 next-damage kill family.",
        card,
        printedCard: overlay.printedCard,
        printedSourceTextHash: hashCardRulesText(overlay.printedCard),
        appliedErrata: overlay.appliedErrata,
        cardCode,
        modelingStatus: "approved",
        sourceTextHash: hashCardRulesText(card),
        clauses: [{
          id: "clause-1",
          sourceText: card.text.plain,
          normalizedText: card.text.plain,
          unsupportedReason: null,
          assignments: assignments.map((assignment) => ({
            ...assignment,
            confidence: "high" as const,
            sourceText: card.text.plain,
          })),
        }],
      },
      new Date().toISOString(),
      behaviorCatalog,
    );
    console.log(`Approved ${document.cardCode} ${document.card.name}`);
  }
} finally {
  await client.close();
}

async function loadEffectiveCards() {
  const sets = await Promise.all(
    ["ogn", "ogs", "sfd", "unl"].map(async (setName) =>
      cardSetFileSchema.parse(JSON.parse(await readFile(
        path.join(process.cwd(), "data", "sets", `${setName}.json`),
        "utf8",
      ))),
    ),
  );
  const releases = await loadOfficialErrata(sets.flat());
  const printingsByName = new Map<string, Card[]>();
  for (const card of sets[0]) {
    printingsByName.set(card.name, [...(printingsByName.get(card.name) ?? []), card]);
  }
  return new Map(
    [...printingsByName.values()].map((printings) => {
      const printedCard = selectPreferredPrinting(printings);
      return [
        deriveCardCodeFromCard(printedCard),
        applyOfficialErrata(printedCard, releases),
      ];
    }),
  );
}
