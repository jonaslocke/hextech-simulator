import type { Db } from "mongodb";
import type { DeckValidationReason } from "@/shared/deck-validation";
import {
  CANONICAL_CARDS_COLLECTION,
  BehaviorCatalogNotInitializedError,
  hashCardRulesText,
  loadBehaviorDefinitions,
  validatePrimitiveAssignmentParameters,
  type CanonicalBehaviorBinding,
  type CanonicalBehaviorClause,
  type CanonicalCardDocument,
  type PrimitiveCatalogEntry,
} from "../card-catalog";
import { deriveCardCodeFromCard } from "../card-catalog/identity";
import { compileBehaviorModel } from "./behavior-runtime";
import { createPrimitiveHandlers } from "./primitive-handlers";
import { getRuntimeCoverageStatus } from "./runtime-coverage";
import { gameCardDefinitionSchema, type GameCardDefinition } from "./schemas";

export type RuntimeBehaviorDefinition = Omit<PrimitiveCatalogEntry, "examples">;

/** Reads publication evidence without publishing, repairing, or changing it. */
export async function loadCanonicalDeckReadiness(db: Db, cardCodes: readonly string[]) {
  const codes = [...new Set(cardCodes)];
  const [documents, behaviorDefinitions] = await Promise.all([
    db.collection<CanonicalCardDocument>(CANONICAL_CARDS_COLLECTION)
      .find({ cardCode: { $in: codes } }).toArray(),
    loadBehaviorDefinitions(db).catch((error: unknown) => {
      if (error instanceof BehaviorCatalogNotInitializedError) return error;
      throw error;
    }),
  ]);
  const result = inspectCanonicalDeckReadiness({
    cards: documents,
    behaviorDefinitions: behaviorDefinitions instanceof BehaviorCatalogNotInitializedError ? [] : behaviorDefinitions,
  });
  if (behaviorDefinitions instanceof BehaviorCatalogNotInitializedError) {
    result.reasons.push(...behaviorDefinitions.details.map((message) => ({
      code: "deck.behaviorCatalogUnsynchronized", message,
    })));
  }
  for (const cardCode of codes) {
    if (!documents.some((document) => document.cardCode === cardCode)) {
      result.reasons.push({
        code: "deck.canonicalModelMissing",
        message: `Missing approved canonical card: ${cardCode}.`,
        cardCode,
      });
    }
  }
  return result;
}

/** The same catalog and executable-runtime checks used by snapshot loading. */
export function inspectCanonicalDeckReadiness(input: {
  cards: readonly CanonicalCardDocument[];
  behaviorDefinitions: readonly RuntimeBehaviorDefinition[];
}): { cards: GameCardDefinition[]; reasons: DeckValidationReason[] } {
  const cards: GameCardDefinition[] = [];
  const reasons: DeckValidationReason[] = [];
  const definitions = new Map(input.behaviorDefinitions.map((definition) => [definition.id, definition]));
  const seen = new Set<string>();
  for (const document of input.cards) {
    const add = (code: string, message: string) => reasons.push({
      code, message, cardCode: document.cardCode, canonicalName: document.card?.name,
    });
    if (seen.has(document.cardCode)) {
      add("deck.canonicalIdentityAmbiguous", `Multiple canonical documents for ${document.cardCode}.`);
      continue;
    }
    seen.add(document.cardCode);
    const parsed = gameCardDefinitionSchema.safeParse({
      cardCode: document.cardCode,
      sourceTextHash: document.sourceTextHash,
      card: document.card,
      behaviorModel: document.behaviorModel,
      effectText: document.effectText,
      effectBehaviorModel: document.effectBehaviorModel,
    });
    if (!parsed.success) {
      add("deck.canonicalModelMalformed", `Malformed canonical card ${document.cardCode}: ${parsed.error.message}`);
      continue;
    }
    const definition = parsed.data;
    cards.push(definition);
    if (document.modelingStatus !== "approved") {
      add("deck.canonicalModelUnapproved", `Canonical card is not approved: ${definition.card.name}`);
    }
    if (deriveCardCodeFromCard(definition.card) !== document.cardCode) {
      add("deck.canonicalIdentityMismatch", `Canonical identity mismatch: ${definition.card.name}`);
    }
    if (hashCardRulesText(definition.card) !== document.sourceTextHash) {
      add("deck.canonicalRulesStale", `Stale canonical rules text: ${definition.card.name}`);
    }
    for (const [label, model] of [
      ["", definition.behaviorModel],
      ["Effect Text ", definition.effectBehaviorModel],
    ] as const) {
      if (!model) continue;
      model.clauses.forEach((clause, sequence) => {
        if (clause.sequence !== sequence) {
          add("deck.canonicalClauseSequence", `Invalid ${label}clause sequence for ${document.cardCode}:${clause.id}`);
        }
        validateClause(document.cardCode, clause, definitions, add);
      });
      validateBindings(document.cardCode, `${label}playTimings`, model.playTimings, definitions, add);
    }
  }
  reasons.push(...inspectSnapshotRuntimeReadiness(cards));
  return { cards, reasons };
}

