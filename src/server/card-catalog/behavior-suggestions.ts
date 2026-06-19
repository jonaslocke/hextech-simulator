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
  getPrimitiveCatalogEntry,
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
  sourceFiles: string[] = []
): CorpusBehaviorSuggestionReport {
  return buildCorpusBehaviorSuggestionReport(analyzeCardCorpus(cards, sourceFiles));
}

export function buildCorpusBehaviorSuggestionReport(
  discoveryReport: CorpusPrimitiveDiscoveryReport
): CorpusBehaviorSuggestionReport {
  const primitiveCatalog = buildPrimitiveCatalog(discoveryReport.primitives);
  const cards = discoveryReport.cards.map(buildCardBehaviorSuggestion);
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
  discovery: CardPrimitiveDiscovery
): CardBehaviorSuggestion {
  const clauses = discovery.clauses.map(buildClauseBehaviorSuggestion);
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
  clause: ClauseDiscovery
): ClauseBehaviorSuggestion {
  const assignments = clause.assignments.map(buildSuggestedPrimitiveAssignment);
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
  assignment: PrimitiveAssignment
): SuggestedPrimitiveAssignment {
  const catalogEntry = getPrimitiveCatalogEntry(assignment.primitiveId, assignment.family);
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
