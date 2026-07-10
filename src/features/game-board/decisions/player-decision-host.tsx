"use client";

import type { BoardCatalogCard } from "../board-view-model";
import { DecisionInspectionTrigger } from "../components/decision-inspection-trigger";
import { CardSelectionPrompt } from "./card-selection-prompt";
import { CombatDamagePrompt } from "./combat-damage-prompt";
import { OptionDecisionPrompt } from "./option-decision-prompt";
import { OrderedDecisionPrompt } from "./ordered-decision-prompt";
import { PendingDecisionStatus } from "./pending-decision-status";
import { TokenPlacementPrompt } from "./token-placement-prompt";
import {
  createCombatDamageIntent,
  createSelectionIntent,
  createTokenPlacementIntent,
} from "./player-decision-intent";
import type {
  PlayerDecisionIntent,
  PlayerDecisionRequest,
} from "./player-decision-types";

export function PlayerDecisionHost({
  cardsByInstanceId,
  decision,
  interactionSuspended = false,
  isPromptVisible = true,
  isSubmitting,
  onCancel,
  onInspect,
  onIntent,
}: {
  cardsByInstanceId: Record<string, BoardCatalogCard>;
  decision: PlayerDecisionRequest | null;
  interactionSuspended?: boolean;
  isPromptVisible?: boolean;
  isSubmitting: boolean;
  onCancel?: () => void;
  onInspect?: () => void;
  onIntent: (intent: PlayerDecisionIntent) => Promise<boolean>;
}) {
  if (!decision) {
    return null;
  }

  const headerAction =
    onInspect && (decision.inspection ?? "none") !== "none" ? (
      <DecisionInspectionTrigger onInspect={onInspect} />
    ) : undefined;

  switch (decision.kind) {
    case "cardSelection":
      return (
        <CardSelectionPrompt
          cancelLabel={decision.cancelLabel}
          confirmLabel={decision.confirmLabel}
          description={decision.description}
          decisionKey={decision.decisionKey}
          draftKey={decision.decisionKey}
          headerAction={headerAction}
          interactionSuspended={interactionSuspended}
          isOpen
          isSubmitting={isSubmitting}
          isVisible={isPromptVisible}
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
          headerAction={headerAction}
          interactionSuspended={interactionSuspended}
          isSubmitting={isSubmitting}
          isVisible={isPromptVisible}
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
          headerAction={headerAction}
          interactionSuspended={interactionSuspended}
          isSubmitting={isSubmitting}
          isVisible={isPromptVisible}
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
          headerAction={headerAction}
          interactionSuspended={interactionSuspended}
          isSubmitting={isSubmitting}
          isVisible={isPromptVisible}
          onSubmit={(allocations) =>
            onIntent(
              createCombatDamageIntent(decision.actionId, allocations),
            )
          }
        />
      );
    case "tokenPlacement":
      return (
        <TokenPlacementPrompt
          decision={decision}
          isSubmitting={isSubmitting}
          onSubmit={(placements) =>
            onIntent(createTokenPlacementIntent(decision.actionId, placements))
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
