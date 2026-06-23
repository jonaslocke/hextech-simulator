import type { Db } from "mongodb";
import { z } from "zod";
import { cardSchema, type Card } from "../catalog";
import { loadBehaviorDefinitions } from "./behavior-definition-repository";
import { deriveCardCodeFromCard } from "./identity";
import { hashCardRulesText } from "./import-preview";
import {
  combineSupportStatuses,
  validatePrimitiveAssignmentParameters,
  type EngineSupportStatus,
  type PrimitiveCatalogEntry
} from "./primitive-catalog";

export const CANONICAL_CARDS_COLLECTION = "canonicalCards";

const primitiveFamilySchema = z.enum([
  "ability", "timing", "selector", "action", "modifier", "trigger",
  "condition", "choice", "cost", "replacement", "prevention", "keyword",
  "unsupported"
]);
const primitiveParameterValueSchema = z.union([
  z.string(), z.number(), z.boolean(), z.null()
]);

export const approvedPrimitiveAssignmentSchema = z.object({
  primitiveId: z.string().min(1),
  family: primitiveFamilySchema,
  sourceText: z.string(),
  parameters: z.record(primitiveParameterValueSchema),
  confidence: z.enum(["high", "medium", "low"])
}).strict();
export const approvedBehaviorClauseSchema = z.object({
  id: z.string().min(1),
  sourceText: z.string(),
  normalizedText: z.string(),
  assignments: z.array(approvedPrimitiveAssignmentSchema),
  unsupportedReason: z.string().nullable()
}).strict();
export const canonicalCardPublicationInputSchema = z.object({
  cardCode: z.string().min(1),
  card: cardSchema,
  sourceTextHash: z.string().min(1),
  modelingStatus: z.literal("approved"),
  clauses: z.array(approvedBehaviorClauseSchema),
  adminNotes: z.string()
}).strict();

export type ApprovedPrimitiveAssignment = z.infer<typeof approvedPrimitiveAssignmentSchema>;
export type ApprovedBehaviorClause = z.infer<typeof approvedBehaviorClauseSchema>;
export type CanonicalCardPublicationInput = z.infer<typeof canonicalCardPublicationInputSchema>;

export type CanonicalBehaviorBinding = {
  behaviorId: string;
  parameters: ApprovedPrimitiveAssignment["parameters"];
  confidence: ApprovedPrimitiveAssignment["confidence"];
  order: number;
};

export type CanonicalBehaviorClause = {
  id: string;
  sequence: number;
  sourceText: string;
  normalizedText: string;
  abilities: CanonicalBehaviorBinding[];
  triggers: CanonicalBehaviorBinding[];
  conditions: CanonicalBehaviorBinding[];
  selectors: CanonicalBehaviorBinding[];
  choices: CanonicalBehaviorBinding[];
  costs: CanonicalBehaviorBinding[];
  timings: CanonicalBehaviorBinding[];
  effects: CanonicalBehaviorBinding[];
  keywords: CanonicalBehaviorBinding[];
};

export type CanonicalBehaviorModel = {
  playTimings: CanonicalBehaviorBinding[];
  clauses: CanonicalBehaviorClause[];
};

export type CanonicalCardDocument = {
  id: string;
  cardCode: string;
  card: Card;
  sourceTextHash: string;
  modelingStatus: "approved";
  runtimeSupportStatus: EngineSupportStatus;
  behaviorModel: CanonicalBehaviorModel;
  approval: { adminNotes: string; approvedAt: string };
  createdAt: string;
  updatedAt: string;
};

type CanonicalCardMongoDocument = CanonicalCardDocument & { _id: string };

