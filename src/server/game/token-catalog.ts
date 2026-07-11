import ognCards from "@data/sets/ogn.json";
import ogsCards from "@data/sets/ogs.json";
import sfdCards from "@data/sets/sfd.json";
import unlCards from "@data/sets/unl.json";
import { deriveCardCodeFromCard } from "@/server/card-catalog/identity";
import { cardSetFileSchema } from "@/server/catalog";
import type { GameCardDefinition } from "./schemas";

const tokenCards = cardSetFileSchema
  .parse([...ognCards, ...ogsCards, ...sfdCards, ...unlCards])
  .filter((card) => card.classification.supertype === "Token");

const tokenDefinitions = tokenCards.map((card) => ({
  cardCode: deriveCardCodeFromCard(card),
  sourceTextHash: `token:${deriveCardCodeFromCard(card)}`,
  card,
  behaviorModel: { playTimings: [], clauses: [] },
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
