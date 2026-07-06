"use client";

import { CombatDamageDialog } from "../components/combat-damage-dialog";
import type { BoardCatalogCard } from "../board-view-model";
import type { CombatDamageDecisionRequest } from "./player-decision-types";

export function CombatDamagePrompt({
  cardsByInstanceId,
  decision,
  isSubmitting,
  onSubmit,
}: {
  cardsByInstanceId: Record<string, BoardCatalogCard>;
  decision: CombatDamageDecisionRequest;
  isSubmitting: boolean;
  onSubmit: (
    allocations: Array<{ targetUnitId: string; amount: number }>,
  ) => void;
}) {
  return (
    <CombatDamageDialog
      cardsByInstanceId={cardsByInstanceId}
      choice={decision.choice}
      isSubmitting={isSubmitting}
      onSubmit={onSubmit}
    />
  );
}
