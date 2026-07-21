import ognCards from "@data/sets/ogn.json";
import ogsCards from "@data/sets/ogs.json";
import sfdCards from "@data/sets/sfd.json";
import unlCards from "@data/sets/unl.json";
import {
  deriveCanonicalPrintingGroupKey,
  deriveCardCodeFromCard,
} from "@/server/card-catalog/identity";
import { resolveCanonicalPrintingGroups } from "@/server/card-catalog/printing-selection";
import { cardSetFileSchema } from "@/server/catalog";
import type { GameCardDefinition } from "./schemas";

const tokenPrintingGroups = resolveCanonicalPrintingGroups(
  cardSetFileSchema
  .parse([...ognCards, ...ogsCards, ...sfdCards, ...unlCards])
  .filter((card) => card.classification.supertype === "Token"),
  deriveCanonicalPrintingGroupKey,
);
if (tokenPrintingGroups.unresolved.length > 0) {
  throw new Error(
    tokenPrintingGroups.unresolved.map((group) => group.reason).join("; "),
  );
}
const tokenCards = tokenPrintingGroups.selected;

const tokenDefinitions = tokenCards.map((card) => ({
  cardCode: deriveCardCodeFromCard(card),
  sourceTextHash: `token:${deriveCardCodeFromCard(card)}`,
  card,
  behaviorModel: card.text.plain.includes("[Temporary]")
    ? { playTimings: [], clauses: [{ id: "temporary", sequence: 0, sourceText: "[Temporary]", normalizedText: "[Temporary]", abilities: [], triggers: [{ behaviorId: "trigger.beginning", parameters: { player: "controller" }, confidence: "high", order: 0 }], conditions: [], selectors: [], choices: [], costs: [], timings: [], effects: [{ behaviorId: "action.kill_unit", parameters: { target: "source" }, confidence: "high", order: 1 }], keywords: [{ behaviorId: "keyword.temporary", parameters: {}, confidence: "high", order: 2 }] }] }
    : { playTimings: [], clauses: [] },
}) satisfies GameCardDefinition);

const tokenDefinitionsByCode = new Map(
  tokenDefinitions.map((definition) => [definition.cardCode, definition]),
);

export function getTokenCatalogDefinitions(): readonly GameCardDefinition[] {
  return tokenDefinitions;
}

export function getTokenCatalogDefinition(
  cardCode: string,
): GameCardDefinition | undefined {
  return tokenDefinitionsByCode.get(cardCode);
}
