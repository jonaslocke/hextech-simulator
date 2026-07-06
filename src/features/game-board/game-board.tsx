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
import { ActionRail } from "./components/action-rail";
import { BattlefieldBoard } from "./components/battlefield-board";
import {
  CardZoneAnimationSnapshot,
  CardZonePlacement,
  CardZoneTransferOverlay,
  ZoneAnimationCount,
  captureCardZoneAnimationSnapshot,
} from "./components/card-zone-transfer-overlay";
import { PlayerBoard } from "./components/player-board";
import { PlayerHandFan } from "./components/player-hand-fan";
import { ScoreHeader } from "./components/score-header";
import { TargetSelectionPrompt } from "./components/target-selection-prompt";
import { ShowdownPrompt } from "./components/showdown-prompt";
import { TemporaryZoneOverlay } from "./components/temporary-zone-overlay";
import { PlayerDecisionHost } from "./decisions/player-decision-host";
import { usePlayerDecisionRequest } from "./decisions/use-player-decision-request";
import {
  adaptProjectionToBoard,
  type BoardCatalogCard,
  type BoardPlayerProjection,
  type BoardZoneProjection,
  type BoardProjection,
} from "./board-view-model";
import {
  chainOverlayZone,
  moveSelectionTitle,
  showdownPromptState,
  simultaneousMoveAction,
} from "./model";
import {
  BattlefieldData,
  Card,
  ChainCardEntry,
  PlayerData,
  TemporaryZone,
  ZoneData,
  ZoneKind,
} from "./types";
import { cn } from "@/shared/utils/cn";

type ProjectedBattlefield = BoardProjection["battlefields"][number];
type ProjectedPlayerState = BoardPlayerProjection;
type ProjectedZone = BoardZoneProjection;
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

