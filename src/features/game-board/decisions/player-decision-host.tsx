"use client";

import type { BoardCatalogCard } from "../board-view-model";
import { CardSelectionPrompt } from "./card-selection-prompt";
import { CombatDamagePrompt } from "./combat-damage-prompt";
import { OptionDecisionPrompt } from "./option-decision-prompt";
import { OrderedDecisionPrompt } from "./ordered-decision-prompt";
import { PendingDecisionStatus } from "./pending-decision-status";
import {
  createCombatDamageIntent,
  createSelectionIntent,
} from "./player-decision-intent";
import type {
  PlayerDecisionIntent,
  PlayerDecisionRequest,
} from "./player-decision-types";

export function PlayerDecisionHost({
  cardsByInstanceId,
  decision,
  onCancel,
  onIntent,
}: {
  cardsByInstanceId: Record<string, BoardCatalogCard>;
  decision: PlayerDecisionRequest | null;
  onCancel?: () => void;
  onIntent: (intent: PlayerDecisionIntent) => void;
}) {
  if (!decision) {
    return null;
  }

  switch (decision.kind) {
    case "cardSelection":
      return (
        <CardSelectionPrompt
          cancelLabel={decision.cancelLabel}
          confirmLabel={decision.confirmLabel}
          description={decision.description}
          decisionKey={decision.decisionKey}
          isOpen
          maxSelected={decision.maxSelected}
          minSelected={decision.minSelected}
          onCancel={decision.canCancel ? onCancel : undefined}
          onConfirm={(selectedIds) =>
            onIntent(createSelectionIntent(decision.actionId, selectedIds))
          }
          options={decision.cards}
          presentation="cards"
          selectionMode={decision.selectionMode}
          title={decision.title}
        />
      );
    case "optionDecision":
      return (
        <OptionDecisionPrompt
          decision={decision}
          onCancel={onCancel}
          onSubmit={(selectedIds) =>
            onIntent(createSelectionIntent(decision.actionId, selectedIds))
          }
        />
      );
    case "orderedDecision":
      return (
        <OrderedDecisionPrompt
          decision={decision}
          onSubmit={(orderedIds) =>
            onIntent(createSelectionIntent(decision.actionId, orderedIds))
          }
        />
      );
    case "combatDamage":
      return (
        <CombatDamagePrompt
          cardsByInstanceId={cardsByInstanceId}
          decision={decision}
          onSubmit={(allocations) =>
            onIntent(
              createCombatDamageIntent(decision.actionId, allocations),
            )
          }
        />
      );
    case "pendingDecision":
      return (
        <PendingDecisionStatus
          message={decision.message}
          title={decision.title}
          tone={decision.tone}
        />
      );
  }
}
