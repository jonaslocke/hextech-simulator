import type { Db } from "mongodb";
import {
  CANONICAL_CARDS_COLLECTION,
  analyzeCardBehaviorSuggestions,
  buildCurrentBehaviorCatalog,
  type CanonicalCardDocument,
  type CardBehaviorSuggestion,
  type PrimitiveCatalogEntry,
} from "../../src/server/card-catalog";
import { deriveCardCodeFromCard } from "../../src/server/card-catalog/identity";
import { hashCardRulesText } from "../../src/server/card-catalog/import-preview";
import { loadSourceCardCatalog, type Card } from "../../src/server/catalog";
import { inspectCanonicalDeckReadiness } from "../../src/server/game/catalog-readiness";
import {
  getRuntimeCoverageStatus,
  type RuntimeCoverageStatus,
} from "../../src/server/game/runtime-coverage";

export type CardImplementationStatus =
  | "unknown"
  | "not_published"
  | "published_stale"
  | "published_not_executable"
  | "executable";

export type CardImplementationEvidence = {
  status: CardImplementationStatus;
  sourceTextHash: string;
  canonicalSourceTextHash: string | null;
  runtimeSupportStatus: string | null;
  readinessReasons: string[];
  behaviorModel: CanonicalCardDocument["behaviorModel"] | null;
  effectBehaviorModel: CanonicalCardDocument["effectBehaviorModel"] | null;
};

export type JevBehaviorCapability = Omit<PrimitiveCatalogEntry, "examples"> & {
  runtimeCoverage: RuntimeCoverageStatus | null;
  examples: PrimitiveCatalogEntry["examples"];
};

export type CompactBehaviorSuggestion = {
  cardCode: string;
  cardName: string;
  publicCode: string;
  setCode: string;
  rulesText: string;
  primitiveIds: string[];
  supportStatus: CardBehaviorSuggestion["supportStatus"];
  unsupportedClauseCount: number;
  missingRequiredParameterCount: number;
  clauses: Array<{
    id: string;
    sourceText: string;
    normalizedText: string;
    supportStatus: CardBehaviorSuggestion["supportStatus"];
    unsupportedReason: string | null;
    missingRequiredParameters: string[];
    assignments: Array<{
      primitiveId: string;
      family: string;
      parameters: Record<string, string | number | boolean | null>;
      confidence: "high" | "medium" | "low";
      supportStatus: string;
      parameterValidation: {
        complete: boolean;
        missingRequired: string[];
        issues: Array<{ parameterName: string; message: string }>;
      };
    }>;
  }>;
};

export type CardJevTriageState = {
  objective: string;
  constraints: string[];
  targetCard: Card;
  targetIdentity: {
    cardCode: string;
    publicCode: string;
    sourceTextHash: string;
  };
  implementation: CardImplementationEvidence;
  deterministicSuggestion: CompactBehaviorSuggestion | null;
  behaviorCatalog: JevBehaviorCapability[];
  catalogMetadata: {
    sourceCatalogVersionHash: string;
    sourceSetFiles: string[];
    behaviorPrimitiveCount: number;
  };
};

export type CardTriageTarget =
  | {
      publicCode: string;
      cardName?: never;
    }
  | {
      cardName: string;
      publicCode?: never;
    };

export async function buildCardJevTriageState(input: {
  target: CardTriageTarget;
  db?: Db | null;
}): Promise<CardJevTriageState> {
  const [sourceCatalog, primitiveCatalog] = await Promise.all([
    loadSourceCardCatalog(),
    buildCurrentBehaviorCatalog(),
  ]);
  const card = resolveTargetCard(sourceCatalog, input.target);
  const cardCode = deriveCardCodeFromCard(card);
  const sourceTextHash = hashCardRulesText(card);
  const suggestionReport = analyzeCardBehaviorSuggestions(
    [card],
    [card.set.set_id],
    primitiveCatalog,
  );
  const deterministicSuggestion = suggestionReport.cards[0]
    ? compactBehaviorSuggestion(suggestionReport.cards[0])
    : null;
  const implementation = await inspectImplementation({
    db: input.db ?? null,
    cardCode,
    sourceTextHash,
    primitiveCatalog,
  });

  return {
    objective:
      "Choose the lowest-discovery-cost faithful implementation route for exactly this card. Prefer accepted reusable behavior semantics. Do not redefine an existing primitive merely to make the card fit it.",
    constraints: [
      "The target card is the only implementation task being classified.",
      "Existing primitive meanings are protected contracts.",
      "A composition of existing primitives is preferred when it faithfully expresses every material card-text clause.",
      "A primitive with runtimeCoverage=executable is already available to the game runtime; other coverage values require implementation work before the card can rely on it.",
      "The deterministic suggestion is evidence, not authority. Judge it against the target card and behavior catalog.",
      "New shared capability is justified only when no existing primitive or faithful composition can express a material semantic distinction.",
      "Do not infer repository implementation details that are not present in this state.",
    ],
    targetCard: card,
    targetIdentity: {
      cardCode,
      publicCode: card.public_code,
      sourceTextHash,
    },
    implementation,
    deterministicSuggestion,
    behaviorCatalog: primitiveCatalog.map(toJevBehaviorCapability),
    catalogMetadata: {
      sourceCatalogVersionHash: sourceCatalog.versionHash,
      sourceSetFiles: sourceCatalog.setFiles,
      behaviorPrimitiveCount: primitiveCatalog.length,
    },
  };
}

