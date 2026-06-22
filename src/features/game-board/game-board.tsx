"use client";

import {
  FC,
  MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DomainIcon,
  EnergyResource,
  formatDomain,
} from "@/features/card-presentation";
import type { Card as CatalogCard } from "@/server/catalog";
import type {
  ProjectedBattlefield,
  ProjectedPlayerState,
  ProjectedZone,
} from "@/server/match";
import { ChoiceDialog } from "@/shared/components/choice-dialog";
import cardBackImage from "../../../assets/cardback.jpg";
import { ActionRail } from "./components/action-rail";
import { ScoreHeader } from "./components/score-header";
import { TemporaryZoneOverlay } from "./components/temporary-zone-overlay";
import { BattlefieldBoard } from "./components/battlefield-board";
import {
  CardZoneAnimationSnapshot,
  CardZonePlacement,
  CardZoneTransferOverlay,
  ZoneAnimationCount,
  captureCardZoneAnimationSnapshot,
} from "./components/card-zone-transfer-overlay";
import { PlayerHandFan } from "./components/player-hand-fan";
import { PlayerBoard } from "./components/player-board";
import {
  BattlefieldData,
  Card,
  ChainCardEntry,
  GameBoardProps,
  PlayerData,
  TemporaryZone,
  ZoneData,
  ZoneKind,
} from "./types";

type BattlefieldShowdownState = "neutral" | "open" | "deferred";
type CardActionMenuItem = {
  disabled?: boolean;
  label: string;
  onSelect?: () => void;
};
type CardActionMenuState = {
  items: CardActionMenuItem[];
  left: number;
  top: number;
} | null;

