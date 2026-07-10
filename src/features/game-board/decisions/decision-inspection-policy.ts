export const decisionInspectionPolicies = [
  "none",
  "board",
  "publicGameState",
] as const;

export type DecisionInspectionPolicy =
  (typeof decisionInspectionPolicies)[number];

export type DecisionInspectionZone = "trash" | "banishment";