export async function publishCanonicalCard(
  db: Db,
  input: CanonicalCardPublicationInput,
  now = new Date().toISOString(),
  behaviorCatalog?: PrimitiveCatalogEntry[]
): Promise<CanonicalCardDocument> {
  const catalog = behaviorCatalog ?? (await loadBehaviorDefinitions(db));
  const collection = db.collection<CanonicalCardMongoDocument>(CANONICAL_CARDS_COLLECTION);
  const parsed = canonicalCardPublicationInputSchema.parse(input);
  const existing = await collection.findOne({ _id: parsed.cardCode });
  const document = buildCanonicalCardDocument(
    parsed,
    catalog,
    existing?.createdAt ?? now,
    now
  );
  const { id, createdAt, ...mutableFields } = document;

  await collection.updateOne(
    { _id: id },
    { $set: { ...mutableFields, id }, $setOnInsert: { _id: id, createdAt } },
    { upsert: true }
  );
  return document;
}

export function buildCanonicalCardDocument(
  input: CanonicalCardPublicationInput,
  behaviorCatalog: PrimitiveCatalogEntry[],
  createdAt: string,
  updatedAt: string
): CanonicalCardDocument {
  const parsed = canonicalCardPublicationInputSchema.parse(input);
  const card = normalizeCanonicalCard(parsed.card);
  const derivedCardCode = deriveCardCodeFromCard(card);

  if (parsed.cardCode !== derivedCardCode) {
    throw new Error(`Card code ${parsed.cardCode} does not match uploaded card ${derivedCardCode}.`);
  }
  if (parsed.sourceTextHash !== hashCardRulesText(card)) {
    throw new Error("Card rules text changed after preview.");
  }

  const catalogById = new Map(behaviorCatalog.map((behavior) => [behavior.id, behavior]));
  const clauseIds = new Set<string>();
  const playTimings: CanonicalBehaviorBinding[] = [];
  const runtimeSupportStatuses: EngineSupportStatus[] = [];
  const clauses = parsed.clauses.map((clause, sequence) => {
    if (clauseIds.has(clause.id)) {
      throw new Error(`Duplicate behavior clause id: ${clause.id}`);
    }
    clauseIds.add(clause.id);

    if (clause.unsupportedReason !== null) {
      throw new Error(
        `Unsupported behavior clause ${clause.id}: ${clause.unsupportedReason}`
      );
    }

    const structuredClause: CanonicalBehaviorClause = {
      id: clause.id,
      sequence,
      sourceText: clause.sourceText,
      normalizedText: clause.normalizedText,
      abilities: [],
      triggers: [],
      conditions: [],
      selectors: [],
      choices: [],
      costs: [],
      timings: [],
      effects: [],
      keywords: []
    };

    clause.assignments.forEach((assignment, order) => {
      const behavior = catalogById.get(assignment.primitiveId);
      if (!behavior) {
        throw new Error(`Unknown behavior definition: ${assignment.primitiveId}`);
      }
      if (behavior.family !== assignment.family) {
        throw new Error(`Behavior family mismatch: ${assignment.primitiveId}`);
      }
      const validation = validatePrimitiveAssignmentParameters(assignment, behavior);
      if (!validation.complete) {
        throw new Error(
          `Invalid behavior binding ${assignment.primitiveId}: ${validation.issues
            .map((issue) => issue.message).join(" ")}`
        );
      }
      if (
        assignment.primitiveId === "selector.friendly_unit" &&
        assignment.parameters.controller !== undefined &&
        assignment.parameters.controller !== "controller"
      ) {
        throw new Error(
          "Invalid behavior binding selector.friendly_unit: controller must reference the source controller."
        );
      }
      if (
        assignment.primitiveId === "selector.enemy_unit" &&
        assignment.parameters.controller !== undefined &&
        assignment.parameters.controller !== "opponent"
      ) {
        throw new Error(
          "Invalid behavior binding selector.enemy_unit: controller must reference an opponent."
        );
      }

      if (
        assignment.family === "condition" &&
        behavior.engineSupport.status === "ambiguous"
      ) {
        throw new Error(
          `Ambiguous behavior condition must be replaced before publication: ${assignment.primitiveId}`
        );
      }

      const binding = {
        behaviorId: assignment.primitiveId,
        parameters: assignment.parameters,
        confidence: assignment.confidence,
        order
      } satisfies CanonicalBehaviorBinding;
      runtimeSupportStatuses.push(behavior.engineSupport.status);

      if (
        card.classification.type === "Spell" &&
        (assignment.primitiveId === "timing.action" ||
          assignment.primitiveId === "timing.reaction")
      ) {
        playTimings.push(binding);
        return;
      }

      addBindingToStructuredClause(structuredClause, assignment.family, binding);
    });

    return structuredClause;
  });

  return {
    id: parsed.cardCode,
    cardCode: parsed.cardCode,
    card,
    sourceTextHash: parsed.sourceTextHash,
    modelingStatus: "approved",
    runtimeSupportStatus: combineSupportStatuses(runtimeSupportStatuses),
    behaviorModel: { playTimings, clauses },
    approval: { adminNotes: parsed.adminNotes, approvedAt: updatedAt },
    createdAt,
    updatedAt
  };
}

