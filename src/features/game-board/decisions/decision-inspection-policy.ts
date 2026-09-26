export const decisionInspectionPolicies = [
  "none",
  "board",
  "publicGameState",
] as const;

export type DecisionInspectionPolicy =
  (typeof decisionInspectionPolicies)[number];

export type DecisionInspectionZone = "trash" | "banishment";

export function decisionInspectionPolicyForPrompt(decision: {
  kind: string;
}): DecisionInspectionPolicy {
  if (decision.kind === "pendingDecision") return "none";
  // Interactive prompts cover the public board, so none or narrower policies
  // must not hide public information from players making a decision.
  return "publicGameState";
}
