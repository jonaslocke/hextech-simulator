import {
  analyzeCardCorpus,
  analyzeLocalCardSetCorpus,
  type CardPrimitiveDiscovery,
  type ClauseDiscovery,
  type CorpusPrimitiveDiscoveryReport,
  type PrimitiveAssignment
} from "./primitive-discovery";
import {
  buildPrimitiveCatalog,
  combineSupportStatuses,
  validatePrimitiveAssignmentParameters,
  type EngineSupportStatus,
  type PrimitiveCatalogEntry,
  type PrimitiveParameterValidation
} from "./primitive-catalog";
import type { Card } from "../catalog";

export type SuggestedPrimitiveAssignment = {
  assignment: PrimitiveAssignment;
  catalogEntry: PrimitiveCatalogEntry;
  parameterValidation: PrimitiveParameterValidation;
  supportStatus: EngineSupportStatus;
};

export type ClauseBehaviorSuggestion = {
  id: string;
  sourceText: string;
  normalizedText: string;
  assignments: SuggestedPrimitiveAssignment[];
  supportStatus: EngineSupportStatus;
  unsupportedReason: string | null;
  missingRequiredParameters: string[];
};

export type CardBehaviorSuggestion = {
  cardCode: string;
  cardName: string;
  publicCode: string;
  setCode: string;
  rulesText: string;
  primitiveIds: string[];
  supportStatus: EngineSupportStatus;
  clauses: ClauseBehaviorSuggestion[];
  unsupportedClauseCount: number;
  missingRequiredParameterCount: number;
};

export type CorpusBehaviorSuggestionReport = {
  summary: {
    sourceFiles: string[];
    totalCards: number;
    cardsWithRulesText: number;
    suggestedCardCount: number;
    completeSuggestionCount: number;
    unsupportedCardCount: number;
    ambiguousCardCount: number;
    requiresEngineSupportCardCount: number;
    missingRequiredParameterCount: number;
    discoveredPrimitiveCount: number;
    catalogPrimitiveCount: number;
  };
  primitiveCatalog: PrimitiveCatalogEntry[];
  cards: CardBehaviorSuggestion[];
};

export async function analyzeLocalCardSetBehaviorSuggestions(): Promise<CorpusBehaviorSuggestionReport> {
  return buildCorpusBehaviorSuggestionReport(await analyzeLocalCardSetCorpus());
}

export function analyzeCardBehaviorSuggestions(
  cards: Card[],
  sourceFiles: string[] = [],
  primitiveCatalog?: PrimitiveCatalogEntry[]
): CorpusBehaviorSuggestionReport {
  return buildCorpusBehaviorSuggestionReport(
    analyzeCardCorpus(cards, sourceFiles),
    primitiveCatalog
  );
}

export function buildCorpusBehaviorSuggestionReport(
  discoveryReport: CorpusPrimitiveDiscoveryReport,
  suppliedPrimitiveCatalog?: PrimitiveCatalogEntry[]
): CorpusBehaviorSuggestionReport {
  const primitiveCatalog =
    suppliedPrimitiveCatalog ?? buildPrimitiveCatalog(discoveryReport.primitives);
  const primitiveCatalogById = new Map(
    primitiveCatalog.map((entry) => [entry.id, entry])
  );
  const cards = discoveryReport.cards.map((card) =>
    buildCardBehaviorSuggestion(card, primitiveCatalogById)
  );
  const completeSuggestionCount = cards.filter(isCompleteSuggestion).length;

  return {
    summary: {
      sourceFiles: discoveryReport.summary.sourceFiles,
      totalCards: discoveryReport.summary.totalCards,
      cardsWithRulesText: discoveryReport.summary.cardsWithRulesText,
      suggestedCardCount: cards.length,
      completeSuggestionCount,
      unsupportedCardCount: cards.filter((card) => card.supportStatus === "unsupported").length,
      ambiguousCardCount: cards.filter((card) => card.supportStatus === "ambiguous").length,
      requiresEngineSupportCardCount: cards.filter(
        (card) => card.supportStatus === "requires_engine_support"
      ).length,
      missingRequiredParameterCount: cards.reduce(
        (total, card) => total + card.missingRequiredParameterCount,
        0
      ),
      discoveredPrimitiveCount: discoveryReport.summary.discoveredPrimitiveCount,
      catalogPrimitiveCount: primitiveCatalog.length
    },
    primitiveCatalog,
    cards
  };
}

export function buildCardBehaviorSuggestion(
  discovery: CardPrimitiveDiscovery,
  primitiveCatalogById?: ReadonlyMap<string, PrimitiveCatalogEntry>
): CardBehaviorSuggestion {
  const catalogById =
    primitiveCatalogById ??
    new Map(buildPrimitiveCatalog().map((entry) => [entry.id, entry]));
  const clauses = discovery.clauses.map((clause) =>
    buildClauseBehaviorSuggestion(clause, catalogById)
  );
  const supportStatus = combineSupportStatuses(
    clauses.map((clause) => clause.supportStatus)
  );

  return {
    cardCode: discovery.cardCode,
    cardName: discovery.cardName,
    publicCode: discovery.publicCode,
    setCode: discovery.setCode,
    rulesText: discovery.rulesText,
    primitiveIds: discovery.primitiveIds,
    supportStatus,
    clauses,
    unsupportedClauseCount: clauses.filter((clause) => clause.unsupportedReason !== null)
      .length,
    missingRequiredParameterCount: clauses.reduce(
      (total, clause) => total + clause.missingRequiredParameters.length,
      0
    )
  };
}

function buildClauseBehaviorSuggestion(
  clause: ClauseDiscovery,
  primitiveCatalogById: ReadonlyMap<string, PrimitiveCatalogEntry>
): ClauseBehaviorSuggestion {
  const assignments = clause.assignments.map((assignment) =>
    buildSuggestedPrimitiveAssignment(assignment, primitiveCatalogById)
  );
  const missingRequiredParameters = assignments.flatMap(
    (assignment) => assignment.parameterValidation.missingRequired
  );
  const supportStatuses = assignments.map((assignment) => assignment.supportStatus);

  if (clause.unsupportedReason) {
    supportStatuses.push("unsupported");
  }

  if (missingRequiredParameters.length > 0) {
    supportStatuses.push("ambiguous");
  }

  return {
    id: clause.id,
    sourceText: clause.sourceText,
    normalizedText: clause.normalizedText,
    assignments,
    supportStatus: combineSupportStatuses(supportStatuses),
    unsupportedReason: clause.unsupportedReason,
    missingRequiredParameters
  };
}

function buildSuggestedPrimitiveAssignment(
  assignment: PrimitiveAssignment,
  primitiveCatalogById: ReadonlyMap<string, PrimitiveCatalogEntry>
): SuggestedPrimitiveAssignment {
  const catalogEntry = primitiveCatalogById.get(assignment.primitiveId);

  if (!catalogEntry) {
    throw new Error(`Behavior definition is unavailable: ${assignment.primitiveId}`);
  }
  const parameterValidation = validatePrimitiveAssignmentParameters(
    assignment,
    catalogEntry
  );

  return {
    assignment,
    catalogEntry,
    parameterValidation,
    supportStatus: parameterValidation.complete
      ? catalogEntry.engineSupport.status
      : "ambiguous"
  };
}

function isCompleteSuggestion(card: CardBehaviorSuggestion): boolean {
  return (
    card.unsupportedClauseCount === 0 &&
    card.missingRequiredParameterCount === 0 &&
    card.supportStatus !== "unsupported" &&
    card.supportStatus !== "ambiguous"
  );
}
