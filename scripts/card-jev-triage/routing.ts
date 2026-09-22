import {
  PRIMITIVE_QUESTION_PREFIX,
  primitiveQuestionName,
} from "./questions";
import type {
  ChoiceResponse,
  NoulResponse,
  Questions,
  ScoreResponse,
  SystemOneResult,
} from "@typesafe-ai/sdk";
import type { CardJevTriageState } from "./state";

type CardJevSystemOneResult = SystemOneResult<Questions>;

export const cardTriageRoutes = [
  "ALREADY_IMPLEMENTED",
  "TARGETED_IMPLEMENTATION",
  "MOE_DISCOVERY",
] as const;

export type CardTriageRoute = (typeof cardTriageRoutes)[number];

export type PrimitiveCandidate = {
  id: string;
  probability: number;
  runtimeCoverage: CardJevTriageState["behaviorCatalog"][number]["runtimeCoverage"];
};

export type CardTriageDecision = {
  route: CardTriageRoute;
  disposition: {
    choice: string;
    confidence: number;
    reuseOrComposeProbability: number;
  };
  primaryGap: {
    choice: string;
    confidence: number;
    noneProbability: number;
  };
  selectedPrimitives: PrimitiveCandidate[];
  topPrimitiveCandidates: PrimitiveCandidate[];
  nonExecutablePrimitiveRisks: PrimitiveCandidate[];
  signals: {
    existingBehaviorVocabularySufficient: number;
    existingExecutableCapabilitiesSufficient: number;
    compositionSufficient: number;
    behaviorModelOnlySufficient: number;
    deterministicSuggestionComplete: number;
    deterministicSuggestionParametersReliable: number;
    allMaterialClausesCoveredByExistingPrimitives: number;
    primitiveParameterizationSufficient: number;
    referencedTokenDefinitionsSufficient: number;
    sourceStateSufficientForRouting: number;
    requiresExistingPrimitiveExtension: number;
    requiresNewPrimitive: number;
    requiresNewEventOrTriggerInfrastructure: number;
    requiresNewPersistentGameState: number;
    requiresNewSelectorOrChoiceContract: number;
    requiresNewTimingOrChainContract: number;
    requiresNewProjectionContract: number;
    mechanicalNovelty: number;
  };
  reasons: string[];
};

// Final shadow-calibration gate derived from the ten-card regression set after
// refining the Jev questions/state. Keep the gate deliberately small and use
// only signals that remained discriminative in the final pass. Other Jev
// answers stay available as telemetry but do not block the fast path.
const FAST_VOCABULARY_THRESHOLD = 0.7;
const FAST_CLAUSE_COVERAGE_THRESHOLD = 0.5;
const FAST_PARAMETERIZATION_THRESHOLD = 0.5;
const FAST_NO_GAP_THRESHOLD = 0.6;
const FAST_NEW_PRIMITIVE_CEILING = 0.25;
const FAST_NOVELTY_CEILING = 1.25;

const PRIMITIVE_SELECTION_THRESHOLD = 0.7;
const NON_EXECUTABLE_RISK_THRESHOLD = 0.6;
const TOP_PRIMITIVE_CANDIDATE_COUNT = 10;

