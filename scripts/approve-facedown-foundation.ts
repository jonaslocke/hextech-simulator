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
import { cardSetFileSchema } from "../src/server/catalog";

const CONFIRM_FLAG = "--confirm";
const BANDLETREE_CARD_CODE = "OGN-278";

if (!process.argv.includes(CONFIRM_FLAG)) {
  throw new Error(
    `Refusing to approve facedown foundation cards without ${CONFIRM_FLAG}.`,
  );
}

type Assignment = {
  family: CanonicalCardPublicationInput["clauses"][number]["assignments"][number]["family"];
  primitiveId: string;
  parameters: Record<string, string | number | boolean | null>;
};

const MODELS: Record<string, Assignment[]> = {
  [BANDLETREE_CARD_CODE]: [
    {
      family: "modifier",
      primitiveId: "modifier.facedown_capacity",
      parameters: { amount: 1 },
    },
  ],
};

const client = await getMongoClient();

try {
  const printedSets = await Promise.all(
    ["ogn", "ogs", "sfd", "unl"].map(async (setName) =>
      cardSetFileSchema.parse(
        JSON.parse(
          await readFile(
            path.join(process.cwd(), "data", "sets", `${setName}.json`),
            "utf8",
          ),
        ),
      ),
    ),
  );
  const cards = printedSets.flat();
  const releases = await loadOfficialErrata(cards);
  const behaviorCatalog = await buildCurrentBehaviorCatalog();
  const db = client.db(getMongoDatabaseName());

  for (const [cardCode, assignments] of Object.entries(MODELS)) {
    const printedCard = cards.find(
      (card) => deriveCardCodeFromCard(card) === cardCode,
    );
    if (!printedCard) {
      throw new Error(`Missing local card data: ${cardCode}.`);
    }
    const overlay = applyOfficialErrata(printedCard, releases);
    const document = await publishCanonicalCard(
      db,
      {
        adminNotes:
          "Facedown foundation: generic battlefield facedown-capacity modifier.",
        card: overlay.effectiveCard,
        printedCard: overlay.printedCard,
        printedSourceTextHash: hashCardRulesText(overlay.printedCard),
        appliedErrata: overlay.appliedErrata,
        cardCode,
        modelingStatus: "approved",
        sourceTextHash: hashCardRulesText(overlay.effectiveCard),
        clauses: [
          {
            id: "facedown-capacity",
            sourceText: overlay.effectiveCard.text.plain,
            normalizedText: overlay.effectiveCard.text.plain,
            unsupportedReason: null,
            assignments: assignments.map((assignment) => ({
              ...assignment,
              confidence: "high" as const,
              sourceText: overlay.effectiveCard.text.plain,
            })),
          },
        ],
      },
      new Date().toISOString(),
      behaviorCatalog,
    );
    console.log(`Approved ${document.cardCode} ${document.card.name}`);
  }
} finally {
  await client.close();
}
