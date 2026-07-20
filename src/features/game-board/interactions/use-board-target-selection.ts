import type { GameProjection } from "@/shared/game";
import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type MouseEvent,
  type SetStateAction,
} from "react";
import {
  activeTargetRequirement,
  targetSelectionCanAdd,
  targetSelectionIsLegal,
  toggleMovementSelection,
  type CombinedTargetRequirement,
} from "../model";
import type { Card } from "../types";

export type BoardTargetSelection = {
  actionId: string;
  canDecline: boolean;
  legalTargetIds: string[];
  maxTargets: number;
  minTargets: number;
  purpose: "choice" | "hidePayment" | "move" | "play";
  requirement: CombinedTargetRequirement;
  selectedTargetIds: string[];
  targetKind: "battlefield" | "card";
};

type SubmitProjectedAction = (
  actionId: string | undefined,
  selectedIds?: string[],
  allocations?: Array<{ targetUnitId: string; amount: number }>,
) => Promise<boolean>;

type UseBoardTargetSelectionArgs = {
  actions: GameProjection["actions"];
  capturePendingAnimationSnapshot?: () => void;
  highlightedCardInstanceIds: Set<string>;
  submitProjectedAction: SubmitProjectedAction;
};

const EMPTY_TARGET_IDS: string[] = [];

