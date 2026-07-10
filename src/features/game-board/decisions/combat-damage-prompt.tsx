"use client";

import type { ReactNode } from "react";
import { CombatDamageDialog } from "../components/combat-damage-dialog";
import type { BoardCatalogCard } from "../board-view-model";
import type { CombatDamageDecisionRequest } from "./player-decision-types";

export function CombatDamagePrompt({
  cardsByInstanceId,
  decision,
  headerAction,
  interactionSuspended,
  isSubmitting,
  isVisible,
  onSubmit,
}: {
  cardsByInstanceId: Record<string, BoardCatalogCard>;
  decision: CombatDamageDecisionRequest;
  headerAction?: ReactNode;
  interactionSuspended: boolean;
  isSubmitting: boolean;
  isVisible: boolean;
  onSubmit: (
    allocations: Array<{ targetUnitId: string; amount: number }>,
  ) => void;
}) {
  return (
    <CombatDamageDialog
      cardsByInstanceId={cardsByInstanceId}
      choice={decision.choice}
      headerAction={headerAction}
      interactionSuspended={interactionSuspended}
      isSubmitting={isSubmitting}
      isVisible={isVisible}
      onSubmit={onSubmit}
    />
  );
}
