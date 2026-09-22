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
  "MOE_THEN_LARRY",
] as const;

export type CardTriageRoute = (typeof cardTriageRoutes)[number];

export type SelectedPrimitive = {
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
  selectedPrimitives: SelectedPrimitive[];
  signals: {
    existingBehaviorVocabularySufficient: number;
    existingExecutableCapabilitiesSufficient: number;
    compositionSufficient: number;
    behaviorModelOnlySufficient: number;
    allMaterialClausesCoveredByExistingPrimitives: number;
    sourceStateSufficientForRouting: number;
    requiresExistingPrimitiveExtension: number;
    requiresNewPrimitive: number;
    requiresNewEventOrTriggerInfrastructure: number;
    requiresNewPersistentGameState: number;
    requiresNewSelectorOrChoiceContract: number;
    requiresNewTimingOrChainContract: number;
    requiresNewProjectionContract: number;
    sharedEngineChangeLikely: number;
    fullMoeDiscoveryNeeded: number;
    larryVerificationLikelyNeeded: number;
    mechanicalNovelty: number;
    recommendedTargetedRouteProbability: number;
  };
  reasons: string[];
};

const FAST_POSITIVE_THRESHOLD = 0.85;
const FAST_STATE_THRESHOLD = 0.8;
const FAST_MODEL_ONLY_THRESHOLD = 0.75;
const FAST_RISK_CEILING = 0.2;
const FAST_ROUTE_THRESHOLD = 0.7;
const FAST_REUSE_OR_COMPOSE_THRESHOLD = 0.85;
const FAST_NOVELTY_CEILING = 1.25;
const PRIMITIVE_SELECTION_THRESHOLD = 0.7;