type BattlefieldShowdownState = "neutral" | "open" | "deferred";
type BoardLocation =
  NonNullable<GameProjection["actions"][number]["presentation"]["boardLocation"]>;
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
  const [openZone, setOpenZone] = useState<TemporaryZone>(null);
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
  const isChainLockedOpen = (projection.chain?.items.length ?? 0) > 0;
  const wasChainLockedOpen = useRef(isChainLockedOpen);
  const canViewerPassChain =
    isChainLockedOpen &&
    sourceProjection.actions.some((action) => action.label === "Pass priority");
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
  const beginGlobalAction = (action: GameProjection["actions"][number]) => {
    const requirement = action.targets.find((target) => target.kind === "card");
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
  const setOpenZoneRespectingChain = (zone: TemporaryZone) => {
    if (isChainLockedOpen) {
      setOpenZone("chain");
      return;
    }

    setOpenZone(zone);
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
    const requirement = actionToSubmit.targets.find(
      (target) => target.kind === "card" || target.kind === "battlefield",
    );

    if (requirement && requirement.maximum > 0) {
      setTargetSelection({
        actionId: actionToSubmit.id,
        legalTargetIds: requirement.legalIds,
        maxTargets: requirement.maximum,
        minTargets: requirement.minimum,
        purpose: stagedMoveAction ? "move" : "play",
        selectedTargetIds: stagedMoveAction ? [card.instanceId] : [],
        targetKind: requirement.kind === "battlefield" ? "battlefield" : "card",
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

    const selectedTargetIds = targetSelection.selectedTargetIds.includes(
      cardInstanceId,
    )
      ? targetSelection.selectedTargetIds.filter((id) => id !== cardInstanceId)
      : [...targetSelection.selectedTargetIds, cardInstanceId].slice(
          0,
          targetSelection.maxTargets,
        );
    const nextSelection = {
      ...targetSelection,
      selectedTargetIds,
    };

    setTargetSelection(nextSelection);

    if (
      nextSelection.purpose === "play" &&
      nextSelection.minTargets === nextSelection.maxTargets &&
      selectedTargetIds.length === nextSelection.maxTargets &&
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

    if (selection.selectedTargetIds.length < selection.minTargets) {
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
    setOpenZone((currentZone) =>
      chainOverlayZone(
        currentZone,
        wasChainLockedOpen.current,
        isChainLockedOpen,
      ),
    );
    wasChainLockedOpen.current = isChainLockedOpen;
  }, [isChainLockedOpen]);

  useEffect(() => {
    if (!isChainLockedOpen || openZone !== "chain") {
      setHighlightedCardInstanceIds(new Set());
    }
  }, [isChainLockedOpen, openZone]);

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
    const requirement = effectSelectionAction.targets.find(
      (target) => target.kind === "card",
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
      className="relative flex flex-col h-screen overflow-hidden text-slate-100"
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
        <div className="flex-1 gap-2 grid grid-rows-[minmax(96px,0.8fr)_minmax(0,1.2fr)_minmax(180px,2fr)_minmax(0,1.2fr)_minmax(96px,0.8fr)_48px] p-2 min-h-0 overflow-hidden">
          <PlayerBoard
            highlightedCardInstanceIds={displayedHighlightedCardInstanceIds}
            hiddenCardInstanceIds={activeTransferCardIds}
            onBoardCardPrimaryAction={handleBoardCardPrimaryAction}
            onBoardCardPointerEnter={handleTargetPointerEnter}
            onBoardCardPointerLeave={handleTargetPointerLeave}
            onOpenBanish={() => setOpenZoneRespectingChain("banish")}
            onOpenTrash={() => setOpenZoneRespectingChain("opponentTrash")}
            player={board.opponent}
            isActivePlayer={isOpponentActive}
            isMirrored
          />
          <LayoutGroup id="battlefield-showdown-layout">
            <div className="flex gap-2 min-h-0">
              <BattlefieldBoard
                battlefield={board.playerBattlefield}
                highlightedCardInstanceIds={displayedHighlightedCardInstanceIds}
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
              />
              <BattlefieldBoard
                battlefield={board.opponentBattlefield}
                highlightedCardInstanceIds={displayedHighlightedCardInstanceIds}
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
              />
            </div>
          </LayoutGroup>
          <PlayerBoard
            highlightedCardInstanceIds={displayedHighlightedCardInstanceIds}
            hiddenCardInstanceIds={activeTransferCardIds}
            isBaseHighlighted={hoveredBoardLocation?.kind === "base"}
            onOpenBanish={() => setOpenZoneRespectingChain("banish")}
            onOpenTrash={() => setOpenZoneRespectingChain("playerTrash")}
            onChampionContextAction={handleChampionCardAction}
            onChampionPrimaryAction={handleChampionCardAction}
            onBoardCardPrimaryAction={handleBoardCardPrimaryAction}
            onBoardCardPointerEnter={handleTargetPointerEnter}
            onBoardCardPointerLeave={handleTargetPointerLeave}
            onRuneContextAction={handleRuneContextAction}
            onRunePrimaryAction={handleRunePrimaryAction}
            player={board.player}
            isActivePlayer={isPlayerActive}
          />
          <RunePoolBar runePool={viewerState?.runePool} />
        </div>
        <ActionRail
          isChainLockedOpen={isChainLockedOpen}
          onPassTurn={passFocusAction ? onPass : onEndTurn}
          openZone={openZone}
          passTurnDisabled={!canViewerEndTurn || isSubmittingAction}
          passTurnLabel={isSubmittingAction ? "Submitting…" : passTurnLabel}
          setOpenZone={setOpenZoneRespectingChain}
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
      <TemporaryZoneOverlay
        canPassChain={canViewerPassChain}
        chainCards={chainCards}
        chainPassLabel={isSubmittingAction ? "Submitting…" : chainPassLabel}
        isCloseDisabled={isChainLockedOpen}
        isSubmittingAction={isSubmittingAction}
        logEntries={logEntries}
        onClose={() => setOpenZoneRespectingChain(null)}
        onChainItemPointerEnter={(targetCardInstanceIds) =>
          setHighlightedCardInstanceIds(new Set(targetCardInstanceIds))
        }
        onChainItemPointerLeave={() => setHighlightedCardInstanceIds(new Set())}
        onPassChain={onPass}
        openZone={openZone}
        opponentBanishment={board.opponent.zones.banishment}
        opponentTrash={board.opponent.zones.trash}
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
              targetSelection.selectedTargetIds.length >=
                targetSelection.minTargets &&
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

function createAnimationData(board: ReturnType<typeof createBoardModel>): {
  placements: CardZonePlacement[];
  zoneCounts: ZoneAnimationCount[];
} {
  const placements: CardZonePlacement[] = [];
  const zoneCounts: ZoneAnimationCount[] = [];

  addPlayerAnimationData(board.player, placements, zoneCounts);
  addPlayerAnimationData(board.opponent, placements, zoneCounts);
  addBattlefieldAnimationData({
    battlefield: board.playerBattlefield,
    opponentPlayerId: board.opponent.playerId,
    placements,
    playerPlayerId: board.player.playerId,
    zoneCounts,
  });
  addBattlefieldAnimationData({
    battlefield: board.opponentBattlefield,
    opponentPlayerId: board.opponent.playerId,
    placements,
    playerPlayerId: board.player.playerId,
    zoneCounts,
  });

  return { placements, zoneCounts };
}

function addPlayerAnimationData(
  player: PlayerData,
  placements: CardZonePlacement[],
  zoneCounts: ZoneAnimationCount[],
) {
  const zones = Object.values(player.zones);

  for (const zone of zones) {
    const zoneId = `${player.playerId}:${zone.kind}`;

    zoneCounts.push({
      count: zone.count,
      ownerPlayerId: player.playerId,
      zoneId,
      zoneKind: zone.kind,
    });

    for (const card of zone.cards) {
      placements.push({
        card,
        ownerPlayerId: player.playerId,
        zoneId,
        zoneKind: zone.kind,
      });
    }
  }
}

function addBattlefieldAnimationData({
  battlefield,
  opponentPlayerId,
  placements,
  playerPlayerId,
  zoneCounts,
}: {
  battlefield: BattlefieldData;
  opponentPlayerId: string;
  placements: CardZonePlacement[];
  playerPlayerId: string;
  zoneCounts: ZoneAnimationCount[];
}) {
  const playerZoneId = `battlefield:${battlefield.id}:player`;
  const opponentZoneId = `battlefield:${battlefield.id}:opponent`;

  zoneCounts.push(
    {
      count: battlefield.playerUnits.length,
      ownerPlayerId: playerPlayerId,
      zoneId: playerZoneId,
      zoneKind: "battlefield",
    },
    {
      count: battlefield.opponentUnits.length,
      ownerPlayerId: opponentPlayerId,
      zoneId: opponentZoneId,
      zoneKind: "battlefield",
    },
  );

  for (const card of battlefield.playerUnits) {
    placements.push({
      card,
      ownerPlayerId: playerPlayerId,
      zoneId: playerZoneId,
      zoneKind: "battlefield",
    });
  }

  for (const card of battlefield.opponentUnits) {
    placements.push({
      card,
      ownerPlayerId: opponentPlayerId,
      zoneId: opponentZoneId,
      zoneKind: "battlefield",
    });
  }
}

function areSetsEqual<T>(left: Set<T>, right: Set<T>) {
  if (left.size !== right.size) {
    return false;
  }

  for (const item of left) {
    if (!right.has(item)) {
      return false;
    }
  }

  return true;
}

function RunePoolBar({
  runePool,
}: {
  runePool: ProjectedPlayerState["runePool"] | undefined;
}) {
  const energy = runePool?.energy ?? 0;
  const conditionalEnergy = runePool?.conditionalEnergy ?? {};
  const power = runePool?.power ?? {};

  const conditionalEntries = Object.entries(conditionalEnergy).filter(
    ([, entry]) => entry.amount > 0,
  );

  const powerEntries = Object.entries(power)
    .filter(([, amount]) => amount > 0)
    .sort(
      ([left], [right]) => powerDomainOrder(left) - powerDomainOrder(right),
    );

  const hasRunePool =
    energy > 0 || powerEntries.length > 0 || conditionalEntries.length > 0;

  if (!hasRunePool) {
    return null;
  }

  return (
    <div
      aria-label="Rune pool"
      className={cn(
        "relative flex items-center gap-2 px-2.5 py-1.5 border rounded-lg min-h-10 overflow-hidden text-slate-100 text-xs",
        "border-cyan-100/12 bg-slate-950/22 shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_10px_28px_rgba(0,0,0,0.18)] ring-1 ring-cyan-300/5",
        "supports-backdrop-filter:bg-slate-950/14 supports-backdrop-filter:backdrop-blur-md",
      )}
      role="status"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_10%_50%,rgba(103,232,249,0.08),transparent_38%),linear-gradient(90deg,rgba(255,255,255,0.035),transparent_55%)] pointer-events-none"
      />

      <span className="relative font-mono font-semibold text-[10px] text-cyan-100/65 uppercase tracking-[0.18em] shrink-0">
        Rune pool
      </span>

      <div className="relative flex flex-1 items-center gap-1.5 min-w-0 overflow-auto [scrollbar-color:rgba(103,232,249,0.22)_transparent]">
        {energy > 0 && (
          <RunePoolChip label="Energy" tone="energy" title={`${energy} Energy`}>
            <EnergyResource compact value={energy} />
          </RunePoolChip>
        )}

        {conditionalEntries.map(([id, entry]) => (
          <RunePoolChip
            key={id}
            label="Spell Energy"
            tone="spell"
            title={`${entry.amount} spell-only Energy`}
          >
            <EnergyResource compact value={entry.amount} />
          </RunePoolChip>
        ))}

        {powerEntries.map(([domain, amount]) => (
          <RunePoolChip
            key={domain}
            label={formatDomain(domain)}
            tone="power"
            title={`${amount} ${formatDomain(domain)} Power`}
          >
            <DomainIcon decorative domain={domain} />
            <span className="font-mono font-bold tabular-nums text-white">
              {amount}
            </span>
          </RunePoolChip>
        ))}
      </div>
    </div>
  );
}

function RunePoolChip({
  children,
  label,
  title,
  tone,
}: {
  children: ReactNode;
  label: string;
  title: string;
  tone: "energy" | "power" | "spell";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] px-2 py-1 border rounded-md shrink-0",
        tone === "energy" &&
          "border-amber-200/25 bg-amber-300/10 text-amber-100",
        tone === "spell" && "border-cyan-200/25 bg-cyan-300/10 text-cyan-100",
        tone === "power" &&
          "border-violet-200/25 bg-violet-300/10 text-violet-100",
      )}
      title={title}
    >
      <span className="text-[11px] text-current/75">{label}</span>
      {children}
    </span>
  );
}

function powerDomainOrder(domain: string) {
  const order = ["Body", "Calm", "Chaos", "Fury", "Mind", "Order", "Rainbow"];

  return order.indexOf(formatDomain(domain)) === -1
    ? order.length
    : order.indexOf(formatDomain(domain));
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

function createBoardModel({
  cardsByInstanceId,
  playerNames,
  projection,
  scores,
}: {
  cardsByInstanceId: Record<string, BoardCatalogCard>;
  playerNames: NonNullable<GameBoardProps["playerNames"]>;
  projection: BoardProjection;
  scores: NonNullable<GameBoardProps["scores"]>;
}) {
  const viewerPlayerId = projection.viewerPlayerId;
  const opponentPlayerId = projection.setup.playerIds.find(
    (playerId) => playerId !== viewerPlayerId,
  );

  if (!opponentPlayerId) {
    throw new Error("Game projection must include an opponent for the viewer.");
  }

  const player = buildPlayerData({
    cardsByInstanceId,
    player: projection.players[viewerPlayerId],
    playerNames,
    projection,
    scores,
  });
  const opponent = buildPlayerData({
    cardsByInstanceId,
    player: projection.players[opponentPlayerId],
    playerNames,
    projection,
    scores,
  });

  const playerBattlefieldProjection = projection.battlefields.find(
    (battlefield) => battlefield.selectedByPlayerId === viewerPlayerId,
  );
  const opponentBattlefieldProjection = projection.battlefields.find(
    (battlefield) => battlefield.selectedByPlayerId === opponentPlayerId,
  );
  const cardOwnerByInstanceId = inferCardOwners(
    projection.setup.playerIds,
    cardsByInstanceId,
  );

  const playerBattlefield = buildBattlefieldData({
    battlefield: playerBattlefieldProjection,
    cardsByInstanceId,
    fallbackSelectedByPlayerId: viewerPlayerId,
    opponentPlayerId,
    projection,
    viewerPlayerId,
    cardOwnerByInstanceId,
  });
  const opponentBattlefield = buildBattlefieldData({
    battlefield: opponentBattlefieldProjection,
    cardsByInstanceId,
    fallbackSelectedByPlayerId: opponentPlayerId,
    opponentPlayerId,
    projection,
    viewerPlayerId,
    cardOwnerByInstanceId,
  });

  const showdownBattlefieldId = projection.showdown?.battlefieldId;
  const playerBattlefieldShowdownState = showdownStateForBattlefield(
    playerBattlefield.id,
    showdownBattlefieldId,
  );
  const opponentBattlefieldShowdownState = showdownStateForBattlefield(
    opponentBattlefield.id,
    showdownBattlefieldId,
  );

  return {
    opponent,
    opponentBattlefield,
    opponentBattlefieldShowdownState,
    player,
    playerBattlefield,
    playerBattlefieldShowdownState,
  };
}

function buildPlayerData({
  cardsByInstanceId,
  player,
  playerNames,
  projection,
  scores,
}: {
  cardsByInstanceId: Record<string, BoardCatalogCard>;
  player: ProjectedPlayerState | undefined;
  playerNames: Partial<Record<string, string>>;
  projection: BoardProjection;
  scores: Partial<Record<string, number>>;
}): PlayerData {
  if (!player) {
    throw new Error("Projected player state is missing.");
  }

  return {
    playerId: player.playerId,
    name: playerNames[player.playerId] ?? player.playerId,
    score: scores[player.playerId] ?? player.points,
    zones: {
      banishment: buildZone(
        "banishment",
        player.zones.banishment,
        cardsByInstanceId,
        projection,
      ),
      base: buildZone("base", player.zones.base, cardsByInstanceId, projection),
      champion: buildZone(
        "champion",
        player.zones.champion,
        cardsByInstanceId,
        projection,
      ),
      hand: buildZone("hand", player.zones.hand, cardsByInstanceId, projection),
      legend: buildZone(
        "legend",
        player.zones.legend,
        cardsByInstanceId,
        projection,
      ),
      mainDeck: buildZone(
        "mainDeck",
        player.zones.mainDeck,
        cardsByInstanceId,
        projection,
      ),
      runeDeck: buildZone(
        "runeDeck",
        player.zones.runeDeck,
        cardsByInstanceId,
        projection,
      ),
      trash: buildZone(
        "trash",
        player.zones.trash,
        cardsByInstanceId,
        projection,
      ),
    },
  };
}

function buildZone(
  kind: ZoneKind,
  zone: ProjectedZone,
  cardsByInstanceId: Record<string, BoardCatalogCard>,
  projection: BoardProjection,
): ZoneData {
  const cards = zone.cardInstanceIds
    .flatMap((cardInstanceId) =>
      buildCard(cardInstanceId, cardsByInstanceId, projection.cardStates),
    )
    .filter((card) => isCardAllowedInZone(kind, card));

  return {
    cards,
    count: zone.count,
    kind,
    visibility: zone.visibility,
  };
}

function buildBattlefieldData({
  battlefield,
  cardsByInstanceId,
  cardOwnerByInstanceId,
  fallbackSelectedByPlayerId,
  opponentPlayerId,
  projection,
  viewerPlayerId,
}: {
  battlefield: ProjectedBattlefield | undefined;
  cardsByInstanceId: Record<string, BoardCatalogCard>;
  cardOwnerByInstanceId: Record<string, string>;
  fallbackSelectedByPlayerId: string;
  opponentPlayerId: string;
  projection: BoardProjection;
  viewerPlayerId: string;
}): BattlefieldData {
  const battlefieldCard = battlefield
    ? cardsByInstanceId[battlefield.cardInstanceId]
    : undefined;
  const unitCards = (battlefield?.units ?? []).flatMap((cardInstanceId) => {
    const ownerPlayerId =
      cardOwnerByInstanceId[cardInstanceId] ?? battlefield?.selectedByPlayerId;
    const card = buildCard(
      cardInstanceId,
      cardsByInstanceId,
      projection.cardStates,
    ).filter((item) => isCardAllowedInZone("battlefield", item));

    return card.map((item) => ({
      card: item,
      ownerPlayerId,
    }));
  });

  return {
    id: battlefield?.battlefieldId ?? `missing:${fallbackSelectedByPlayerId}`,
    selectedByPlayerId:
      battlefield?.selectedByPlayerId ?? fallbackSelectedByPlayerId,
    controllerPlayerId: battlefield?.controllerPlayerId ?? null,
    contestedByPlayerId: battlefield?.contestedByPlayerId ?? null,
    name: battlefieldCard?.name ?? "Battlefield",
    description: battlefieldCard?.text.plain ?? "No battlefield selected.",
    img: battlefieldCard?.media.image_url ?? "",
    playerUnits: unitCards
      .filter(({ ownerPlayerId }) => ownerPlayerId === viewerPlayerId)
      .map(({ card }) => card),
    opponentUnits: unitCards
      .filter(({ ownerPlayerId }) => ownerPlayerId === opponentPlayerId)
      .map(({ card }) => card),
  };
}

function buildCard(
  cardInstanceId: string,
  cardsByInstanceId: Record<string, BoardCatalogCard>,
  cardStates: BoardProjection["cardStates"],
): Card[] {
  const card = cardsByInstanceId[cardInstanceId];

  if (!card) {
    return [];
  }

  return [
    {
      domains: card.classification.domain,
      damage: cardStates[cardInstanceId]?.damage,
      energy: card.attributes.energy ?? undefined,
      img: card.media.image_url ?? cardBackImage.src,
      instanceId: cardInstanceId,
      isExhausted: cardStates[cardInstanceId]?.exhausted ?? false,
      might:
        cardStates[cardInstanceId]?.computedMight ??
        card.attributes.might ??
        undefined,
      name: card.name,
      power: card.attributes.power ?? undefined,
      publicCode: card.public_code,
      rulesText: card.text.plain,
      setLabel: card.set.label,
      supertype: card.classification.supertype ?? undefined,
      type: card.classification.type,
    },
  ];
}

function isCardAllowedInZone(kind: ZoneKind, card: Card) {
  switch (kind) {
    case "legend":
      return card.type === "Legend";
    case "champion":
      return card.type === "Unit" && card.supertype === "Champion";
    case "runeDeck":
      return card.type === "Rune";
    case "battlefield":
      return card.type === "Unit";
    case "hand":
    case "mainDeck":
      return (
        card.type === "Gear" || card.type === "Spell" || card.type === "Unit"
      );
    case "base":
      return (
        card.type === "Rune" || card.type === "Gear" || card.type === "Unit"
      );
    case "banishment":
    case "trash":
      return true;
  }
}

function inferCardOwners(
  playerIds: readonly string[],
  cardsByInstanceId: Record<string, BoardCatalogCard>,
) {
  return Object.fromEntries(
    Object.keys(cardsByInstanceId).flatMap((cardInstanceId) => {
      const ownerPlayerId = playerIds.find(
        (playerId) =>
          cardInstanceId.startsWith(`${playerId}:`) ||
          cardInstanceId.startsWith(`${playerId}-`),
      );

      return ownerPlayerId ? [[cardInstanceId, ownerPlayerId]] : [];
    }),
  );
}

function showdownStateForBattlefield(
  battlefieldId: string,
  showdownBattlefieldId: string | undefined,
): BattlefieldShowdownState {
  if (!showdownBattlefieldId) {
    return "neutral";
  }

  return battlefieldId === showdownBattlefieldId ? "open" : "deferred";
}