export function decideCardTriageRoute(
  state: CardJevTriageState,
  result: CardJevSystemOneResult,
): CardTriageDecision {
  if (state.implementation.status === "executable") {
    return alreadyImplementedDecision();
  }

  const disposition = choiceAnswer(result, "implementationDisposition");
  const primaryGap = choiceAnswer(result, "primaryGapFamily");
  const mechanicalNovelty = scoreAnswer(result, "mechanicalNovelty");
  const reuseOrComposeProbability =
    (disposition.probabilities.EXACT_REUSE ?? 0) +
    (disposition.probabilities.COMPOSE_EXISTING ?? 0);

  const primitiveCandidates = collectPrimitiveCandidates(state, result);
  const selectedPrimitives = primitiveCandidates.filter(
    (primitive) => primitive.probability >= PRIMITIVE_SELECTION_THRESHOLD,
  );
  const topPrimitiveCandidates = primitiveCandidates.slice(
    0,
    TOP_PRIMITIVE_CANDIDATE_COUNT,
  );
  const nonExecutablePrimitiveRisks = primitiveCandidates.filter(
    (primitive) =>
      primitive.probability >= NON_EXECUTABLE_RISK_THRESHOLD &&
      primitive.runtimeCoverage !== "executable",
  );

  const signals: CardTriageDecision["signals"] = {
    existingBehaviorVocabularySufficient: noulProbability(
      result,
      "existingBehaviorVocabularySufficient",
    ),
    existingExecutableCapabilitiesSufficient: noulProbability(
      result,
      "existingExecutableCapabilitiesSufficient",
    ),
    compositionSufficient: noulProbability(result, "compositionSufficient"),
    behaviorModelOnlySufficient: noulProbability(
      result,
      "behaviorModelOnlySufficient",
    ),
    deterministicSuggestionComplete: noulProbability(
      result,
      "deterministicSuggestionComplete",
    ),
    deterministicSuggestionParametersReliable: noulProbability(
      result,
      "deterministicSuggestionParametersReliable",
    ),
    allMaterialClausesCoveredByExistingPrimitives: noulProbability(
      result,
      "allMaterialClausesCoveredByExistingPrimitives",
    ),
    primitiveParameterizationSufficient: noulProbability(
      result,
      "primitiveParameterizationSufficient",
    ),
    referencedTokenDefinitionsSufficient: noulProbability(
      result,
      "referencedTokenDefinitionsSufficient",
    ),
    sourceStateSufficientForRouting: noulProbability(
      result,
      "sourceStateSufficientForRouting",
    ),
    requiresExistingPrimitiveExtension: noulProbability(
      result,
      "requiresExistingPrimitiveExtension",
    ),
    requiresNewPrimitive: noulProbability(result, "requiresNewPrimitive"),
    requiresNewEventOrTriggerInfrastructure: noulProbability(
      result,
      "requiresNewEventOrTriggerInfrastructure",
    ),
    requiresNewPersistentGameState: noulProbability(
      result,
      "requiresNewPersistentGameState",
    ),
    requiresNewSelectorOrChoiceContract: noulProbability(
      result,
      "requiresNewSelectorOrChoiceContract",
    ),
    requiresNewTimingOrChainContract: noulProbability(
      result,
      "requiresNewTimingOrChainContract",
    ),
    requiresNewProjectionContract: noulProbability(
      result,
      "requiresNewProjectionContract",
    ),
    mechanicalNovelty: mechanicalNovelty.score,
  };

  const noGapProbability = primaryGap.probabilities.NONE ?? 0;

  const fastPath =
    signals.existingBehaviorVocabularySufficient >=
      FAST_VOCABULARY_THRESHOLD &&
    signals.allMaterialClausesCoveredByExistingPrimitives >=
      FAST_CLAUSE_COVERAGE_THRESHOLD &&
    signals.primitiveParameterizationSufficient >=
      FAST_PARAMETERIZATION_THRESHOLD &&
    noGapProbability >= FAST_NO_GAP_THRESHOLD &&
    signals.requiresNewPrimitive <= FAST_NEW_PRIMITIVE_CEILING &&
    signals.mechanicalNovelty <= FAST_NOVELTY_CEILING &&
    nonExecutablePrimitiveRisks.length === 0;

  if (fastPath) {
    return {
      route: "TARGETED_IMPLEMENTATION",
      disposition: {
        choice: disposition.choice,
        confidence: disposition.confidence,
        reuseOrComposeProbability,
      },
      primaryGap: {
        choice: primaryGap.choice,
        confidence: primaryGap.confidence,
        noneProbability: primaryGap.probabilities.NONE ?? 0,
      },
      selectedPrimitives,
      topPrimitiveCandidates,
      nonExecutablePrimitiveRisks,
      signals,
      reasons: [
        "Final calibrated semantic signals place the card in the targeted-implementation fast path.",
        "No primitive with material probability lacks executable runtime coverage.",
        "Vocabulary coverage, clause coverage, parameterization, gap confidence, new-primitive risk, and novelty satisfy the final gate.",
      ],
    };
  }

  return {
    route: "MOE_DISCOVERY",
    disposition: {
      choice: disposition.choice,
      confidence: disposition.confidence,
      reuseOrComposeProbability,
    },
    primaryGap: {
      choice: primaryGap.choice,
      confidence: primaryGap.confidence,
      noneProbability: primaryGap.probabilities.NONE ?? 0,
    },
    selectedPrimitives,
    topPrimitiveCandidates,
    nonExecutablePrimitiveRisks,
    signals,
    reasons: buildEscalationReasons({
      nonExecutablePrimitiveRisks,
      noGapProbability,
      signals,
    }),
  };
}

export function buildCompactCardTriageOutput(input: {
  state: CardJevTriageState;
  mode: "on" | "shadow";
  decision: CardTriageDecision;
  artifactPath: string;
}) {
  const route =
    input.mode === "shadow" ? "MOE_DISCOVERY" : input.decision.route;

  return {
    card: input.state.targetCard.name,
    cardCode: input.state.targetIdentity.cardCode,
    implementationStatus: input.state.implementation.status,
    mode: input.mode,
    route,
    jevAdvisoryRoute:
      input.mode === "shadow" ? input.decision.route : undefined,
    disposition: input.decision.disposition,
    primaryGap: input.decision.primaryGap,
    selectedPrimitives: input.decision.selectedPrimitives,
    topPrimitiveCandidates: input.decision.topPrimitiveCandidates,
    nonExecutablePrimitiveRisks:
      input.decision.nonExecutablePrimitiveRisks,
    signals: input.decision.signals,
    artifact: input.artifactPath,
  };
}

