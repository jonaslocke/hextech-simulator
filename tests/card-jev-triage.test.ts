import assert from "node:assert/strict";
import test from "node:test";
import type { Questions, SystemOneResult } from "@typesafe-ai/sdk";
import {
  buildCardTriageQuestions,
  primitiveQuestionName,
} from "../scripts/card-jev-triage/questions";
import {
  buildCompactCardTriageOutput,
  decideCardTriageRoute,
} from "../scripts/card-jev-triage/routing";
import {
  buildJevCardRequestState,
  type CardJevTriageState,
  type JevBehaviorCapability,
} from "../scripts/card-jev-triage/state";

const moveTrigger = capability({
  id: "trigger.on_move",
  family: "trigger",
  listensToEvents: ["unit.moved"],
});
const drawCards = capability({
  id: "action.draw_cards",
  family: "action",
  emitsEvents: ["card.drawn"],
});

const state = buildState([moveTrigger, drawCards]);

test("card Jev triage asks semantic evidence questions and one independent question per primitive", () => {
  const questions = buildCardTriageQuestions(state);

  assert.equal(questions.implementationDisposition?.type, "choice");
  assert.equal(questions.mechanicalNovelty?.type, "score");
  assert.equal(questions.primitiveParameterizationSufficient?.type, "noul");
  assert.equal(questions.referencedTokenDefinitionsSufficient?.type, "noul");
  assert.equal(questions.deterministicSuggestionParametersReliable?.type, "noul");
  assert.equal(questions.recommendedRoute, undefined);
  assert.equal(questions.fullMoeDiscoveryNeeded, undefined);
  assert.equal(questions.larryVerificationLikelyNeeded, undefined);
  assert.equal(
    questions[primitiveQuestionName("trigger.on_move")]?.type,
    "noul",
  );
  assert.equal(
    questions[primitiveQuestionName("action.draw_cards")]?.type,
    "noul",
  );
  assert.equal(
    Object.keys(questions).filter((name) => name.startsWith("primitive::")).length,
    state.behaviorCatalog.length,
  );
});

test("shared primitive-selection guidance rejects normal-cost and ready-entry false positives", () => {
  const questions = buildCardTriageQuestions(state);
  const question = questions[primitiveQuestionName("trigger.on_move")];

  assert.equal(question?.type, "noul");
  if (!question || question.type !== "noul") return;
  assert.equal(question.instructions, "Required primitive: trigger.on_move?");
  assert.equal(question.criteria, undefined);
  assert.match(state.primitiveSelectionRule, /cost\.pay/i);
  assert.match(state.primitiveSelectionRule, /normal printed play cost/i);
  assert.match(state.primitiveSelectionRule, /action\.ready_cards/i);
  assert.match(state.primitiveSelectionRule, /entry-state semantics/i);
});

test("Jev request state includes compact token definitions and excludes repository-only metadata", () => {
  const requestState = buildJevCardRequestState(state);
  const serialized = JSON.stringify(requestState);

  assert.equal(requestState.card.rulesText, "When I move, draw 1.");
  assert.equal(requestState.behaviorCatalog.length, 2);
  assert.equal(requestState.tokenCatalog.length, 1);
  assert.equal(requestState.tokenCatalog[0]?.name, "Sprite");
  assert.equal(requestState.tokenCatalog[0]?.might, 3);
  assert.equal("catalogMetadata" in requestState, false);
  assert.equal("targetIdentity" in requestState, false);
  assert.equal(serialized.includes("sourceTextHash"), false);
  assert.equal(serialized.includes("image_url"), false);
  assert.equal(serialized.includes("fixedRules"), false);
  assert.equal(serialized.includes("examples"), false);
  assert.equal(serialized.includes("engineSupport"), false);
});

test("final Stellacorn-like calibration routes directly to targeted implementation", () => {
  const result = buildResult(state, {
    signalOverrides: {
      existingBehaviorVocabularySufficient: 0.93,
      existingExecutableCapabilitiesSufficient: 0.44,
      compositionSufficient: 0.94,
      allMaterialClausesCoveredByExistingPrimitives: 0.91,
      primitiveParameterizationSufficient: 0.9,
      sourceStateSufficientForRouting: 0.54,
      requiresExistingPrimitiveExtension: 0.07,
      requiresNewPrimitive: 0.06,
    },
    primaryGapNoneProbability: 0.95,
    mechanicalNovelty: 0.61,
    primitiveProbabilities: {
      "trigger.on_move": 0.94,
      "action.draw_cards": 0.93,
    },
  });

  const decision = decideCardTriageRoute(state, result);

  assert.equal(decision.route, "TARGETED_IMPLEMENTATION");
  assert.deepEqual(
    decision.selectedPrimitives.map(({ id }) => id),
    ["trigger.on_move", "action.draw_cards"],
  );
});

