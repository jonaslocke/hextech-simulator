"use client";

import { ChoiceDialog } from "@/shared/components/choice-dialog";
import type { GameProjection } from "@/shared/game";
import { LayoutGroup } from "motion/react";
import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import cardBackImage from "../../../assets/cardback.jpg";
import { areSetsEqual, createAnimationData } from "./board-animation-model";
import { buildCard, createBoardModel } from "./board-model";
import { adaptProjectionToBoard } from "./board-view-model";
import { ActionRail } from "./components/action-rail";
import { BattlefieldBoard } from "./components/battlefield-board";
import { CardActionMenu } from "./components/card-action-menu";
import { DecisionInspectionToolbar } from "./components/decision-inspection-toolbar";
import { DecisionInspectionTrigger } from "./components/decision-inspection-trigger";
import { DecisionZoneBrowser } from "./components/decision-zone-browser";
import {
  CardZoneAnimationSnapshot,
  CardZoneTransferOverlay,
  captureCardZoneAnimationSnapshot,
} from "./components/card-zone-transfer-overlay";
import { ChainOverlay } from "./components/chain-overlay";
import { PlayerBoard } from "./components/player-board";
import { PlayerHandFan } from "./components/player-hand-fan";
import { RunePoolBar } from "./components/rune-pool-bar";
import { ScoreHeader, type MatchHudContext } from "./components/score-header";
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
import { useBoardTargetSelection } from "./interactions/use-board-target-selection";
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
  activeTargetRequirement,
  combineTargetRequirements,
  moveSelectionTitle,
  showdownPromptState,
  targetSelectionIsLegal,
} from "./model";
import { Card, ChainCardEntry, TemporaryZone } from "./types";

type GameBoardProps = {
  isSubmittingAction?: boolean;
  onPerformAction: (input: {
    actionId: string;
    selectedIds: string[];
    allocations?: Array<{ targetUnitId: string; amount: number }>;
    tokenPlacements?: Array<{ destinationId: string; count: number }>;
  }) => Promise<boolean>;
  playerNames?: Partial<Record<string, string>>;
  projection: GameProjection;
  scores?: Partial<Record<string, number>>;
  matchContext?: MatchHudContext;
};

