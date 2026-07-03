"use client";

import {
  DomainIcon,
  EnergyResource,
  formatDomain,
} from "@/features/card-presentation";
import { ChoiceDialog } from "@/shared/components/choice-dialog";
import type { GameProjection } from "@/shared/game";
import {
  FC,
  MouseEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import cardBackImage from "../../../assets/cardback.jpg";
import { ActionRail } from "./components/action-rail";
import { BattlefieldBoard } from "./components/battlefield-board";
import { PendingChoiceStatus } from "./components/pending-choice-status";
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
import { CombatDamageDialog } from "./components/combat-damage-dialog";
import { ShowdownPrompt } from "./components/showdown-prompt";
import { TemporaryZoneOverlay } from "./components/temporary-zone-overlay";
import {
  adaptProjectionToBoard,
  type BoardCatalogCard,
  type BoardPlayerProjection,
  type BoardZoneProjection,
  type BoardProjection,
} from "./board-view-model";
import {
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

type ProjectedBattlefield = BoardProjection["battlefields"][number];
type ProjectedPlayerState = BoardPlayerProjection;
type ProjectedZone = BoardZoneProjection;
type GameBoardProps = {
  onPerformAction: (input: {
    actionId: string;
    selectedIds: string[];
    allocations?: Array<{ targetUnitId: string; amount: number }>;
  }) => void;
  playerNames?: Partial<Record<string, string>>;
  projection: GameProjection;
  scores?: Partial<Record<string, number>>;
};

type BattlefieldShowdownState = "neutral" | "open" | "deferred";
type CardActionMenuItem = {
  accessibleLabel?: string;
  disabled?: boolean;
  hoverBattlefieldId?: string | null;
  id: string;
  label: ReactNode;
  onSelect?: () => void;
};
type CardActionMenuState = {
  items: CardActionMenuItem[];
  left: number;
  top: number;
} | null;
type AssignCombatDamagePendingChoice = {
  playerId: string;
  totalDamage: number;
  type: "assignCombatDamage";
};

const EMPTY_TARGET_IDS: string[] = [];

export const GameBoard: FC<GameBoardProps> = ({
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
    ) => {
      if (actionId) onPerformAction({ actionId, selectedIds, allocations });
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
  const onSubmitChoice = (input: {
    choiceId: string;
    orderedIds: string[];
  }) => {
    const action = sourceProjection.actions.find((candidate) => {
      if (candidate.presentation.surface !== "choice-dialog") return false;
      const encoded = candidate.id.split(":").at(-1);
      if (!encoded) return false;
      try {
        return (
          JSON.stringify(JSON.parse(decodeURIComponent(encoded))) ===
          JSON.stringify(input.orderedIds)
        );
      } catch {
        return false;
      }
    });
    submitProjectedAction(action?.id);
  };
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
  } | null>(null);
  const [highlightedCardInstanceIds, setHighlightedCardInstanceIds] = useState<
    Set<string>
  >(new Set());
  const [hoveredTargetCardInstanceId, setHoveredTargetCardInstanceId] =
    useState<string | null>(null);
  const [hoveredBattlefieldId, setHoveredBattlefieldId] = useState<
    string | null
  >(null);
  const [pendingSubmittedTargetIds, setPendingSubmittedTargetIds] = useState<
    string[]
  >([]);
  const isChainLockedOpen = (projection.chain?.items.length ?? 0) > 0;
  const canViewerPassChain =
    isChainLockedOpen &&
    projection.chain?.priorityPlayerId === projection.viewerPlayerId;
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
  const combatDamageAction = sourceProjection.actions.find(
    (action) => action.choice?.kind === "combatDamage",
  );
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
  const readyCardsAction = sourceProjection.actions.find(
    (action) => action.id.split(":")[3] === "readyCards",
  );
  const triggerOrderChoice =
    projection.pendingChoice?.type === "orderTriggers"
      ? projection.pendingChoice
      : null;
  const pendingChoiceOptions =
    triggerOrderChoice?.optionIds.map((id) => {
      const item = triggerOrderChoice.pendingChainItems.find(
        (candidate) => candidate.id === id,
      );
      const cardInstanceId = item?.cardInstanceId ?? item?.sourceCardInstanceId;

      return {
        description: item ? formatChainItemKind(item.kind) : undefined,
        id,
        imageUrl: cardInstanceId
          ? (cardsByInstanceId[cardInstanceId]?.media.image_url ??
            cardBackImage.src)
          : undefined,
        label: item?.label ?? id,
      };
    }) ?? [];
  const board = createBoardModel({
    cardsByInstanceId,
    playerNames,
    projection,
    scores,
  });
  const waitingReadyChoice =
    sourceProjection.pendingChoice?.type === "readyCards" &&
    sourceProjection.pendingChoice.playerId !== sourceProjection.viewerPlayerId
      ? sourceProjection.pendingChoice
      : null;
  const waitingChoicePlayerName = waitingReadyChoice
    ? waitingReadyChoice.playerId === board.player.playerId
      ? board.player.name
      : board.opponent.name
    : null;
  const waitingCombatDamageChoice = assignCombatDamagePendingChoiceFromUnknown(
    sourceProjection.pendingChoice,
  );
  const waitingCombatDamageChoiceForOpponent =
    waitingCombatDamageChoice?.playerId !== sourceProjection.viewerPlayerId
      ? waitingCombatDamageChoice
      : null;
  const waitingCombatDamagePlayerName = waitingCombatDamageChoiceForOpponent
    ? waitingCombatDamageChoiceForOpponent.playerId === board.player.playerId
      ? board.player.name
      : board.opponent.name
    : null;
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
          : kind === "readyCards"
            ? "choice"
            : "play",
      selectedTargetIds: [],
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
    setHoveredBattlefieldId(null);
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

    setHoveredBattlefieldId(null);

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

    const mode = modes.find((candidate) => candidate.enabled);

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

    const modes = viewerState.availablePaymentModes[card.instanceId] ?? [];

    openCardActionMenu(
      event,
      modes.length > 0
        ? modes.map((mode) => ({
            disabled: !mode.enabled,
            hoverBattlefieldId: battlefieldIdFromMoveAction(mode),
            id: mode.id,
            label: mode.enabled
              ? mode.label
              : `${mode.label} (${mode.disabledReason ?? "unavailable"})`,
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
      (target) => target.kind === "card",
    );

    if (requirement && requirement.maximum > 0) {
      setTargetSelection({
        actionId: actionToSubmit.id,
        legalTargetIds: requirement.legalIds,
        maxTargets: requirement.maximum,
        minTargets: requirement.minimum,
        purpose: stagedMoveAction ? "move" : "play",
        selectedTargetIds: stagedMoveAction ? [card.instanceId] : [],
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
        disabled: !action.enabled,
        hoverBattlefieldId: battlefieldIdFromMoveAction(action),
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
      selectedTargetIds.length === nextSelection.maxTargets
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
  const submitTargetedPlay = (selection = targetSelection) => {
    if (!selection) {
      return;
    }

    if (selection.selectedTargetIds.length < selection.minTargets) {
      return;
    }

    submitProjectedAction(selection.actionId, selection.selectedTargetIds);
    setPendingSubmittedTargetIds(selection.selectedTargetIds);
    setHoveredTargetCardInstanceId(null);
    setTargetSelection(null);
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
    if (isChainLockedOpen) {
      setOpenZone("chain");
    }
  }, [isChainLockedOpen]);

  useEffect(() => {
    if (!isChainLockedOpen || openZone !== "chain") {
      setHighlightedCardInstanceIds(new Set());
    }
  }, [isChainLockedOpen, openZone]);

  useEffect(() => {
    setCardActionMenu(null);
    setHoveredBattlefieldId(null);
    setHoveredTargetCardInstanceId(null);
    setPendingSubmittedTargetIds([]);
  }, [projection.stateVersion]);

  useEffect(() => {
    if (!readyCardsAction) return;
    const requirement = readyCardsAction.targets.find(
      (target) => target.kind === "card",
    );
    if (!requirement) return;
    setTargetSelection((current) =>
      current?.actionId === readyCardsAction.id
        ? current
        : {
            actionId: readyCardsAction.id,
            legalTargetIds: requirement.legalIds,
            maxTargets: requirement.maximum,
            minTargets: requirement.minimum,
            purpose: "choice",
            selectedTargetIds: [],
          },
    );
  }, [readyCardsAction]);

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
      <ScoreHeader opponent={board.opponent} player={board.player} />
      {waitingReadyChoice && waitingChoicePlayerName && (
        <PendingChoiceStatus
          message={
            <>
              Waiting for {waitingChoicePlayerName} to choose{" "}
              {waitingReadyChoice.maximum} runes to ready.
            </>
          }
          title="End-of-turn choice"
        />
      )}
      {waitingCombatDamageChoiceForOpponent &&
        waitingCombatDamagePlayerName && (
          <PendingChoiceStatus
            message={
              <>
                Waiting for {waitingCombatDamagePlayerName} to assign{" "}
                {waitingCombatDamageChoiceForOpponent.totalDamage} combat
                damage.
              </>
            }
            title="Combat damage"
            tone="amber"
          />
        )}
      {showdownPrompt && showdownBattlefieldName && (
        <ShowdownPrompt
          battlefieldName={showdownBattlefieldName}
          focusPlayerId={showdownPrompt.focusPlayerId}
          hasFocus={showdownPrompt.hasFocus}
          hasPriority={showdownPrompt.hasPriority}
          isClosed={showdownPrompt.isClosed}
          isCombat={showdownPrompt.kind === "combat"}
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
          <div className="flex gap-2">
            <BattlefieldBoard
              battlefield={board.playerBattlefield}
              highlightedCardInstanceIds={displayedHighlightedCardInstanceIds}
              hiddenCardInstanceIds={activeTransferCardIds}
              isHighlighted={
                hoveredBattlefieldId === board.playerBattlefield.id
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
                hoveredBattlefieldId === board.opponentBattlefield.id
              }
              onCardPrimaryAction={handleBoardCardPrimaryAction}
              onCardPointerEnter={handleTargetPointerEnter}
              onCardPointerLeave={handleTargetPointerLeave}
              owner="opponent"
              showdownState={board.opponentBattlefieldShowdownState}
            />
          </div>
          <PlayerBoard
            highlightedCardInstanceIds={displayedHighlightedCardInstanceIds}
            hiddenCardInstanceIds={activeTransferCardIds}
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
          passTurnDisabled={!canViewerEndTurn}
          passTurnLabel={passTurnLabel}
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
        chainPassLabel={chainPassLabel}
        isCloseDisabled={isChainLockedOpen}
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
      {targetSelection && (
        <TargetSelectionPrompt
          canSubmit={
            targetSelection.selectedTargetIds.length >=
            targetSelection.minTargets
          }
          maxTargets={targetSelection.maxTargets}
          minTargets={targetSelection.minTargets}
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
                ? readyCardsAction?.label
                : undefined
          }
        />
      )}
      {triggerOrderChoice && (
        <ChoiceDialog
          confirmLabel="Submit order"
          description="Move triggered effects into the order they should resolve."
          isOpen
          onConfirm={(orderedIds) =>
            onSubmitChoice?.({
              choiceId: triggerOrderChoice.id,
              orderedIds,
            })
          }
          options={pendingChoiceOptions}
          selectionMode="ordered"
          title={triggerOrderChoice.prompt}
        />
      )}
      {combatDamageAction?.choice?.kind === "combatDamage" && (
        <CombatDamageDialog
          cardsByInstanceId={cardsByInstanceId}
          choice={combatDamageAction.choice}
          onSubmit={(allocations) =>
            submitProjectedAction(combatDamageAction.id, [], allocations)
          }
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
            onItemPointerEnter={(item) =>
              setHoveredBattlefieldId(item.hoverBattlefieldId ?? null)
            }
            onItemPointerLeave={() => setHoveredBattlefieldId(null)}
            top={cardActionMenu.top}
          />
        </>
      )}
    </main>
  );
};

function assignCombatDamagePendingChoiceFromUnknown(
  pendingChoice: unknown,
): AssignCombatDamagePendingChoice | null {
  if (!pendingChoice || typeof pendingChoice !== "object") {
    return null;
  }

  const candidate = pendingChoice as Partial<AssignCombatDamagePendingChoice>;

  if (
    candidate.type !== "assignCombatDamage" ||
    typeof candidate.playerId !== "string" ||
    typeof candidate.totalDamage !== "number"
  ) {
    return null;
  }

  return {
    playerId: candidate.playerId,
    totalDamage: candidate.totalDamage,
    type: "assignCombatDamage",
  };
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

  if (
    energy === 0 &&
    powerEntries.length === 0 &&
    conditionalEntries.length === 0
  ) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 px-2 border border-white/15 rounded-md overflow-auto text-slate-100 text-xs">
      <span className="font-mono font-semibold text-slate-400 uppercase tracking-wide">
        Rune pool
      </span>
      {energy > 0 && (
        <span className="inline-flex items-center gap-1 bg-yellow-300/10 px-2 py-1 border border-yellow-300/25 rounded text-yellow-100">
          <span>Energy</span>
          <EnergyResource compact value={energy} />
        </span>
      )}
      {conditionalEntries.map(([id, entry]) => (
        <span
          className="inline-flex items-center gap-1 bg-cyan-300/10 px-2 py-1 border border-cyan-300/25 rounded text-cyan-100"
          key={id}
          title="Spell-only Energy"
        >
          <span>Spell Energy</span>
          <EnergyResource compact value={entry.amount} />
        </span>
      ))}
      {powerEntries.map(([domain, amount]) => (
        <span
          className="inline-flex items-center gap-1 bg-violet-300/10 px-2 py-1 border border-violet-300/25 rounded text-violet-100"
          key={domain}
          title={`${formatDomain(domain)} Power`}
        >
          <DomainIcon decorative domain={domain} />
          <span className="font-bold text-white">{amount}</span>
        </span>
      ))}
    </div>
  );
}

function powerDomainOrder(domain: string) {
  const order = ["Body", "Calm", "Chaos", "Fury", "Mind", "Order", "Rainbow"];

  return order.indexOf(formatDomain(domain)) === -1
    ? order.length
    : order.indexOf(formatDomain(domain));
}

function formatChainItemKind(kind: string) {
  switch (kind) {
    case "ability":
      return "Ability";
    case "spell":
      return "Spell";
    case "trigger":
      return "Triggered ability";
    case "unit":
      return "Unit";
    default:
      return undefined;
  }
}

function CardActionMenu({
  items,
  left,
  onClose,
  onItemPointerEnter,
  onItemPointerLeave,
  top,
}: {
  items: CardActionMenuItem[];
  left: number;
  onClose: () => void;
  onItemPointerEnter?: (item: CardActionMenuItem) => void;
  onItemPointerLeave?: () => void;
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
          onPointerEnter={() => {
            if (!item.disabled) {
              onItemPointerEnter?.(item);
            }
          }}
          onPointerLeave={onItemPointerLeave}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function battlefieldIdFromMoveAction(
  action: Pick<GameProjection["actions"][number], "id">,
) {
  const [, , , kind, , encodedExtra] = action.id.split(":");

  if (kind !== "move" && kind !== "moveMany") {
    return null;
  }

  if (!encodedExtra) {
    return null;
  }

  try {
    const extra = decodeURIComponent(encodedExtra);

    return extra === "base" ? null : extra;
  } catch {
    return null;
  }
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