function alreadyImplementedDecision(): CardTriageDecision {
  return {
    route: "ALREADY_IMPLEMENTED",
    disposition: {
      choice: "EXACT_REUSE",
      confidence: 1,
      reuseOrComposeProbability: 1,
    },
    primaryGap: {
      choice: "NONE",
      confidence: 1,
      noneProbability: 1,
    },
    selectedPrimitives: [],
    topPrimitiveCandidates: [],
    nonExecutablePrimitiveRisks: [],
    signals: {
      existingBehaviorVocabularySufficient: 1,
      existingExecutableCapabilitiesSufficient: 1,
      compositionSufficient: 1,
      behaviorModelOnlySufficient: 1,
      deterministicSuggestionComplete: 1,
      deterministicSuggestionParametersReliable: 1,
      allMaterialClausesCoveredByExistingPrimitives: 1,
      primitiveParameterizationSufficient: 1,
      referencedTokenDefinitionsSufficient: 1,
      sourceStateSufficientForRouting: 1,
      requiresExistingPrimitiveExtension: 0,
      requiresNewPrimitive: 0,
      requiresNewEventOrTriggerInfrastructure: 0,
      requiresNewPersistentGameState: 0,
      requiresNewSelectorOrChoiceContract: 0,
      requiresNewTimingOrChainContract: 0,
      requiresNewProjectionContract: 0,
      mechanicalNovelty: 0,
    },
    reasons: ["Canonical source is current and runtime readiness is executable."],
  };
}

function collectPrimitiveCandidates(
  state: CardJevTriageState,
  result: CardJevSystemOneResult,
): PrimitiveCandidate[] {
  return state.behaviorCatalog
    .map((primitive) => {
      const answer = result.answers[primitiveQuestionName(primitive.id)];
      if (!answer || answer.type !== "noul") return null;
      return {
        id: primitive.id,
        probability: answer.noul,
        runtimeCoverage: primitive.runtimeCoverage,
      } satisfies PrimitiveCandidate;
    })
    .filter(
      (primitive): primitive is PrimitiveCandidate => primitive !== null,
    )
    .sort((left, right) => right.probability - left.probability);
}

function buildEscalationReasons(input: {
  nonExecutablePrimitiveRisks: PrimitiveCandidate[];
  noGapProbability: number;
  signals: CardTriageDecision["signals"];
}): string[] {
  const reasons: string[] = [];

  if (
    input.signals.existingBehaviorVocabularySufficient <
    FAST_VOCABULARY_THRESHOLD
  ) {
    reasons.push(
      "Existing behavior-vocabulary sufficiency is below the final fast-path floor.",
    );
  }
  if (
    input.signals.allMaterialClausesCoveredByExistingPrimitives <
    FAST_CLAUSE_COVERAGE_THRESHOLD
  ) {
    reasons.push(
      "Existing primitives do not confidently cover all material card clauses.",
    );
  }
  if (
    input.signals.primitiveParameterizationSufficient <
    FAST_PARAMETERIZATION_THRESHOLD
  ) {
    reasons.push(
      "Primitive parameterization sufficiency is below the final fast-path floor.",
    );
  }
  if (input.noGapProbability < FAST_NO_GAP_THRESHOLD) {
    reasons.push(
      "Jev does not assign enough probability to there being no material capability gap.",
    );
  }
  if (input.signals.requiresNewPrimitive > FAST_NEW_PRIMITIVE_CEILING) {
    reasons.push("New-primitive risk exceeds the final fast-path ceiling.");
  }
  if (input.signals.mechanicalNovelty > FAST_NOVELTY_CEILING) {
    reasons.push("Mechanical novelty exceeds the final fast-path ceiling.");
  }
  if (input.nonExecutablePrimitiveRisks.length > 0) {
    reasons.push(
      `Material primitive candidates are not executable: ${input.nonExecutablePrimitiveRisks
        .map(
          (primitive) =>
            `${primitive.id} (${primitive.probability.toFixed(2)})`,
        )
        .join(", ")}.`,
    );
  }
  if (reasons.length === 0) {
    reasons.push("The final targeted-implementation gate was not fully satisfied.");
  }

  return reasons;
}

function noulProbability(
  result: CardJevSystemOneResult,
  name: string,
): number {
  const answer = result.answers[name];
  if (!answer || answer.type !== "noul") {
    throw new Error(`Expected Jev noul answer: ${name}`);
  }
  return (answer as NoulResponse).noul;
}

function choiceAnswer(
  result: CardJevSystemOneResult,
  name: string,
): ChoiceResponse {
  const answer = result.answers[name];
  if (!answer || answer.type !== "choice") {
    throw new Error(`Expected Jev choice answer: ${name}`);
  }
  return answer;
}

function scoreAnswer(
  result: CardJevSystemOneResult,
  name: string,
): ScoreResponse {
  const answer = result.answers[name];
  if (!answer || answer.type !== "score") {
    throw new Error(`Expected Jev score answer: ${name}`);
  }
  return answer;
}

export function isPrimitiveQuestion(name: string): boolean {
  return name.startsWith(PRIMITIVE_QUESTION_PREFIX);
}
