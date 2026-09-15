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
  combineTargetRequirements,
  targetSelectionCanAdd,
  targetSelectionIsLegal,
  type CombinedTargetRequirement,
} from "../model";
import type { Card } from "../types";

export type BoardTargetSelection = {
  actionId: string;
  carriedSelectedTargetIds?: string[];
  followUpLocationRequirement?: CombinedTargetRequirement;
  legalTargetIds: string[];
  maxTargets: number;
  minTargets: number;
  purpose: "choice" | "move" | "play";
  requirement: CombinedTargetRequirement;
  selectedTargetIds: string[];
  targetKind: "battlefield" | "card" | "location" | "chainItem" | "payment";
  preparingPayment?: boolean;
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

export function createCardPaymentPreparation(action: GameProjection["actions"][number]): BoardTargetSelection | null {
  if (!action.enabled || action.poolPayment?.mode !== "card" || action.poolPayment.canPay) return null;
  return {
    actionId: action.id, purpose: "play", targetKind: "payment", preparingPayment: true,
    legalTargetIds: [], minTargets: 0, maxTargets: 0, selectedTargetIds: [],
    // No gameplay target exists; this is an empty selection aggregate.
    requirement: { requirements: [], legalIds: [], minimum: 0, maximum: 0 },
  };
}

export function useBoardTargetSelection({
  actions,
  capturePendingAnimationSnapshot,
  highlightedCardInstanceIds,
  submitProjectedAction,
}: UseBoardTargetSelectionArgs): {
  chooseBoardTarget: (cardInstanceId: string | undefined) => void;
  clearSubmittedTargetHighlights: () => void;
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
  const [storedSelection, setTargetSelection] =
    useState<BoardTargetSelection | null>(null);
  const [hoveredTargetCardInstanceId, setHoveredTargetCardInstanceId] =
    useState<string | null>(null);
  const [pendingSubmittedTargetIds, setPendingSubmittedTargetIds] = useState<
    string[]
  >([]);

  const targetSelectionAction = storedSelection
    ? (actions.find((action) => action.id === storedSelection.actionId) ??
      actions.find((action) =>
        actionIdsHaveSameIdentity(action.id, storedSelection.actionId),
      ))
    : undefined;
  const targetSelection = storedSelection
    ? rebindStagedSelection(storedSelection, targetSelectionAction)
    : null;

  const selectedDeflectSources =
    targetSelectionAction?.costPreview?.targetAdditionalPower.filter((source) =>
      [...(targetSelection?.carriedSelectedTargetIds ?? []), ...(targetSelection?.selectedTargetIds ?? [])].includes(source.targetId),
    ) ?? [];
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

      if (
        selection.followUpLocationRequirement &&
        selection.targetKind !== "location"
      ) {
        const carriedSelectedTargetIds = [
          ...(selection.carriedSelectedTargetIds ?? []),
          ...selection.selectedTargetIds,
        ];
        const nextRequirement = locationRequirementForSelectedIds(
          selection.followUpLocationRequirement,
          carriedSelectedTargetIds,
        );
        setTargetSelection({
          ...selection,
          carriedSelectedTargetIds,
          followUpLocationRequirement: undefined,
          legalTargetIds: nextRequirement.legalIds,
          maxTargets: nextRequirement.maximum,
          minTargets: nextRequirement.minimum,
          requirement: nextRequirement,
          selectedTargetIds: [],
          targetKind: "location",
        });
        return false;
      }

      const selectedIds = [
        ...(selection.carriedSelectedTargetIds ?? []),
        ...selection.selectedTargetIds,
      ];
      const selectedAdditionalPower = additionalPowerForTargets(
        targetSelectionAction,
        selectedIds,
      );
      const missingAdditionalPower = Math.max(
        0,
        selectedAdditionalPower -
          (targetSelectionAction?.costPreview?.availableAnyPower ?? 0),
      );
      if (missingAdditionalPower > 0 || !targetSelectionAction?.enabled ||
        targetSelectionAction.poolPayment?.canPay === false) {
        // Battlefield/Chain selection uses its established selector first.
        // Once selected, hand off to the same movable preparation surface so
        // resource sources remain accessible without losing the real targets.
        if (targetSelectionAction?.enabled && selection.targetKind !== "card" && selection.targetKind !== "payment") {
          setTargetSelection({ ...selection, targetKind: "payment", preparingPayment: true,
            carriedSelectedTargetIds: selectedIds, selectedTargetIds: [], legalTargetIds: [], minTargets: 0, maxTargets: 0,
            requirement: { requirements: [], legalIds: [], minimum: 0, maximum: 0 } });
        }
        return false;
      }

      if (!stagedTargetsAreCurrent(selection, targetSelectionAction)) return false;

      if (selection.purpose === "move" || selection.purpose === "play") {
        capturePendingAnimationSnapshot?.();
      }

      const accepted = await submitProjectedAction(
        targetSelectionAction?.id ?? selection.actionId,
        selectedIds,
      );

      if (!accepted) return false;

      setPendingSubmittedTargetIds(selectedIds);
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

  const chooseBoardTarget = useCallback(
    (cardInstanceId: string | undefined) => {
      if (!targetSelection || !cardInstanceId) {
        return;
      }

      if (!targetSelection.legalTargetIds.includes(cardInstanceId)) {
        return;
      }

      const isSelected =
        targetSelection.selectedTargetIds.includes(cardInstanceId);
      if (
        !isSelected &&
        !targetSelectionCanAdd(
          targetSelection.requirement,
          targetSelection.selectedTargetIds,
          cardInstanceId,
        )
      ) {
        return;
      }
      const selectedTargetIds = isSelected
        ? targetSelection.selectedTargetIds.filter(
            (id) => id !== cardInstanceId,
          )
        : [...targetSelection.selectedTargetIds, cardInstanceId];
      const nextSelection = {
        ...targetSelection,
        selectedTargetIds,
      };

      setTargetSelection(nextSelection);

      if (
        nextSelection.purpose === "play" &&
        !nextSelection.preparingPayment &&
        (!targetSelectionAction?.poolPayment || targetSelectionAction.poolPayment.mode === "card") &&
        !nextSelection.followUpLocationRequirement &&
        nextSelection.minTargets === nextSelection.maxTargets &&
        selectedTargetIds.length === nextSelection.maxTargets &&
        targetSelectionIsLegal(nextSelection.requirement, selectedTargetIds) &&
        additionalPowerForTargets(targetSelectionAction, selectedTargetIds) ===
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

function locationRequirementForSelectedIds(
  requirement: CombinedTargetRequirement,
  selectedIds: readonly string[],
): CombinedTargetRequirement {
  const legalIds = [
    ...new Set(
      requirement.requirements.flatMap((individual) => {
        const mappings = individual.legalIdsBySelectedId;
        if (!mappings) return individual.legalIds;
        return selectedIds.flatMap((id) => mappings[id] ?? []);
      }),
    ),
  ];
  return { ...requirement, legalIds };
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

/** Rebind the intent, including its optional/destination action identity, to the
 * current projection. Selection legality never comes from a stale target list. */
export function rebindStagedSelection(selection: BoardTargetSelection, action: GameProjection["actions"][number] | undefined): BoardTargetSelection {
  if (!action) return selection;
  const requirement = selection.targetKind === "payment" ? selection.requirement
    : combineTargetRequirements(action, selection.targetKind);
  if (!requirement) return { ...selection, legalTargetIds: [], requirement: { ...selection.requirement, legalIds: [] } };
  const current = selection.targetKind === "location" && selection.carriedSelectedTargetIds
    ? locationRequirementForSelectedIds(requirement, selection.carriedSelectedTargetIds) : requirement;
  return { ...selection, actionId: action.id, requirement: current,
    preparingPayment: selection.preparingPayment || (action.poolPayment?.mode === "card" && !action.poolPayment.canPay),
    followUpLocationRequirement: selection.followUpLocationRequirement
      ? combineTargetRequirements(action, "location") ?? undefined : undefined,
    legalTargetIds: current.legalIds, minTargets: current.minimum, maxTargets: current.maximum,
    selectedTargetIds: selection.selectedTargetIds.filter((id) => current.legalIds.includes(id)) };
}

export function stagedTargetsAreCurrent(selection: BoardTargetSelection, action: GameProjection["actions"][number] | undefined) {
  if (!action) return false;
  const selected = [...(selection.carriedSelectedTargetIds ?? []), ...selection.selectedTargetIds];
  return new Set(selected).size === selected.length &&
    selected.every((id) => action.targets.some((target) => target.legalIds.includes(id))) &&
    action.targets.every((target) => {
      const count = selected.filter((id) => target.legalIds.includes(id)).length;
      return count >= target.minimum && count <= target.maximum;
    });
}

function additionalPowerForTargets(
  action: GameProjection["actions"][number] | undefined,
  targetIds: readonly string[],
) {
  return (
    action?.costPreview?.targetAdditionalPower
      .filter((source) => targetIds.includes(source.targetId))
      .reduce((total, source) => total + source.amount, 0) ?? 0
  );
}
