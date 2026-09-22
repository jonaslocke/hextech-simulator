import {
  choice,
  noul,
  score,
  type Questions,
} from "@typesafe-ai/sdk";
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
      "Best implementation disposition for this card?",
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
    recommendedRoute: choice(
      "Least expensive safe discovery route before implementation?",
      {
        TARGETED_IMPLEMENTATION:
          "Existing executable capabilities are sufficient; verify identified owners and implement without broad semantic discovery.",
        MOE_DISCOVERY:
          "Full reusable-behavior discovery is needed before implementation.",
        MOE_THEN_LARRY:
          "Moe discovery is needed and the likely shared change has meaningful state/sequence risk afterward.",
      },
    ),
    existingBehaviorVocabularySufficient: noul(
      "Can existing behavior vocabulary express every material card clause without redefining a primitive?",
    ),
    existingExecutableCapabilitiesSufficient: noul(
      "Are executable primitives sufficient for every material card clause?",
    ),
    compositionSufficient: noul(
      "Is faithful composition of existing primitives sufficient?",
    ),
    behaviorModelOnlySufficient: noul(
      "Is this likely only behavior-model/publication work with no shared engine-code change?",
    ),
    deterministicSuggestionComplete: noul(
      "Does the deterministic suggestion cover all material card clauses accurately enough to guide implementation?",
    ),
    allMaterialClausesCoveredByExistingPrimitives: noul(
      "Do existing primitives collectively cover every material semantic distinction in the card?",
    ),
    requiresExistingPrimitiveExtension: noul(
      "Does faithful implementation require extending an existing primitive contract or parameters?",
    ),
    requiresNewPrimitive: noul(
      "Does faithful implementation require a genuinely new reusable primitive?",
    ),
    requiresNewEventOrTriggerInfrastructure: noul(
      "Is new event or trigger infrastructure required?",
    ),
    requiresNewPersistentGameState: noul(
      "Is new persistent game state or per-turn/effect memory required?",
    ),
    requiresNewSelectorOrChoiceContract: noul(
      "Is a new selector, targeting, choice, or cardinality contract required?",
    ),
    requiresNewTimingOrChainContract: noul(
      "Is a new timing, Priority, Focus, Chain, delayed-resolution, or continuation contract required?",
    ),
    requiresNewProjectionContract: noul(
      "Is a new viewer projection or client-visible gameplay contract required?",
    ),
    sharedEngineChangeLikely: noul(
      "Is shared game-engine code likely to change?",
    ),
    fullMoeDiscoveryNeeded: noul(
      "Should full Moe reusable-behavior discovery run before implementation?",
    ),
    larryVerificationLikelyNeeded: noul(
      "After the semantic owner is understood, is Larry-style state/sequence verification likely warranted?",
    ),
    sourceStateSufficientForRouting: noul(
      "Is the supplied state sufficient to route this card without repository-wide semantic discovery first?",
    ),
    mechanicalNovelty: score(
      "Mechanical novelty relative to supplied behavior vocabulary and runtime coverage?",
      [
        "0 — direct reuse of executable semantics.",
        "1 — straightforward composition of executable semantics.",
        "2 — likely narrow extension or uncertain composition.",
        "3 — material new reusable behavior or shared engine work likely.",
        "4 — multiple new semantic/runtime capabilities likely.",
      ],
    ),
    primaryGapFamily: choice(
      "Primary missing semantic owner if executable capabilities are insufficient?",
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
        COST: "Cost/payment contract.",
        REPLACEMENT: "Replacement effect.",
        PREVENTION: "Prevention effect.",
        KEYWORD: "Keyword semantics.",
        STATE: "Persistent game/effect memory.",
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