export const GameBoard: FC<GameBoardProps> = ({
  isSubmittingAction = false,
  onPerformAction,
  playerNames = {},
  projection: sourceProjection,
  scores = {},
  matchContext,
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
  const interactionLockedRef = useRef(false);
  const submitProjectedAction = useCallback(
    (
      actionId: string | undefined,
      selectedIds: string[] = [],
      allocations?: Array<{ targetUnitId: string; amount: number }>,
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
  const [pendingAnimationSnapshot, setPendingAnimationSnapshot] =
    useState<CardZoneAnimationSnapshot | null>(null);
  const [unitPlayChoice, setUnitPlayChoice] =
    useState<GameBoardUnitPlayChoice>(null);
  const [highlightedCardInstanceIds, setHighlightedCardInstanceIds] = useState<
    Set<string>
  >(new Set());

  const board = createBoardModel({
    cardsByInstanceId,
    playerNames,
    projection,
    scores,
  });

  const animationData = useMemo(() => createAnimationData(board), [board]);

  const capturePendingAnimationSnapshot = useCallback(() => {
    setPendingAnimationSnapshot(
      captureCardZoneAnimationSnapshot({
        placements: animationData.placements,
        stateVersion: projection.stateVersion,
        zoneCounts: animationData.zoneCounts,
      }),
    );
  }, [animationData, projection.stateVersion]);

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
    highlightedCardInstanceIds,
    submitProjectedAction,
  });

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
  });
  const decisionInspection = useDecisionInspection({
    request: decisionInspectionRequest,
  });
  interactionLockedRef.current = decisionInspection.isInspecting;
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
            targetLabels: item.targetCardInstanceIds.map(
              (id) => cardsByInstanceId[id]?.name ?? "Unknown target",
            ),
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
          targetLabels: item.targetCardInstanceIds.map(
            (id) => cardsByInstanceId[id]?.name ?? "Unknown target",
          ),
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
    activeLocationDragOverlay,
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
    onAcceptedMoveDrop: submitLocationDragMoveAction,
    onAcceptedPlayDrop: submitLocationDragPlayAction,
  });

  const movementDraftDestination =
    targetSelection?.purpose === "move"
      ? (targetSelectionAction?.presentation.boardLocation ?? null)
      : null;

  const canUseLocationDrag =
    !decisionInspection.isInspecting &&
    !isSubmittingAction &&
    !targetSelection &&
    !playerDecision &&
    !sourceProjection.pendingChoice &&
    !unitPlayChoice &&
    !isChainLockedOpen;

  const stagedMovementCardInstanceIds = useMemo(
    () =>
      targetSelection?.purpose === "move"
        ? new Set(targetSelection.selectedTargetIds)
        : new Set<string>(),
    [targetSelection?.purpose, targetSelection?.selectedTargetIds],
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
    setUnitPlayChoice(null);

    if (!isChainLockedOpen) {
      setIsChainOverlayOpen(false);
    }
  }, [
    closeCardActionMenu,
    decisionInspection.isInspecting,
    isChainLockedOpen,
    setIsChainOverlayOpen,
  ]);

  const boardCardPrimaryAction = decisionInspection.isInspecting
    ? undefined
    : handleBoardCardPrimaryAction;
  const boardCardPointerEnter = decisionInspection.isInspecting
    ? undefined
    : handleTargetPointerEnter;
  const boardCardPointerLeave = decisionInspection.isInspecting
    ? undefined
    : handleTargetPointerLeave;
  const canInspectPublicZones =
    decisionInspection.isInspecting &&
    decisionInspection.policy === "publicGameState";

  const openPlayerTrash = decisionInspection.isInspecting
    ? canInspectPublicZones && board.player.zones.trash.count > 0
      ? () => decisionInspection.inspectZone(board.player.playerId, "trash")
      : undefined
    : () => setOpenZone("playerTrash");
  const openOpponentTrash = decisionInspection.isInspecting
    ? canInspectPublicZones && board.opponent.zones.trash.count > 0
      ? () => decisionInspection.inspectZone(board.opponent.playerId, "trash")
      : undefined
    : () => setOpenZone("opponentTrash");
  const openPlayerBanishment = decisionInspection.isInspecting
    ? canInspectPublicZones && board.player.zones.banishment.count > 0
      ? () =>
          decisionInspection.inspectZone(board.player.playerId, "banishment")
      : undefined
    : () => setOpenZone("banish");
  const openOpponentBanishment = decisionInspection.isInspecting
    ? canInspectPublicZones && board.opponent.zones.banishment.count > 0
      ? () =>
          decisionInspection.inspectZone(board.opponent.playerId, "banishment")
      : undefined
    : () => setOpenZone("banish");

  return (
    <main
      className="relative flex flex-col h-screen overflow-hidden text-slate-100 game-board"
      onClickCapture={
        decisionInspection.isInspecting ? undefined : handleTargetClickCapture
      }
    >
      <ScoreHeader
        matchContext={matchContext}
        opponent={board.opponent}
        player={board.player}
        victoryScore={projection.victoryScore}
      />
      <PlayerDecisionHost
        cardsByInstanceId={cardsByInstanceId}
        decision={playerDecision}
        interactionSuspended={decisionInspection.isInspecting}
        isPromptVisible={!decisionInspection.isInspecting}
        isSubmitting={isSubmittingAction}
        onCancel={() => setTargetSelection(null)}
        onInspect={
          decisionInspection.canInspect
            ? decisionInspection.inspectBoard
            : undefined
        }
        onIntent={async (intent) => {
          const accepted = await submitProjectedAction(
            intent.actionId,
            intent.selectedIds ?? [],
            intent.allocations,
            intent.tokenPlacements,
          );
          if (accepted && targetSelection?.actionId === intent.actionId) {
            setTargetSelection(null);
          }
          return accepted;
        }}
      />
      {decisionInspection.isInspecting && (
        <DecisionInspectionToolbar
          decisionTitle={decisionInspection.decisionTitle}
          onInspectZone={decisionInspection.inspectZone}
          onReturnToDecision={decisionInspection.returnToDecision}
          opponent={board.opponent}
          player={board.player}
          policy={decisionInspection.policy}
        />
      )}
      {decisionInspection.state.mode === "zone" && (
        <DecisionZoneBrowser
          inspectedZone={decisionInspection.state}
          onClose={decisionInspection.closeZone}
          onInspectZone={decisionInspection.inspectZone}
          opponent={board.opponent}
          player={board.player}
        />
      )}
      {showdownPrompt &&
        !decisionInspection.isInspecting &&
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
            onPassFocus={
              showdownPrompt.canPassFocus && !targetSelection
                ? onPass
                : undefined
            }
            priorityPlayerId={showdownPrompt.priorityPlayerId}
          />
        )}
      <section className="flex flex-1 min-h-0 overflow-hidden">
        <LocationDragProvider
          activeDragData={activeLocationDrag}
          dragOverlay={activeLocationDragOverlay}
          onActiveDragDataChange={handleLocationDragDataChange}
          onDragCancel={handleLocationDragCancel}
          onDragEnd={handleLocationDragEnd}
          onDragOver={handleLocationDragOver}
        >
          <div className="flex-1 gap-2 grid grid-rows-[minmax(96px,0.8fr)_minmax(0,1.2fr)_minmax(180px,2fr)_minmax(0,1.2fr)_minmax(96px,0.8fr)_48px] p-2 min-h-0 overflow-hidden">
            <PlayerBoard
              highlightedCardInstanceIds={displayedHighlightedCardInstanceIds}
              hiddenCardInstanceIds={activeTransferCardIds}
              onBoardCardPrimaryAction={boardCardPrimaryAction}
              onBoardCardPointerEnter={boardCardPointerEnter}
              onBoardCardPointerLeave={boardCardPointerLeave}
              onOpenBanish={openOpponentBanishment}
              onOpenTrash={openOpponentTrash}
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
                  hiddenCardInstanceIds={activeTransferCardIds}
                  isHighlighted={
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
            <PlayerBoard
              highlightedCardInstanceIds={displayedHighlightedCardInstanceIds}
              hiddenCardInstanceIds={activeTransferCardIds}
              isBaseHighlighted={
                hoveredBoardLocation?.kind === "base" ||
                isMovementDraftDestination({ kind: "base" })
              }
              onOpenBanish={openPlayerBanishment}
              onOpenTrash={openPlayerTrash}
              onChampionContextAction={
                decisionInspection.isInspecting
                  ? undefined
                  : handleChampionCardAction
              }
              onChampionPrimaryAction={
                decisionInspection.isInspecting
                  ? undefined
                  : handleChampionCardAction
              }
              onBoardCardPrimaryAction={boardCardPrimaryAction}
              onBoardCardPointerEnter={boardCardPointerEnter}
              onBoardCardPointerLeave={boardCardPointerLeave}
              onRuneContextAction={
                decisionInspection.isInspecting
                  ? undefined
                  : handleRuneContextAction
              }
              onRunePrimaryAction={
                decisionInspection.isInspecting
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
            <RunePoolBar runePool={viewerState?.runePool} />
          </div>
        </LocationDragProvider>
        <ActionRail
          concedeDisabled={isSubmittingAction}
          disabled={decisionInspection.isInspecting}
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
      {!decisionInspection.isInspecting && globalActions.length > 0 && (
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
        canPassPriority={!decisionInspection.isInspecting && canViewerPassChain}
        chainCards={chainCards}
        chainPassLabel={isSubmittingAction ? "Submitting…" : chainPassLabel}
        isCloseDisabled={isChainLockedOpen}
        interactionSuspended={decisionInspection.isInspecting}
        isOpen={isChainOverlayOpen}
        isSubmittingAction={
          isSubmittingAction || decisionInspection.isInspecting
        }
        onClose={() => setIsChainOverlayOpen(false)}
        onItemPointerEnter={(targetCardInstanceIds) =>
          setHighlightedCardInstanceIds(new Set(targetCardInstanceIds))
        }
        onItemPointerLeave={() => setHighlightedCardInstanceIds(new Set())}
        onPassPriority={onPassPriority}
        priorityWindowKey={`${projection.stateVersion}:${passPriorityAction?.id ?? "none"}`}
      />
      <TemporaryZoneOverlay
        enableCloseShortcut={!decisionInspection.isInspecting}
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
        onCardContextAction={
          decisionInspection.isInspecting
            ? undefined
            : handleCardContextFromHand
        }
        onPlayCard={
          decisionInspection.isInspecting ? undefined : handlePlayCardFromHand
        }
        onTuck={closeCardActionMenu}
        playerId={board.player.playerId}
      />
      {!decisionInspection.isInspecting &&
        targetSelection?.targetKind === "card" &&
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
            onCancel={() => {
              if (
                targetSelection.purpose === "choice" &&
                targetSelection.minTargets === 0
              ) {
                void submitTargetedPlay({
                  ...targetSelection,
                  selectedTargetIds: [],
                });
                return;
              }
              setTargetSelection(null);
            }}
            onSubmit={() => submitTargetedPlay()}
            selectedCount={targetSelection.selectedTargetIds.length}
            selectedTargetLabels={targetSelection.selectedTargetIds.map(
              (id) => cardsByInstanceId[id]?.name ?? "Unknown target",
            )}
            cancelLabel={
              targetSelection.purpose === "move"
                ? "Cancel move"
                : targetSelection.purpose === "choice"
                  ? targetSelection.minTargets === 0
                    ? "Decline"
                    : "Close"
                  : "Cancel"
            }
            confirmLabel={
              targetSelectionIsChoosingOptionalCost(targetSelection)
                ? targetSelectionHasChosenOptionalCost(targetSelection)
                  ? "Pay optional cost"
                  : "Pay normal cost"
                : targetSelection.purpose === "move"
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
                  : targetSelectionIsChoosingOptionalCost(targetSelection)
                    ? optionalCostTitle(targetSelectionAction?.label)
                    : undefined
            }
            helperText={
              targetSelectionIsChoosingOptionalCost(targetSelection)
                ? "Choose a card to pay the optional cost, or pay the normal cost."
                : targetSelection.purpose === "move"
                  ? "Click additional units to include them, then confirm the move."
                  : undefined
            }
          />
        )}
      {targetSelection?.targetKind === "battlefield" && (
        <ChoiceDialog
          confirmLabel="Choose battlefield"
          decisionKey={`battlefield:${targetSelection.actionId}`}
          description="Choose the battlefield affected by this action."
          headerAction={
            decisionInspection.request?.source === "battlefieldChoice" ? (
              <DecisionInspectionTrigger
                onInspect={decisionInspection.inspectBoard}
              />
            ) : undefined
          }
          interactionSuspended={decisionInspection.isInspecting}
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
              id: battlefield.battlefieldId,
              imageOrientation: "landscape" as const,
              imageUrl: battlefield.card.imageUrl ?? undefined,
              label: battlefield.card.name,
            }))}
          selectionMode="single"
          title="Choose a Battlefield"
        />
      )}
      {!decisionInspection.isInspecting && unitPlayChoice && (
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
      {cardActionMenu && !decisionInspection.isInspecting && (
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
            onItemHighlight={setCardActionMenuHighlight}
            onItemHighlightEnd={clearCardActionMenuHighlight}
            top={cardActionMenu.top}
          />
        </>
      )}
    </main>
  );
};

function targetSelectionIsChoosingOptionalCost(
  targetSelection: NonNullable<
    ReturnType<typeof useBoardTargetSelection>["targetSelection"]
  >,
) {
  return (
    activeTargetRequirement(
      targetSelection.requirement,
      targetSelection.selectedTargetIds,
    )?.selectionPurpose === "optionalCost"
  );
}

function targetSelectionHasChosenOptionalCost(
  targetSelection: NonNullable<
    ReturnType<typeof useBoardTargetSelection>["targetSelection"]
  >,
) {
  let cursor = 0;
  for (const requirement of targetSelection.requirement.requirements) {
    const selected = targetSelection.selectedTargetIds.slice(
      cursor,
      cursor + requirement.maximum,
    );
    if (requirement.selectionPurpose === "optionalCost" && selected.length > 0) {
      return true;
    }
    cursor += selected.length;
  }
  return false;
}

function optionalCostTitle(actionLabel: string | undefined) {
  const cardName = actionLabel?.replace(/^Play\s+/i, "").trim();
  return cardName ? `${cardName} - Optional Cost` : "Optional Cost";
}
