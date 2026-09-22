import { choice, noul, score, type Questions } from "@typesafe-ai/sdk";
import type { CardJevTriageState } from "./state";

export const PRIMITIVE_QUESTION_PREFIX = "primitive::";

export function primitiveQuestionName(primitiveId: string): string {
  return `${PRIMITIVE_QUESTION_PREFIX}${primitiveId}`;
}

export function buildCardTriageQuestions(
  state: CardJevTriageState,
): Questions {
  const questions: Questions = {
    implementationDisposition: choice(
      "Best semantic implementation disposition for this card?",
      {
        EXACT_REUSE:
          "Reuse an existing approved behavior shape without material semantic change.",
        COMPOSE_EXISTING:
          "Compose existing primitives without changing their accepted meanings.",
        EXTEND_EXISTING:
          "An existing reusable owner needs a narrow extension.",
        NEW_CAPABILITY:
          "A material semantic distinction requires a genuinely new reusable capability.",
        INSUFFICIENT_EVIDENCE:
          "The supplied state is insufficient for a faithful classification.",
      },
    ),
    existingBehaviorVocabularySufficient: noul(
      "Can the supplied existing behavior vocabulary express every material rules-text clause without redefining primitive meaning?",
    ),
    existingExecutableCapabilitiesSufficient: noul(
      "Are primitives with runtimeCoverage=executable sufficient to implement every material rules-text clause faithfully?",
    ),
    compositionSufficient: noul(
      "Can this card be implemented faithfully by composing existing primitive meanings rather than extending or creating reusable semantics?",
    ),
    behaviorModelOnlySufficient: noul(
      "Is implementation likely limited to card behavior-model/publication work, with no shared engine capability change required?",
    ),
    deterministicSuggestionComplete: noul(
      "Does the deterministic suggestion identify every material semantic owner needed by the card?",
    ),
    deterministicSuggestionParametersReliable: noul(
      "Are the deterministic suggestion's supplied parameters and cardinalities faithful to the card text, rather than parser approximations or misread printed characteristics?",
    ),
    allMaterialClausesCoveredByExistingPrimitives: noul(
      "Do existing primitives collectively cover every material semantic distinction present in the card rules text?",
    ),
    primitiveParameterizationSufficient: noul(
      "Can the required existing primitives express the card's exact targets, counts, conditions, durations, destinations, and other parameters without changing their contracts?",
    ),
    referencedTokenDefinitionsSufficient: noul(
      "If this card creates or references named tokens, does tokenCatalog contain every required named token with gameplay characteristics sufficient to represent the rules text? Answer yes when the card does not create or reference named tokens.",
    ),
    requiresExistingPrimitiveExtension: noul(
      "Does faithful implementation require extending an existing primitive contract, accepted parameter domain, or semantic meaning?",
    ),
    requiresNewPrimitive: noul(
      "Does faithful implementation require a genuinely new reusable primitive?",
    ),
    requiresNewEventOrTriggerInfrastructure: noul(
      "Is new event or trigger infrastructure required beyond the supplied executable trigger/event capabilities?",
    ),
    requiresNewPersistentGameState: noul(
      "Is new persistent game state or per-turn/effect memory required beyond the supplied capabilities?",
    ),
    requiresNewSelectorOrChoiceContract: noul(
      "Is a new selector, targeting, choice, or cardinality contract required beyond existing primitive parameterization?",
    ),
    requiresNewTimingOrChainContract: noul(
      "Is a new timing, Priority, Focus, Chain, delayed-resolution, or continuation contract required?",
    ),
    requiresNewProjectionContract: noul(
      "Is a new viewer projection or client-visible gameplay contract required?",
    ),
    sourceStateSufficientForRouting: noul(
      "Is the supplied card, token, behavior-vocabulary, runtime-coverage, and deterministic-suggestion state sufficient to decide whether broad reusable-behavior discovery can be skipped?",
    ),
    mechanicalNovelty: score(
      "Mechanical novelty relative to the supplied behavior vocabulary, token definitions, and runtime coverage?",
      [
        "0 — direct reuse of executable semantics.",
        "1 — straightforward composition of executable semantics.",
        "2 — likely narrow extension, incomplete source state, or uncertain composition.",
        "3 — material new reusable behavior or shared engine work likely.",
        "4 — multiple new semantic/runtime capabilities likely.",
      ],
    ),
    primaryGapFamily: choice(
      "Primary missing semantic owner if existing executable capabilities are insufficient?",
      {
        NONE: "No missing reusable capability.",
        ABILITY: "Activated/reusable ability.",
        TIMING: "Timing contract.",
        SELECTOR: "Target/selection contract.",
        ACTION: "State-changing effect.",
        MODIFIER: "Modifier contract.",
        TRIGGER: "Event/trigger contract.",
        CONDITION: "Condition/predicate.",
        CHOICE: "Player/system choice.",
        COST: "Special rules-text-defined cost/payment contract.",
        REPLACEMENT: "Replacement effect.",
        PREVENTION: "Prevention effect.",
        KEYWORD: "Keyword semantics.",
        STATE: "Persistent game/effect memory.",
        TOKEN: "Named token definition or token-specific semantics.",
        PROJECTION: "Viewer/client projection.",
        MULTIPLE: "Multiple distinct owners are missing.",
        INSUFFICIENT_EVIDENCE: "State does not establish the primary gap.",
      },
    ),
  };

  for (const primitive of state.behaviorCatalog) {
    questions[primitiveQuestionName(primitive.id)] = noul(
      `Required primitive: ${primitive.id}?`,
    );
  }

  return questions;
}
