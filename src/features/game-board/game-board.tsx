"use client";

import {
  DomainIcon,
  EnergyResource,
  formatDomain,
} from "@/features/card-presentation";
import { ChoiceDialog } from "@/shared/components/choice-dialog";
import type { GameProjection } from "@/shared/game";
import { LayoutGroup } from "motion/react";
import {
  FC,
  MouseEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import cardBackImage from "../../../assets/cardback.jpg";
import { areSetsEqual, createAnimationData } from "./board-animation-model";
import { buildCard, createBoardModel } from "./board-model";
import {
  adaptProjectionToBoard,
  type BoardPlayerProjection,
} from "./board-view-model";
import { ActionRail } from "./components/action-rail";
import { BattlefieldBoard } from "./components/battlefield-board";
import { CardTile } from "./components/card-tile";
import {
  CardZoneAnimationSnapshot,
  CardZoneTransferOverlay,
  captureCardZoneAnimationSnapshot,
} from "./components/card-zone-transfer-overlay";
import { ChainOverlay } from "./components/chain-overlay";
import { PlayerBoard } from "./components/player-board";
import { PlayerHandFan } from "./components/player-hand-fan";
import { RunePoolBar } from "./components/rune-pool-bar";
import { ScoreHeader } from "./components/score-header";
import { ShowdownPrompt } from "./components/showdown-prompt";
import { TargetSelectionPrompt } from "./components/target-selection-prompt";
import { TemporaryZoneOverlay } from "./components/temporary-zone-overlay";
import { PlayerDecisionHost } from "./decisions/player-decision-host";
import { usePlayerDecisionRequest } from "./decisions/use-player-decision-request";
import {
  boardLocationDropStatus,
  isBoardDropLocationData,
  legalDropLocationsForCard,
  type BoardDropLocation,
  type LocationDragData,
} from "./drag-and-drop/location-drag-actions";
import { LocationDragProvider } from "./drag-and-drop/location-drag-provider";
import {
  chainOverlayOpen,
  combineTargetRequirements,
  moveSelectionTitle,
  showdownPromptState,
  simultaneousMoveAction,
  targetSelectionCanAdd,
  targetSelectionIsLegal,
  type CombinedTargetRequirement,
} from "./model";
import { Card, ChainCardEntry, TemporaryZone } from "./types";

type GameBoardProps = {
  isSubmittingAction?: boolean;
  onPerformAction: (input: {
    actionId: string;
    selectedIds: string[];
    allocations?: Array<{ targetUnitId: string; amount: number }>;
  }) => Promise<boolean>;
  playerNames?: Partial<Record<string, string>>;
  projection: GameProjection;
  scores?: Partial<Record<string, number>>;
};

type BoardLocation = NonNullable<
  GameProjection["actions"][number]["presentation"]["boardLocation"]
>;
type CardActionMenuItem = {
  accessibleLabel?: string;
  boardLocation?: BoardLocation | null;
  disabled?: boolean;
  id: string;
  label: ReactNode;
  onSelect?: () => void;
};
type CardActionMenuState = {
  items: CardActionMenuItem[];
  left: number;
  top: number;
} | null;
type PaymentMode =
  BoardPlayerProjection["availablePaymentModes"][string][number];

const EMPTY_TARGET_IDS: string[] = [];

export const GameBoard: FC<GameBoardProps> = ({
  isSubmittingAction = false,
  onPerformAction,
  playerNames = {},
  projection: sourceProjection,
  scores = {},
}) => {
  const adapted = useMemo(
    () => adaptProjectionToBoard(sourceProjection),
    [sourceProjection],
  );
  const { cardsByInstanceId, projection } = adapted;

  const logEntries = sourceProjection.logEntries.map((entry, index) => ({
    ...entry,
    sequence: index + 1,
  }));
  const submitProjectedAction = useCallback(
    (
      actionId: string | undefined,
      selectedIds: string[] = [],
      allocations?: Array<{ targetUnitId: string; amount: number }>,
    ): Promise<boolean> => {
      if (!actionId) return Promise.resolve(false);
      return onPerformAction({ actionId, selectedIds, allocations });
    },
    [onPerformAction],
  );
  const sourceActions = useCallback(
    (sourceCardInstanceId: string) =>
      sourceProjection.actions.filter(
        (action) => action.sourceCardInstanceId === sourceCardInstanceId,
      ),
    [sourceProjection.actions],
  );
  const onEndTurn = () =>
    submitProjectedAction(
      sourceProjection.actions.find((action) => action.label === "End turn")
        ?.id,
    );
  const onPass = () =>
    submitProjectedAction(
      sourceProjection.actions.find(
        (action) =>
          action.label === "Pass priority" || action.label === "Pass focus",
      )?.id,
    );
  const onPlayCard = useCallback(
    (input: {
      cardInstanceId: string;
      choices?: { targetCardInstanceIds?: string[] };
      selectedModeId?: string;
    }) => {
      const action = input.selectedModeId
        ? sourceProjection.actions.find(
            (candidate) => candidate.id === input.selectedModeId,
          )
        : sourceActions(input.cardInstanceId)[0];
      submitProjectedAction(
        action?.id,
        input.choices?.targetCardInstanceIds ?? [],
      );
    },
    [sourceActions, sourceProjection.actions, submitProjectedAction],
  );
  const [openZone, setOpenZone] =
    useState<Exclude<TemporaryZone, "chain">>(null);
  const [isChainOverlayOpen, setIsChainOverlayOpen] = useState(false);
  const [cardActionMenu, setCardActionMenu] =
    useState<CardActionMenuState>(null);
  const [activeTransferCardIds, setActiveTransferCardIds] = useState<
    Set<string>
  >(new Set());
  const [pendingAnimationSnapshot, setPendingAnimationSnapshot] =
    useState<CardZoneAnimationSnapshot | null>(null);
  const [targetSelection, setTargetSelection] = useState<{
    actionId: string;
    legalTargetIds: string[];
    maxTargets: number;
    minTargets: number;
    purpose: "choice" | "move" | "play";
    requirement: CombinedTargetRequirement;
    selectedTargetIds: string[];
    targetKind: "battlefield" | "card";
  } | null>(null);
  const [unitPlayChoice, setUnitPlayChoice] = useState<{
    card: Card;
    modes: PaymentMode[];
  } | null>(null);
  const [highlightedCardInstanceIds, setHighlightedCardInstanceIds] = useState<
    Set<string>
  >(new Set());
  const [hoveredTargetCardInstanceId, setHoveredTargetCardInstanceId] =
    useState<string | null>(null);
  const [hoveredBoardLocation, setHoveredBoardLocation] =
    useState<BoardLocation | null>(null);
  const [pendingSubmittedTargetIds, setPendingSubmittedTargetIds] = useState<
    string[]
  >([]);
  const [activeLocationDrag, setActiveLocationDrag] =
    useState<LocationDragData | null>(null);
  const [hoveredLocationDrop, setHoveredLocationDrop] =
    useState<BoardDropLocation | null>(null);

  const isChainLockedOpen = (projection.chain?.items.length ?? 0) > 0;
  const wasChainLockedOpen = useRef(isChainLockedOpen);
  const passPriorityAction = sourceProjection.actions.find(
    (action) => action.label === "Pass priority",
  );
  const canViewerPassChain = isChainLockedOpen && Boolean(passPriorityAction);
  const onPassPriority = useCallback(
    () => submitProjectedAction(passPriorityAction?.id),
    [passPriorityAction?.id, submitProjectedAction],
  );
  const chainPassWillResolve =
    canViewerPassChain &&
    projection.chain !== null &&
    projection.chain.relevantPlayerIds.every(
      (playerId) =>
        playerId === projection.viewerPlayerId ||
        projection.chain?.passedPlayerIds.includes(playerId),
    );
  const chainPassLabel = chainPassWillResolve
    ? "Pass and Resolve"
    : "Pass Priority";
  const endTurnAction = sourceProjection.actions.find(
    (action) => action.label === "End turn",
  );
  const passFocusAction = sourceProjection.actions.find(
    (action) => action.label === "Pass focus",
  );
  const concedeAction = sourceProjection.actions.find(
    (action) => action.id.split(":")[3] === "concede",
  );

  const onConcede = useCallback(async () => {
    await submitProjectedAction(concedeAction?.id);
  }, [concedeAction?.id, submitProjectedAction]);
  const canViewerEndTurn = Boolean(endTurnAction || passFocusAction);
  const passTurnLabel = isChainLockedOpen
    ? "Resolve chain first"
    : passFocusAction
      ? "Pass Focus"
      : canViewerEndTurn
        ? "Pass Turn"
        : "Waiting for turn";
  const showdownPrompt = showdownPromptState(sourceProjection);
  const showdownBattlefieldName = showdownPrompt
    ? (sourceProjection.battlefields.find(
        (battlefield) =>
          battlefield.battlefieldId === showdownPrompt.battlefieldId,
      )?.card.name ?? "Battlefield")
    : null;
  const globalActions = sourceProjection.actions.filter(
    (action) =>
      action.sourceCardInstanceId === null &&
      action.presentation.surface === "action-rail" &&
      action.id.split(":")[3] !== "moveMany" &&
      action.id.split(":")[3] !== "concede" &&
      !["End turn", "Pass focus", "Pass priority"].includes(action.label) &&
      action.choice?.kind !== "combatDamage",
  );
  const effectSelectionAction = sourceProjection.actions.find(
    (action) => action.choice?.kind === "effectSelection",
  );
  const playerDecision = usePlayerDecisionRequest({
    activeTargetSelection: targetSelection,
    cardsByInstanceId,
    playerNames,
    sourceProjection,
  });
  const targetSelectionUsesCardPrompt =
    playerDecision?.kind === "cardSelection" &&
    targetSelection?.actionId === playerDecision.actionId;
  const board = createBoardModel({
    cardsByInstanceId,
    playerNames,
    projection,
    scores,
  });
  const activeLocationDragCard = activeLocationDrag
    ? (buildCard(
        activeLocationDrag.sourceCardInstanceId,
        cardsByInstanceId,
        projection.cardStates,
      )[0] ?? null)
    : null;

  const activeLocationDragLegalDrops = activeLocationDrag
    ? legalDropLocationsForCard({
        actions: sourceProjection.actions,
        sourceCardInstanceId: activeLocationDrag.sourceCardInstanceId,
        sourceLocation: activeLocationDrag.sourceLocation,
      })
    : [];

  const isLocationDropEnabled = Boolean(activeLocationDrag);

  const getLocationDropStatus = (location: BoardDropLocation) =>
    boardLocationDropStatus({
      active: isLocationDropEnabled,
      hoveredLocation: hoveredLocationDrop,
      legalLocations: activeLocationDragLegalDrops,
      location,
    });

  const activeLocationDragOverlay = activeLocationDragCard ? (
    <div
      className="inline-flex opacity-95 pointer-events-none"
      style={{
        filter:
          "drop-shadow(0 0 1px rgba(103,232,249,0.95)) drop-shadow(0 0 8px rgba(103,232,249,0.75)) drop-shadow(0 0 22px rgba(103,232,249,0.35))",
      }}
    >
      <CardTile
        {...activeLocationDragCard}
        enableHoverPreview={false}
        enableZoneAnimation={false}
        focusablePreview={false}
      />
    </div>
  ) : null;

  const beginGlobalAction = (action: GameProjection["actions"][number]) => {
    const requirement = combineTargetRequirements(action, "card");
    if (!requirement) {
      submitProjectedAction(action.id);
      return;
    }
    const kind = action.id.split(":")[3];
    setTargetSelection({
      actionId: action.id,
      legalTargetIds: requirement.legalIds,
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
  };
  const chainControllerDetails = (controllerPlayerId: string) => {
    if (controllerPlayerId === board.player.playerId) {
      return {
        controllerName: board.player.name,
        controllerSeat: "player" as const,
      };
    }

    return {
      controllerName: board.opponent.name,
      controllerSeat: "opponent" as const,
    };
  };
  const chainCards: ChainCardEntry[] = (projection.chain?.items ?? []).flatMap(
    (item) => {
      const displayCardInstanceId =
        item.cardInstanceId ?? item.sourceCardInstanceId;
      const controllerDetails = chainControllerDetails(item.controllerPlayerId);

      if (displayCardInstanceId) {
        const cards = buildCard(
          displayCardInstanceId,
          cardsByInstanceId,
          projection.cardStates,
        );

        if (cards.length > 0) {
          return cards.map((card) => ({
            card,
            chainItemId: item.id,
            controllerPlayerId: item.controllerPlayerId,
            ...controllerDetails,
            sourceCardInstanceId: item.sourceCardInstanceId,
            targetCardInstanceIds: item.targetCardInstanceIds,
          }));
        }
      }

      return [
        {
          card: {
            name: item.label,
            img: cardBackImage.src,
            type: undefined,
          } satisfies Card,
          chainItemId: item.id,
          controllerPlayerId: item.controllerPlayerId,
          ...controllerDetails,
          sourceCardInstanceId: item.sourceCardInstanceId,
          targetCardInstanceIds: item.targetCardInstanceIds,
        },
      ];
    },
  );
  const viewerState = projection.players[projection.viewerPlayerId];
  const targetSelectionAction = targetSelection
    ? (sourceProjection.actions.find(
        (action) => action.id === targetSelection.actionId,
      ) ??
      sourceProjection.actions.find((action) =>
        actionIdsHaveSameIdentity(action.id, targetSelection.actionId),
      ))
    : undefined;
  const selectedDeflectSources =
    targetSelectionAction?.costPreview?.targetAdditionalPower.filter((source) =>
      targetSelection?.selectedTargetIds.includes(source.targetId),
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
  const activePlayerId = projection.turn?.activePlayerId;
  const isOpponentActive = activePlayerId === board.opponent.playerId;
  const isPlayerActive = activePlayerId === board.player.playerId;
  const animationData = useMemo(() => createAnimationData(board), [board]);
  const handleActiveTransferCardIdsChange = useCallback(
    (cardInstanceIds: Set<string>) => {
      setActiveTransferCardIds((current) =>
        areSetsEqual(current, cardInstanceIds) ? current : cardInstanceIds,
      );
    },
    [],
  );
  const capturePendingAnimationSnapshot = useCallback(() => {
    setPendingAnimationSnapshot(
      captureCardZoneAnimationSnapshot({
        placements: animationData.placements,
        stateVersion: projection.stateVersion,
        zoneCounts: animationData.zoneCounts,
      }),
    );
  }, [animationData, projection.stateVersion]);
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

      onPlayCard?.(input);
    },
    [capturePendingAnimationSnapshot, onPlayCard],
  );
  const submitRuneAction = (actionId: string) => {
    capturePendingAnimationSnapshot();
    submitProjectedAction(actionId);
  };
  const closeCardActionMenu = () => {
    setCardActionMenu(null);
    setHoveredBoardLocation(null);
  };
  const openCardActionMenu = (
    event: MouseEvent<HTMLElement>,
    items: CardActionMenuItem[],
  ) => {
    if (items.length === 0) {
      closeCardActionMenu();
      return;
    }

    setHoveredBoardLocation(null);

    const menuWidth = 180;
    const menuHeight = Math.max(44, items.length * 36 + 12);
    const gutter = 8;

    setCardActionMenu({
      items,
      left: Math.min(
        event.clientX,
        Math.max(gutter, window.innerWidth - menuWidth - gutter),
      ),
      top: Math.min(
        event.clientY,
        Math.max(gutter, window.innerHeight - menuHeight - gutter),
      ),
    });
  };

  const handlePlayCardFromHand = (card: Card) => {
    closeCardActionMenu();

    if (!card.instanceId || !onPlayCard || !viewerState) {
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
  };
  const openPlayableCardMenu = (card: Card, event: MouseEvent<HTMLElement>) => {
    if (!card.instanceId || !viewerState) {
      return;
    }

    const modes = (
      viewerState.availablePaymentModes[card.instanceId] ?? []
    ).filter((mode) => mode.enabled);

    openCardActionMenu(
      event,
      modes.length > 0
        ? modes.map((mode) => ({
            boardLocation: mode.boardLocation,
            id: mode.id,
            label: mode.label,
            onSelect: () => beginPlayOrTargetSelection(card, mode.id),
          }))
        : [
            {
              disabled: true,
              id: `${card.instanceId}:not-playable`,
              label: "Not playable",
            },
          ],
    );
  };
  const beginPlayOrTargetSelection = (card: Card, selectedModeId?: string) => {
    if (!card.instanceId || !viewerState) {
      return;
    }

    const projectedAction = selectedModeId
      ? sourceProjection.actions.find((action) => action.id === selectedModeId)
      : sourceActions(card.instanceId)[0];
    if (!projectedAction) {
      return;
    }
    const stagedMoveAction = simultaneousMoveAction(
      sourceProjection.actions,
      projectedAction,
      card.instanceId,
    );
    const actionToSubmit = stagedMoveAction ?? projectedAction;
    const targetKind = actionToSubmit.targets.some(
      (target) => target.kind === "card",
    )
      ? "card"
      : "battlefield";
    const requirement = combineTargetRequirements(actionToSubmit, targetKind);

    if (requirement && requirement.maximum > 0) {
      setTargetSelection({
        actionId: actionToSubmit.id,
        legalTargetIds: requirement.legalIds,
        maxTargets: requirement.maximum,
        minTargets: requirement.minimum,
        purpose: stagedMoveAction ? "move" : "play",
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
  };
  const handleCardContextFromHand = (
    card: Card,
    event: MouseEvent<HTMLElement>,
  ) => {
    openPlayableCardMenu(card, event);
  };
  const handleChampionCardAction = (
    card: Card,
    event?: MouseEvent<HTMLElement>,
  ) => {
    if (!event) {
      return;
    }

    openPlayableCardMenu(card, event);
  };
  const handleBoardCardPrimaryAction = (
    card: Card,
    event?: MouseEvent<HTMLElement>,
  ) => {
    if (targetSelection) {
      chooseBoardTarget(card.instanceId);
      return;
    }

    if (!card.instanceId || !event) {
      return;
    }
    const actions = sourceActions(card.instanceId);
    if (actions.length === 0) return;
    openCardActionMenu(
      event,
      actions.map((action) => ({
        boardLocation: action.presentation.boardLocation,
        disabled: !action.enabled,
        id: action.id,
        label: action.enabled
          ? action.label
          : `${action.label} (${action.disabledReason ?? "unavailable"})`,
        onSelect: () => beginPlayOrTargetSelection(card, action.id),
      })),
    );
  };
  const chooseBoardTarget = (cardInstanceId: string | undefined) => {
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
      ? targetSelection.selectedTargetIds.filter((id) => id !== cardInstanceId)
      : [...targetSelection.selectedTargetIds, cardInstanceId];
    const nextSelection = {
      ...targetSelection,
      selectedTargetIds,
    };

    setTargetSelection(nextSelection);

    if (
      nextSelection.purpose === "play" &&
      nextSelection.minTargets === nextSelection.maxTargets &&
      selectedTargetIds.length === nextSelection.maxTargets &&
      targetSelectionIsLegal(nextSelection.requirement, selectedTargetIds) &&
      additionalPowerForTargets(targetSelectionAction, selectedTargetIds) === 0
    ) {
      submitTargetedPlay(nextSelection);
    }
  };
  const handleTargetClickCapture = (event: MouseEvent<HTMLElement>) => {
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
  };
  const handleTargetPointerEnter = (card: Card) => {
    if (!targetSelection || !card.instanceId) {
      return;
    }

    if (!legalTargetIds.includes(card.instanceId)) {
      return;
    }

    setHoveredTargetCardInstanceId(card.instanceId);
  };
  const handleTargetPointerLeave = (card: Card) => {
    if (hoveredTargetCardInstanceId !== card.instanceId) {
      return;
    }

    setHoveredTargetCardInstanceId(null);
  };
  const submitTargetedPlay = async (
    selection = targetSelection,
  ): Promise<boolean> => {
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

    const accepted = await submitProjectedAction(
      targetSelectionAction?.id ?? selection.actionId,
      selection.selectedTargetIds,
    );
    if (!accepted) return false;

    setPendingSubmittedTargetIds(selection.selectedTargetIds);
    setHoveredTargetCardInstanceId(null);
    setTargetSelection(null);
    return true;
  };
  const openRuneActionMenu = (card: Card, event: MouseEvent<HTMLElement>) => {
    if (!card.instanceId) {
      return;
    }

    const actions = sourceActions(card.instanceId);
    const powerDomain = actions
      .map((action) => action.label.match(/^Add Power \[(.+)]$/)?.[1])
      .find((domain) => domain !== undefined);

    openCardActionMenu(
      event,
      actions.map((action) => ({
        accessibleLabel: runeActionAccessibleLabel(action, powerDomain),
        disabled: !action.enabled,
        id: action.id,
        label: runeActionMenuLabel(action, powerDomain),
        onSelect: () => submitRuneAction(action.id),
      })),
    );
  };
  const handleRunePrimaryAction = (
    card: Card,
    event?: MouseEvent<HTMLElement>,
  ) => {
    if (event) openRuneActionMenu(card, event);
  };
  const handleRuneContextAction = openRuneActionMenu;

  useEffect(() => {
    setIsChainOverlayOpen((isOpen) =>
      chainOverlayOpen(isOpen, wasChainLockedOpen.current, isChainLockedOpen),
    );
    wasChainLockedOpen.current = isChainLockedOpen;
  }, [isChainLockedOpen]);

  useEffect(() => {
    if (!isChainLockedOpen || !isChainOverlayOpen) {
      setHighlightedCardInstanceIds(new Set());
    }
  }, [isChainLockedOpen, isChainOverlayOpen]);

  useEffect(() => {
    setCardActionMenu(null);
    setHoveredBoardLocation(null);
    setHoveredTargetCardInstanceId(null);
    setPendingSubmittedTargetIds([]);
  }, [projection.stateVersion]);

  useEffect(() => {
    if (
      !effectSelectionAction ||
      (playerDecision?.kind === "cardSelection" &&
        playerDecision.actionId === effectSelectionAction.id)
    )
      return;
    const requirement = combineTargetRequirements(
      effectSelectionAction,
      "card",
    );
    if (!requirement) return;
    setTargetSelection((current) =>
      current?.actionId === effectSelectionAction.id
        ? current
        : {
            actionId: effectSelectionAction.id,
            legalTargetIds: requirement.legalIds,
            maxTargets: requirement.maximum,
            minTargets: requirement.minimum,
            purpose: "choice",
            requirement,
            selectedTargetIds: [],
            targetKind: "card",
          },
    );
  }, [effectSelectionAction, playerDecision]);

  useEffect(() => {
    if (
      playerDecision?.kind === "cardSelection" &&
      targetSelection &&
      playerDecision.actionId !== targetSelection.actionId
    ) {
      setTargetSelection(null);
    }
  }, [playerDecision, targetSelection]);

  useEffect(() => {
    if (!cardActionMenu) {
      return;
    }

    const close = () => closeCardActionMenu();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };

    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [cardActionMenu]);

  return (
    <main
      className="relative flex flex-col h-screen overflow-hidden text-slate-100 game-board"
      onClickCapture={handleTargetClickCapture}
    >
      <ScoreHeader
        opponent={board.opponent}
        player={board.player}
        victoryScore={projection.victoryScore}
      />
      <PlayerDecisionHost
        cardsByInstanceId={cardsByInstanceId}
        decision={playerDecision}
        isSubmitting={isSubmittingAction}
        onCancel={() => setTargetSelection(null)}
        onIntent={async (intent) => {
          const accepted = await submitProjectedAction(
            intent.actionId,
            intent.selectedIds ?? [],
            intent.allocations,
          );
          if (accepted && targetSelection?.actionId === intent.actionId) {
            setTargetSelection(null);
          }
          return accepted;
        }}
      />
      {showdownPrompt &&
        showdownBattlefieldName &&
        !sourceProjection.pendingChoice && (
          <ShowdownPrompt
            attackerMight={showdownPrompt.attackerMight}
            battlefieldName={showdownBattlefieldName}
            defenderMight={showdownPrompt.defenderMight}
            focusPlayerId={showdownPrompt.focusPlayerId}
            hasFocus={showdownPrompt.hasFocus}
            hasPriority={showdownPrompt.hasPriority}
            isClosed={showdownPrompt.isClosed}
            isCombat={showdownPrompt.kind === "combat"}
            isFinalFocusPass={showdownPrompt.isFinalFocusPass}
            isSubmitting={isSubmittingAction}
            onPassFocus={showdownPrompt.canPassFocus ? onPass : undefined}
            priorityPlayerId={showdownPrompt.priorityPlayerId}
          />
        )}
      <section className="flex flex-1 min-h-0 overflow-hidden">
        <LocationDragProvider
          activeDragData={activeLocationDrag}
          dragOverlay={activeLocationDragOverlay}
          onActiveDragDataChange={(data) => {
            setActiveLocationDrag(data);

            if (!data) {
              setHoveredLocationDrop(null);
            }
          }}
          onDragCancel={() => setHoveredLocationDrop(null)}
          onDragEnd={() => setHoveredLocationDrop(null)}
          onDragOver={(event) => {
            const overData = event.over?.data.current;

            setHoveredLocationDrop(
              isBoardDropLocationData(overData) ? overData.location : null,
            );
          }}
        >
          <div className="flex-1 gap-2 grid grid-rows-[minmax(96px,0.8fr)_minmax(0,1.2fr)_minmax(180px,2fr)_minmax(0,1.2fr)_minmax(96px,0.8fr)_48px] p-2 min-h-0 overflow-hidden">
            <PlayerBoard
              highlightedCardInstanceIds={displayedHighlightedCardInstanceIds}
              hiddenCardInstanceIds={activeTransferCardIds}
              onBoardCardPrimaryAction={handleBoardCardPrimaryAction}
              onBoardCardPointerEnter={handleTargetPointerEnter}
              onBoardCardPointerLeave={handleTargetPointerLeave}
              onOpenBanish={() => setOpenZone("banish")}
              onOpenTrash={() => setOpenZone("opponentTrash")}
              player={board.opponent}
              isActivePlayer={isOpponentActive}
              isMirrored
            />
            <LayoutGroup id="battlefield-showdown-layout">
              <div className="flex gap-2 min-h-0">
                <BattlefieldBoard
                  battlefield={board.playerBattlefield}
                  highlightedCardInstanceIds={
                    displayedHighlightedCardInstanceIds
                  }
                  hiddenCardInstanceIds={activeTransferCardIds}
                  isHighlighted={
                    hoveredBoardLocation?.kind === "battlefield" &&
                    hoveredBoardLocation.battlefieldId ===
                      board.playerBattlefield.id
                  }
                  onCardPrimaryAction={handleBoardCardPrimaryAction}
                  onCardPointerEnter={handleTargetPointerEnter}
                  onCardPointerLeave={handleTargetPointerLeave}
                  owner="player"
                  showdownState={board.playerBattlefieldShowdownState}
                  enablePlayerUnitLocationDrag
                  dropStatus={getLocationDropStatus({
                    kind: "battlefield",
                    battlefieldId: board.playerBattlefield.id,
                  })}
                  isLocationDropEnabled={isLocationDropEnabled}
                />
                <BattlefieldBoard
                  battlefield={board.opponentBattlefield}
                  highlightedCardInstanceIds={
                    displayedHighlightedCardInstanceIds
                  }
                  hiddenCardInstanceIds={activeTransferCardIds}
                  isHighlighted={
                    hoveredBoardLocation?.kind === "battlefield" &&
                    hoveredBoardLocation.battlefieldId ===
                      board.opponentBattlefield.id
                  }
                  onCardPrimaryAction={handleBoardCardPrimaryAction}
                  onCardPointerEnter={handleTargetPointerEnter}
                  onCardPointerLeave={handleTargetPointerLeave}
                  owner="opponent"
                  showdownState={board.opponentBattlefieldShowdownState}
                  enablePlayerUnitLocationDrag
                  dropStatus={getLocationDropStatus({
                    kind: "battlefield",
                    battlefieldId: board.opponentBattlefield.id,
                  })}
                  isLocationDropEnabled={isLocationDropEnabled}
                />
              </div>
            </LayoutGroup>
            <PlayerBoard
              highlightedCardInstanceIds={displayedHighlightedCardInstanceIds}
              hiddenCardInstanceIds={activeTransferCardIds}
              isBaseHighlighted={hoveredBoardLocation?.kind === "base"}
              onOpenBanish={() => setOpenZone("banish")}
              onOpenTrash={() => setOpenZone("playerTrash")}
              onChampionContextAction={handleChampionCardAction}
              onChampionPrimaryAction={handleChampionCardAction}
              onBoardCardPrimaryAction={handleBoardCardPrimaryAction}
              onBoardCardPointerEnter={handleTargetPointerEnter}
              onBoardCardPointerLeave={handleTargetPointerLeave}
              onRuneContextAction={handleRuneContextAction}
              onRunePrimaryAction={handleRunePrimaryAction}
              player={board.player}
              isActivePlayer={isPlayerActive}
              enableLocationDrag
              baseDropStatus={getLocationDropStatus({ kind: "base" })}
              isLocationDropEnabled={isLocationDropEnabled}
            />
            <RunePoolBar runePool={viewerState?.runePool} />
          </div>
        </LocationDragProvider>
        <ActionRail
          concedeDisabled={isSubmittingAction}
          isChainOpen={isChainOverlayOpen}
          isChainLockedOpen={isChainLockedOpen}
          onChainOpenChange={setIsChainOverlayOpen}
          onConcede={concedeAction ? onConcede : undefined}
          onPassTurn={passFocusAction ? onPass : onEndTurn}
          openZone={openZone}
          passTurnDisabled={!canViewerEndTurn || isSubmittingAction}
          passTurnLabel={isSubmittingAction ? "Submitting…" : passTurnLabel}
          setOpenZone={setOpenZone}
        />
      </section>
      {globalActions.length > 0 && (
        <div className="top-12 left-1/2 z-50 fixed flex gap-2 -translate-x-1/2">
          {globalActions.map((action) => (
            <button
              className="bg-slate-950/90 hover:bg-slate-800 px-3 py-1.5 border border-cyan-300/30 rounded text-cyan-100 text-xs"
              key={action.id}
              onClick={() => beginGlobalAction(action)}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
      <ChainOverlay
        canPassPriority={canViewerPassChain}
        chainCards={chainCards}
        chainPassLabel={isSubmittingAction ? "Submitting…" : chainPassLabel}
        isCloseDisabled={isChainLockedOpen}
        isOpen={isChainOverlayOpen}
        isSubmittingAction={isSubmittingAction}
        onClose={() => setIsChainOverlayOpen(false)}
        onItemPointerEnter={(targetCardInstanceIds) =>
          setHighlightedCardInstanceIds(new Set(targetCardInstanceIds))
        }
        onItemPointerLeave={() => setHighlightedCardInstanceIds(new Set())}
        onPassPriority={onPassPriority}
        priorityWindowKey={`${projection.stateVersion}:${passPriorityAction?.id ?? "none"}`}
      />
      <TemporaryZoneOverlay
        enableCloseShortcut
        logEntries={logEntries}
        onClose={() => setOpenZone(null)}
        openZone={openZone}
        opponentBanishment={board.opponent.zones.banishment}
        opponentTrash={board.opponent.zones.trash}
        placement={isChainOverlayOpen ? "secondary" : "primary"}
        playerBanishment={board.player.zones.banishment}
        playerTrash={board.player.zones.trash}
      />

      <PlayerHandFan
        cards={board.player.zones.hand.cards}
        hiddenCardInstanceIds={activeTransferCardIds}
        onCardContextAction={handleCardContextFromHand}
        onPlayCard={handlePlayCardFromHand}
        onTuck={closeCardActionMenu}
        playerId={board.player.playerId}
      />
      {targetSelection?.targetKind === "card" &&
        !targetSelectionUsesCardPrompt && (
          <TargetSelectionPrompt
            canSubmit={
              !isSubmittingAction &&
              targetSelectionIsLegal(
                targetSelection.requirement,
                targetSelection.selectedTargetIds,
              ) &&
              missingDeflectPower === 0
            }
            costPreview={
              targetSelectionAction?.costPreview
                ? {
                    additionalPower: selectedDeflectPower,
                    availableAnyPower:
                      targetSelectionAction.costPreview.availableAnyPower,
                    basePower: targetSelectionAction.costPreview.basePower,
                    energy: targetSelectionAction.costPreview.energy,
                    sourceNames: selectedDeflectSources.map(
                      (source) =>
                        cardsByInstanceId[source.targetId]?.name ??
                        "Unknown permanent",
                    ),
                  }
                : undefined
            }
            maxTargets={targetSelection.maxTargets}
            minTargets={targetSelection.minTargets}
            isSubmitting={isSubmittingAction}
            onCancel={() => setTargetSelection(null)}
            onSubmit={() => submitTargetedPlay()}
            selectedCount={targetSelection.selectedTargetIds.length}
            cancelLabel={
              targetSelection.purpose === "move"
                ? "Cancel move"
                : targetSelection.purpose === "choice"
                  ? "Close"
                  : "Cancel"
            }
            confirmLabel={
              targetSelection.purpose === "move"
                ? "Confirm move"
                : targetSelection.purpose === "choice"
                  ? "Confirm"
                  : "Play"
            }
            title={
              targetSelection.purpose === "move"
                ? moveSelectionTitle(
                    sourceProjection.actions.find(
                      (action) => action.id === targetSelection.actionId,
                    ),
                    sourceProjection.battlefields,
                  )
                : targetSelection.purpose === "choice"
                  ? effectSelectionAction?.label
                  : undefined
            }
          />
        )}
      {targetSelection?.targetKind === "battlefield" && (
        <ChoiceDialog
          confirmLabel="Choose battlefield"
          description="Choose the battlefield affected by this action."
          isOpen
          isSubmitting={isSubmittingAction}
          onCancel={() => setTargetSelection(null)}
          onConfirm={(selectedIds) =>
            submitTargetedPlay({
              ...targetSelection,
              selectedTargetIds: selectedIds,
            })
          }
          options={sourceProjection.battlefields
            .filter((battlefield) =>
              targetSelection.legalTargetIds.includes(
                battlefield.battlefieldId,
              ),
            )
            .map((battlefield) => ({
              description: battlefield.card.rulesText || "Battlefield",
              id: battlefield.battlefieldId,
              imageOrientation: "landscape" as const,
              imageUrl: battlefield.card.imageUrl ?? undefined,
              label: battlefield.card.name,
            }))}
          selectionMode="single"
          title="Choose a Battlefield"
        />
      )}
      {unitPlayChoice && (
        <ChoiceDialog
          confirmLabel="Play unit"
          description="Units may be played to your Base or a battlefield you control."
          isOpen
          isSubmitting={isSubmittingAction}
          onCancel={() => setUnitPlayChoice(null)}
          onConfirm={([actionId]) => {
            const card = unitPlayChoice.card;
            setUnitPlayChoice(null);
            if (actionId) beginPlayOrTargetSelection(card, actionId);
          }}
          options={unitPlayChoice.modes.map((mode) => ({
            disabled: !mode.enabled,
            id: mode.id,
            label: mode.enabled
              ? mode.label
              : `${mode.label} (${mode.disabledReason ?? "unavailable"})`,
          }))}
          selectionMode="single"
          title={`Choose where to play ${unitPlayChoice.card.name}`}
        />
      )}
      <CardZoneTransferOverlay
        onActiveCardIdsChange={handleActiveTransferCardIdsChange}
        onPendingSnapshotConsumed={() => setPendingAnimationSnapshot(null)}
        pendingSnapshot={pendingAnimationSnapshot}
        placements={animationData.placements}
        stateVersion={projection.stateVersion}
        zoneCounts={animationData.zoneCounts}
      />
      {cardActionMenu && (
        <>
          <button
            aria-label="Close card action menu"
            className="z-[2147483646] fixed inset-0 bg-transparent cursor-default"
            onPointerDown={closeCardActionMenu}
            type="button"
          />
          <CardActionMenu
            items={cardActionMenu.items}
            left={cardActionMenu.left}
            onClose={closeCardActionMenu}
            onItemHighlight={(item) =>
              setHoveredBoardLocation(item.boardLocation ?? null)
            }
            onItemHighlightEnd={() => setHoveredBoardLocation(null)}
            top={cardActionMenu.top}
          />
        </>
      )}
    </main>
  );
};

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
    action?.costPreview?.targetAdditionalPower
      .filter((source) => targetIds.includes(source.targetId))
      .reduce((total, source) => total + source.amount, 0) ?? 0
  );
}

function CardActionMenu({
  items,
  left,
  onClose,
  onItemHighlight,
  onItemHighlightEnd,
  top,
}: {
  items: CardActionMenuItem[];
  left: number;
  onClose: () => void;
  onItemHighlight?: (item: CardActionMenuItem) => void;
  onItemHighlightEnd?: () => void;
  top: number;
}) {
  return (
    <div
      className="z-[2147483647] fixed bg-slate-950/95 shadow-[0_18px_45px_rgba(0,0,0,0.75)] p-1 border border-white/10 rounded-md ring-1 ring-cyan-300/20 min-w-44 overflow-hidden text-slate-100 text-sm"
      onPointerDown={(event) => event.stopPropagation()}
      style={{ left, top }}
    >
      {items.map((item) => (
        <button
          aria-label={item.accessibleLabel}
          className="flex items-center enabled:hover:bg-cyan-300/15 px-3 py-2 rounded w-full disabled:text-slate-500 text-xs text-left transition disabled:cursor-not-allowed"
          disabled={item.disabled}
          key={item.id}
          onClick={() => {
            onClose();
            item.onSelect?.();
          }}
          onBlur={onItemHighlightEnd}
          onFocus={() => {
            if (!item.disabled) {
              onItemHighlight?.(item);
            }
          }}
          onPointerEnter={() => {
            if (!item.disabled) {
              onItemHighlight?.(item);
            }
          }}
          onPointerLeave={(event) => {
            if (document.activeElement !== event.currentTarget) {
              onItemHighlightEnd?.();
            }
          }}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
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
