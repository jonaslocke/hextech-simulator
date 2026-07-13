"use client";

import {
  DomainIcon,
  EnergyResource,
  formatDomain,
} from "@/features/card-presentation";
import type { GameProjection } from "@/shared/game";
import {
  useCallback,
  useMemo,
  type Dispatch,
  type MouseEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { BoardPlayerProjection } from "../board-view-model";
import type { CardActionMenuItem } from "../components/card-action-menu";
import {
  activeTargetRequirement,
  combineTargetRequirements,
  simultaneousMoveAction,
} from "../model";
import type { Card } from "../types";
import type { BoardTargetSelection } from "./use-board-target-selection";

type PaymentMode =
  BoardPlayerProjection["availablePaymentModes"][string][number];

function unavailableMenuItem(cardInstanceId: string): CardActionMenuItem {
  return {
    disabled: true,
    id: `${cardInstanceId}:not-playable`,
    label: "Not Playable",
  };
}

export type GameBoardUnitPlayChoice = {
  card: Card;
  modes: PaymentMode[];
} | null;

type SubmitProjectedAction = (
  actionId: string | undefined,
  selectedIds?: string[],
  allocations?: Array<{ targetUnitId: string; amount: number }>,
) => Promise<boolean>;

type OpenCardActionMenu = (
  event: MouseEvent<HTMLElement>,
  items: CardActionMenuItem[],
) => void;

type UseGameBoardActionsArgs = {
  actions: GameProjection["actions"];
  capturePendingAnimationSnapshot: () => void;
  chooseBoardTarget: (cardInstanceId: string | undefined) => void;
  closeCardActionMenu: () => void;
  isChainLockedOpen: boolean;
  openCardActionMenu: OpenCardActionMenu;
  setTargetSelection: Dispatch<SetStateAction<BoardTargetSelection | null>>;
  submitProjectedAction: SubmitProjectedAction;
  setUnitPlayChoice: Dispatch<SetStateAction<GameBoardUnitPlayChoice>>;
  targetSelection: BoardTargetSelection | null;
  viewerState: BoardPlayerProjection | undefined;
};

export function useGameBoardActions({
  actions,
  capturePendingAnimationSnapshot,
  chooseBoardTarget,
  closeCardActionMenu,
  isChainLockedOpen,
  openCardActionMenu,
  setTargetSelection,
  setUnitPlayChoice,
  submitProjectedAction,
  targetSelection,
  viewerState,
}: UseGameBoardActionsArgs) {
  const sourceActions = useCallback(
    (sourceCardInstanceId: string) =>
      actions.filter(
        (action) => action.sourceCardInstanceId === sourceCardInstanceId,
      ),
    [actions],
  );

  const endTurnAction = useMemo(
    () => actions.find((action) => action.label === "End turn"),
    [actions],
  );
  const passAction = useMemo(
    () =>
      actions.find(
        (action) =>
          action.label === "Pass priority" || action.label === "Pass focus",
      ),
    [actions],
  );
  const passFocusAction = useMemo(
    () => actions.find((action) => action.label === "Pass focus"),
    [actions],
  );
  const concedeAction = useMemo(
    () => actions.find((action) => action.id.split(":")[3] === "concede"),
    [actions],
  );

  const onEndTurn = useCallback(
    () => {
      if (targetSelection) return Promise.resolve(false);
      return submitProjectedAction(endTurnAction?.id);
    },
    [endTurnAction?.id, submitProjectedAction, targetSelection],
  );

  const onPass = useCallback(
    () => {
      if (targetSelection) return Promise.resolve(false);
      return submitProjectedAction(passAction?.id);
    },
    [passAction?.id, submitProjectedAction, targetSelection],
  );

  const onConcede = useCallback(async () => {
    await submitProjectedAction(concedeAction?.id);
  }, [concedeAction?.id, submitProjectedAction]);

  const onPlayCard = useCallback(
    (input: {
      cardInstanceId: string;
      choices?: { targetCardInstanceIds?: string[] };
      selectedModeId?: string;
    }) => {
      const action = input.selectedModeId
        ? actions.find((candidate) => candidate.id === input.selectedModeId)
        : sourceActions(input.cardInstanceId)[0];
      submitProjectedAction(
        action?.id,
        input.choices?.targetCardInstanceIds ?? [],
      );
    },
    [actions, sourceActions, submitProjectedAction],
  );

  const submitPlayCard = useCallback(
    (input: {
      canPlay: boolean;
      cardInstanceId: string;
      choices?: {
        targetCardInstanceIds?: string[];
      };
      selectedModeId?: string;
    }) => {
      if (input.canPlay) {
        capturePendingAnimationSnapshot();
      }

      onPlayCard(input);
    },
    [capturePendingAnimationSnapshot, onPlayCard],
  );

  const submitRuneAction = useCallback(
    (actionId: string) => {
      capturePendingAnimationSnapshot();
      submitProjectedAction(actionId);
    },
    [capturePendingAnimationSnapshot, submitProjectedAction],
  );

  const beginPlayOrTargetSelection = useCallback(
    (card: Card, selectedModeId?: string) => {
      if (!card.instanceId || !viewerState) {
        return;
      }

      const projectedAction = selectedModeId
        ? actions.find((action) => action.id === selectedModeId)
        : sourceActions(card.instanceId)[0];
      if (!projectedAction) {
        return;
      }
      const stagedMoveAction = simultaneousMoveAction(
        actions,
        projectedAction,
        card.instanceId,
      );
      const actionToSubmit = stagedMoveAction ?? projectedAction;
      const isHideAction = actionToSubmit.id.split(":")[3] === "hide";
      const targetKind = actionToSubmit.targets.some(
        (target) => target.kind === "card",
      )
        ? "card"
        : "battlefield";
      const requirement = combineTargetRequirements(actionToSubmit, targetKind);

      if (requirement && requirement.maximum > 0) {
        setTargetSelection({
          actionId: actionToSubmit.id,
          legalTargetIds: activeTargetRequirement(requirement, [])?.legalIds ?? [],
          maxTargets: requirement.maximum,
          minTargets: requirement.minimum,
          purpose: stagedMoveAction
            ? "move"
            : isHideAction
              ? "hidePayment"
              : "play",
          requirement,
          selectedTargetIds: stagedMoveAction ? [card.instanceId] : [],
          targetKind,
        });
        return;
      }

      if (requirement && requirement.maximum === 0) {
        submitPlayCard({
          canPlay: true,
          cardInstanceId: card.instanceId,
          choices: {
            targetCardInstanceIds: [],
          },
          selectedModeId,
        });
        return;
      }

      submitPlayCard({
        canPlay: true,
        cardInstanceId: card.instanceId,
        selectedModeId,
      });
    },
    [actions, setTargetSelection, sourceActions, submitPlayCard, viewerState],
  );

  const beginGlobalAction = useCallback(
    (action: GameProjection["actions"][number]) => {
      const requirement = combineTargetRequirements(action, "card");
      if (!requirement) {
        submitProjectedAction(action.id);
        return;
      }
      const kind = action.id.split(":")[3];
      setTargetSelection({
        actionId: action.id,
        legalTargetIds: activeTargetRequirement(requirement, [])?.legalIds ?? [],
        maxTargets: requirement.maximum,
        minTargets: requirement.minimum,
        purpose:
          kind === "moveMany"
            ? "move"
            : action.choice?.kind === "effectSelection"
              ? "choice"
              : "play",
        requirement,
        selectedTargetIds: [],
        targetKind: "card",
      });
    },
    [setTargetSelection, submitProjectedAction],
  );

  const handlePlayCardFromHand = useCallback(
    (card: Card) => {
      closeCardActionMenu();

      if (!card.instanceId || !viewerState) {
        return;
      }

      const modes = viewerState.availablePaymentModes[card.instanceId] ?? [];
      const enabledModes = modes.filter((candidate) => candidate.enabled);

      if (enabledModes.length > 1) {
        setUnitPlayChoice({ card, modes: enabledModes });
        return;
      }

      const mode = enabledModes[0];

      submitPlayCard({
        canPlay: Boolean(mode),
        cardInstanceId: card.instanceId,
        selectedModeId: mode?.id,
      });
    },
    [closeCardActionMenu, setUnitPlayChoice, submitPlayCard, viewerState],
  );

  const openPlayableCardMenu = useCallback(
    (card: Card, event: MouseEvent<HTMLElement>) => {
      if (!card.instanceId || !viewerState) {
        return;
      }

      const modes = viewerState.availablePaymentModes[card.instanceId] ?? [];
      const enabledModes = modes.filter((mode) => mode.enabled);

      openCardActionMenu(
        event,
        enabledModes.length > 0
          ? enabledModes.map((mode) => ({
              boardLocation: mode.boardLocation,
              disabled: false,
              id: mode.id,
              label: mode.label,
              onSelect: () => beginPlayOrTargetSelection(card, mode.id),
            }))
          : [unavailableMenuItem(card.instanceId)],
      );
    },
    [beginPlayOrTargetSelection, openCardActionMenu, viewerState],
  );

  const handleCardContextFromHand = useCallback(
    (card: Card, event: MouseEvent<HTMLElement>) => {
      openPlayableCardMenu(card, event);
    },
    [openPlayableCardMenu],
  );

  const handleChampionCardAction = useCallback(
    (card: Card, event?: MouseEvent<HTMLElement>) => {
      if (!event) {
        return;
      }

      openPlayableCardMenu(card, event);
    },
    [openPlayableCardMenu],
  );

  const handleBoardCardPrimaryAction = useCallback(
    (card: Card, event?: MouseEvent<HTMLElement>) => {
      if (targetSelection) {
        chooseBoardTarget(card.instanceId);
        return;
      }

      if (!card.instanceId || !event) {
        return;
      }
      const cardActions = sourceActions(card.instanceId);
      const enabledCardActions = cardActions.filter((action) => action.enabled);
      if (cardActions.length === 0) return;
      if (enabledCardActions.length === 0) {
        openCardActionMenu(event, [unavailableMenuItem(card.instanceId)]);
        return;
      }
      const allActionsAddResources = enabledCardActions.every((action) =>
        /^(Add (?:spell )?(?:Energy|Power)|Add Energy and Power)/.test(
          action.label,
        ),
      );
      if (allActionsAddResources) {
        const powerDomain = enabledCardActions
          .map((action) => action.label.match(/^Add Power \[(.+)]$/)?.[1])
          .find((domain) => domain !== undefined);
        openCardActionMenu(
          event,
          enabledCardActions.map((action) => ({
            accessibleLabel: runeActionAccessibleLabel(action, powerDomain),
            disabled: false,
            id: action.id,
            label: runeActionMenuLabel(action, powerDomain),
            onSelect: () => submitRuneAction(action.id),
          })),
        );
        return;
      }
      openCardActionMenu(
        event,
        enabledCardActions.map((action) => ({
          boardLocation: action.presentation.boardLocation,
          disabled: false,
          id: action.id,
          label: action.label,
          onSelect: () => beginPlayOrTargetSelection(card, action.id),
        })),
      );
    },
    [
      beginPlayOrTargetSelection,
      chooseBoardTarget,
      openCardActionMenu,
      sourceActions,
      submitRuneAction,
      targetSelection,
    ],
  );

  const openRuneActionMenu = useCallback(
    (card: Card, event: MouseEvent<HTMLElement>) => {
      if (!card.instanceId) {
        return;
      }

      const runeActions = sourceActions(card.instanceId);
      const enabledRuneActions = runeActions.filter((action) => action.enabled);
      if (enabledRuneActions.length === 0) {
        openCardActionMenu(event, [unavailableMenuItem(card.instanceId)]);
        return;
      }
      const powerDomain = enabledRuneActions
        .map((action) => action.label.match(/^Add Power \[(.+)]$/)?.[1])
        .find((domain) => domain !== undefined);

      openCardActionMenu(
        event,
        enabledRuneActions.map((action) => ({
          accessibleLabel: runeActionAccessibleLabel(action, powerDomain),
          disabled: false,
          id: action.id,
          label: runeActionMenuLabel(action, powerDomain),
          onSelect: () => submitRuneAction(action.id),
        })),
      );
    },
    [openCardActionMenu, sourceActions, submitRuneAction],
  );

  const handleRunePrimaryAction = useCallback(
    (card: Card, event?: MouseEvent<HTMLElement>) => {
      if (event) openRuneActionMenu(card, event);
    },
    [openRuneActionMenu],
  );

  const globalActions = useMemo(
    () =>
      actions.filter(
        (action) =>
          action.sourceCardInstanceId === null &&
          action.presentation.surface === "action-rail" &&
          action.id.split(":")[3] !== "moveMany" &&
          action.id.split(":")[3] !== "concede" &&
          !["End turn", "Pass focus", "Pass priority"].includes(action.label) &&
          action.choice?.kind !== "combatDamage",
      ),
    [actions],
  );

  const canViewerEndTurn = !targetSelection && Boolean(endTurnAction || passFocusAction);
  const passTurnLabel = targetSelection
    ? "Choose targets or cancel"
    : isChainLockedOpen
    ? "Resolve chain first"
    : passFocusAction
      ? "Pass Focus"
      : canViewerEndTurn
        ? "Pass Turn"
        : "Waiting for turn";

  const submitLocationDragMoveAction = useCallback(
    (action: GameProjection["actions"][number]) => {
      if (targetSelection) {
        return Promise.resolve(false);
      }

      if (
        !action.enabled ||
        action.id.split(":")[3] !== "move" ||
        !action.sourceCardInstanceId
      ) {
        return Promise.resolve(false);
      }

      closeCardActionMenu();

      const destination = action.presentation.boardLocation;

      if (destination?.kind === "battlefield") {
        const stagedMoveAction = simultaneousMoveAction(
          actions,
          action,
          action.sourceCardInstanceId,
        );

        if (!stagedMoveAction) {
          capturePendingAnimationSnapshot();
          return submitProjectedAction(action.id);
        }

        const requirement = combineTargetRequirements(stagedMoveAction, "card");

        if (!requirement || requirement.maximum === 0) {
          capturePendingAnimationSnapshot();
          return submitProjectedAction(action.id);
        }

        setTargetSelection({
          actionId: stagedMoveAction.id,
          legalTargetIds: activeTargetRequirement(requirement, [])?.legalIds ?? [],
          maxTargets: requirement.maximum,
          minTargets: requirement.minimum,
          purpose: "move",
          requirement,
          selectedTargetIds: [action.sourceCardInstanceId],
          targetKind: "card",
        });

        return Promise.resolve(true);
      }

      capturePendingAnimationSnapshot();

      return submitProjectedAction(action.id);
    },
    [
      actions,
      capturePendingAnimationSnapshot,
      closeCardActionMenu,
      setTargetSelection,
      submitProjectedAction,
      targetSelection,
    ],
  );

  const submitLocationDragPlayAction = useCallback(
    (action: GameProjection["actions"][number]) => {
      if (targetSelection) {
        return Promise.resolve(false);
      }

      if (
        !action.enabled ||
        action.id.split(":")[3] !== "play" ||
        !action.sourceCardInstanceId
      ) {
        return Promise.resolve(false);
      }

      closeCardActionMenu();

      const targetKind = action.targets.some((target) => target.kind === "card")
        ? "card"
        : "battlefield";
      const requirement = combineTargetRequirements(action, targetKind);

      if (requirement && requirement.maximum > 0) {
        setTargetSelection({
          actionId: action.id,
          legalTargetIds: activeTargetRequirement(requirement, [])?.legalIds ?? [],
          maxTargets: requirement.maximum,
          minTargets: requirement.minimum,
          purpose: "play",
          requirement,
          selectedTargetIds: [],
          targetKind,
        });

        return Promise.resolve(true);
      }

      capturePendingAnimationSnapshot();

      if (requirement && requirement.maximum === 0) {
        return submitProjectedAction(action.id, []);
      }

      return submitProjectedAction(action.id);
    },
    [
      capturePendingAnimationSnapshot,
      closeCardActionMenu,
      setTargetSelection,
      submitProjectedAction,
      targetSelection,
    ],
  );

  return {
    beginGlobalAction,
    beginPlayOrTargetSelection,
    canViewerEndTurn,
    concedeAction,
    globalActions,
    handleBoardCardPrimaryAction,
    handleCardContextFromHand,
    handleChampionCardAction,
    handlePlayCardFromHand,
    handleRuneContextAction: openRuneActionMenu,
    handleRunePrimaryAction,
    onConcede,
    onEndTurn,
    onPass,
    passFocusAction,
    passTurnLabel,
    submitLocationDragMoveAction,
    submitLocationDragPlayAction,
  };
}

function runeActionMenuLabel(
  action: GameProjection["actions"][number],
  powerDomain: string | undefined,
): ReactNode {
  let content: ReactNode = action.label;
  if (action.label === "Add Energy") {
    content = (
      <span className="inline-flex items-center gap-1.5">
        <span>Add</span>
        <EnergyResource compact value={1} />
      </span>
    );
  } else if (action.label.startsWith("Add Power [") && powerDomain) {
    content = (
      <span className="inline-flex items-center gap-1.5">
        <span>Add</span>
        <DomainIcon decorative domain={powerDomain} />
      </span>
    );
  } else if (action.label === "Add Energy and Power" && powerDomain) {
    content = (
      <span className="inline-flex items-center gap-1.5">
        <span>Add</span>
        <EnergyResource compact value={1} />
        <span>and</span>
        <DomainIcon decorative domain={powerDomain} />
      </span>
    );
  }

  if (action.enabled) return content;

  return (
    <span className="inline-flex items-center gap-1">
      {content}
      <span>({action.disabledReason ?? "unavailable"})</span>
    </span>
  );
}

function runeActionAccessibleLabel(
  action: GameProjection["actions"][number],
  powerDomain: string | undefined,
) {
  const domain = powerDomain ? formatDomain(powerDomain) : "Power";
  if (action.label === "Add Energy") return "Add 1 Energy";
  if (action.label.startsWith("Add Power [")) return `Add 1 ${domain} Power`;
  if (action.label === "Add Energy and Power") {
    return `Add 1 Energy and 1 ${domain} Power`;
  }
  return action.label;
}
