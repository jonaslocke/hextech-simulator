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
  throw new Error("Refusing to approve the OGN keyword-grant family without --confirm.");
}

type Assignment = {
  family: CanonicalCardPublicationInput["clauses"][number]["assignments"][number]["family"];
  primitiveId: string;
  parameters: Record<string, string | number | boolean | null>;
};

const MODELS: Record<string, Assignment[]> = {
  "OGN-004": [
    { family: "timing", primitiveId: "timing.action", parameters: {} },
    { family: "selector", primitiveId: "selector.unit", parameters: { scope: "any", area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1, selectionKey: "targetUnit" } },
    { family: "modifier", primitiveId: "modifier.grant_keyword", parameters: { keywordId: "keyword.assault", amount: 3, target: "unit", selectionKey: "targetUnit", duration: "thisTurn" } },
  ],
  "OGN-015": [
    { family: "modifier", primitiveId: "modifier.grant_keyword", parameters: { keywordId: "keyword.assault", amount: 1, target: "friendly_unit", locationRelation: "sourceLocation", excludesSource: true, duration: "whileSourceAtBattlefield" } },
  ],
  "OGN-057": [
    { family: "keyword", primitiveId: "keyword.hidden", parameters: {} },
    { family: "timing", primitiveId: "timing.action", parameters: {} },
    { family: "selector", primitiveId: "selector.unit", parameters: { scope: "any", area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1, selectionKey: "targetUnit" } },
    { family: "modifier", primitiveId: "modifier.grant_keyword", parameters: { keywordId: "keyword.shield", amount: 3, target: "unit", selectionKey: "targetUnit", duration: "thisTurn" } },
    { family: "modifier", primitiveId: "modifier.grant_keyword", parameters: { keywordId: "keyword.tank", target: "unit", selectionKey: "targetUnit", duration: "thisTurn" } },
  ],
  "OGN-074": [
    { family: "keyword", primitiveId: "keyword.shield", parameters: { amount: 1 } },
    { family: "keyword", primitiveId: "keyword.tank", parameters: {} },
    { family: "modifier", primitiveId: "modifier.grant_keyword", parameters: { keywordId: "keyword.shield", amount: 1, target: "friendly_unit", locationRelation: "sourceLocation", excludesSource: true, duration: "whileSourceAtBattlefield" } },
  ],
  "OGN-279": [
    { family: "trigger", primitiveId: "trigger.defend_at_source_battlefield", parameters: {} },
    { family: "selector", primitiveId: "selector.unit", parameters: { scope: "any", area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1, selectionKey: "targetUnit" } },
    { family: "modifier", primitiveId: "modifier.grant_keyword", parameters: { keywordId: "keyword.shield", amount: 2, target: "unit", selectionKey: "targetUnit", duration: "thisCombat" } },
  ],
  "OGN-297": [
    { family: "modifier", primitiveId: "modifier.grant_keyword", parameters: { keywordId: "keyword.ganking", target: "unit", locationRelation: "sourceLocation", duration: "whileSourceAtBattlefield" } },
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
    const document = await publishCanonicalCard(db, {
      adminNotes: "OGN M2 keyword-grant and combat-role modifier family.",
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
    }, new Date().toISOString(), behaviorCatalog);
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
