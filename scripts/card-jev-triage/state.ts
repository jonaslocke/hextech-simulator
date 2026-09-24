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
import { loadCardCatalog, type Card } from "../../src/server/catalog";
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
  existingBehaviorIds: string[];
};

export type JevTargetCard = {
  name: string;
  publicCode: string;
  setCode: string;
  type: Card["classification"]["type"];
  supertype: Card["classification"]["supertype"];
  domains: string[];
  energy: number | null;
  might: number | null;
  power: number | null;
  tags: string[];
  rulesText: string;
};

export type JevTokenDefinition = {
  name: string;
  publicCode: string;
  setCode: string;
  type: Card["classification"]["type"];
  domains: string[];
  energy: number | null;
  might: number | null;
  power: number | null;
  tags: string[];
  rulesText: string;
};

export type JevBehaviorCapability = {
  id: string;
  family: PrimitiveCatalogEntry["family"];
  name: string;
  description: string;
  parameters: Array<{
    name: string;
    type: PrimitiveCatalogEntry["parameters"][number]["type"];
    required: boolean;
  }>;
  listensToEvents: string[];
  emitsEvents: string[];
  runtimeCoverage: RuntimeCoverageStatus | null;
};

export type CompactBehaviorSuggestion = {
  primitiveIds: string[];
  supportStatus: CardBehaviorSuggestion["supportStatus"];
  unsupportedClauseCount: number;
  missingRequiredParameterCount: number;
  clauses: Array<{
    id: string;
    unsupportedReason: string | null;
    missingRequiredParameters: string[];
    assignments: Array<{
      primitiveId: string;
      family: string;
      parameters: Record<string, string | number | boolean | null>;
      confidence: "high" | "medium" | "low";
      supportStatus: string;
    }>;
  }>;
};

export type CardJevTriageState = {
  objective: string;
  constraints: string[];
  primitiveSelectionRule: string;
  targetCard: JevTargetCard;
  targetIdentity: {
    cardCode: string;
    publicCode: string;
    sourceTextHash: string;
  };
  implementation: CardImplementationEvidence;
  deterministicSuggestion: CompactBehaviorSuggestion | null;
  tokenCatalog: JevTokenDefinition[];
  behaviorCatalog: JevBehaviorCapability[];
  catalogMetadata: {
    sourceCatalogVersionHash: string;
    sourceSetFiles: string[];
    behaviorPrimitiveCount: number;
    tokenDefinitionCount: number;
  };
};

export type JevCardRequestState = {
  objective: string;
  constraints: string[];
  primitiveSelectionRule: string;
  card: JevTargetCard;
  implementation: {
    status: CardImplementationStatus;
    runtimeSupportStatus: string | null;
    readinessReasons: string[];
    existingBehaviorIds: string[];
  };
  deterministicSuggestion: CompactBehaviorSuggestion | null;
  tokenCatalog: JevTokenDefinition[];
  behaviorCatalog: JevBehaviorCapability[];
};

export type CardTriageTarget =
  | { cardName: string; publicCode?: never }
  | { publicCode: string; cardName?: never };

export async function buildCardJevTriageState(input: {
  target: CardTriageTarget;
  db?: Db | null;
}): Promise<CardJevTriageState> {
  const [catalog, primitiveCatalog] = await Promise.all([
    loadCardCatalog(),
    buildCurrentBehaviorCatalog(),
  ]);
  const card = resolveTargetCard(catalog, input.target);
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
  const tokenCatalog = catalog.cards
    .filter((candidate) => candidate.classification.supertype === "Token")
    .map(toJevTokenDefinition)
    .sort((left, right) =>
      `${left.name}\u0000${left.publicCode}`.localeCompare(
        `${right.name}\u0000${right.publicCode}`,
      ),
    );

  return {
    objective:
      "Choose the lowest-discovery-cost faithful route for implementing exactly this card using the current reusable behavior vocabulary and known source token definitions.",
    constraints: [
      "Protect existing primitive meanings.",
      "Prefer faithful composition of existing primitives over extension or new capability.",
      "runtimeCoverage=executable means the primitive is already executable; other values require implementation work.",
      "The deterministic suggestion is evidence, not authority; validate both primitive identity and parameterization independently.",
      "The tokenCatalog is the supplied source of known token definitions. Do not invent a named token that is absent from it.",
      "Judge only from the supplied state; do not assume repository details that are not present.",
    ],
    primitiveSelectionRule:
      "For primitive::* questions, answer yes only when that primitive's accepted semantics are materially required by the card. Similar wording alone is not enough. Printed Energy, Power, Might, domains, card type, supertype, and tags are card characteristics and do not by themselves require behavior primitives. Select cost.pay only for a rules-text-defined additional, alternate, optional, or special payment; never merely because the card has a normal printed play cost. Select action.ready_cards only when an existing exhausted card is changed to ready; text that creates or plays an object ready is entry-state semantics such as modifier.enter_ready, not action.ready_cards. A keyword may already own semantics stated in its reminder text, so do not duplicate lower-level primitives unless the behavior model materially requires both.",
    targetCard: toJevTargetCard(card),
    targetIdentity: {
      cardCode,
      publicCode: card.public_code,
      sourceTextHash,
    },
    implementation,
    deterministicSuggestion,
    tokenCatalog,
    behaviorCatalog: primitiveCatalog.map(toJevBehaviorCapability),
    catalogMetadata: {
      sourceCatalogVersionHash: catalog.versionHash,
      sourceSetFiles: catalog.setFiles,
      behaviorPrimitiveCount: primitiveCatalog.length,
      tokenDefinitionCount: tokenCatalog.length,
    },
  };
}