export function useBoardTargetSelection({
  actions,
  capturePendingAnimationSnapshot,
  highlightedCardInstanceIds,
  submitProjectedAction,
}: UseBoardTargetSelectionArgs): {
  chooseBoardTarget: (cardInstanceId: string | undefined) => void;
  clearSubmittedTargetHighlights: () => void;
  declineTargetedChoice: () => Promise<boolean>;
  displayedHighlightedCardInstanceIds: Set<string>;
  handleTargetClickCapture: (event: MouseEvent<HTMLElement>) => void;
  handleTargetPointerEnter: (card: Card) => void;
  handleTargetPointerLeave: (card: Card) => void;
  missingDeflectPower: number;
  selectedDeflectPower: number;
  selectedDeflectSources: NonNullable<
    GameProjection["actions"][number]["costPreview"]
  >["targetAdditionalPower"];
  setTargetSelection: Dispatch<SetStateAction<BoardTargetSelection | null>>;
  submitTargetedPlay: (
    selection?: BoardTargetSelection | null,
  ) => Promise<boolean>;
  targetSelection: BoardTargetSelection | null;
  targetSelectionAction: GameProjection["actions"][number] | undefined;
} {
  const [targetSelection, setTargetSelection] =
    useState<BoardTargetSelection | null>(null);
  const [hoveredTargetCardInstanceId, setHoveredTargetCardInstanceId] =
    useState<string | null>(null);
  const [pendingSubmittedTargetIds, setPendingSubmittedTargetIds] = useState<
    string[]
  >([]);

  const targetSelectionAction = targetSelection
    ? (actions.find((action) => action.id === targetSelection.actionId) ??
      actions.find((action) =>
        actionIdsHaveSameIdentity(action.id, targetSelection.actionId),
      ))
    : undefined;

  const selectedDeflectSources = (targetSelection?.selectedTargetIds ?? [])
    .flatMap((targetId) =>
      targetSelectionAction?.costPreview?.targetAdditionalPower.filter(
        (source) => source.targetId === targetId,
      ) ?? [],
    );
  const selectedDeflectPower = selectedDeflectSources.reduce(
    (total, source) => total + source.amount,
    0,
  );
  const missingDeflectPower = Math.max(
    0,
    selectedDeflectPower -
      (targetSelectionAction?.costPreview?.availableAnyPower ?? 0),
  );
  const legalTargetIds = targetSelection?.legalTargetIds ?? EMPTY_TARGET_IDS;

  const displayedHighlightedCardInstanceIds = useMemo(() => {
    const next = new Set(highlightedCardInstanceIds);

    for (const targetId of targetSelection?.selectedTargetIds ?? []) {
      next.add(targetId);
    }

    for (const targetId of pendingSubmittedTargetIds) {
      next.add(targetId);
    }

    if (
      hoveredTargetCardInstanceId &&
      legalTargetIds.includes(hoveredTargetCardInstanceId)
    ) {
      next.add(hoveredTargetCardInstanceId);
    }

    return next;
  }, [
    highlightedCardInstanceIds,
    hoveredTargetCardInstanceId,
    legalTargetIds,
    pendingSubmittedTargetIds,
    targetSelection?.selectedTargetIds,
  ]);

  const submitTargetedPlay = useCallback(
    async (selection = targetSelection): Promise<boolean> => {
      if (!selection) {
        return false;
      }

      if (
        !targetSelectionIsLegal(
          selection.requirement,
          selection.selectedTargetIds,
        )
      ) {
        return false;
      }

      const selectedAdditionalPower = additionalPowerForTargets(
        targetSelectionAction,
        selection.selectedTargetIds,
      );
      const missingAdditionalPower = Math.max(
        0,
        selectedAdditionalPower -
          (targetSelectionAction?.costPreview?.availableAnyPower ?? 0),
      );
      if (missingAdditionalPower > 0) {
        return false;
      }

      if (selection.purpose === "move" || selection.purpose === "play") {
        capturePendingAnimationSnapshot?.();
      }

      const accepted = await submitProjectedAction(
        targetSelectionAction?.id ?? selection.actionId,
        selection.selectedTargetIds,
      );

      if (!accepted) return false;

      setPendingSubmittedTargetIds(selection.selectedTargetIds);
      setHoveredTargetCardInstanceId(null);
      setTargetSelection(null);
      return true;
    },
    [
      capturePendingAnimationSnapshot,
      targetSelection,
      targetSelectionAction,
      submitProjectedAction,
    ],
  );

  const declineTargetedChoice = useCallback(async (): Promise<boolean> => {
    if (
      !targetSelection ||
      targetSelection.purpose !== "choice" ||
      !targetSelection.canDecline
    ) {
      return false;
    }

    const accepted = await submitProjectedAction(
      targetSelectionAction?.id ?? targetSelection.actionId,
      [],
    );
    if (!accepted) return false;

    setHoveredTargetCardInstanceId(null);
    setTargetSelection(null);
    return true;
  }, [submitProjectedAction, targetSelection, targetSelectionAction]);

  const chooseBoardTarget = useCallback(
    (cardInstanceId: string | undefined) => {
      if (!targetSelection || !cardInstanceId) {
        return;
      }

      if (!targetSelection.legalTargetIds.includes(cardInstanceId)) {
        return;
      }

      const selectedTargetIds = targetSelection.purpose === "move"
        ? toggleMovementSelection(
            targetSelection.selectedTargetIds,
            cardInstanceId,
            targetSelection.minTargets,
          )
        : null;
      if (selectedTargetIds === null &&
        !targetSelectionCanAdd(
          targetSelection.requirement,
          targetSelection.selectedTargetIds,
          cardInstanceId,
        )
      ) {
        return;
      }
      const nextSelectedTargetIds = selectedTargetIds ?? [
        ...targetSelection.selectedTargetIds,
        cardInstanceId,
      ];
      const nextSelection = {
        ...targetSelection,
        selectedTargetIds: nextSelectedTargetIds,
        legalTargetIds:
          activeTargetRequirement(
            targetSelection.requirement,
            nextSelectedTargetIds,
          )?.legalIds ?? [],
      };

      setTargetSelection(nextSelection);

      if (
        nextSelection.purpose === "play" &&
        nextSelection.minTargets === nextSelection.maxTargets &&
        nextSelectedTargetIds.length === nextSelection.maxTargets &&
        targetSelectionIsLegal(nextSelection.requirement, nextSelectedTargetIds) &&
        additionalPowerForTargets(targetSelectionAction, nextSelectedTargetIds) ===
          0
      ) {
        submitTargetedPlay(nextSelection);
      }
    },
    [targetSelection, targetSelectionAction, submitTargetedPlay],
  );

  const handleTargetClickCapture = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!targetSelection || !(event.target instanceof Element)) {
        return;
      }

      const cardElement = event.target.closest(
        "[data-card-instance-id]",
      ) as HTMLElement | null;
      const cardInstanceId = cardElement?.dataset.cardInstanceId;

      if (
        !cardInstanceId ||
        !targetSelection.legalTargetIds.includes(cardInstanceId)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      chooseBoardTarget(cardInstanceId);
    },
    [chooseBoardTarget, targetSelection],
  );

  const handleTargetPointerEnter = useCallback(
    (card: Card) => {
      if (!targetSelection || !card.instanceId) {
        return;
      }

      if (!legalTargetIds.includes(card.instanceId)) {
        return;
      }

      setHoveredTargetCardInstanceId(card.instanceId);
    },
    [legalTargetIds, targetSelection],
  );

  const handleTargetPointerLeave = useCallback(
    (card: Card) => {
      if (hoveredTargetCardInstanceId !== card.instanceId) {
        return;
      }

      setHoveredTargetCardInstanceId(null);
    },
    [hoveredTargetCardInstanceId],
  );

  const clearSubmittedTargetHighlights = useCallback(() => {
    setHoveredTargetCardInstanceId(null);
    setPendingSubmittedTargetIds([]);
  }, []);

  return {
    chooseBoardTarget,
    clearSubmittedTargetHighlights,
    declineTargetedChoice,
    displayedHighlightedCardInstanceIds,
    handleTargetClickCapture,
    handleTargetPointerEnter,
    handleTargetPointerLeave,
    missingDeflectPower,
    selectedDeflectPower,
    selectedDeflectSources,
    setTargetSelection,
    submitTargetedPlay,
    targetSelection,
    targetSelectionAction,
  };
}

function actionIdsHaveSameIdentity(left: string, right: string) {
  const leftParts = left.split(":");
  const rightParts = right.split(":");
  return (
    leftParts.length >= 5 &&
    rightParts.length >= 5 &&
    leftParts.slice(2).join(":") === rightParts.slice(2).join(":")
  );
}

function additionalPowerForTargets(
  action: GameProjection["actions"][number] | undefined,
  targetIds: readonly string[],
) {
  return (
    targetIds.reduce(
      (total, targetId) =>
        total +
        (action?.costPreview?.targetAdditionalPower.find(
          (source) => source.targetId === targetId,
        )?.amount ?? 0),
      0,
    )
  );
}
