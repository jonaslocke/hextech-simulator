import type { GameProjection } from "@/shared/game";
import type { ReactNode } from "react";

export type PlayerDecisionIntent = {
  actionId: string;
  selectedIds?: string[];
  allocations?: Array<{ targetUnitId: string; amount: number }>;
};

export type PlayerDecisionCard = {
  id: string;
  label: string;
  description?: string;
  imageUrl?: string;
  disabled?: boolean;
};

export type PlayerDecisionOption = PlayerDecisionCard & {
  imageOrientation?: "auto" | "portrait" | "landscape";
};

export type CombatDamageChoice = Extract<
  NonNullable<GameProjection["actions"][number]["choice"]>,
  { kind: "combatDamage" }
>;

export type CardSelectionDecisionRequest = {
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

export type OptionDecisionRequest = {
  kind: "optionDecision";
  decisionKey: string;
  actionId: string;
  title: string;
  description?: string;
  options: PlayerDecisionOption[];
  confirmLabel?: string;
  canCancel?: boolean;
};

export type OrderedDecisionRequest = {
  kind: "orderedDecision";
  decisionKey: string;
  actionId: string;
  title: string;
  description?: string;
  options: PlayerDecisionOption[];
  confirmLabel?: string;
};

export type CombatDamageDecisionRequest = {
  kind: "combatDamage";
  actionId: string;
  choice: CombatDamageChoice;
};

export type PendingDecisionRequest = {
  kind: "pendingDecision";
  title: string;
  message: ReactNode;
  tone?: "cyan" | "amber";
};

export type PlayerDecisionRequest =
  | CardSelectionDecisionRequest
  | OptionDecisionRequest
  | OrderedDecisionRequest
  | CombatDamageDecisionRequest
  | PendingDecisionRequest;