function resolveTargetCard(
  catalog: Awaited<ReturnType<typeof loadSourceCardCatalog>>,
  target: CardTriageTarget,
): Card {
  if (target.publicCode !== undefined) {
    const publicCode = target.publicCode;
    const card = catalog.byPublicCode.get(publicCode);

    if (!card) {
      throw new Error(`Unknown source card public code: ${publicCode}`);
    }

    return card;
  }

  const cardName = target.cardName;

  const exact = catalog.byName.get(cardName);
  if (exact) return exact;

  const normalizedName = cardName.toLocaleLowerCase();
  const caseInsensitive = catalog.cards.filter(
    (card) => card.name.toLocaleLowerCase() === normalizedName,
  );

  if (caseInsensitive.length === 1) {
    return caseInsensitive[0]!;
  }

  if (caseInsensitive.length > 1) {
    throw new Error(
      `Card name ${JSON.stringify(cardName)} matches multiple printings; use --public-code.`,
    );
  }

  throw new Error(`Unknown source card: ${cardName}`);
}

async function inspectImplementation(input: {
  db: Db | null;
  cardCode: string;
  sourceTextHash: string;
  primitiveCatalog: PrimitiveCatalogEntry[];
}): Promise<CardImplementationEvidence> {
  if (!input.db) {
    return {
      status: "unknown",
      sourceTextHash: input.sourceTextHash,
      canonicalSourceTextHash: null,
      runtimeSupportStatus: null,
      readinessReasons: ["Canonical database check skipped."],
      behaviorModel: null,
      effectBehaviorModel: null,
    };
  }

  const document = await input.db
    .collection<
      CanonicalCardDocument & { _id: string }
    >(CANONICAL_CARDS_COLLECTION)
    .findOne({ cardCode: input.cardCode });

  if (!document) {
    return {
      status: "not_published",
      sourceTextHash: input.sourceTextHash,
      canonicalSourceTextHash: null,
      runtimeSupportStatus: null,
      readinessReasons: [
        "No approved canonical card is persisted for this card code.",
      ],
      behaviorModel: null,
      effectBehaviorModel: null,
    };
  }

  const sourceIsCurrent = document.sourceTextHash === input.sourceTextHash;
  const readiness = inspectCanonicalDeckReadiness({
    cards: [document],
    behaviorDefinitions: input.primitiveCatalog,
  });
  const readinessReasons = readiness.reasons.map((reason) => reason.message);

  if (!sourceIsCurrent) {
    readinessReasons.unshift(
      "Persisted canonical rules text does not match the current local source card.",
    );
  }

  return {
    status: !sourceIsCurrent
      ? "published_stale"
      : readinessReasons.length === 0
        ? "executable"
        : "published_not_executable",
    sourceTextHash: input.sourceTextHash,
    canonicalSourceTextHash: document.sourceTextHash,
    runtimeSupportStatus: document.runtimeSupportStatus,
    readinessReasons,
    behaviorModel: document.behaviorModel,
    effectBehaviorModel: document.effectBehaviorModel,
  };
}

function compactBehaviorSuggestion(
  suggestion: CardBehaviorSuggestion,
): CompactBehaviorSuggestion {
  return {
    cardCode: suggestion.cardCode,
    cardName: suggestion.cardName,
    publicCode: suggestion.publicCode,
    setCode: suggestion.setCode,
    rulesText: suggestion.rulesText,
    primitiveIds: suggestion.primitiveIds,
    supportStatus: suggestion.supportStatus,
    unsupportedClauseCount: suggestion.unsupportedClauseCount,
    missingRequiredParameterCount: suggestion.missingRequiredParameterCount,
    clauses: suggestion.clauses.map((clause) => ({
      id: clause.id,
      sourceText: clause.sourceText,
      normalizedText: clause.normalizedText,
      supportStatus: clause.supportStatus,
      unsupportedReason: clause.unsupportedReason,
      missingRequiredParameters: clause.missingRequiredParameters,
      assignments: clause.assignments.map((assignment) => ({
        primitiveId: assignment.assignment.primitiveId,
        family: assignment.assignment.family,
        parameters: assignment.assignment.parameters,
        confidence: assignment.assignment.confidence,
        supportStatus: assignment.supportStatus,
        parameterValidation: assignment.parameterValidation,
      })),
    })),
  };
}

function toJevBehaviorCapability(
  entry: PrimitiveCatalogEntry,
): JevBehaviorCapability {
  return {
    id: entry.id,
    family: entry.family,
    name: entry.name,
    description: entry.description,
    parameters: entry.parameters,
    fixedRules: entry.fixedRules,
    listensToEvents: entry.listensToEvents,
    emitsEvents: entry.emitsEvents,
    timingRequirements: entry.timingRequirements,
    targetingRequirements: entry.targetingRequirements,
    engineSupport: entry.engineSupport,
    runtimeCoverage: getRuntimeCoverageStatus(entry.id),
    examples: entry.examples.slice(0, 5),
  };
}