export const GameBoard: FC<GameBoardProps> = ({
  cardsByInstanceId,
  logEntries = [],
  onActivateAbility,
  onAddRuneResource,
  onEndTurn,
  onPass,
  onPlayCard,
  onSubmitChoice,
  playerNames = {},
  projection,
  scores = {},
}) => {
  const [openZone, setOpenZone] = useState<TemporaryZone>(null);
  const [cardActionMenu, setCardActionMenu] =
    useState<CardActionMenuState>(null);
  const [activeTransferCardIds, setActiveTransferCardIds] = useState<
    Set<string>
  >(new Set());
  const [pendingAnimationSnapshot, setPendingAnimationSnapshot] =
    useState<CardZoneAnimationSnapshot | null>(null);
  const [targetSelection, setTargetSelection] = useState<{
    cardInstanceId: string;
    maxTargets: number;
    minTargets: number;
    selectedTargetIds: string[];
    selectedModeId?: string;
  } | null>(null);
  const [highlightedCardInstanceIds, setHighlightedCardInstanceIds] = useState<
    Set<string>
  >(new Set());
  const [hoveredTargetCardInstanceId, setHoveredTargetCardInstanceId] =
    useState<string | null>(null);
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
  const canViewerEndTurn =
    !isChainLockedOpen &&
    projection.turn?.activePlayerId === projection.viewerPlayerId;
  const passTurnLabel = isChainLockedOpen
    ? "Resolve chain first"
    : canViewerEndTurn
      ? "Pass Turn"
      : "Waiting for turn";
  const pendingChoiceOptions =
    projection.pendingChoice?.optionIds.map((id) => {
      const item = projection.pendingChoice?.pendingChainItems.find(
        (candidate) => candidate.id === id,
      );
      const cardInstanceId = item?.cardInstanceId ?? item?.sourceCardInstanceId;

      return {
        description: item ? formatChainItemKind(item.kind) : undefined,
        id,
        imageUrl: cardInstanceId
          ? cardsByInstanceId[cardInstanceId]?.media.image_url ?? cardBackImage.src
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
  const legalTargetIds =
    targetSelection && viewerState
      ? (viewerState.legalTargetsByCard[targetSelection.cardInstanceId]
          ?.cardInstanceIds ?? [])
      : [];
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
  const submitRuneResource = useCallback(
    (input: { cardInstanceId: string; resourceType: "energy" | "power" }) => {
      capturePendingAnimationSnapshot();
      onAddRuneResource?.(input);
    },
    [capturePendingAnimationSnapshot, onAddRuneResource],
  );
  const closeCardActionMenu = () => setCardActionMenu(null);
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

    submitPlayCard({
      canPlay: modes.length > 0,
      cardInstanceId: card.instanceId,
      selectedModeId: modes[0]?.id,
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
          label: `Play ${mode.label}`,
            onSelect: () => beginPlayOrTargetSelection(card, mode.id),
          }))
        : [
            {
              disabled: true,
              label: "Not playable",
            },
          ],
    );
  };
  const beginPlayOrTargetSelection = (card: Card, selectedModeId?: string) => {
    if (!card.instanceId || !viewerState) {
      return;
    }

    const targetConfig = getTargetConfig(card);
    const legalTargets =
      viewerState.legalTargetsByCard[card.instanceId]?.cardInstanceIds ?? [];

    if (targetConfig && targetConfig.maxTargets > 0) {
      setTargetSelection({
        cardInstanceId: card.instanceId,
        maxTargets: targetConfig.maxTargets,
        minTargets: targetConfig.minTargets,
        selectedModeId,
        selectedTargetIds: [],
      });
      return;
    }

    if (targetConfig && targetConfig.maxTargets === 0 && legalTargets.length >= 0) {
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
      chooseBoardTarget(card);
      return;
    }

    if (card.name !== "Lux, Crownguard" || !card.instanceId || !event) {
      return;
    }

    const abilityId = "lux-crownguard-add-spell-energy";
    const availableAbilityIds =
      viewerState?.availableAbilityIdsByCard[card.instanceId] ?? [];
    const canActivate = availableAbilityIds.includes(abilityId);
    openCardActionMenu(event, [
      {
        disabled: !canActivate,
        label: luxAbilityMenuLabel({
          canActivate,
          isExhausted: card.isExhausted ?? false,
        }),
        onSelect: () =>
          onActivateAbility?.({
            abilityId,
            sourceCardInstanceId: card.instanceId!,
          }),
      },
    ]);
  };
  const chooseBoardTarget = (card: Card) => {
    if (!targetSelection || !card.instanceId || !viewerState) {
      return;
    }

    const legalTargets =
      viewerState.legalTargetsByCard[targetSelection.cardInstanceId]
        ?.cardInstanceIds ?? [];

    if (!legalTargets.includes(card.instanceId)) {
      return;
    }

    const selectedTargetIds = targetSelection.selectedTargetIds.includes(
      card.instanceId,
    )
      ? targetSelection.selectedTargetIds.filter((id) => id !== card.instanceId)
      : [...targetSelection.selectedTargetIds, card.instanceId].slice(
          0,
          targetSelection.maxTargets,
        );
    const nextSelection = {
      ...targetSelection,
      selectedTargetIds,
    };

    setTargetSelection(nextSelection);

    if (
      nextSelection.minTargets === nextSelection.maxTargets &&
      selectedTargetIds.length === nextSelection.maxTargets
    ) {
      submitTargetedPlay(nextSelection);
    }
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

    submitPlayCard({
      canPlay: true,
      cardInstanceId: selection.cardInstanceId,
      choices: {
        targetCardInstanceIds: selection.selectedTargetIds,
      },
      selectedModeId: selection.selectedModeId,
    });
    setPendingSubmittedTargetIds(selection.selectedTargetIds);
    setHoveredTargetCardInstanceId(null);
    setTargetSelection(null);
  };
  const handleRunePrimaryAction = (card: Card) => {
    closeCardActionMenu();

    if (!card.instanceId) {
      return;
    }

    submitRuneResource({
      cardInstanceId: card.instanceId,
      resourceType: "energy",
    });
  };
  const handleRuneContextAction = (
    card: Card,
    event: MouseEvent<HTMLElement>,
  ) => {
    if (!card.instanceId) {
      return;
    }

    openCardActionMenu(event, [
      {
        disabled: card.isExhausted,
        label: card.isExhausted ? "Add Energy (exhausted)" : "Add Energy",
        onSelect: () =>
          submitRuneResource({
            cardInstanceId: card.instanceId!,
            resourceType: "energy",
          }),
      },
      {
        label: "Add Power",
        onSelect: () =>
          submitRuneResource({
            cardInstanceId: card.instanceId!,
            resourceType: "power",
          }),
      },
    ]);
  };

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
    setHoveredTargetCardInstanceId(null);
    setPendingSubmittedTargetIds([]);
  }, [projection.stateVersion]);

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
    <main className="relative flex flex-col h-screen overflow-hidden text-slate-100">
      <ScoreHeader opponent={board.opponent} player={board.player} />
      <section className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 gap-2 grid grid-rows-[minmax(96px,0.8fr)_minmax(0,1.2fr)_minmax(180px,2fr)_minmax(0,1.2fr)_minmax(96px,0.8fr)_48px] min-h-0 p-2 overflow-hidden">
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
          onPassTurn={onEndTurn}
          openZone={openZone}
          passTurnDisabled={!canViewerEndTurn}
          passTurnLabel={passTurnLabel}
          setOpenZone={setOpenZoneRespectingChain}
        />
      </section>
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
            targetSelection.selectedTargetIds.length >= targetSelection.minTargets
          }
          maxTargets={targetSelection.maxTargets}
          minTargets={targetSelection.minTargets}
          onCancel={() => setTargetSelection(null)}
          onSubmit={() => submitTargetedPlay()}
          selectedCount={targetSelection.selectedTargetIds.length}
        />
      )}
      {projection.pendingChoice && (
        <ChoiceDialog
          confirmLabel="Submit order"
          description="Move triggered effects into the order they should resolve."
          isOpen
          onConfirm={(orderedIds) =>
            onSubmitChoice?.({
              choiceId: projection.pendingChoice!.id,
              orderedIds,
            })
          }
          options={pendingChoiceOptions}
          selectionMode="ordered"
          title={projection.pendingChoice.prompt}
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
            top={cardActionMenu.top}
          />
        </>
      )}
    </main>
  );
};

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

