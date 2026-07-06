"use client";

import { CombatDamageDialog } from "../components/combat-damage-dialog";
import type { BoardCatalogCard } from "../board-view-model";
import type { CombatDamageDecisionRequest } from "./player-decision-types";

export function CombatDamagePrompt({
  cardsByInstanceId,
  decision,
  onSubmit,
}: {
  cardsByInstanceId: Record<string, BoardCatalogCard>;
  decision: CombatDamageDecisionRequest;
  onSubmit: (
    allocations: Array<{ targetUnitId: string; amount: number }>,
  ) => void;
}) {
  return (
    <CombatDamageDialog
      cardsByInstanceId={cardsByInstanceId}
      choice={decision.choice}
      onSubmit={onSubmit}
    />
  );
}