export function buildJevCardRequestState(
  state: CardJevTriageState,
): JevCardRequestState {
  return {
    objective: state.objective,
    constraints: state.constraints,
    primitiveSelectionRule: state.primitiveSelectionRule,
    card: state.targetCard,
    implementation: {
      status: state.implementation.status,
      runtimeSupportStatus: state.implementation.runtimeSupportStatus,
      readinessReasons: state.implementation.readinessReasons,
      existingBehaviorIds: state.implementation.existingBehaviorIds,
    },
    deterministicSuggestion: state.deterministicSuggestion,
    tokenCatalog: state.tokenCatalog,
    behaviorCatalog: state.behaviorCatalog,
  };
}

function resolveTargetCard(
  catalog: Awaited<ReturnType<typeof loadCardCatalog>>,
  target: CardTriageTarget,
): Card {
  if (target.publicCode !== undefined) {
    const publicCode = target.publicCode;
    const card = catalog.byPublicCode.get(publicCode);
    if (!card) throw new Error(`Unknown source card public code: ${publicCode}`);
    return card;
  }

  const cardName = target.cardName;
  const exact = catalog.byName.get(cardName);
  if (exact) return exact;

  const normalizedName = cardName.toLocaleLowerCase();
  const caseInsensitive = catalog.cards.filter(
    (candidate) => candidate.name.toLocaleLowerCase() === normalizedName,
  );
  if (caseInsensitive.length === 1) return caseInsensitive[0]!;
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
      existingBehaviorIds: [],
    };
  }

  const document = await input.db
    .collection<CanonicalCardDocument & { _id: string }>(
      CANONICAL_CARDS_COLLECTION,
    )
    .findOne({ cardCode: input.cardCode });

  if (!document) {
    return {
      status: "not_published",
      sourceTextHash: input.sourceTextHash,
      canonicalSourceTextHash: null,
      runtimeSupportStatus: null,
      readinessReasons: ["No approved canonical card is persisted for this card code."],
      existingBehaviorIds: [],
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
    existingBehaviorIds: collectCanonicalBehaviorIds(document),
  };
}

function toJevTargetCard(card: Card): JevTargetCard {
  return {
    name: card.name,
    publicCode: card.public_code,
    setCode: card.set.set_id,
    type: card.classification.type,
    supertype: card.classification.supertype,
    domains: [...card.classification.domain],
    energy: card.attributes.energy,
    might: card.attributes.might,
    power: card.attributes.power,
    tags: [...card.tags],
    rulesText: card.text.plain,
  };
}

function toJevTokenDefinition(card: Card): JevTokenDefinition {
  return {
    name: card.name,
    publicCode: card.public_code,
    setCode: card.set.set_id,
    type: card.classification.type,
    domains: [...card.classification.domain],
    energy: card.attributes.energy,
    might: card.attributes.might,
    power: card.attributes.power,
    tags: [...card.tags],
    rulesText: card.text.plain,
  };
}

function compactBehaviorSuggestion(
  suggestion: CardBehaviorSuggestion,
): CompactBehaviorSuggestion {
  return {
    primitiveIds: suggestion.primitiveIds,
    supportStatus: suggestion.supportStatus,
    unsupportedClauseCount: suggestion.unsupportedClauseCount,
    missingRequiredParameterCount: suggestion.missingRequiredParameterCount,
    clauses: suggestion.clauses.map((clause) => ({
      id: clause.id,
      unsupportedReason: clause.unsupportedReason,
      missingRequiredParameters: clause.missingRequiredParameters,
      assignments: clause.assignments.map((assignment) => ({
        primitiveId: assignment.assignment.primitiveId,
        family: assignment.assignment.family,
        parameters: assignment.assignment.parameters,
        confidence: assignment.assignment.confidence,
        supportStatus: assignment.supportStatus,
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
    parameters: entry.parameters.map((parameter) => ({
      name: parameter.name,
      type: parameter.type,
      required: parameter.required,
    })),
    listensToEvents: [...entry.listensToEvents],
    emitsEvents: [...entry.emitsEvents],
    runtimeCoverage: getRuntimeCoverageStatus(entry.id),
  };
}

export function collectCanonicalBehaviorIds(
  document: CanonicalCardDocument,
): string[] {
  const ids = new Set<string>();

  for (const model of [document.behaviorModel, document.effectBehaviorModel]) {
    if (!model) continue;
    for (const binding of model.playTimings) ids.add(binding.behaviorId);
    for (const clause of model.clauses) {
      for (const bindings of [
        clause.abilities,
        clause.triggers,
        clause.conditions,
        clause.selectors,
        clause.choices,
        clause.costs,
        clause.timings,
        clause.effects,
        clause.keywords,
      ]) {
        for (const binding of bindings) ids.add(binding.behaviorId);
      }
    }
  }

  return [...ids].sort();
}
