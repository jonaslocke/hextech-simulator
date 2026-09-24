import type { Card } from "../catalog";
import type { CanonicalCardPublicationInput } from "./canonical-card-repository";
import { hashCardRulesText } from "./import-preview";

const CLEAVE_CARD_CODE = "OGN-004";
const CLEAVE_EFFECT_TEXT = "Give a unit [Assault 3] this turn.";

/** Build the reviewed canonical model for Cleave from its local OGN printing. */
export function buildCleaveCanonicalPublication(
  card: Card,
): CanonicalCardPublicationInput {
  const cardCode = card.public_code.split("/")[0];
  if (cardCode !== CLEAVE_CARD_CODE || card.name !== "Cleave") {
    throw new Error(`Expected ${CLEAVE_CARD_CODE} Cleave, received ${card.public_code}.`);
  }

  const sourceText = card.text.plain;
  const assignments: CanonicalCardPublicationInput["clauses"][number]["assignments"] = [
    {
      family: "timing",
      primitiveId: "timing.action",
      sourceText,
      parameters: {},
      confidence: "high",
    },
    {
      family: "selector",
      primitiveId: "selector.unit",
      sourceText: CLEAVE_EFFECT_TEXT,
      parameters: {
        scope: "any",
        minimumCount: 1,
        maximumCount: 1,
        area: "board",
        locationRelation: "any",
        excludesSource: false,
      },
      confidence: "high",
    },
    {
      family: "modifier",
      primitiveId: "modifier.grant_keyword",
      sourceText: CLEAVE_EFFECT_TEXT,
      parameters: {
        keywordBehaviorId: "keyword.assault",
        amount: 3,
        target: "unit",
        duration: "thisTurn",
        displayDuration: "This turn",
      },
      confidence: "high",
    },
  ];

  return {
    cardCode: CLEAVE_CARD_CODE,
    card,
    sourceTextHash: hashCardRulesText(card),
    modelingStatus: "approved",
    adminNotes: "OGN Cleave executable model: grant Assault 3 to one unit this turn.",
    clauses: [
      {
        id: "clause-1",
        sourceText,
        normalizedText: sourceText,
        assignments,
        unsupportedReason: null,
      },
    ],
  };
}