test("final Ride the Wind-like calibration qualifies for the advisory fast path", () => {
  const result = buildResult(state, {
    signalOverrides: {
      existingBehaviorVocabularySufficient: 0.75,
      existingExecutableCapabilitiesSufficient: 0.29,
      compositionSufficient: 0.76,
      allMaterialClausesCoveredByExistingPrimitives: 0.59,
      primitiveParameterizationSufficient: 0.53,
      sourceStateSufficientForRouting: 0.44,
      requiresExistingPrimitiveExtension: 0.34,
      requiresNewPrimitive: 0.22,
    },
    primaryGapNoneProbability: 0.64,
    mechanicalNovelty: 1.01,
    primitiveProbabilities: {
      "trigger.on_move": 0.85,
      "action.draw_cards": 0.78,
    },
  });

  assert.equal(
    decideCardTriageRoute(state, result).route,
    "TARGETED_IMPLEMENTATION",
  );
});

test("final Spinning Axe-like calibration qualifies for the advisory fast path", () => {
  const result = buildResult(state, {
    signalOverrides: {
      existingBehaviorVocabularySufficient: 0.73,
      existingExecutableCapabilitiesSufficient: 0.38,
      compositionSufficient: 0.8,
      deterministicSuggestionParametersReliable: 0.25,
      allMaterialClausesCoveredByExistingPrimitives: 0.51,
      primitiveParameterizationSufficient: 0.61,
      sourceStateSufficientForRouting: 0.44,
      requiresExistingPrimitiveExtension: 0.2,
      requiresNewPrimitive: 0.16,
    },
    primaryGapNoneProbability: 0.69,
    mechanicalNovelty: 1.12,
    primitiveProbabilities: {
      "trigger.on_move": 0.91,
      "action.draw_cards": 0.82,
    },
  });

  assert.equal(
    decideCardTriageRoute(state, result).route,
    "TARGETED_IMPLEMENTATION",
  );
});

test("final Sprite Burst-like calibration remains in Moe", () => {
  const result = buildResult(state, {
    signalOverrides: {
      existingBehaviorVocabularySufficient: 0.63,
      existingExecutableCapabilitiesSufficient: 0.35,
      compositionSufficient: 0.68,
      deterministicSuggestionParametersReliable: 0.07,
      allMaterialClausesCoveredByExistingPrimitives: 0.45,
      primitiveParameterizationSufficient: 0.3,
      referencedTokenDefinitionsSufficient: 0.19,
      sourceStateSufficientForRouting: 0.38,
      requiresExistingPrimitiveExtension: 0.57,
      requiresNewPrimitive: 0.35,
    },
    primaryGapNoneProbability: 0.17,
    mechanicalNovelty: 1.88,
    primitiveProbabilities: {
      "trigger.on_move": 0.87,
      "action.draw_cards": 0.85,
    },
  });

  assert.equal(decideCardTriageRoute(state, result).route, "MOE_DISCOVERY");
});

test("final Elder Dragon-like calibration remains in Moe", () => {
  const result = buildResult(state, {
    signalOverrides: {
      existingBehaviorVocabularySufficient: 0.56,
      existingExecutableCapabilitiesSufficient: 0.24,
      compositionSufficient: 0.74,
      allMaterialClausesCoveredByExistingPrimitives: 0.35,
      primitiveParameterizationSufficient: 0.36,
      sourceStateSufficientForRouting: 0.32,
      requiresExistingPrimitiveExtension: 0.51,
      requiresNewPrimitive: 0.45,
    },
    primaryGapNoneProbability: 0.35,
    mechanicalNovelty: 1.86,
    primitiveProbabilities: {
      "trigger.on_move": 0.92,
      "action.draw_cards": 0.7,
    },
  });

  assert.equal(decideCardTriageRoute(state, result).route, "MOE_DISCOVERY");
});