/** Snapshot evidence can be checked again without inventing publication status. */
export function inspectSnapshotRuntimeReadiness(cards: readonly GameCardDefinition[]): DeckValidationReason[] {
  const reasons: DeckValidationReason[] = [];
  const handlers = createPrimitiveHandlers({
    definitions: new Map(cards.map((definition) => [definition.cardCode, definition])),
    instances: new Map(),
  });
  for (const definition of cards) {
    for (const model of [definition.behaviorModel, definition.effectBehaviorModel]) {
      if (!model) continue;
      try {
        compileBehaviorModel(model, handlers);
      } catch (error) {
        reasons.push({
          code: "deck.runtimeCompilationFailed",
          message: `Runtime compilation failed for ${definition.cardCode}: ${error instanceof Error ? error.message : "Unknown runtime error"}`,
          cardCode: definition.cardCode,
          canonicalName: definition.card.name,
        });
      }
    }
  }
  return reasons;
}

type AddReason = (code: string, message: string) => void;

function validateClause(
  cardCode: string,
  clause: CanonicalBehaviorClause,
  definitions: ReadonlyMap<string, RuntimeBehaviorDefinition>,
  add: AddReason,
) {
  for (const [group, bindings] of Object.entries(clause)) {
    if (Array.isArray(bindings)) validateBindings(cardCode, `${clause.id}.${group}`, bindings, definitions, add);
  }
}

function validateBindings(
  cardCode: string,
  group: string,
  bindings: readonly CanonicalBehaviorBinding[],
  definitions: ReadonlyMap<string, RuntimeBehaviorDefinition>,
  add: AddReason,
) {
  const orders = new Set<number>();
  for (const binding of bindings) {
    if (orders.has(binding.order)) add("deck.canonicalBindingOrder", `Duplicate binding order in ${cardCode}:${group}`);
    orders.add(binding.order);
    const definition = definitions.get(binding.behaviorId);
    if (!definition) {
      add("deck.behaviorDefinitionMissing", `Missing synchronized behavior definition: ${binding.behaviorId}`);
    } else {
      const validation = validatePrimitiveAssignmentParameters({
        primitiveId: binding.behaviorId,
        family: definition.family,
        sourceText: "",
        parameters: binding.parameters,
        confidence: binding.confidence,
      }, { ...definition, examples: [] });
      if (!validation.complete) add("deck.canonicalParametersInvalid", `Invalid canonical parameters for ${cardCode}:${binding.behaviorId}`);
    }
    const status = getRuntimeCoverageStatus(binding.behaviorId);
    if (status !== "executable") {
      add("deck.behaviorNotExecutable", `Behavior is not executable for ${cardCode}:${group}:${binding.behaviorId} (${status ?? "missing"})`);
    }
  }
}