function getTargetConfig(card: Card):
  | {
      minTargets: number;
      maxTargets: number;
    }
  | null {
  switch (card.name) {
    case "Stupefy":
    case "Falling Comet":
    case "Blast of Power":
    case "Final Spark":
      return {
        minTargets: 1,
        maxTargets: 1,
      };
    case "Back to Back":
      return {
        minTargets: 2,
        maxTargets: 2,
      };
    case "Singularity":
      return {
        minTargets: 0,
        maxTargets: 2,
      };
    default:
      return null;
  }
}

function TargetSelectionPrompt({
  canSubmit,
  maxTargets,
  minTargets,
  onCancel,
  onSubmit,
  selectedCount,
}: {
  canSubmit: boolean;
  maxTargets: number;
  minTargets: number;
  onCancel: () => void;
  onSubmit: () => void;
  selectedCount: number;
}) {
  return (
    <div className="bottom-24 left-1/2 z-[2147483646] fixed flex items-center gap-3 bg-slate-950/95 shadow-2xl px-4 py-3 border border-cyan-300/30 rounded-md text-sm text-slate-100 -translate-x-1/2">
      <span>
        Choose targets {selectedCount}/{maxTargets}
        {minTargets === 0 ? " (optional)" : ""}
      </span>
      <button
        className="px-3 py-1 border border-white/15 rounded text-slate-300 hover:text-white"
        onClick={onCancel}
        type="button"
      >
        Cancel
      </button>
      <button
        className="disabled:opacity-40 bg-cyan-300 px-3 py-1 rounded font-semibold text-slate-950"
        disabled={!canSubmit}
        onClick={onSubmit}
        type="button"
      >
        Play
      </button>
    </div>
  );
}

function luxAbilityMenuLabel({
  canActivate,
  isExhausted,
}: {
  canActivate: boolean;
  isExhausted: boolean;
}) {
  if (canActivate) {
    return "Add spell Energy";
  }

  if (isExhausted) {
    return "Add spell Energy (exhausted)";
  }

  return "Add spell Energy (no priority)";
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

  if (energy === 0 && powerEntries.length === 0 && conditionalEntries.length === 0) {
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
  top,
}: {
  items: CardActionMenuItem[];
  left: number;
  onClose: () => void;
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
          className="flex items-center enabled:hover:bg-cyan-300/15 px-3 py-2 rounded w-full disabled:text-slate-500 text-xs text-left transition disabled:cursor-not-allowed"
          disabled={item.disabled}
          key={item.label}
          onClick={() => {
            onClose();
            item.onSelect?.();
          }}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function createBoardModel({
  cardsByInstanceId,
  playerNames,
  projection,
  scores,
}: {
  cardsByInstanceId: GameBoardProps["cardsByInstanceId"];
  playerNames: NonNullable<GameBoardProps["playerNames"]>;
  projection: GameBoardProps["projection"];
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
  cardsByInstanceId: Record<string, CatalogCard>;
  player: ProjectedPlayerState | undefined;
  playerNames: Partial<Record<string, string>>;
  projection: GameBoardProps["projection"];
  scores: Partial<Record<string, number>>;
}): PlayerData {
  if (!player) {
    throw new Error("Projected player state is missing.");
  }

  return {
    playerId: player.playerId,
    name: playerNames[player.playerId] ?? player.playerId,
    score: scores[player.playerId] ?? 0,
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
  cardsByInstanceId: Record<string, CatalogCard>,
  projection: GameBoardProps["projection"],
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
  cardsByInstanceId: Record<string, CatalogCard>;
  cardOwnerByInstanceId: Record<string, string>;
  fallbackSelectedByPlayerId: string;
  opponentPlayerId: string;
  projection: GameBoardProps["projection"];
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
  cardsByInstanceId: Record<string, CatalogCard>,
  cardStates: GameBoardProps["projection"]["cardStates"],
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
      might: cardStates[cardInstanceId]?.computedMight ?? card.attributes.might ?? undefined,
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
  cardsByInstanceId: Record<string, CatalogCard>,
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