test("a non-executable primitive at material probability blocks the fast path even below display-selection threshold", () => {
  const futureEffect = capability({
    id: "action.future_effect",
    family: "action",
    runtimeCoverage: "planned",
  });
  const stateWithGap = buildState([moveTrigger, drawCards, futureEffect]);
  const result = buildResult(stateWithGap, {
    primitiveProbabilities: {
      "trigger.on_move": 0.94,
      "action.draw_cards": 0.92,
      "action.future_effect": 0.65,
    },
  });

  const decision = decideCardTriageRoute(stateWithGap, result);

  assert.equal(decision.route, "MOE_DISCOVERY");
  assert.equal(
    decision.selectedPrimitives.some(({ id }) => id === "action.future_effect"),
    false,
  );
  assert.equal(decision.nonExecutablePrimitiveRisks[0]?.id, "action.future_effect");
  assert.equal(
    decision.topPrimitiveCandidates.some(({ id }) => id === "action.future_effect"),
    true,
  );
});

test("shadow mode never replaces the existing Moe route", () => {
  const result = buildResult(state, {
    primitiveProbabilities: {
      "trigger.on_move": 0.93,
      "action.draw_cards": 0.91,
    },
  });
  const decision = decideCardTriageRoute(state, result);

  const compact = buildCompactCardTriageOutput({
    state,
    mode: "shadow",
    decision,
    artifactPath: ".agent-work/card-jev-triage/sfd-048.json",
  });

  assert.equal(compact.route, "MOE_DISCOVERY");
  assert.equal(compact.jevAdvisoryRoute, "TARGETED_IMPLEMENTATION");
  assert.equal(compact.signals.mechanicalNovelty, 0.4);
  assert.equal(compact.topPrimitiveCandidates.length, 2);
});

type SignalName =
  | "existingBehaviorVocabularySufficient"
  | "existingExecutableCapabilitiesSufficient"
  | "compositionSufficient"
  | "behaviorModelOnlySufficient"
  | "deterministicSuggestionComplete"
  | "deterministicSuggestionParametersReliable"
  | "allMaterialClausesCoveredByExistingPrimitives"
  | "primitiveParameterizationSufficient"
  | "referencedTokenDefinitionsSufficient"
  | "sourceStateSufficientForRouting"
  | "requiresExistingPrimitiveExtension"
  | "requiresNewPrimitive"
  | "requiresNewEventOrTriggerInfrastructure"
  | "requiresNewPersistentGameState"
  | "requiresNewSelectorOrChoiceContract"
  | "requiresNewTimingOrChainContract"
  | "requiresNewProjectionContract";

const defaultSignals: Record<SignalName, number> = {
  existingBehaviorVocabularySufficient: 0.9,
  existingExecutableCapabilitiesSufficient: 0.8,
  compositionSufficient: 0.9,
  behaviorModelOnlySufficient: 0.8,
  deterministicSuggestionComplete: 0.8,
  deterministicSuggestionParametersReliable: 0.8,
  allMaterialClausesCoveredByExistingPrimitives: 0.9,
  primitiveParameterizationSufficient: 0.85,
  referencedTokenDefinitionsSufficient: 0.9,
  sourceStateSufficientForRouting: 0.8,
  requiresExistingPrimitiveExtension: 0.05,
  requiresNewPrimitive: 0.05,
  requiresNewEventOrTriggerInfrastructure: 0.05,
  requiresNewPersistentGameState: 0.05,
  requiresNewSelectorOrChoiceContract: 0.05,
  requiresNewTimingOrChainContract: 0.05,
  requiresNewProjectionContract: 0.05,
};