function addBindingToStructuredClause(
  clause: CanonicalBehaviorClause,
  family: ApprovedPrimitiveAssignment["family"],
  binding: CanonicalBehaviorBinding
): void {
  switch (family) {
    case "ability":
      clause.abilities.push(binding);
      return;
    case "trigger":
      clause.triggers.push(binding);
      return;
    case "condition":
      clause.conditions.push(binding);
      return;
    case "selector":
      clause.selectors.push(binding);
      return;
    case "choice":
      clause.choices.push(binding);
      return;
    case "cost":
      clause.costs.push(binding);
      return;
    case "timing":
      clause.timings.push(binding);
      return;
    case "action":
    case "modifier":
    case "replacement":
    case "prevention":
      clause.effects.push(binding);
      return;
    case "keyword":
      clause.keywords.push(binding);
      return;
    case "unsupported":
      throw new Error(`Unsupported behavior cannot be published: ${binding.behaviorId}`);
  }
}

export function normalizeCanonicalCard(card: Card): Card {
  return {
    id: card.id,
    name: card.name,
    ...(card.riftbound_id ? { riftbound_id: card.riftbound_id } : {}),
    public_code: card.public_code,
    ...(card.collector_number !== undefined ? { collector_number: card.collector_number } : {}),
    attributes: { ...card.attributes },
    classification: {
      type: card.classification.type,
      supertype: card.classification.supertype,
      ...(card.classification.rarity !== undefined ? { rarity: card.classification.rarity } : {}),
      domain: [...card.classification.domain]
    },
    text: { plain: card.text.plain, ...(card.text.rich !== undefined ? { rich: card.text.rich } : {}) },
    set: { ...card.set },
    media: { ...card.media },
    tags: [...card.tags],
    metadata: { ...card.metadata }
  };
}

export type PersistedCanonicalCardSummary = {
  cardCode: string;
  modelingStatus: "approved";
  runtimeSupportStatus: EngineSupportStatus;
  sourceTextHash: string;
  updatedAt: string;
};
export type ExistingCanonicalCardLookup = (
  cardCodes: string[]
) => Promise<Map<string, PersistedCanonicalCardSummary>>;

export function createMongoCanonicalCardLookup(db: Db): ExistingCanonicalCardLookup {
  return async (cardCodes) => {
    const uniqueCardCodes = [...new Set(cardCodes)];
    if (uniqueCardCodes.length === 0) return new Map();
    const documents = await db.collection<CanonicalCardMongoDocument>(CANONICAL_CARDS_COLLECTION)
      .find({ _id: { $in: uniqueCardCodes } }).toArray();
    return new Map(documents.map((document) => [document.cardCode, {
      cardCode: document.cardCode,
      modelingStatus: "approved" as const,
      runtimeSupportStatus: document.runtimeSupportStatus,
      sourceTextHash: document.sourceTextHash,
      updatedAt: document.updatedAt
    }]));
  };
}
