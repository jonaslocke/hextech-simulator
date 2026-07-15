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

if (!process.argv.includes("--confirm")) {
  throw new Error("Refusing to approve Hand of Noxus without --confirm.");
}

const client = await getMongoClient();
try {
  const cards = await loadEffectiveCards();
  const overlay = cards.get("OGN-253");
  if (!overlay) throw new Error("Missing local card data: OGN-253");
  const card = overlay.effectiveCard;
  const behaviorCatalog = await buildCurrentBehaviorCatalog();
  const document = await publishCanonicalCard(
    client.db(getMongoDatabaseName()),
    {
      adminNotes: "OGN M2 Legion activated Energy resource ability.",
      card,
      printedCard: overlay.printedCard,
      printedSourceTextHash: hashCardRulesText(overlay.printedCard),
      appliedErrata: overlay.appliedErrata,
      cardCode: "OGN-253",
      modelingStatus: "approved",
      sourceTextHash: hashCardRulesText(card),
      clauses: [{
        id: "clause-1",
        sourceText: card.text.plain,
        normalizedText: card.text.plain,
        unsupportedReason: null,
        assignments: [
          {
            family: "timing",
            primitiveId: "timing.reaction",
            parameters: {},
            confidence: "high",
            sourceText: card.text.plain,
          },
          {
            family: "keyword",
            primitiveId: "keyword.legion",
            parameters: {},
            confidence: "high",
            sourceText: card.text.plain,
          },
          {
            family: "ability",
            primitiveId: "ability.exhaust_for_resource",
            parameters: {
              resourceType: "energy",
              amountSource: "constant",
              amount: 1,
              usage: "unrestricted",
            },
            confidence: "high",
            sourceText: card.text.plain,
          },
        ],
      }],
    },
    new Date().toISOString(),
    behaviorCatalog,
  );
  console.log(`Approved ${document.cardCode} ${document.card.name}`);
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
  for (const printed of sets[0]) {
    printingsByName.set(
      printed.name,
      [...(printingsByName.get(printed.name) ?? []), printed],
    );
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