export function decideCardTriageRoute(
  state: CardJevTriageState,
  result: CardJevSystemOneResult,
): CardTriageDecision {
  if (state.implementation.status === "executable") {
    return alreadyImplementedDecision();
  }

  const disposition = choiceAnswer(result, "implementationDisposition");
  const recommendedRoute = choiceAnswer(result, "recommendedRoute");
  const mechanicalNovelty = scoreAnswer(result, "mechanicalNovelty");
  const reuseOrComposeProbability =
    (disposition.probabilities.EXACT_REUSE ?? 0) +
    (disposition.probabilities.COMPOSE_EXISTING ?? 0);
  const selectedPrimitives = collectSelectedPrimitives(state, result);
  const signals = {
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
    allMaterialClausesCoveredByExistingPrimitives: noulProbability(
      result,
      "allMaterialClausesCoveredByExistingPrimitives",
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
    sharedEngineChangeLikely: noulProbability(
      result,
      "sharedEngineChangeLikely",
    ),
    fullMoeDiscoveryNeeded: noulProbability(result, "fullMoeDiscoveryNeeded"),
    larryVerificationLikelyNeeded: noulProbability(
      result,
      "larryVerificationLikelyNeeded",
    ),
    mechanicalNovelty: mechanicalNovelty.score,
    recommendedTargetedRouteProbability:
      recommendedRoute.probabilities.TARGETED_IMPLEMENTATION ?? 0,
  };

  const rulesTextIsMaterial = state.targetCard.text.plain.trim().length > 0;
  const selectedNonExecutable = selectedPrimitives.filter(
    (primitive) => primitive.runtimeCoverage !== "executable",
  );
  const riskSignals = [
    signals.requiresExistingPrimitiveExtension,
    signals.requiresNewPrimitive,
    signals.requiresNewEventOrTriggerInfrastructure,
    signals.requiresNewPersistentGameState,
    signals.requiresNewSelectorOrChoiceContract,
    signals.requiresNewTimingOrChainContract,
    signals.requiresNewProjectionContract,
    signals.sharedEngineChangeLikely,
    signals.fullMoeDiscoveryNeeded,
  ];
  const maxRisk = Math.max(...riskSignals);

  const fastPath =
    reuseOrComposeProbability >= FAST_REUSE_OR_COMPOSE_THRESHOLD &&
    signals.recommendedTargetedRouteProbability >= FAST_ROUTE_THRESHOLD &&
    signals.existingBehaviorVocabularySufficient >= FAST_POSITIVE_THRESHOLD &&
    signals.existingExecutableCapabilitiesSufficient >= FAST_POSITIVE_THRESHOLD &&
    signals.allMaterialClausesCoveredByExistingPrimitives >=
      FAST_POSITIVE_THRESHOLD &&
    signals.sourceStateSufficientForRouting >= FAST_STATE_THRESHOLD &&
    signals.behaviorModelOnlySufficient >= FAST_MODEL_ONLY_THRESHOLD &&
    maxRisk <= FAST_RISK_CEILING &&
    signals.mechanicalNovelty <= FAST_NOVELTY_CEILING &&
    selectedNonExecutable.length === 0 &&
    (!rulesTextIsMaterial || selectedPrimitives.length > 0);

  if (fastPath) {
    return {
      route: "TARGETED_IMPLEMENTATION",
      disposition: {
        choice: disposition.choice,
        confidence: disposition.confidence,
        reuseOrComposeProbability,
      },
      selectedPrimitives,
      signals,
      reasons: [
        "Jev signals agree that existing executable primitives cover the material card semantics.",
        "No selected primitive requires new runtime coverage.",
        "Novelty and shared-engine risk remain below the conservative fast-path thresholds.",
      ],
    };
  }

  const moeThenLarryProbability =
    recommendedRoute.probabilities.MOE_THEN_LARRY ?? 0;
  const needsLarry =
    moeThenLarryProbability >= 0.6 ||
    (signals.sharedEngineChangeLikely >= 0.7 &&
      signals.larryVerificationLikelyNeeded >= 0.65);

  const reasons = buildEscalationReasons({
    state,
    reuseOrComposeProbability,
    selectedNonExecutable,
    signals,
    maxRisk,
  });

  return {
    route: needsLarry ? "MOE_THEN_LARRY" : "MOE_DISCOVERY",
    disposition: {
      choice: disposition.choice,
      confidence: disposition.confidence,
      reuseOrComposeProbability,
    },
    selectedPrimitives,
    signals,
    reasons,
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
    selectedPrimitives: input.decision.selectedPrimitives,
    confidence: {
      executableCapabilities:
        input.decision.signals.existingExecutableCapabilitiesSufficient,
      newPrimitive: input.decision.signals.requiresNewPrimitive,
      primitiveExtension:
        input.decision.signals.requiresExistingPrimitiveExtension,
      sharedEngineChange: input.decision.signals.sharedEngineChangeLikely,
      fullMoeDiscovery: input.decision.signals.fullMoeDiscoveryNeeded,
      larryVerification:
        input.decision.signals.larryVerificationLikelyNeeded,
      mechanicalNovelty: input.decision.signals.mechanicalNovelty,
    },
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
    selectedPrimitives: [],
    signals: {
      existingBehaviorVocabularySufficient: 1,
      existingExecutableCapabilitiesSufficient: 1,
      compositionSufficient: 1,
      behaviorModelOnlySufficient: 1,
      allMaterialClausesCoveredByExistingPrimitives: 1,
      sourceStateSufficientForRouting: 1,
      requiresExistingPrimitiveExtension: 0,
      requiresNewPrimitive: 0,
      requiresNewEventOrTriggerInfrastructure: 0,
      requiresNewPersistentGameState: 0,
      requiresNewSelectorOrChoiceContract: 0,
      requiresNewTimingOrChainContract: 0,
      requiresNewProjectionContract: 0,
      sharedEngineChangeLikely: 0,
      fullMoeDiscoveryNeeded: 0,
      larryVerificationLikelyNeeded: 0,
      mechanicalNovelty: 0,
      recommendedTargetedRouteProbability: 1,
    },
    reasons: ["Canonical source is current and runtime readiness is executable."],
  };
}

function collectSelectedPrimitives(
  state: CardJevTriageState,
  result: CardJevSystemOneResult,
): SelectedPrimitive[] {
  return state.behaviorCatalog
    .map((primitive) => {
      const answer = result.answers[primitiveQuestionName(primitive.id)];
      if (!answer || answer.type !== "noul") return null;
      return {
        id: primitive.id,
        probability: answer.noul,
        runtimeCoverage: primitive.runtimeCoverage,
      } satisfies SelectedPrimitive;
    })
    .filter(
      (primitive): primitive is SelectedPrimitive =>
        primitive !== null &&
        primitive.probability >= PRIMITIVE_SELECTION_THRESHOLD,
    )
    .sort((left, right) => right.probability - left.probability);
}

function buildEscalationReasons(input: {
  state: CardJevTriageState;
  reuseOrComposeProbability: number;
  selectedNonExecutable: SelectedPrimitive[];
  signals: CardTriageDecision["signals"];
  maxRisk: number;
}): string[] {
  const reasons: string[] = [];
  if (input.reuseOrComposeProbability < FAST_REUSE_OR_COMPOSE_THRESHOLD) {
    reasons.push("Reuse/composition confidence does not meet the fast-path threshold.");
  }
  if (
    input.signals.existingExecutableCapabilitiesSufficient <
    FAST_POSITIVE_THRESHOLD
  ) {
    reasons.push("Existing executable-capability sufficiency is not high-confidence.");
  }
  if (input.maxRisk > FAST_RISK_CEILING) {
    reasons.push("At least one new/shared-capability risk signal exceeds the fast-path ceiling.");
  }
  if (input.selectedNonExecutable.length > 0) {
    reasons.push(
      `Selected primitives are not executable: ${input.selectedNonExecutable
        .map((primitive) => primitive.id)
        .join(", ")}.`,
    );
  }
  if (
    input.state.targetCard.text.plain.trim().length > 0 &&
    input.state.behaviorCatalog.length > 0 &&
    input.signals.sourceStateSufficientForRouting < FAST_STATE_THRESHOLD
  ) {
    reasons.push("Jev does not consider the supplied state sufficient for direct routing.");
  }
  if (reasons.length === 0) {
    reasons.push("The conservative targeted-implementation gate was not fully satisfied.");
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