function buildResult(
  cardState: CardJevTriageState,
  input: {
    primitiveProbabilities?: Record<string, number>;
    signalOverrides?: Partial<Record<SignalName, number>>;
    primaryGapNoneProbability?: number;
    mechanicalNovelty?: number;
  } = {},
): SystemOneResult<Questions> {
  const questions = buildCardTriageQuestions(cardState);
  const signals = { ...defaultSignals, ...input.signalOverrides };
  const answers: Record<string, unknown> = {};

  for (const [name, question] of Object.entries(questions)) {
    if (name === "implementationDisposition") {
      answers[name] = choiceAnswer("COMPOSE_EXISTING", {
        EXACT_REUSE: 0.03,
        COMPOSE_EXISTING: 0.94,
        EXTEND_EXISTING: 0.01,
        NEW_CAPABILITY: 0.01,
        INSUFFICIENT_EVIDENCE: 0.01,
      });
      continue;
    }
    if (name === "primaryGapFamily") {
      const noneProbability = input.primaryGapNoneProbability ?? 0.82;
      answers[name] = choiceAnswer("NONE", {
        NONE: noneProbability,
        ABILITY: 0.01,
        TIMING: 0.01,
        SELECTOR: 0.01,
        ACTION: 0.01,
        MODIFIER: 0.01,
        TRIGGER: 0.01,
        CONDITION: 0.01,
        CHOICE: 0.01,
        COST: 0.01,
        REPLACEMENT: 0.01,
        PREVENTION: 0.01,
        KEYWORD: 0.01,
        STATE: 0.01,
        TOKEN: 0.01,
        PROJECTION: 0.01,
        MULTIPLE: 0.01,
        INSUFFICIENT_EVIDENCE: 0.01,
      });
      continue;
    }
    if (name === "mechanicalNovelty") {
      answers[name] = {
        type: "score",
        score: input.mechanicalNovelty ?? 0.4,
        confidence: 0.95,
        legend: {},
        probabilities: {
          "0": 0.7,
          "1": 0.25,
          "2": 0.03,
          "3": 0.01,
          "4": 0.01,
        },
      };
      continue;
    }
    if (name.startsWith("primitive::")) {
      const primitiveId = name.slice("primitive::".length);
      answers[name] = {
        type: "noul",
        noul: input.primitiveProbabilities?.[primitiveId] ?? 0.04,
      };
      continue;
    }

    assert.equal(question.type, "noul");
    assert.ok(name in signals, `Missing test signal fixture for ${name}`);
    answers[name] = {
      type: "noul",
      noul: signals[name as SignalName],
    };
  }

  return {
    model: "jev-test",
    answers,
    usage: { input_tokens: 1000, output_tokens: 100 },
  } as unknown as SystemOneResult<Questions>;
}

function choiceAnswer(
  choice: string,
  probabilities: Record<string, number>,
): unknown {
  return {
    type: "choice",
    choice,
    confidence: probabilities[choice] ?? 0,
    probabilities,
  };
}

function buildState(
  behaviorCatalog: JevBehaviorCapability[],
): CardJevTriageState {
  return {
    objective: "test",
    constraints: [],
    primitiveSelectionRule:
      "Select cost.pay only for a special rules-text-defined cost, never a normal printed play cost. action.ready_cards is not entry-state semantics.",
    targetCard: {
      name: "Stellacorn Herder",
      publicCode: "SFD-048/221",
      setCode: "SFD",
      type: "Unit",
      supertype: null,
      domains: ["Calm"],
      energy: 4,
      might: 3,
      power: null,
      tags: ["Mount Targon"],
      rulesText: "When I move, draw 1.",
    },
    targetIdentity: {
      cardCode: "SFD-048",
      publicCode: "SFD-048/221",
      sourceTextHash: "test-hash",
    },
    implementation: {
      status: "not_published",
      sourceTextHash: "test-hash",
      canonicalSourceTextHash: null,
      runtimeSupportStatus: null,
      readinessReasons: [],
      existingBehaviorIds: [],
    },
    deterministicSuggestion: null,
    tokenCatalog: [
      {
        name: "Sprite",
        publicCode: "OGN-229/298",
        setCode: "OGN",
        type: "Unit",
        domains: ["Colorless"],
        energy: null,
        might: 3,
        power: null,
        tags: [],
        rulesText:
          "[Temporary] (Kill me at the start of your Beginning Phase, before scoring.)",
      },
    ],
    behaviorCatalog,
    catalogMetadata: {
      sourceCatalogVersionHash: "test-catalog",
      sourceSetFiles: ["sfd.json"],
      behaviorPrimitiveCount: behaviorCatalog.length,
      tokenDefinitionCount: 1,
    },
  };
}

function capability(input: {
  id: string;
  family: JevBehaviorCapability["family"];
  runtimeCoverage?: JevBehaviorCapability["runtimeCoverage"];
  listensToEvents?: JevBehaviorCapability["listensToEvents"];
  emitsEvents?: JevBehaviorCapability["emitsEvents"];
}): JevBehaviorCapability {
  return {
    id: input.id,
    family: input.family,
    name: input.id,
    description: input.id,
    parameters: [],
    listensToEvents: input.listensToEvents ?? [],
    emitsEvents: input.emitsEvents ?? [],
    runtimeCoverage: input.runtimeCoverage ?? "executable",
  };
}
