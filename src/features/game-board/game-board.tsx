"use client";

import { chainRelationships, type ChainRelationships } from "./chain-relationships";
import { PlayableCardMenuLabel } from "./components/playable-card-menu-label";

import {
  serializeStructuredBugReport,
  type StructuredBugReport,
} from "@/shared/bug-report";
import type { GameProjection } from "@/shared/game";
import { copyText } from "@/shared/utils/copy-text";
import { LayoutGroup } from "motion/react";
import {
  FC,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import cardBackImage from "../../../assets/cardback.jpg";
import { areSetsEqual, createAnimationData } from "./board-animation-model";
import {
  cloneViewerSafeProjection,
  createStructuredBugReport,
  findRelatedProjectedCard,
  toggleRelatedProjectedCardSelection,
} from "./bug-report";
import { buildCard, createBoardModel } from "./board-model";
import { adaptProjectionToBoard } from "./board-view-model";
import { ActionRail } from "./components/action-rail";
import { ReportCardChoiceDialog } from "./components/report-card-choice-dialog";
import { BattlefieldBoard } from "./components/battlefield-board";
import { CardActionMenu } from "./components/card-action-menu";
import { DecisionInspectionToolbar } from "./components/decision-inspection-toolbar";
import { DecisionInspectionTrigger } from "./components/decision-inspection-trigger";
import { DecisionZoneBrowser } from "./components/decision-zone-browser";
import {
  type CardZoneAnimationSnapshot,
  type CardZoneSourceReservation,
  CardZoneTransferOverlay,
  captureCardZoneAnimationSnapshot,
} from "./components/card-zone-transfer-overlay";
import { ChainOverlay } from "./components/chain-overlay";
import { BugReportPanel } from "./components/bug-report-panel";
import { MovementDraftStage } from "./components/movement-draft-stage";
import { PlayerBoard } from "./components/player-board";
import { PublicRevealWindow } from "./components/public-reveal-window";
import { PlayerHandFan } from "./components/player-hand-fan";
import { RunePoolBar } from "./components/rune-pool-bar";
import {
  PlayerHudPlate,
  ScoreHeader,
  type MatchHudContext,
} from "./components/score-header";
import { ShowdownPrompt } from "./components/showdown-prompt";
import { TargetSelectionPrompt } from "./components/target-selection-prompt";
import { TemporaryZoneOverlay } from "./components/temporary-zone-overlay";
import { PlayerDecisionHost } from "./decisions/player-decision-host";
import { usePlayerDecisionRequest } from "./decisions/use-player-decision-request";
import {
  sameBoardLocation,
  type BoardDropLocation,
} from "./drag-and-drop/location-drag-actions";
import { LocationDragProvider } from "./drag-and-drop/location-drag-provider";
import { stagedTargetsAreCurrent, useBoardTargetSelection } from "./interactions/use-board-target-selection";
import {
  persistStructuredBugReport,
  useViewerSafeProjectionHistory,
} from "./interactions/use-viewer-safe-projection-history";
import { useCardActionMenu } from "./interactions/use-card-action-menu";
import { useChainOverlayState } from "./interactions/use-chain-overlay-state";
import { resolveDecisionInspectionRequest } from "./interactions/decision-inspection-request";
import { useDecisionInspection } from "./interactions/use-decision-inspection";
import {
  useGameBoardActions,
  type GameBoardUnitPlayChoice,
} from "./interactions/use-game-board-actions";
import { useBoardLocationDragState } from "./interactions/use-location-drag-state";
import {
  applyMovementDraftToAnimationData,
  createMovementDraftView,
} from "./interactions/movement-draft";
import { applyTransferSourceReservations } from "./interactions/transfer-source-reservations";
import {
  combineTargetRequirements,
  moveSelectionTitle,
  showdownPromptState,
  targetSelectionIsLegal,
} from "./model";
import { Card, ChainCardEntry, TemporaryZone } from "./types";
import {
  ReportCardSelectionProvider,
  type ReportCardSelectionState,
} from "./report-card-selection-context";

type BugReportDraft = {
  actual: string;
  capturedAt: string;
  expected: string;
  game: GameProjection;
  notes: string;
  recentStates: GameProjection[];
  reportId: string;
  selectedCardInstanceIds: Set<string>;
};

type GameBoardProps = {
  isSubmittingAction?: boolean;
  onPerformAction: (input: {
    actionId: string;
    selectedIds: string[];
    targetSelections?: Record<string, string[]>;
    allocations?: Array<{ targetUnitId: string; amount: number }>;
    tokenPlacements?: Array<{ destinationId: string; count: number }>;
  }) => Promise<boolean>;
  playerNames?: Partial<Record<string, string>>;
  projection: GameProjection;
  scores?: Partial<Record<string, number>>;
  matchContext?: MatchHudContext;
  onReportCardSelectionChange?: (
    selection: ReportCardSelectionState | null,
  ) => void;
};

export const GameBoard: FC<GameBoardProps> = ({
  isSubmittingAction = false,
  onPerformAction,
  playerNames = {},
  projection: sourceProjection,
  scores = {},
  matchContext,
  onReportCardSelectionChange,
}) => {
  const adapted = useMemo(
    () => adaptProjectionToBoard(sourceProjection),
    [sourceProjection],
  );
  const { cardsByInstanceId, projection } = adapted;
  const projectionHistoryRef = useViewerSafeProjectionHistory(sourceProjection);
  const [bugReportDraft, setBugReportDraft] = useState<BugReportDraft | null>(
    null,
  );
  const [finalizedBugReport, setFinalizedBugReport] =
    useState<StructuredBugReport | null>(null);
  const [bugReportArtifactPath, setBugReportArtifactPath] = useState<string | null>(
    null,
  );
  const [bugReportError, setBugReportError] = useState<string | null>(null);
  const [isSavingBugReport, setIsSavingBugReport] = useState(false);

  const logEntries = sourceProjection.logEntries.map((entry, index) => ({
    ...entry,
    sequence: index + 1,
  }));
  const interactionLockedRef = useRef(false);
  const debugDrawAction = sourceProjection.actions.find((action) =>
    action.id.split(":")[3] === "debugDraw",
  );
  const submitProjectedAction = useCallback(
    (
      actionId: string | undefined,
      selectedIds: string[] = [],
      allocations?: Array<{ targetUnitId: string; amount: number }>,
      targetSelections?: Record<string, string[]>,
      tokenPlacements?: Array<{ destinationId: string; count: number }>,
    ): Promise<boolean> => {
      if (!actionId || interactionLockedRef.current) {
        return Promise.resolve(false);
      }

      return onPerformAction({
        actionId,
        selectedIds,
        allocations,
        tokenPlacements,
        targetSelections,
      });
    },
    [onPerformAction],
  );
  const [openZone, setOpenZone] =
    useState<Exclude<TemporaryZone, "chain">>(null);
  const {
    cardActionMenu,
    clearCardActionMenuHighlight,
    closeCardActionMenu,
    hoveredBoardLocation,
    openCardActionMenu,
    setCardActionMenuHighlight,
  } = useCardActionMenu();
  const {
    canViewerPassChain,
    chainPassLabel,
    isChainLockedOpen,
    isChainOverlayOpen,
    onPassPriority,
    passPriorityAction,
    setIsChainOverlayOpen,
  } = useChainOverlayState({
    actions: sourceProjection.actions,
    projection,
    submitProjectedAction,
  });
  const [activeTransferCardIds, setActiveTransferCardIds] = useState<
    Set<string>
  >(new Set());
  const [activeTransferSourceReservations, setActiveTransferSourceReservations] =
    useState<CardZoneSourceReservation[]>([]);
  const [pendingAnimationSnapshot, setPendingAnimationSnapshot] =
    useState<CardZoneAnimationSnapshot | null>(null);
  const [unitPlayChoice, setUnitPlayChoice] =
    useState<GameBoardUnitPlayChoice>(null);
  const [highlightedCardInstanceIds, setHighlightedCardInstanceIds] = useState<
    Set<string>
  >(new Set());

  const authoritativeBoard = createBoardModel({
    cardsByInstanceId,
    playerNames,
    projection,
    scores,
  });
  const authoritativeAnimationData = useMemo(
    () => createAnimationData(authoritativeBoard),
    [authoritativeBoard],
  );
  const latestAnimationDataRef = useRef(authoritativeAnimationData);

  const capturePendingAnimationSnapshot = useCallback(() => {
    const animationData = latestAnimationDataRef.current;
    setPendingAnimationSnapshot(
      captureCardZoneAnimationSnapshot({
        placements: animationData.placements,
        stateVersion: projection.stateVersion,
        zoneCounts: animationData.zoneCounts,
      }),
    );
  }, [projection.stateVersion]);

  const discardPendingAnimationSnapshot = useCallback(() => {
    setPendingAnimationSnapshot(null);
  }, []);

  const {
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
  } = useBoardTargetSelection({
    actions: sourceProjection.actions,
    capturePendingAnimationSnapshot,
    discardPendingAnimationSnapshot,
    highlightedCardInstanceIds,
    submitProjectedAction,
  });

  const movementDraftDestination =
    targetSelection?.purpose === "move" &&
    targetSelectionAction?.presentation.boardLocation?.kind === "battlefield"
      ? targetSelectionAction.presentation.boardLocation
      : null;
  const movementDraft = useMemo(
    () =>
      movementDraftDestination && targetSelection?.purpose === "move"
        ? createMovementDraftView({
            board: authoritativeBoard,
            destinationBattlefieldId: movementDraftDestination.battlefieldId,
            eligibleUnitIds: targetSelection.legalTargetIds,
            selectedUnitIds: targetSelection.selectedTargetIds,
          })
        : null,
    [authoritativeBoard, movementDraftDestination, targetSelection],
  );
  const animationData = useMemo(
    () =>
      applyMovementDraftToAnimationData(
        authoritativeAnimationData,
        movementDraft,
      ),
    [authoritativeAnimationData, movementDraft],
  );
  latestAnimationDataRef.current = animationData;

  const { board, placeholderCardInstanceIds } = useMemo(
    () =>
      applyTransferSourceReservations(
        authoritativeBoard,
        activeTransferSourceReservations,
      ),
    [authoritativeBoard, activeTransferSourceReservations],
  );

  const showdownPrompt = showdownPromptState(sourceProjection);
  const showdownBattlefieldName = showdownPrompt
    ? (sourceProjection.battlefields.find(
        (battlefield) =>
          battlefield.battlefieldId === showdownPrompt.battlefieldId,
      )?.card.name ?? "Battlefield")
    : null;
  const effectSelectionAction = sourceProjection.actions.find(
    (action) => action.choice?.kind === "effectSelection",
  );
  const playerDecision = usePlayerDecisionRequest({
    activeTargetSelection: targetSelection,
    cardsByInstanceId,
    playerNames,
    sourceProjection,
  });
  const decisionInspectionRequest = resolveDecisionInspectionRequest({
    playerDecision,
    targetSelection,
    unitPlayChoice,
  });
  const decisionInspection = useDecisionInspection({
    request: decisionInspectionRequest,
  });
  const isReportMode = Boolean(bugReportDraft);
  const isInteractionSuspended =
    decisionInspection.isInspecting || isReportMode;
  interactionLockedRef.current = isInteractionSuspended;
  const targetSelectionUsesCardPrompt =
    playerDecision?.kind === "cardSelection" &&
    targetSelection?.actionId === playerDecision.actionId;

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
  const [hoveredChainRelationships, setHoveredChainRelationships] = useState<ChainRelationships | null>(null);
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
            targetCardInstanceIds:
              item.targetCardInstanceIdGroups?.flat() ??
              item.targetCardInstanceIds,
            relationships: chainRelationships(sourceProjection, item),
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
          targetCardInstanceIds:
            item.targetCardInstanceIdGroups?.flat() ??
            item.targetCardInstanceIds,
          relationships: chainRelationships(sourceProjection, item),
        },
      ];
    },
  );
  const viewerState = projection.players[projection.viewerPlayerId];
  const activePlayerId = projection.turn?.activePlayerId;
  const isOpponentActive = activePlayerId === board.opponent.playerId;
  const isPlayerActive = activePlayerId === board.player.playerId;

  const handleActiveTransferCardIdsChange = useCallback(
    (cardInstanceIds: Set<string>) => {
      setActiveTransferCardIds((current) =>
        areSetsEqual(current, cardInstanceIds) ? current : cardInstanceIds,
      );
    },
    [],
  );
  const handleActiveSourceReservationsChange = useCallback(
    (reservations: CardZoneSourceReservation[]) => {
      setActiveTransferSourceReservations((current) =>
        sourceReservationsEqual(current, reservations) ? current : reservations,
      );
    },
    [],
  );

  const {
    beginGlobalAction,
    beginPlayOrTargetSelection,
    canViewerEndTurn,
    concedeAction,
    globalActions,
    handleBoardCardPrimaryAction,
    handleCardContextFromHand,
    handleChampionCardAction,
    handlePlayCardFromHand,
    handleRuneContextAction,
    handleRunePrimaryAction,
    onConcede,
    onEndTurn,
    onPass,
    passFocusAction,
    passTurnLabel,
    submitLocationDragMoveAction,
    submitLocationDragPlayAction,
  } = useGameBoardActions({
    actions: sourceProjection.actions,
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
  });

  const {
    activeLocationDrag,
    activeLocationDragAttachmentIds,
    activeLocationDragOverlay,
    activeTransferStartRects,
    consumeTransferStartRects,
    getLocationDropStatus,
    handleLocationDragCancel,
    handleLocationDragDataChange,
    handleLocationDragEnd,
    handleLocationDragOver,
    isLocationDropEnabled,
  } = useBoardLocationDragState({
    actions: sourceProjection.actions,
    cardStates: projection.cardStates,
    cardsByInstanceId,
    movementDraft,
    onAcceptedMoveDrop: submitLocationDragMoveAction,
    onAcceptedPlayDrop: submitLocationDragPlayAction,
    onStageMovementDraftCard: chooseBoardTarget,
    onUnstageMovementDraftCard: chooseBoardTarget,
  });

  const isMovementDraftActive = Boolean(movementDraft);
  const canUseLocationDrag =
    !isInteractionSuspended &&
    !isSubmittingAction &&
    (!targetSelection || targetSelection.purpose === "move") &&
    !playerDecision &&
    !sourceProjection.pendingChoice &&
    !unitPlayChoice &&
    !isChainLockedOpen;

  const hiddenBoardCardInstanceIds = useMemo(() => {
    const hidden = new Set(activeTransferCardIds);
    for (const cardInstanceId of movementDraft?.hiddenCardInstanceIds ?? []) {
      hidden.add(cardInstanceId);
    }
    for (const cardInstanceId of activeLocationDragAttachmentIds) {
      hidden.add(cardInstanceId);
    }
    for (const cardInstanceId of placeholderCardInstanceIds) {
      hidden.add(cardInstanceId);
    }
    return hidden;
  }, [
    activeLocationDragAttachmentIds,
    activeTransferCardIds,
    movementDraft?.hiddenCardInstanceIds,
    placeholderCardInstanceIds,
  ]);

  const stagedMovementCardInstanceIds = useMemo(
    () => movementDraft?.stagedCardInstanceIds ?? new Set<string>(),
    [movementDraft],
  );

  const isMovementDraftDestination = useCallback(
    (location: BoardDropLocation) =>
      movementDraftDestination
        ? sameBoardLocation(movementDraftDestination, location)
        : false,
    [movementDraftDestination],
  );

  useEffect(() => {
    if (!isChainLockedOpen || !isChainOverlayOpen) {
      setHighlightedCardInstanceIds(new Set());
      setHoveredChainRelationships(null);
    }
  }, [isChainLockedOpen, isChainOverlayOpen]);

  useEffect(() => {
    closeCardActionMenu();
    clearSubmittedTargetHighlights();
  }, [
    clearSubmittedTargetHighlights,
    closeCardActionMenu,
    projection.stateVersion,
  ]);

  useEffect(() => {
    if (
      !effectSelectionAction ||
      (playerDecision?.kind === "cardSelection" &&
        playerDecision.actionId === effectSelectionAction.id)
    ) {
      return;
    }

    const requirement = combineTargetRequirements(
      effectSelectionAction,
      "card",
    );

    if (!requirement) {
      return;
    }

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
  }, [effectSelectionAction, playerDecision, setTargetSelection]);

  useEffect(() => {
    if (
      playerDecision?.kind === "cardSelection" &&
      targetSelection &&
      playerDecision.actionId !== targetSelection.actionId
    ) {
      setTargetSelection(null);
    }
  }, [playerDecision, setTargetSelection, targetSelection]);

  useEffect(() => {
    if (!decisionInspection.isInspecting) {
      return;
    }

    closeCardActionMenu();
    setOpenZone(null);

    if (!isChainLockedOpen) {
      setIsChainOverlayOpen(false);
    }
  }, [
    closeCardActionMenu,
    decisionInspection.isInspecting,
    isChainLockedOpen,
    setIsChainOverlayOpen,
  ]);

  const boardCardPrimaryAction = isInteractionSuspended
    ? undefined
    : isMovementDraftActive
      ? (card: Card) => chooseBoardTarget(card.instanceId)
      : handleBoardCardPrimaryAction;
  const boardCardPointerEnter = isInteractionSuspended
    ? undefined
    : handleTargetPointerEnter;
  const boardCardPointerLeave = isInteractionSuspended
    ? undefined
    : handleTargetPointerLeave;
  const canInspectPublicZones =
    decisionInspection.isInspecting &&
    decisionInspection.policy === "publicGameState";

  const openPlayerTrash = isReportMode
    ? undefined
    : decisionInspection.isInspecting
    ? canInspectPublicZones && board.player.zones.trash.count > 0
      ? () => decisionInspection.inspectZone(board.player.playerId, "trash")
      : undefined
    : () => setOpenZone("playerTrash");
  const openOpponentTrash = isReportMode
    ? undefined
    : decisionInspection.isInspecting
    ? canInspectPublicZones && board.opponent.zones.trash.count > 0
      ? () => decisionInspection.inspectZone(board.opponent.playerId, "trash")
      : undefined
    : () => setOpenZone("opponentTrash");
  const openPlayerBanishment = isReportMode
    ? undefined
    : decisionInspection.isInspecting
    ? canInspectPublicZones && board.player.zones.banishment.count > 0
      ? () =>
          decisionInspection.inspectZone(board.player.playerId, "banishment")
      : undefined
    : () => setOpenZone("banish");
  const openOpponentBanishment = isReportMode
    ? undefined
    : decisionInspection.isInspecting
    ? canInspectPublicZones && board.opponent.zones.banishment.count > 0
      ? () =>
          decisionInspection.inspectZone(board.opponent.playerId, "banishment")
      : undefined
    : () => setOpenZone("banish");

  const beginBugReport = useCallback(() => {
    const game = cloneViewerSafeProjection(sourceProjection);
    setBugReportDraft({
      actual: "",
      capturedAt: new Date().toISOString(),
      expected: "",
      game,
      notes: "",
      recentStates: projectionHistoryRef.current
        .filter((entry) => entry.stateVersion !== game.stateVersion)
        .map(cloneViewerSafeProjection),
      reportId: createBugReportId(),
      selectedCardInstanceIds: new Set(),
    });
    setFinalizedBugReport(null);
    setBugReportArtifactPath(null);
    setBugReportError(null);
  }, [projectionHistoryRef, sourceProjection]);

  const cancelBugReport = useCallback(() => {
    setBugReportDraft(null);
    setFinalizedBugReport(null);
    setBugReportArtifactPath(null);
    setBugReportError(null);
  }, []);

  const toggleBugReportCard = useCallback((instanceId: string) => {
    setBugReportDraft((current) => {
      if (!current || !findRelatedProjectedCard(current.game, instanceId)) {
        return current;
      }
      return {
        ...current,
        selectedCardInstanceIds: toggleRelatedProjectedCardSelection({
          instanceId,
          projection: current.game,
          selectedCardInstanceIds: current.selectedCardInstanceIds,
        }),
      };
    });
  }, []);

  const reportCardSelection = useMemo<ReportCardSelectionState>(
    () => ({
      isReportMode,
      selectedCardInstanceIds:
        bugReportDraft?.selectedCardInstanceIds ?? null,
      toggleCardInstanceId: toggleBugReportCard,
    }),
    [bugReportDraft?.selectedCardInstanceIds, isReportMode, toggleBugReportCard],
  );

  useEffect(() => {
    onReportCardSelectionChange?.(reportCardSelection);
  }, [onReportCardSelectionChange, reportCardSelection]);

  useEffect(
    () => () => onReportCardSelectionChange?.(null),
    [onReportCardSelectionChange],
  );

  const handleBoardClickCapture = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (!isInteractionSuspended) {
        handleTargetClickCapture(event);
      }
    },
    [handleTargetClickCapture, isInteractionSuspended],
  );

  const finalizeBugReport = useCallback(async () => {
    if (!bugReportDraft) return;
    const report = createStructuredBugReport({
      actual: bugReportDraft.actual,
      capturedAt: bugReportDraft.capturedAt,
      expected: bugReportDraft.expected,
      game: bugReportDraft.game,
      notes: bugReportDraft.notes,
      recentStates: bugReportDraft.recentStates,
      relatedCardInstanceIds: [...bugReportDraft.selectedCardInstanceIds],
      reportId: bugReportDraft.reportId,
    });
    setFinalizedBugReport(report);
    setIsSavingBugReport(true);
    setBugReportError(null);
    try {
      setBugReportArtifactPath(await persistStructuredBugReport(report));
    } catch (error) {
      setBugReportError(
        error instanceof Error
          ? error.message
          : "Copy or export the finalized report instead.",
      );
    } finally {
      setIsSavingBugReport(false);
    }
  }, [bugReportDraft]);

  const copyFinalizedBugReport = useCallback(async () => {
    if (!finalizedBugReport) return;
    await copyText(serializeStructuredBugReport(finalizedBugReport));
  }, [finalizedBugReport]);

  const exportFinalizedBugReport = useCallback(() => {
    if (!finalizedBugReport) return;
    const blob = new Blob([`${serializeStructuredBugReport(finalizedBugReport)}\n`], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `bug-report-${finalizedBugReport.match.gameId}-v${finalizedBugReport.match.stateVersion}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [finalizedBugReport]);

  return (
    <ReportCardSelectionProvider
      {...reportCardSelection}
    >
    <main
      className="relative grid h-dvh grid-rows-[auto_minmax(0,1fr)_7rem] overflow-hidden text-slate-100 game-board"
      onClickCapture={handleBoardClickCapture}
    >
      <div className="relative">
        <ScoreHeader
          matchContext={matchContext}
          opponent={board.opponent}
          player={board.player}
          turn={projection.turn}
          victoryScore={projection.victoryScore}
        />
      </div>
      <PlayerDecisionHost
        cardsByInstanceId={cardsByInstanceId}
        decision={playerDecision}
        interactionSuspended={isInteractionSuspended}
        isPromptVisible={!decisionInspection.isInspecting}
        isSubmitting={isSubmittingAction}
        onCancel={() => {
          if (!isInteractionSuspended) setTargetSelection(null);
        }}
        onBeginEffectPlay={(actionId) => {
          const action = sourceProjection.actions.find(
            (candidate) => candidate.id === actionId,
          );
          const cardInstanceId = action?.sourceCardInstanceId;
          const stagedCard = cardInstanceId
            ? buildCard(cardInstanceId, cardsByInstanceId, projection.cardStates)[0]
            : undefined;
          if (stagedCard) beginPlayOrTargetSelection(stagedCard, actionId);
        }}
        onInspect={
          !isInteractionSuspended && decisionInspection.canInspect
            ? decisionInspection.inspectBoard
            : undefined
        }
        onIntent={async (intent) => {
          const accepted = await submitProjectedAction(
            intent.actionId,
            intent.selectedIds ?? [],
            intent.allocations,
            undefined,
            intent.tokenPlacements,
          );
          if (accepted && targetSelection?.actionId === intent.actionId) {
            setTargetSelection(null);
          }
          return accepted;
        }}
      />
      {decisionInspection.isInspecting && !isReportMode && (
        <DecisionInspectionToolbar
          decisionTitle={decisionInspection.decisionTitle}
          onInspectZone={decisionInspection.inspectZone}
          onReturnToDecision={decisionInspection.returnToDecision}
          opponent={board.opponent}
          player={board.player}
          policy={decisionInspection.policy}
        />
      )}
      {decisionInspection.state.mode === "zone" && !isReportMode && (
        <DecisionZoneBrowser
          inspectedZone={decisionInspection.state}
          onClose={decisionInspection.closeZone}
          onInspectZone={decisionInspection.inspectZone}
          opponent={board.opponent}
          player={board.player}
        />
      )}
      {showdownPrompt &&
        !isInteractionSuspended &&
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
      <section className="flex min-h-0 overflow-hidden">
        <LocationDragProvider
          activeDragData={activeLocationDrag}
          dragOverlay={activeLocationDragOverlay}
          onActiveDragDataChange={
            isInteractionSuspended
              ? () => undefined
              : handleLocationDragDataChange
          }
          onDragCancel={
            isInteractionSuspended ? () => undefined : handleLocationDragCancel
          }
          onDragEnd={
            isInteractionSuspended ? () => undefined : handleLocationDragEnd
          }
          onDragOver={
            isInteractionSuspended ? () => undefined : handleLocationDragOver
          }
        >
          <div className="flex-1 gap-2 grid grid-rows-[minmax(120px,0.9fr)_minmax(180px,1.4fr)_minmax(120px,0.9fr)] p-2 pb-0 min-w-0 min-h-0 overflow-hidden">
            <div className="gap-1 grid grid-rows-2 min-h-0">
              <PlayerBoard
              highlightedCardInstanceIds={displayedHighlightedCardInstanceIds}
              hiddenCardInstanceIds={hiddenBoardCardInstanceIds}
              onBoardCardPrimaryAction={boardCardPrimaryAction}
              onBoardCardPointerEnter={boardCardPointerEnter}
              onBoardCardPointerLeave={boardCardPointerLeave}
              onOpenBanish={openOpponentBanishment}
              onOpenTrash={openOpponentTrash}
              player={board.opponent}
              isActivePlayer={isOpponentActive}
              isBaseHighlighted={hoveredChainRelationships?.basePlayerIds.includes(board.opponent.playerId)}
              isMirrored
              />
            </div>
            <LayoutGroup id="battlefield-showdown-layout">
              <div className="flex gap-2 min-h-0">
                <BattlefieldBoard
                  battlefield={board.playerBattlefield}
                  highlightedCardInstanceIds={
                    displayedHighlightedCardInstanceIds
                  }
                  hiddenCardInstanceIds={hiddenBoardCardInstanceIds}
                  isHighlighted={
                    Boolean(hoveredChainRelationships?.battlefieldIds.includes(board.playerBattlefield.id)) ||
                    (hoveredBoardLocation?.kind === "battlefield" &&
                      hoveredBoardLocation.battlefieldId ===
                        board.playerBattlefield.id) ||
                    isMovementDraftDestination({
                      kind: "battlefield",
                      battlefieldId: board.playerBattlefield.id,
                    })
                  }
                  onCardPrimaryAction={boardCardPrimaryAction}
                  onCardPointerEnter={boardCardPointerEnter}
                  onCardPointerLeave={boardCardPointerLeave}
                  owner="player"
                  showdownState={board.playerBattlefieldShowdownState}
                  enablePlayerUnitLocationDrag={canUseLocationDrag}
                  stagedMovementCardInstanceIds={stagedMovementCardInstanceIds}
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
                  hiddenCardInstanceIds={hiddenBoardCardInstanceIds}
                  isHighlighted={
                    Boolean(hoveredChainRelationships?.battlefieldIds.includes(board.opponentBattlefield.id)) ||
                    (hoveredBoardLocation?.kind === "battlefield" &&
                      hoveredBoardLocation.battlefieldId ===
                        board.opponentBattlefield.id) ||
                    isMovementDraftDestination({
                      kind: "battlefield",
                      battlefieldId: board.opponentBattlefield.id,
                    })
                  }
                  enablePlayerUnitLocationDrag={canUseLocationDrag}
                  stagedMovementCardInstanceIds={stagedMovementCardInstanceIds}
                  onCardPrimaryAction={boardCardPrimaryAction}
                  onCardPointerEnter={boardCardPointerEnter}
                  onCardPointerLeave={boardCardPointerLeave}
                  owner="opponent"
                  showdownState={board.opponentBattlefieldShowdownState}
                  dropStatus={getLocationDropStatus({
                    kind: "battlefield",
                    battlefieldId: board.opponentBattlefield.id,
                  })}
                  isLocationDropEnabled={isLocationDropEnabled}
                />
              </div>
            </LayoutGroup>
            <div className="gap-1 grid grid-rows-2 min-h-0">
              <PlayerBoard
              highlightedCardInstanceIds={displayedHighlightedCardInstanceIds}
              hiddenCardInstanceIds={hiddenBoardCardInstanceIds}
              isBaseHighlighted={
                Boolean(hoveredChainRelationships?.basePlayerIds.includes(board.player.playerId)) ||
                hoveredBoardLocation?.kind === "base" ||
                isMovementDraftDestination({ kind: "base" })
              }
              onOpenBanish={openPlayerBanishment}
              onOpenTrash={openPlayerTrash}
              onChampionContextAction={
                isInteractionSuspended || isMovementDraftActive
                  ? undefined
                  : handleChampionCardAction
              }
              onChampionPrimaryAction={
                isInteractionSuspended || isMovementDraftActive
                  ? undefined
                  : handleChampionCardAction
              }
              onBoardCardPrimaryAction={boardCardPrimaryAction}
              onBoardCardPointerEnter={boardCardPointerEnter}
              onBoardCardPointerLeave={boardCardPointerLeave}
              onRuneContextAction={
                isInteractionSuspended || isMovementDraftActive
                  ? undefined
                  : handleRuneContextAction
              }
              onRunePrimaryAction={
                isInteractionSuspended || isMovementDraftActive
                  ? undefined
                  : handleRunePrimaryAction
              }
              player={board.player}
              isActivePlayer={isPlayerActive}
              enableLocationDrag={canUseLocationDrag}
              stagedMovementCardInstanceIds={stagedMovementCardInstanceIds}
              baseDropStatus={getLocationDropStatus({ kind: "base" })}
              isLocationDropEnabled={isLocationDropEnabled}
              />
            </div>
          </div>
          <MovementDraftStage
            canDrag={canUseLocationDrag}
            hiddenCardInstanceIds={activeTransferCardIds}
            movementDraft={movementDraft}
            onCardPrimaryAction={boardCardPrimaryAction}
            onCardPointerEnter={boardCardPointerEnter}
            onCardPointerLeave={boardCardPointerLeave}
          />
        </LocationDragProvider>
        <ActionRail
          concedeDisabled={isSubmittingAction || isMovementDraftActive}
          disabled={isInteractionSuspended || isMovementDraftActive}
          isChainOpen={isChainOverlayOpen}
          isChainLockedOpen={isChainLockedOpen}
          isReporting={Boolean(bugReportDraft)}
          onChainOpenChange={
            isInteractionSuspended || isMovementDraftActive
              ? () => undefined
              : setIsChainOverlayOpen
          }
          onConcede={
            !isInteractionSuspended && !isMovementDraftActive && concedeAction
              ? onConcede
              : undefined
          }
          debugAction={
            process.env.NODE_ENV === "development" && debugDrawAction
              ? {
                  disabled:
                    !debugDrawAction.enabled ||
                    isSubmittingAction ||
                    isInteractionSuspended ||
                    isMovementDraftActive,
                  disabledReason: debugDrawAction.disabledReason,
                  label: debugDrawAction.label,
                }
              : undefined
          }
          onDebugAction={
            process.env.NODE_ENV === "development" && debugDrawAction
              ? () => void submitProjectedAction(debugDrawAction.id)
              : undefined
          }
          onPassTurn={
            isInteractionSuspended || isMovementDraftActive
              ? undefined
              : passFocusAction
                ? onPass
                : onEndTurn
          }
          onReportBug={beginBugReport}
          openZone={openZone}
          passTurnDisabled={!canViewerEndTurn || isSubmittingAction || isMovementDraftActive}
          passTurnLabel={isSubmittingAction ? "Submitting…" : passTurnLabel}
          setOpenZone={setOpenZone}
        />
      </section>
      <section
        aria-label="Player context"
        className="relative z-20 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 border-t border-white/10 bg-slate-950/45 px-4 py-2 supports-backdrop-filter:bg-slate-950/25 supports-backdrop-filter:backdrop-blur-md"
      >
        <div className="z-10 relative min-w-0 max-w-full">
          <PlayerHudPlate
            matchScore={
              matchContext?.scoreByPlayerId[board.player.playerId] ?? undefined
            }
            name={board.player.name}
            seat="player"
          />
        </div>
        <div className="z-10 relative justify-self-end min-w-0 max-w-full">
          <RunePoolBar runePool={viewerState?.runePool} />
        </div>
        <PlayerHandFan
          cards={board.player.zones.hand.cards}
          hiddenCardInstanceIds={activeTransferCardIds}
          onCardContextAction={
            isInteractionSuspended || isMovementDraftActive
              ? undefined
              : handleCardContextFromHand
          }
          onPlayCard={
            isInteractionSuspended || isMovementDraftActive
              ? undefined
              : handlePlayCardFromHand
          }
          interactionSuspended={isInteractionSuspended || isMovementDraftActive}
          onTuck={closeCardActionMenu}
          playerId={board.player.playerId}
        />
      </section>
      {!isInteractionSuspended && !isMovementDraftActive && globalActions.length > 0 && (
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
      <PublicRevealWindow key={sourceProjection.id} reveals={sourceProjection.publicReveals} />
      <ChainOverlay
        canPassPriority={!isInteractionSuspended && !isMovementDraftActive && canViewerPassChain}
        chainCards={chainCards}
        highlightedChainIds={hoveredChainRelationships?.chainIds ?? []}
        chainPassLabel={isSubmittingAction ? "Submitting…" : chainPassLabel}
        isCloseDisabled={isChainLockedOpen || isInteractionSuspended || isMovementDraftActive}
        interactionSuspended={isInteractionSuspended || isMovementDraftActive}
        isOpen={isChainOverlayOpen}
        isSubmittingAction={
          isSubmittingAction || isInteractionSuspended || isMovementDraftActive
        }
        onClose={() => {
          if (!isInteractionSuspended && !isMovementDraftActive) setIsChainOverlayOpen(false);
        }}
        onItemPointerEnter={
          isInteractionSuspended || isMovementDraftActive
            ? undefined
            : (targetCardInstanceIds, relationships) => {
                setHighlightedCardInstanceIds(new Set(targetCardInstanceIds));
                setHoveredChainRelationships(relationships ?? null);
              }
        }
        onItemPointerLeave={
          isInteractionSuspended || isMovementDraftActive
            ? undefined
            : () => { setHighlightedCardInstanceIds(new Set()); setHoveredChainRelationships(null); }
        }
        onPassPriority={
          isInteractionSuspended || isMovementDraftActive ? undefined : onPassPriority
        }
        priorityWindowKey={`${projection.stateVersion}:${passPriorityAction?.id ?? "none"}`}
      />
      <TemporaryZoneOverlay
        enableCloseShortcut={!isInteractionSuspended && !isMovementDraftActive}
        interactionSuspended={isInteractionSuspended || isMovementDraftActive}
        logEntries={logEntries}
        onClose={() => {
          if (!isInteractionSuspended && !isMovementDraftActive) setOpenZone(null);
        }}
        onCardContextAction={isInteractionSuspended || isMovementDraftActive ? undefined : handleCardContextFromHand}
        onCardPrimaryAction={
          isInteractionSuspended || isMovementDraftActive
            ? undefined
            : (card, event) =>
                event
                  ? handleCardContextFromHand(card, event)
                  : handlePlayCardFromHand(card)
        }
        openZone={openZone}
        opponentBanishment={board.opponent.zones.banishment}
        opponentTrash={board.opponent.zones.trash}
        placement={isChainOverlayOpen ? "secondary" : "primary"}
        playerBanishment={board.player.zones.banishment}
        playerTrash={board.player.zones.trash}
      />

      {!isInteractionSuspended &&
        (targetSelection?.targetKind === "card" || targetSelection?.targetKind === "payment") &&
        !targetSelectionUsesCardPrompt && (
          <TargetSelectionPrompt
            canCancel={targetSelection.purpose !== "choice" || targetSelection.minTargets === 0}
            canSubmit={
              !isSubmittingAction &&
              targetSelectionIsLegal(
                targetSelection.requirement,
                targetSelection.selectedTargetIds,
              ) &&
              (Boolean(targetSelection.followUpLocationRequirement) || stagedTargetsAreCurrent(targetSelection, targetSelectionAction)) &&
              missingDeflectPower === 0 &&
              Boolean(targetSelectionAction?.enabled) &&
              targetSelectionAction?.poolPayment?.canPay !== false
            }
            costPreview={
              targetSelectionAction?.costPreview
                ? {
                    additionalPower: selectedDeflectPower,
                    availableAnyPower:
                      targetSelectionAction.costPreview.availableAnyPower,
                    basePower: targetSelectionAction.costPreview.basePower,
                    effectivePower:
                      targetSelectionAction.costPreview.effectivePower,
                    energy: targetSelectionAction.costPreview.energy,
                    printedEnergy:
                      targetSelectionAction.costPreview.printedEnergy,
                    printedPower:
                      targetSelectionAction.costPreview.printedPower,
                    sourceNames: selectedDeflectSources.map(
                      (source) =>
                        cardsByInstanceId[source.targetId]?.name ??
                        "Unknown permanent",
                    ),
                  }
                : undefined
            }
            poolPayment={targetSelection.preparingPayment || targetSelectionAction?.poolPayment?.mode !== "card"
              ? targetSelectionAction?.poolPayment : undefined}
            maxTargets={targetSelection.maxTargets}
            minTargets={targetSelection.minTargets}
            isSubmitting={isSubmittingAction}
            onCancel={() => {
              if (targetSelection.purpose === "choice" && targetSelection.minTargets === 0) {
                void submitTargetedPlay({ ...targetSelection, selectedTargetIds: [] });
              } else if (targetSelection.purpose !== "choice") setTargetSelection(null);
            }}
            onSubmit={() => submitTargetedPlay()}
            selectedCount={targetSelection.selectedTargetIds.length}
            cancelLabel={
              targetSelection.purpose === "move"
                ? "Cancel move"
                : targetSelection.purpose === "choice"
                  ? targetSelection.minTargets === 0 ? "Decline" : "Choose a target"
                  : "Cancel"
            }
            confirmLabel={
              targetSelectionAction?.poolPayment
                ? targetSelectionAction.label
                : targetSelectionHasOptionalCost(targetSelection)
                ? targetSelection.selectedTargetIds.length > 0
                  ? "Exhaust unit"
                  : "Decline"
                : targetSelection.purpose === "move"
                  ? "Confirm move"
                  : targetSelection.purpose === "choice"
                    ? "Confirm"
                    : "Play"
            }
            title={
              targetSelectionAction?.poolPayment
                ? targetSelectionAction.label
                : targetSelection.targetGroups
                  ? `Choose ${targetSelection.requirement.requirements.find((requirement) => requirement.label)?.label ?? "a target"}`
                : targetSelection.purpose === "move"
                ? moveSelectionTitle(
                    sourceProjection.actions.find(
                      (action) => action.id === targetSelection.actionId,
                    ),
                    sourceProjection.battlefields,
                  )
                : targetSelection.purpose === "choice"
                  ? effectSelectionAction?.label
                  : targetSelectionHasOptionalCost(targetSelection)
                    ? optionalCostTitle(targetSelectionAction?.label)
                    : undefined
            }
            helperText={
              targetSelectionHasOptionalCost(targetSelection)
                ? "Exhaust a ready friendly unit to draw 2. Decline to draw 1 instead."
                : targetSelection.purpose === "move"
                ? "Drag or click additional units to include them, then confirm the move."
                  : targetSelection.targetGroups
                    ? `Execution ${(targetSelection.activeTargetGroupIndex ?? 0) + 1} of ${targetSelection.targetGroups.length}`
                  : undefined
            }
          />
        )}
      {targetSelection?.targetKind === "battlefield" && (
        <ReportCardChoiceDialog
          confirmLabel="Choose battlefield"
          decisionKey={`battlefield:${targetSelection.actionId}`}
          description="Choose the battlefield affected by this action."
          headerAction={
            decisionInspection.request?.source === "battlefieldChoice" ? (
              <DecisionInspectionTrigger
              onInspect={
                isInteractionSuspended
                  ? () => undefined
                  : decisionInspection.inspectBoard
              }
              />
            ) : undefined
          }
          interactionSuspended={isInteractionSuspended}
          isOpen
          isSubmitting={isSubmittingAction}
          isVisible={!decisionInspection.isInspecting}
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
              diagnosticCardInstanceId: battlefield.card.instanceId,
              id: battlefield.battlefieldId,
              imageOrientation: "landscape" as const,
              imageUrl: battlefield.card.imageUrl ?? undefined,
              label: battlefield.card.name,
            }))}
          selectionMode="single"
          title="Choose a Battlefield"
        />
      )}
      {targetSelection?.targetKind === "location" && (
        <ReportCardChoiceDialog
          confirmLabel="Choose destination"
          decisionKey={`location:${targetSelection.actionId}`}
          description="Choose the location where the selected unit will move."
          headerAction={<DecisionInspectionTrigger onInspect={decisionInspection.inspectBoard} />}
          interactionSuspended={isInteractionSuspended}
          isOpen
          isSubmitting={isSubmittingAction}
          isVisible={!decisionInspection.isInspecting}
          onCancel={() => setTargetSelection(null)}
          onConfirm={(selectedIds) =>
            submitTargetedPlay({
              ...targetSelection,
              selectedTargetIds: selectedIds,
            })
          }
          options={targetSelection.legalTargetIds.map((id) => {
            const optionLabels = targetSelection.requirement.requirements
              .flatMap((requirement) =>
                requirement.optionLabels
                  ? [[id, requirement.optionLabels[id]] as const]
                  : [],
              )
              .find(([, label]) => Boolean(label));
            const battlefield = sourceProjection.battlefields.find(
              (candidate) => candidate.battlefieldId === id,
            );
            return {
              description:
                id === "base"
                  ? "Move to the selected unit's Base."
                  : "Move to this battlefield.",
              diagnosticCardInstanceId: battlefield?.card.instanceId,
              id,
              imageOrientation: battlefield ? ("landscape" as const) : undefined,
              imageUrl: battlefield?.card.imageUrl ?? undefined,
              label: optionLabels?.[1] ?? battlefield?.card.name ?? id,
            };
          })}
          selectionMode="single"
          title="Choose a Move Destination"
        />
      )}
      {!isInteractionSuspended && !isMovementDraftActive && unitPlayChoice && (
        <ReportCardChoiceDialog
          confirmLabel="Play card"
          description="Choose a destination or payment option for this card."
          headerAction={
            decisionInspection.request?.source === "unitPlayChoice" ? (
              <DecisionInspectionTrigger
                onInspect={decisionInspection.inspectBoard}
              />
            ) : undefined
          }
          isOpen
          isSubmitting={isSubmittingAction}
          onCancel={() => setUnitPlayChoice(null)}
          onConfirm={([actionId]) => {
            const card = unitPlayChoice.card;
            setUnitPlayChoice(null);
            if (actionId) beginPlayOrTargetSelection(card, actionId);
          }}
          options={unitPlayChoice.modes.map((mode) => ({
            labelContent: <PlayableCardMenuLabel mode={mode} />,
            disabled: !mode.enabled,
            id: mode.id,
            label: mode.enabled
              ? mode.label
              : `${mode.label} (${mode.disabledReason ?? "unavailable"})`,
          }))}
          selectionMode="single"
          title={`Choose how to play ${unitPlayChoice.card.name}`}
        />
      )}
      <CardZoneTransferOverlay
        activeTransferStartRects={activeTransferStartRects}
        onActiveCardIdsChange={handleActiveTransferCardIdsChange}
        onActiveSourceReservationsChange={handleActiveSourceReservationsChange}
        onPendingSnapshotConsumed={() => setPendingAnimationSnapshot(null)}
        onTransferStartRectsConsumed={consumeTransferStartRects}
        pendingSnapshot={pendingAnimationSnapshot}
        placements={animationData.placements}
        stateVersion={projection.stateVersion}
        zoneCounts={animationData.zoneCounts}
      />
      {cardActionMenu && !isInteractionSuspended && !isMovementDraftActive && (
        <CardActionMenu
          items={cardActionMenu.items}
          left={cardActionMenu.left}
          onClose={closeCardActionMenu}
          onItemHighlight={setCardActionMenuHighlight}
          onItemHighlightEnd={clearCardActionMenuHighlight}
          top={cardActionMenu.top}
        />
      )}
    </main>
    <BugReportPanel
      artifactPath={bugReportArtifactPath}
      draft={
        bugReportDraft
          ? {
              actual: bugReportDraft.actual,
              expected: bugReportDraft.expected,
              notes: bugReportDraft.notes,
              selectedCardCount: bugReportDraft.selectedCardInstanceIds.size,
              stateVersion: bugReportDraft.game.stateVersion,
            }
          : null
      }
      error={bugReportError}
      isSaving={isSavingBugReport}
      onActualChange={(actual) =>
        setBugReportDraft((current) => current ? { ...current, actual } : current)
      }
      onCancel={cancelBugReport}
      onCopy={copyFinalizedBugReport}
      onExpectedChange={(expected) =>
        setBugReportDraft((current) => current ? { ...current, expected } : current)
      }
      onExport={exportFinalizedBugReport}
      onFinalize={finalizeBugReport}
      onNotesChange={(notes) =>
        setBugReportDraft((current) => current ? { ...current, notes } : current)
      }
      report={finalizedBugReport}
    />
    </ReportCardSelectionProvider>
  );
};

function createBugReportId() {
  return globalThis.crypto?.randomUUID?.() ?? `report-${Date.now()}`;
}

function targetSelectionHasOptionalCost(
  targetSelection: NonNullable<
    ReturnType<typeof useBoardTargetSelection>["targetSelection"]
  >,
) {
  return targetSelection.requirement.requirements.some(
    (requirement) => requirement.selectionPurpose === "optionalCost",
  );
}

function optionalCostTitle(actionLabel: string | undefined) {
  const cardName = actionLabel?.replace(/^Play\s+/i, "").trim();
  return cardName ? `${cardName} - Optional Cost` : "Optional Cost";
}

function sourceReservationsEqual(
  left: readonly CardZoneSourceReservation[],
  right: readonly CardZoneSourceReservation[],
) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((reservation, index) => {
    const candidate = right[index];
    return (
      candidate !== undefined &&
      reservation.attachmentCount === candidate.attachmentCount &&
      reservation.cardInstanceId === candidate.cardInstanceId &&
      reservation.slotIndex === candidate.slotIndex &&
      reservation.sourceExhausted === candidate.sourceExhausted &&
      reservation.zoneId === candidate.zoneId
    );
  });
}
