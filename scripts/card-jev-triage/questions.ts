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
      "Which implementation disposition best fits this card when judged only against the supplied card data, deterministic suggestion, behavior catalog, runtime coverage, and canonical implementation evidence?",
      {
        EXACT_REUSE:
          "An existing approved behavior shape can be reused without a material semantic change.",
        COMPOSE_EXISTING:
          "The card can be expressed faithfully by composing existing behavior primitives without changing their accepted meanings.",
        EXTEND_EXISTING:
          "The correct reusable owner exists, but it needs a narrow extension before the card can be expressed faithfully.",
        NEW_CAPABILITY:
          "At least one material semantic distinction cannot be expressed by the existing reusable behavior vocabulary and requires a genuinely new capability.",
        INSUFFICIENT_EVIDENCE:
          "The supplied state is not enough to classify the implementation faithfully.",
      },
    ),
    recommendedRoute: choice(
      "Which discovery route should a coding agent take before implementing this one card? Choose the least expensive route that still protects semantic correctness.",
      {
        TARGETED_IMPLEMENTATION:
          "Existing executable capabilities are sufficient; verify the identified owners and implement the card without broad semantic discovery.",
        MOE_DISCOVERY:
          "Full reusable-behavior discovery is still needed before implementation.",
        MOE_THEN_LARRY:
          "Reusable-behavior discovery is needed and the likely shared change has meaningful state/sequence risk that warrants Larry verification afterward.",
      },
    ),
    existingBehaviorVocabularySufficient: noul(
      "Can every material behavior clause on this card be expressed faithfully using the supplied existing behavior vocabulary, without redefining any primitive?",
    ),
    existingExecutableCapabilitiesSufficient: noul(
      "Are the supplied primitives with runtimeCoverage=executable sufficient to implement every material behavior clause on this card?",
    ),
    compositionSufficient: noul(
      "Is a composition of existing primitives sufficient to express this card faithfully?",
    ),
    behaviorModelOnlySufficient: noul(
      "Is this likely a behavior-model/publication task only, with no shared game-engine code change required?",
    ),
    deterministicSuggestionComplete: noul(
      "Does the supplied deterministic behavior suggestion cover all material clauses of the card accurately enough to guide implementation?",
    ),
    allMaterialClausesCoveredByExistingPrimitives: noul(
      "Does the supplied behavior catalog contain primitives that collectively cover all material clauses and semantic distinctions in the target card text?",
    ),
    requiresExistingPrimitiveExtension: noul(
      "Does faithful implementation require extending the contract or parameters of an existing primitive?",
    ),
    requiresNewPrimitive: noul(
      "Does faithful implementation require a genuinely new reusable behavior primitive?",
    ),
    requiresNewEventOrTriggerInfrastructure: noul(
      "Does faithful implementation require a new game event, trigger lifecycle, or trigger infrastructure beyond the supplied capabilities?",
    ),
    requiresNewPersistentGameState: noul(
      "Does faithful implementation require new persistent canonical game state, per-turn memory, or effect memory beyond the supplied capabilities?",
    ),
    requiresNewSelectorOrChoiceContract: noul(
      "Does faithful implementation require a new selector, target-selection, player-choice, or cardinality contract beyond the supplied capabilities?",
    ),
    requiresNewTimingOrChainContract: noul(
      "Does faithful implementation require a new timing, Priority, Focus, Chain, delayed-resolution, or continuation contract beyond the supplied capabilities?",
    ),
    requiresNewProjectionContract: noul(
      "Does faithful implementation require a new viewer projection or client-visible gameplay contract beyond the supplied capabilities?",
    ),
    sharedEngineChangeLikely: noul(
      "Is a shared game-engine behavior change likely to be required rather than only authoring or composing an approved behavior model?",
    ),
    fullMoeDiscoveryNeeded: noul(
      "Should the coding agent run the full Moe reusable-behavior discovery procedure before implementing this card?",
    ),
    larryVerificationLikelyNeeded: noul(
      "Assuming the likely implementation path is taken, is there meaningful combinatorial state or action-sequence risk that should be routed to Larry after the semantic owner is understood?",
    ),
    sourceStateSufficientForRouting: noul(
      "Is the supplied state sufficient to route implementation of this card without repository-wide semantic discovery first?",
    ),
    mechanicalNovelty: score(
      "How mechanically novel is this card relative to the supplied behavior vocabulary and executable runtime capabilities?",
      [
        "0 — no material novelty; direct reuse of already executable semantics.",
        "1 — low novelty; straightforward composition of already executable semantics.",
        "2 — moderate novelty; likely narrow extension or uncertain composition.",
        "3 — high novelty; material new reusable behavior or shared engine work is likely.",
        "4 — very high novelty; multiple new semantic/runtime capabilities are likely.",
      ],
    ),
    primaryGapFamily: choice(
      "If the card cannot be implemented entirely with existing executable capabilities, which area is the primary missing semantic owner? Choose NONE when no gap is needed.",
      {
        NONE: "No missing reusable capability is needed.",
        ABILITY: "Activated or reusable ability contract.",
        TIMING: "Action/Reaction/delayed/timing contract.",
        SELECTOR: "Target or selection contract.",
        ACTION: "State-changing effect primitive.",
        MODIFIER: "Static, temporary, numeric, permission, cost, or rule modifier.",
        TRIGGER: "Event or trigger contract.",
        CONDITION: "Behavior condition or predicate.",
        CHOICE: "Player/system choice or option contract.",
        COST: "Additional/activated/payment cost contract.",
        REPLACEMENT: "Replacement effect contract.",
        PREVENTION: "Prevention effect contract.",
        KEYWORD: "Keyword semantics.",
        STATE: "Persistent game/effect/per-turn memory.",
        PROJECTION: "Viewer-safe projection or client-facing gameplay contract.",
        MULTIPLE: "Multiple distinct reusable owners are materially missing.",
        INSUFFICIENT_EVIDENCE:
          "The supplied state does not establish the primary gap.",
      },
    ),
  };

  for (const primitive of state.behaviorCatalog) {
    questions[primitiveQuestionName(primitive.id)] = noul(
      `Should existing primitive ${primitive.id} be part of a faithful behavior model for this target card? Answer yes only when its accepted semantics are materially required by the card; do not select it merely because wording is similar.`,
      {
        true: `Use ${primitive.id} as part of the implementation composition.`,
        false: `${primitive.id} is not materially required by this card.`,
      },
    );
  }

  return questions;
}
