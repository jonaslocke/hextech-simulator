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
import type {
  CardJevTriageState,
  JevBehaviorCapability,
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

test("card Jev triage asks routing questions and one independent question per primitive", () => {
  const questions = buildCardTriageQuestions(state);

  assert.equal(questions.implementationDisposition?.type, "choice");
  assert.equal(questions.mechanicalNovelty?.type, "score");
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


test("high-confidence executable composition routes directly to targeted implementation", () => {
  const result = buildResult(state, {
    selectedPrimitiveIds: ["trigger.on_move", "action.draw_cards"],
  });

  const decision = decideCardTriageRoute(state, result);

  assert.equal(decision.route, "TARGETED_IMPLEMENTATION");
  assert.deepEqual(
    decision.selectedPrimitives.map(({ id }) => id),
    ["trigger.on_move", "action.draw_cards"],
  );
});

test("a selected primitive without executable runtime coverage prevents the fast path", () => {
  const nonExecutable = capability({
    id: "action.future_effect",
    family: "action",
    runtimeCoverage: "planned",
  });
  const stateWithGap = buildState([moveTrigger, nonExecutable]);
  const result = buildResult(stateWithGap, {
    selectedPrimitiveIds: ["trigger.on_move", "action.future_effect"],
  });

  const decision = decideCardTriageRoute(stateWithGap, result);

  assert.equal(decision.route, "MOE_DISCOVERY");
  assert.match(decision.reasons.join(" "), /not executable/i);
});

test("shadow mode never replaces the existing Moe route", () => {
  const result = buildResult(state, {
    selectedPrimitiveIds: ["trigger.on_move", "action.draw_cards"],
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
});

function buildResult(
  cardState: CardJevTriageState,
  input: { selectedPrimitiveIds: string[] },
): SystemOneResult<Questions> {
  const questions = buildCardTriageQuestions(cardState);
  const selected = new Set(input.selectedPrimitiveIds);
  const positive = new Set([
    "existingBehaviorVocabularySufficient",
    "existingExecutableCapabilitiesSufficient",
    "compositionSufficient",
    "behaviorModelOnlySufficient",
    "deterministicSuggestionComplete",
    "allMaterialClausesCoveredByExistingPrimitives",
    "sourceStateSufficientForRouting",
  ]);
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
    if (name === "recommendedRoute") {
      answers[name] = choiceAnswer("TARGETED_IMPLEMENTATION", {
        TARGETED_IMPLEMENTATION: 0.95,
        MOE_DISCOVERY: 0.04,
        MOE_THEN_LARRY: 0.01,
      });
      continue;
    }
    if (name === "primaryGapFamily") {
      answers[name] = choiceAnswer("NONE", {
        NONE: 0.96,
        ABILITY: 0.002,
        TIMING: 0.002,
        SELECTOR: 0.002,
        ACTION: 0.002,
        MODIFIER: 0.002,
        TRIGGER: 0.002,
        CONDITION: 0.002,
        CHOICE: 0.002,
        COST: 0.002,
        REPLACEMENT: 0.002,
        PREVENTION: 0.002,
        KEYWORD: 0.002,
        STATE: 0.002,
        PROJECTION: 0.002,
        MULTIPLE: 0.002,
        INSUFFICIENT_EVIDENCE: 0.01,
      });
      continue;
    }
    if (name === "mechanicalNovelty") {
      answers[name] = {
        type: "score",
        score: 0.4,
        confidence: 0.95,
        legend: {},
        probabilities: { "0": 0.7, "1": 0.25, "2": 0.03, "3": 0.01, "4": 0.01 },
      };
      continue;
    }
    if (name.startsWith("primitive::")) {
      const primitiveId = name.slice("primitive::".length);
      answers[name] = {
        type: "noul",
        noul: selected.has(primitiveId) ? 0.96 : 0.04,
      };
      continue;
    }
    assert.equal(question.type, "noul");
    answers[name] = {
      type: "noul",
      noul: positive.has(name) ? 0.95 : 0.05,
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
    targetCard: {
      id: "test-stellacorn",
      name: "Stellacorn Herder",
      riftbound_id: "sfd-048-221",
      public_code: "SFD-048/221",
      collector_number: 48,
      attributes: { energy: 4, might: 3, power: null },
      classification: {
        type: "Unit",
        supertype: null,
        rarity: "Uncommon",
        domain: ["Calm"],
      },
      text: { plain: "When I move, draw 1." },
      set: { set_id: "SFD", label: "SFD" },
      media: {},
      tags: ["Mount Targon"],
      metadata: {},
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
      behaviorModel: null,
      effectBehaviorModel: null,
    },
    deterministicSuggestion: null,
    behaviorCatalog,
    catalogMetadata: {
      sourceCatalogVersionHash: "test-catalog",
      sourceSetFiles: ["sfd.json"],
      behaviorPrimitiveCount: behaviorCatalog.length,
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
    fixedRules: [],
    listensToEvents: input.listensToEvents ?? [],
    emitsEvents: input.emitsEvents ?? [],
    timingRequirements: [],
    targetingRequirements: [],
    engineSupport: { status: "supported", note: "test" },
    runtimeCoverage: input.runtimeCoverage ?? "executable",
    examples: [],
  };
}
