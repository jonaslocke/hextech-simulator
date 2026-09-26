import type { GameProjection } from "@/shared/game";
import type { ReactNode } from "react";
import type { DecisionInspectionPolicy } from "./decision-inspection-policy";

export type PlayerDecisionIntent = {
  actionId: string;
  selectedIds?: string[];
  allocations?: Array<{ targetUnitId: string; amount: number }>;
  tokenPlacements?: Array<{ destinationId: string; count: number }>;
};

export type PlayerDecisionCard = {
  diagnosticCardInstanceId?: string;
  id: string;
  label: string;
  description?: string;
  imageUrl?: string;
  disabled?: boolean;
};

export type PlayerDecisionOption = Omit<PlayerDecisionCard, "description"> & {
  description?: ReactNode;
  imageOrientation?: "auto" | "portrait" | "landscape";
};

export type CombatDamageChoice = Extract<
  NonNullable<GameProjection["actions"][number]["choice"]>,
  { kind: "combatDamage" }
>;

type DecisionInspectionCapability = {
  /**
   * Controls whether the active gameplay decision may temporarily expose a
   * read-only game-state inspection surface.
   *
   * Omitted values are treated as "none" so older callers remain compatible.
   */
  inspection?: DecisionInspectionPolicy;
};

export type CardSelectionDecisionRequest = DecisionInspectionCapability & {
  kind: "cardSelection";
  decisionKey: string;
  actionId: string;
  title: string;
  description?: string;
  cards: PlayerDecisionCard[];
  minSelected: number;
  maxSelected: number;
  selectionMode: "multiple" | "single";
  confirmLabel?: string | ((selectedIds: string[]) => string);
  cancelLabel?: string;
  canCancel?: boolean;
};

export type OptionDecisionRequest = DecisionInspectionCapability & {
  kind: "optionDecision";
  decisionKey: string;
  actionId: string;
  title: string;
  description?: string;
  options: PlayerDecisionOption[];
  revealedCards?: PlayerDecisionCard[];
  confirmLabel?: string;
  canCancel?: boolean;
};

export type OrderedDecisionRequest = DecisionInspectionCapability & {
  kind: "orderedDecision";
  decisionKey: string;
  actionId: string;
  title: string;
  description?: string;
  options: PlayerDecisionOption[];
  confirmLabel?: string;
};

export type CombatDamageDecisionRequest = DecisionInspectionCapability & {
  kind: "combatDamage";
  actionId: string;
  decisionKey?: string;
  choice: CombatDamageChoice;
};

export type PendingDecisionRequest = DecisionInspectionCapability & {
  kind: "pendingDecision";
  title: string;
  message: ReactNode;
  tone?: "cyan" | "amber";
  revealedCards?: PlayerDecisionCard[];
};

export type TokenPlacementDecisionRequest = DecisionInspectionCapability & {
  kind: "tokenPlacement";
  decisionKey: string;
  actionId: string;
  title: string;
  description?: string;
  tokenName: string;
  count: number;
  destinations: Array<{ id: string; label: string }>;
  confirmLabel?: string;
};

export type EffectPlayDecisionRequest = DecisionInspectionCapability & {
  kind: "effectPlay";
  decisionKey: string;
  stagedCard: PlayerDecisionCard;
  options: Array<{
    actionId: string;
    id: string;
    kind: "play" | "decline" | "continue";
    label: string;
    description?: string;
    resourceCost?: { energy: number; powerCosts: Array<{ amount: number; domains: string[] }> };
  }>;
};

export type PlayerDecisionRequest =
  | CardSelectionDecisionRequest
  | OptionDecisionRequest
  | OrderedDecisionRequest
  | CombatDamageDecisionRequest
  | TokenPlacementDecisionRequest
  | EffectPlayDecisionRequest
  | PendingDecisionRequest;
