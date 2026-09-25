import type { DecisionInspectionPolicy } from "../decisions/decision-inspection-policy";
import type { PlayerDecisionRequest } from "../decisions/player-decision-types";
import type { BoardTargetSelection } from "./use-board-target-selection";

export type DecisionInspectionRequest = {
  decisionKey: string;
  policy: DecisionInspectionPolicy;
  source: "battlefieldChoice" | "locationChoice" | "playerDecision";
  title: string;
};

export function resolveDecisionInspectionRequest({
  playerDecision,
  targetSelection,
}: {
  playerDecision: PlayerDecisionRequest | null;
  targetSelection: BoardTargetSelection | null;
}): DecisionInspectionRequest | null {
  const playerDecisionRequest = resolvePlayerDecisionInspectionRequest(
    playerDecision,
  );

  if (playerDecisionRequest) {
    return playerDecisionRequest;
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
  const policy = decision?.inspection ?? "none";

  if (!decision || policy === "none" || decision.kind === "pendingDecision") {
    return null;
  }

  switch (decision.kind) {
    case "cardSelection":
    case "optionDecision":
    case "orderedDecision":
      return {
        decisionKey: `${policy}:${decision.kind}:${decision.decisionKey}`,
        policy,
        source: "playerDecision",
        title: decision.title,
      };
    case "combatDamage":
      return {
        decisionKey: `${policy}:${decision.kind}:${decision.decisionKey ?? decision.actionId}`,
        policy,
        source: "playerDecision",
        title: "Assign combat damage",
      };
    case "tokenPlacement":
      return {
        decisionKey: `${policy}:${decision.kind}:${decision.decisionKey}`,
        policy,
        source: "playerDecision",
        title: decision.title,
      };
    case "effectPlay":
      return null;
  }
}
