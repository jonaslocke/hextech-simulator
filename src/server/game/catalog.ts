import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import {
  CANONICAL_CARDS_COLLECTION,
  hashCardRulesText,
  loadBehaviorDefinitions,
  validatePrimitiveAssignmentParameters,
  type CanonicalBehaviorBinding,
  type CanonicalBehaviorClause,
  type CanonicalCardDocument,
  type PrimitiveCatalogEntry,
} from "../card-catalog";
import { deriveCardCodeFromCard } from "../card-catalog/identity";
import { selectPreferredPrinting } from "../card-catalog/printing-selection";
import {
  getDeckCardLookupCandidates,
  getDeckCardNameAliases,
} from "../catalog";
import { parseDeckList } from "../deck";
import { getRuntimeCoverageStatus } from "./runtime-coverage";
import {
  compileBehaviorModel,
} from "./behavior-runtime";
import { createPrimitiveHandlers } from "./primitive-handlers";
import {
  deckSnapshotSchema,
  gameCardDefinitionSchema,
  type DeckSnapshot,
  type GameCardDefinition
} from "./schemas";

type CanonicalCardStoredDocument = CanonicalCardDocument & { _id: string };
type RuntimeBehaviorDefinition = Omit<PrimitiveCatalogEntry, "examples">;

export class GameCatalogError extends Error {
  readonly code = "game_catalog_unavailable";

  constructor(public readonly issues: string[]) {
    super(`Game catalog is unavailable: ${issues.join("; ")}`);
  }
}

export async function buildDeckSnapshotFromSource(
  db: Db,
  sourceText: string,
): Promise<DeckSnapshot> {
  const parsedDeck = parseDeckList(sourceText);
  const names = [...new Set(parsedDeck.entries.map((entry) => entry.name))];
  const queryNames = [...new Set(names.flatMap(cardNameLookupCandidates))];
  const [storedCards, behaviorDefinitions] = await Promise.all([
    db.collection<CanonicalCardStoredDocument>(CANONICAL_CARDS_COLLECTION)
      .find({ "card.name": { $in: queryNames } }).toArray(),
    loadBehaviorDefinitions(db),
  ]);

  return buildDeckSnapshot(sourceText, storedCards, behaviorDefinitions);
}

export function buildDeckSnapshot(
  sourceText: string,
  canonicalCards: readonly CanonicalCardDocument[],
  behaviorDefinitions: readonly RuntimeBehaviorDefinition[],
): DeckSnapshot {
  const parsedDeck = parseDeckList(sourceText);
  const expectedNames = [...new Set(parsedDeck.entries.map((entry) => entry.name))];
  const issues: string[] = [];
  const candidatesByName = new Map<string, CanonicalCardDocument[]>();
  const cardsByName = new Map<string, CanonicalCardDocument>();
  for (const document of canonicalCards) {
    for (const name of getDeckCardNameAliases(document.card)) {
      addCanonicalCardCandidate(candidatesByName, name, document);
    }
    for (const alias of legacyCardNameAliases(document.card.name)) {
      addCanonicalCardCandidate(candidatesByName, alias, document);
    }
  }
  for (const [name, candidates] of candidatesByName) {
    try {
      const card = selectPreferredPrinting(
        candidates.map((candidate) => candidate.card),
        name,
      );
      cardsByName.set(name, candidates.find((candidate) => candidate.card === card)!);
    } catch (caught) {
      issues.push(caught instanceof Error ? caught.message : `Unresolved printing: ${name}`);
    }
  }
  const definitionsById = new Map(behaviorDefinitions.map((definition) => [definition.id, definition]));

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

  const cardsByNameResolved = new Map<string, GameCardDefinition>();
  for (const definition of cards) {
    for (const name of getDeckCardNameAliases(definition.card)) {
      cardsByNameResolved.set(name, definition);
    }
    for (const alias of legacyCardNameAliases(definition.card.name)) {
      cardsByNameResolved.set(alias, definition);
    }
  }
  const handlers = createPrimitiveHandlers({
    definitions: new Map(cards.map((definition) => [definition.cardCode, definition])),
    instances: new Map(),
  });
  for (const definition of cards) {
    try {
      compileBehaviorModel(definition.behaviorModel, handlers);
    } catch (error) {
      issues.push(
        `Runtime compilation failed for ${definition.cardCode}: ${
          error instanceof Error ? error.message : "Unknown runtime error"
        }`,
      );
    }
  }
  if (issues.length > 0) throw new GameCatalogError(issues);
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

function legacyCardNameAliases(name: string): string[] {
  if (name.startsWith("Master Yi, ")) {
    return [name.replace(/^Master Yi, /, "Yi, ")];
  }

  return [];
}

function cardNameLookupCandidates(name: string): string[] {
  const candidates = getDeckCardLookupCandidates(name);
  if (!name.startsWith("Yi, ")) return candidates;

  return [...new Set([...candidates, name.replace(/^Yi, /, "Master Yi, ")])];
}

function addCanonicalCardCandidate(
  cardsByName: Map<string, CanonicalCardDocument[]>,
  name: string,
  candidate: CanonicalCardDocument,
) {
  cardsByName.set(name, [...(cardsByName.get(name) ?? []), candidate]);
}

function validateCanonicalDocument(
  document: CanonicalCardDocument,
  definitionsById: ReadonlyMap<string, RuntimeBehaviorDefinition>,
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
  definitionsById: ReadonlyMap<string, RuntimeBehaviorDefinition>,
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
  definitionsById: ReadonlyMap<string, RuntimeBehaviorDefinition>,
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
    const runtimeStatus = getRuntimeCoverageStatus(binding.behaviorId);
    if (runtimeStatus !== "executable") {
      issues.push(
        `Behavior is not executable for ${cardCode}:${group}:${binding.behaviorId} (${runtimeStatus ?? "missing"})`,
      );
    }
  }
}
