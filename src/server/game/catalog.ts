import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Db } from "mongodb";
import {
  BEHAVIORS_COLLECTION,
  CANONICAL_CARDS_COLLECTION,
  hashCardRulesText,
  loadBehaviorDefinitions,
  validatePrimitiveAssignmentParameters,
  type BehaviorDefinitionDocument,
  type CanonicalBehaviorBinding,
  type CanonicalBehaviorClause,
  type CanonicalCardDocument
} from "../card-catalog";
import { deriveCardCodeFromCard } from "../card-catalog/identity";
import { parseDeckList } from "../deck";
import { getRuntimeCoverageStatus } from "./runtime-coverage";
import {
  deckSnapshotSchema,
  gameCardDefinitionSchema,
  type DeckSnapshot,
  type GameCardDefinition
} from "./schemas";

export const INITIAL_DECK_ID = "lux" as const;
export const INITIAL_DECK_PATH = path.join("data", "decks", "lux.dec.txt");
export const INITIAL_DECK_UNIQUE_CARD_COUNT = 21;

type CanonicalCardStoredDocument = CanonicalCardDocument & { _id: string };
type BehaviorStoredDocument = BehaviorDefinitionDocument & { _id: string };

export class GameCatalogError extends Error {
  readonly code = "game_catalog_unavailable";

  constructor(public readonly issues: string[]) {
    super(`Game catalog is unavailable: ${issues.join("; ")}`);
  }
}

export async function loadInitialDeckSnapshot(
  db: Db,
  sourceText?: string
): Promise<DeckSnapshot> {
  const text = sourceText ?? await readFile(path.join(process.cwd(), INITIAL_DECK_PATH), "utf8");
  const parsedDeck = parseDeckList(text);
  const names = [...new Set(parsedDeck.entries.map((entry) => entry.name))];
  const [storedCards, behaviorDefinitions] = await Promise.all([
    db.collection<CanonicalCardStoredDocument>(CANONICAL_CARDS_COLLECTION)
      .find({ "card.name": { $in: names } }).toArray(),
    db.collection<BehaviorStoredDocument>(BEHAVIORS_COLLECTION).find({}).toArray(),
    loadBehaviorDefinitions(db)
  ]);

  return buildDeckSnapshot(text, storedCards, behaviorDefinitions);
}

export function buildDeckSnapshot(
  sourceText: string,
  canonicalCards: readonly CanonicalCardDocument[],
  behaviorDefinitions: readonly BehaviorDefinitionDocument[]
): DeckSnapshot {
  const parsedDeck = parseDeckList(sourceText);
  const expectedNames = [...new Set(parsedDeck.entries.map((entry) => entry.name))];
  const cardsByName = new Map(canonicalCards.map((document) => [document.card.name, document]));
  const definitionsById = new Map(behaviorDefinitions.map((definition) => [definition.id, definition]));
  const issues: string[] = [];

  if (expectedNames.length !== INITIAL_DECK_UNIQUE_CARD_COUNT) {
    issues.push(
      `Initial deck must contain ${INITIAL_DECK_UNIQUE_CARD_COUNT} unique cards; found ${expectedNames.length}.`
    );
  }

  const cards = expectedNames.flatMap((name): GameCardDefinition[] => {
    const document = cardsByName.get(name);
    if (!document) {
      issues.push(`Missing approved canonical card: ${name}`);
      return [];
    }
    validateCanonicalDocument(document, definitionsById, issues);
    const result = gameCardDefinitionSchema.safeParse({
      cardCode: document.cardCode,
      sourceTextHash: document.sourceTextHash,
      card: document.card,
      behaviorModel: document.behaviorModel
    });
    if (!result.success) {
      issues.push(`Malformed canonical card ${document.cardCode}: ${result.error.message}`);
      return [];
    }
    return [result.data];
  });

  if (issues.length > 0) throw new GameCatalogError(issues);

  const cardsByNameResolved = new Map(cards.map((definition) => [definition.card.name, definition]));
  const digest = createHash("sha256")
    .update(JSON.stringify([...cards].sort((left, right) => left.cardCode.localeCompare(right.cardCode))))
    .digest("hex");

  return deckSnapshotSchema.parse({
    sourceText,
    catalogDigest: digest,
    entries: parsedDeck.entries.map((entry) => ({
      section: entry.section,
      quantity: entry.quantity,
      cardCode: cardsByNameResolved.get(entry.name)!.cardCode
    })),
    cards
  });
}

function validateCanonicalDocument(
  document: CanonicalCardDocument,
  definitionsById: ReadonlyMap<string, BehaviorDefinitionDocument>,
  issues: string[]
): void {
  if (document.modelingStatus !== "approved") {
    issues.push(`Canonical card is not approved: ${document.card.name}`);
  }
  if (deriveCardCodeFromCard(document.card) !== document.cardCode) {
    issues.push(`Canonical identity mismatch: ${document.card.name}`);
  }
  if (hashCardRulesText(document.card) !== document.sourceTextHash) {
    issues.push(`Stale canonical rules text: ${document.card.name}`);
  }

  const clauses = document.behaviorModel.clauses;
  clauses.forEach((clause, sequence) => {
    if (clause.sequence !== sequence) {
      issues.push(`Invalid clause sequence for ${document.cardCode}:${clause.id}`);
    }
    validateClause(document.cardCode, clause, definitionsById, issues);
  });
  validateBindings(document.cardCode, "playTimings", document.behaviorModel.playTimings, definitionsById, issues);
}

function validateClause(
  cardCode: string,
  clause: CanonicalBehaviorClause,
  definitionsById: ReadonlyMap<string, BehaviorDefinitionDocument>,
  issues: string[]
): void {
  for (const [group, bindings] of Object.entries(clause)) {
    if (!Array.isArray(bindings)) continue;
    validateBindings(cardCode, `${clause.id}.${group}`, bindings, definitionsById, issues);
  }
}

function validateBindings(
  cardCode: string,
  group: string,
  bindings: readonly CanonicalBehaviorBinding[],
  definitionsById: ReadonlyMap<string, BehaviorDefinitionDocument>,
  issues: string[]
): void {
  const orders = new Set<number>();
  for (const binding of bindings) {
    if (orders.has(binding.order)) issues.push(`Duplicate binding order in ${cardCode}:${group}`);
    orders.add(binding.order);
    if (!definitionsById.has(binding.behaviorId)) {
      issues.push(`Missing synchronized behavior definition: ${binding.behaviorId}`);
    } else {
      const definition = definitionsById.get(binding.behaviorId)!;
      const validation = validatePrimitiveAssignmentParameters({
        primitiveId: binding.behaviorId,
        family: definition.family,
        sourceText: "",
        parameters: binding.parameters,
        confidence: binding.confidence
      }, { ...definition, examples: [] });
      if (!validation.complete) {
        issues.push(`Invalid canonical parameters for ${cardCode}:${binding.behaviorId}`);
      }
    }
    if (!getRuntimeCoverageStatus(binding.behaviorId)) {
      issues.push(`Missing game runtime coverage: ${binding.behaviorId}`);
    }
  }
}
