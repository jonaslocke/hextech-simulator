"use client";

import { FC, useState } from "react";
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
import { PlayerBoard } from "./components/player-board";
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

export const GameBoard: FC<GameBoardProps> = ({
  chainCardInstanceIds = [],
  cardsByInstanceId,
  logEntries = [],
  playerNames = {},
  projection,
  scores = {},
}) => {
  const [openZone, setOpenZone] = useState<TemporaryZone>(null);
  const chainCards = chainCardInstanceIds.flatMap((cardInstanceId) =>
    buildCard(cardInstanceId, cardsByInstanceId),
  );
  const board = createBoardModel({
    cardsByInstanceId,
    playerNames,
    projection,
    scores,
  });

  return (
    <main className="relative flex flex-col h-screen text-slate-100">
      <ScoreHeader opponent={board.opponent} player={board.player} />
      <section className="flex flex-1">
        <div className="flex-1 gap-2 grid grid-rows-[146px_minmax(0,1fr)_calc(100vh/3)_minmax(0,1fr)_146px] p-2">
          <PlayerBoard
            onOpenBanish={() => setOpenZone("banish")}
            onOpenTrash={() => setOpenZone("opponentTrash")}
            player={board.opponent}
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
            player={board.player}
          />
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
    </main>
  );
};

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
    scores,
  });
  const opponent = buildPlayerData({
    cardsByInstanceId,
    player: projection.players[opponentPlayerId],
    playerNames,
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
    viewerPlayerId,
    cardOwnerByInstanceId,
  });
  const opponentBattlefield = buildBattlefieldData({
    battlefield: opponentBattlefieldProjection,
    cardsByInstanceId,
    fallbackSelectedByPlayerId: opponentPlayerId,
    opponentPlayerId,
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
  scores,
}: {
  cardsByInstanceId: Record<string, CatalogCard>;
  player: ProjectedPlayerState | undefined;
  playerNames: Partial<Record<string, string>>;
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
      banishment: buildZone("banishment", player.zones.banishment, cardsByInstanceId),
      base: buildZone("base", player.zones.base, cardsByInstanceId),
      champion: buildZone("champion", player.zones.champion, cardsByInstanceId),
      hand: buildZone("hand", player.zones.hand, cardsByInstanceId),
      legend: buildZone("legend", player.zones.legend, cardsByInstanceId),
      mainDeck: buildZone("mainDeck", player.zones.mainDeck, cardsByInstanceId),
      runeDeck: buildZone("runeDeck", player.zones.runeDeck, cardsByInstanceId),
      trash: buildZone("trash", player.zones.trash, cardsByInstanceId),
    },
  };
}

function buildZone(
  kind: ZoneKind,
  zone: ProjectedZone,
  cardsByInstanceId: Record<string, CatalogCard>,
): ZoneData {
  const cards = zone.cardInstanceIds
    .flatMap((cardInstanceId) => buildCard(cardInstanceId, cardsByInstanceId))
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
  viewerPlayerId,
}: {
  battlefield: ProjectedBattlefield | undefined;
  cardsByInstanceId: Record<string, CatalogCard>;
  cardOwnerByInstanceId: Record<string, string>;
  fallbackSelectedByPlayerId: string;
  opponentPlayerId: string;
  viewerPlayerId: string;
}): BattlefieldData {
  const battlefieldCard = battlefield
    ? cardsByInstanceId[battlefield.cardInstanceId]
    : undefined;
  const unitCards = (battlefield?.units ?? []).flatMap((cardInstanceId) => {
    const ownerPlayerId =
      cardOwnerByInstanceId[cardInstanceId] ?? battlefield?.selectedByPlayerId;
    const card = buildCard(cardInstanceId, cardsByInstanceId).filter((item) =>
      isCardAllowedInZone("battlefield", item),
    );

    return card.map((item) => ({
      card: item,
      ownerPlayerId,
    }));
  });

  return {
    id: battlefield?.battlefieldId ?? `missing:${fallbackSelectedByPlayerId}`,
    selectedByPlayerId: battlefield?.selectedByPlayerId ?? fallbackSelectedByPlayerId,
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
): Card[] {
  const card = cardsByInstanceId[cardInstanceId];

  if (!card) {
    return [];
  }

  return [
    {
      img: card.media.image_url ?? "",
      instanceId: cardInstanceId,
      isExhausted: isCardExhausted(cardInstanceId),
      might: card.attributes.might ?? undefined,
      name: card.name,
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
      return card.type === "Gear" || card.type === "Spell" || card.type === "Unit";
    case "base":
      return card.type === "Rune" || card.type === "Gear" || card.type === "Unit";
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

function isCardExhausted(cardInstanceId: string) {
  return cardInstanceId.includes(":exhausted:") || cardInstanceId.includes("-exhausted-");
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
