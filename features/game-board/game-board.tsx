"use client";

import { FC, MouseEvent, useEffect, useState } from "react";
import type { Card as CatalogCard } from "@/server/catalog";
import type {
  ProjectedBattlefield,
  ProjectedPlayerState,
  ProjectedZone,
} from "@/server/match";
import { ActionRail } from "./components/ActionRail";
import { ScoreHeader } from "./components/ScoreHeader";
import { TemporaryZoneOverlay } from "./components/TemporaryZoneOverlay";
import { BattlefieldBoard } from "./components/battlefield-board";
import { PlayerHandFan } from "./components/player-hand-fan";
import { PlayerBoard } from "./components/player-board";
import {
  EnergyResource,
  formatDomain,
  getDomainIcon,
} from "./lib/transpile-card-description";
import {
  BattlefieldData,
  Card,
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
  chainCardInstanceIds = [],
  cardsByInstanceId,
  logEntries = [],
  onAddRuneResource,
  onPlayCard,
  playerNames = {},
  projection,
  scores = {},
}) => {
  const [openZone, setOpenZone] = useState<TemporaryZone>(null);
  const [cardActionMenu, setCardActionMenu] =
    useState<CardActionMenuState>(null);
  const chainCards = chainCardInstanceIds.flatMap((cardInstanceId) =>
    buildCard(cardInstanceId, cardsByInstanceId, projection.cardStates),
  );
  const board = createBoardModel({
    cardsByInstanceId,
    playerNames,
    projection,
    scores,
  });
  const viewerState = projection.players[projection.viewerPlayerId];
  const activePlayerId = projection.turn?.activePlayerId;
  const isOpponentActive = activePlayerId === board.opponent.playerId;
  const isPlayerActive = activePlayerId === board.player.playerId;
  const closeCardActionMenu = () => setCardActionMenu(null);
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

    onPlayCard({
      canPlay: modes.length > 0,
      cardInstanceId: card.instanceId,
      selectedModeId: modes[0]?.id,
    });
  };
  const openPlayableCardMenu = (
    card: Card,
    event: MouseEvent<HTMLElement>,
  ) => {
    if (!card.instanceId || !viewerState) {
      return;
    }

    const modes = viewerState.availablePaymentModes[card.instanceId] ?? [];

    openCardActionMenu(
      event,
      modes.length > 0
        ? modes.map((mode) => ({
            label: `Play ${mode.label}`,
            onSelect: () =>
              onPlayCard?.({
                canPlay: true,
                cardInstanceId: card.instanceId!,
                selectedModeId: mode.id,
              }),
          }))
        : [
            {
              disabled: true,
              label: "Not playable",
            },
      ],
    );
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
  const handleRunePrimaryAction = (card: Card) => {
    closeCardActionMenu();

    if (!card.instanceId) {
      return;
    }

    onAddRuneResource?.({
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
          onAddRuneResource?.({
            cardInstanceId: card.instanceId!,
            resourceType: "energy",
          }),
      },
      {
        label: "Add Power",
        onSelect: () =>
          onAddRuneResource?.({
            cardInstanceId: card.instanceId!,
            resourceType: "power",
          }),
      },
    ]);
  };

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
      <section className="flex flex-1">
        <div className="flex-1 gap-2 grid grid-rows-[146px_minmax(0,1fr)_calc(100vh/3)_minmax(0,1fr)_146px_64px] p-2">
          <PlayerBoard
            onOpenBanish={() => setOpenZone("banish")}
            onOpenTrash={() => setOpenZone("opponentTrash")}
            player={board.opponent}
            isActivePlayer={isOpponentActive}
            isMirrored
          />
          <div className="flex gap-2">
            <BattlefieldBoard
              battlefield={board.playerBattlefield}
              owner="player"
              showdownState={board.playerBattlefieldShowdownState}
            />
            <BattlefieldBoard
              battlefield={board.opponentBattlefield}
              owner="opponent"
              showdownState={board.opponentBattlefieldShowdownState}
            />
          </div>
          <PlayerBoard
            onOpenBanish={() => setOpenZone("banish")}
            onOpenTrash={() => setOpenZone("playerTrash")}
            onChampionContextAction={handleChampionCardAction}
            onChampionPrimaryAction={handleChampionCardAction}
            onRuneContextAction={handleRuneContextAction}
            onRunePrimaryAction={handleRunePrimaryAction}
            player={board.player}
            isActivePlayer={isPlayerActive}
          />
          <RunePoolBar runePool={viewerState?.runePool} />
        </div>
        <ActionRail openZone={openZone} setOpenZone={setOpenZone} />
      </section>
      <TemporaryZoneOverlay
        chainCards={chainCards}
        logEntries={logEntries}
        onClose={() => setOpenZone(null)}
        openZone={openZone}
        opponentBanishment={board.opponent.zones.banishment}
        opponentTrash={board.opponent.zones.trash}
        playerBanishment={board.player.zones.banishment}
        playerTrash={board.player.zones.trash}
      />

      <PlayerHandFan
        cards={board.player.zones.hand.cards}
        onCardContextAction={handleCardContextFromHand}
        onPlayCard={handlePlayCardFromHand}
        onTuck={closeCardActionMenu}
      />
      {cardActionMenu && (
        <>
          <button
            aria-label="Close card action menu"
            className="fixed inset-0 z-[2147483646] cursor-default bg-transparent"
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

function RunePoolBar({
  runePool,
}: {
  runePool: ProjectedPlayerState["runePool"] | undefined;
}) {
  const energy = runePool?.energy ?? 0;
  const power = runePool?.power ?? {};
  const powerEntries = Object.entries(power)
    .filter(([, amount]) => amount > 0)
    .sort(
      ([left], [right]) => powerDomainOrder(left) - powerDomainOrder(right),
    );

  if (energy === 0 && powerEntries.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 px-2 border border-white/15 rounded-md overflow-auto text-slate-100 text-xs">
      <span className="font-semibold text-slate-400 uppercase tracking-wide">
        Rune pool
      </span>
      {energy > 0 && (
        <span className="inline-flex items-center gap-1 bg-yellow-300/10 px-2 py-1 border border-yellow-300/25 rounded text-yellow-100">
          <span>Energy</span>
          <EnergyResource compact value={energy} />
        </span>
      )}
      {powerEntries.map(([domain, amount]) => {
        const icon = getDomainIcon(domain.toLowerCase());

        return (
          <span
            className="inline-flex items-center gap-1 bg-violet-300/10 px-2 py-1 border border-violet-300/25 rounded text-violet-100"
            key={domain}
            title={`${formatDomain(domain)} Power`}
          >
            {icon && (
              // eslint-disable-next-line @next/next/no-img-element -- Domain icons are local imported UI assets.
              <img alt="" className="w-auto h-4 object-contain" src={icon} />
            )}
            <span>{formatDomain(domain)}</span>
            <span className="font-bold text-white">{amount}</span>
          </span>
        );
      })}
    </div>
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
      energy: card.attributes.energy ?? undefined,
      img: card.media.image_url ?? "",
      instanceId: cardInstanceId,
      isExhausted: cardStates[cardInstanceId]?.exhausted ?? false,
      might: card.attributes.might ?? undefined,
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
