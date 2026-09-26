import {
  decisionInspectionPolicyForPrompt,
  type DecisionInspectionPolicy,
} from "../decisions/decision-inspection-policy";
import type { PlayerDecisionRequest } from "../decisions/player-decision-types";
import type { BoardTargetSelection } from "./use-board-target-selection";

export type DecisionInspectionRequest = {
  decisionKey: string;
  policy: DecisionInspectionPolicy;
  source:
    | "battlefieldChoice"
    | "locationChoice"
    | "playerDecision"
    | "unitPlayChoice";
  title: string;
};

export function resolveDecisionInspectionRequest({
  playerDecision,
  targetSelection,
  unitPlayChoice,
}: {
  playerDecision: PlayerDecisionRequest | null;
  targetSelection: BoardTargetSelection | null;
  unitPlayChoice?: { card: { instanceId?: string; name: string } } | null;
}): DecisionInspectionRequest | null {
  const playerDecisionRequest = resolvePlayerDecisionInspectionRequest(
    playerDecision,
  );

  if (playerDecisionRequest) {
    return playerDecisionRequest;
  }

  if (unitPlayChoice) {
    return {
      decisionKey: `publicGameState:unitPlayChoice:${unitPlayChoice.card.instanceId ?? unitPlayChoice.card.name}`,
      policy: "publicGameState",
      source: "unitPlayChoice",
      title: `Choose how to play ${unitPlayChoice.card.name}`,
    };
  }

  if (targetSelection?.targetKind !== "battlefield" && targetSelection?.targetKind !== "location") {
    return null;
  }

  return {
    decisionKey: `publicGameState:${targetSelection.targetKind === "location" ? "locationChoice" : "battlefieldChoice"}:${targetSelection.actionId}`,
    policy: "publicGameState",
    source: targetSelection.targetKind === "location" ? "locationChoice" : "battlefieldChoice",
    title: targetSelection.targetKind === "location" ? "Choose a move destination." : "Choose the battlefield affected by this action.",
  };
}

function resolvePlayerDecisionInspectionRequest(
  decision: PlayerDecisionRequest | null,
): DecisionInspectionRequest | null {
  if (!decision || decision.kind === "pendingDecision") {
    return null;
  }
  const policy = decisionInspectionPolicyForPrompt(decision);
  if (policy === "none") return null;

  const decisionIdentity = decision.kind === "combatDamage"
    ? decision.decisionKey ?? decision.actionId
    : decision.decisionKey;
  const title = decision.kind === "combatDamage"
    ? "Assign combat damage"
    : decision.kind === "effectPlay"
      ? "Play a card from this effect?"
      : decision.title;

  return {
    decisionKey: `${policy}:${decision.kind}:${decisionIdentity}`,
    policy,
    source: "playerDecision",
    title,
  };
}
