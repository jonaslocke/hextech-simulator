import { getMongoClient, getMongoDatabaseName } from "../src/server/db";
import {
  buildCurrentBehaviorCatalog,
  hashCardRulesText,
  publishCanonicalCard,
  type CanonicalCardPublicationInput,
} from "../src/server/card-catalog";
import { cardSetFileSchema, type Card } from "../src/server/catalog";
import { readFile } from "node:fs/promises";
import path from "node:path";

const CONFIRM_FLAG = "--confirm";
const RECRUIT_TOKEN = "1 :rb_might: Recruit unit";

const CARD_MODELS: Record<
  string,
  Array<{
    id: string;
    sourceText: string;
    assignments: Array<{
      family: CanonicalCardPublicationInput["clauses"][number]["assignments"][number]["family"];
      primitiveId: string;
      parameters: Record<string, string | number | boolean | null>;
      confidence?: "high" | "medium" | "low";
    }>;
  }>
> = {
  "OGN-130": [
    {
      id: "clause-1",
      sourceText: "When I attack, deal 1 to an enemy unit here",
      assignments: [
        { family: "trigger", primitiveId: "trigger.attack", parameters: {} },
        {
          family: "selector",
          primitiveId: "selector.enemy_unit",
          parameters: {
            minimumCount: 1,
            maximumCount: 1,
            area: "battlefield",
            locationRelation: "sourceLocation",
            controller: "opponent",
            excludesSource: false,
          },
        },
        {
          family: "action",
          primitiveId: "action.deal_damage",
          parameters: { amount: 1, target: "unit" },
        },
      ],
    },
  ],
  "OGN-294": [
    {
      id: "clause-1",
      sourceText: "Units here have +1 :rb_might: (This includes attackers.)",
      assignments: [
        {
          family: "modifier",
          primitiveId: "modifier.modify_numeric_value",
          parameters: {
            attribute: "might",
            operation: "increase",
            operand: "constant",
            amount: 1,
            target: "unit",
            locationRelation: "sourceLocation",
            duration: "whileSourceAtBattlefield",
          },
        },
      ],
    },
  ],
  "OGS-013": [
    {
      id: "clause-1",
      sourceText: "Other friendly units have +1 :rb_might: here",
      assignments: [
        {
          family: "modifier",
          primitiveId: "modifier.modify_numeric_value",
          parameters: {
            attribute: "might",
            operation: "increase",
            operand: "constant",
            amount: 1,
            target: "friendly_unit",
            locationRelation: "sourceLocation",
            excludesSource: true,
            duration: "whileSourceOnBoard",
          },
        },
      ],
    },
  ],
  "OGS-015": [
    {
      id: "clause-1",
      sourceText:
        "[Action] (Play on your turn or in showdowns.)Play four 1 :rb_might: Recruit unit tokens (They can be played to your base or to battlefields you control.)",
      assignments: [
        { family: "timing", primitiveId: "timing.action", parameters: {} },
        {
          family: "action",
          primitiveId: "action.play_token",
          parameters: {
            tokenName: RECRUIT_TOKEN,
            count: 4,
            placement: "chooseBaseOrControlledBattlefield",
          },
          confidence: "medium",
        },
      ],
    },
  ],
  "OGS-024": [
    {
      id: "clause-1",
      sourceText:
        "[Action] (Play on your turn or in showdowns.)Give friendly units +2 :rb_might: this turn.",
      assignments: [
        { family: "timing", primitiveId: "timing.action", parameters: {} },
        {
          family: "selector",
          primitiveId: "selector.friendly_unit",
          parameters: {
            minimumCount: 0,
            maximumCount: 0,
            area: "board",
            locationRelation: "any",
            controller: "controller",
            excludesSource: false,
            automatic: true,
            selectionKey: "friendlyUnits",
          },
        },
        {
          family: "modifier",
          primitiveId: "modifier.modify_numeric_value",
          parameters: {
            attribute: "might",
            operation: "increase",
            operand: "constant",
            amount: 2,
            target: "friendly_unit",
            duration: "thisTurn",
            selectionKey: "friendlyUnits",
          },
        },
      ],
    },
  ],
};

if (!process.argv.includes(CONFIRM_FLAG)) {
  console.error(
    `Refusing to mutate canonical cards without ${CONFIRM_FLAG}.`,
  );
  process.exit(1);
}

const client = await getMongoClient();
try {
  const db = client.db(getMongoDatabaseName());
  const behaviorCatalog = await buildCurrentBehaviorCatalog();
  const cards = await loadCards();

  for (const [cardCode, clauses] of Object.entries(CARD_MODELS)) {
    const card = cards.get(cardCode);
    if (!card) throw new Error(`Missing local card data: ${cardCode}`);
    const document = await publishCanonicalCard(
      db,
      {
        adminNotes: "M1 Garen canonical behavior repair.",
        card,
        cardCode,
        clauses: clauses.map((clause) => ({
          id: clause.id,
          sourceText: clause.sourceText,
          normalizedText: clause.sourceText,
          unsupportedReason: null,
          assignments: clause.assignments.map((assignment) => ({
            confidence: assignment.confidence ?? "high",
            family: assignment.family,
            parameters: assignment.parameters,
            primitiveId: assignment.primitiveId,
            sourceText: clause.sourceText,
          })),
        })),
        modelingStatus: "approved",
        sourceTextHash: hashCardRulesText(card),
      },
      new Date().toISOString(),
      behaviorCatalog,
    );
    console.log(`Repaired ${document.cardCode} ${document.card.name}`);
  }
} finally {
  await client.close();
}

async function loadCards() {
  const result = new Map<string, Card>();
  for (const filename of ["ogs.json", "ogn.json"]) {
    const raw = await readFile(
      path.join(process.cwd(), "data", "sets", filename),
      "utf8",
    );
    for (const card of cardSetFileSchema.parse(JSON.parse(raw))) {
      const code = card.public_code.split("/")[0];
      if (code) result.set(code, card);
    }
  }
  return result;
}
