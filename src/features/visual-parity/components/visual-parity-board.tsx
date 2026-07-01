"use client";

import cardBackImage from "../../../../assets/cardback.jpg";
import { GameBoard } from "@/features/game-board";
import { GameBoardV2 } from "@/features/game-board-v2";
import type { GameProjectionV2, ProjectedCardView, ProjectedZoneV2 } from "@/shared/game-v2";
import type { Card as CatalogCard } from "@/server/catalog";
import type { GameProjection } from "@/server/match";

type Variant = "normal" | "chain" | "showdown" | "hand-small" | "hand-large";

export function VisualParityBoard({ engine, variant }: { engine: "legacy" | "v2"; variant: Variant }) {
  const cards = cardsByInstanceId();
  if (engine === "legacy") {
    return <GameBoard cardsByInstanceId={cards} logEntries={[]} onActivateAbility={() => {}} onAddRuneResource={() => {}} onEndTurn={() => {}} onPass={() => {}} onPlayCard={() => {}} onSubmitChoice={() => {}} projection={legacyProjection(variant)} />;
  }
  return <GameBoardV2 onPerformAction={() => {}} projection={v2Projection(variant)} />;
}

const IDS = {
  p1Legend: "p1:legend", p1Champion: "p1:champion", p1Hand: "p1:hand", p1Rune: "p1:rune", p1Unit: "p1:unit",
  p2Legend: "p2:legend", p2Champion: "p2:champion", p2Hand: "p2:hand", p2Rune: "p2:rune", p2Unit: "p2:unit",
  bf1: "p1:battlefield", bf2: "p2:battlefield"
} as const;
const HAND_CARD_IDS = Array.from(
  { length: 16 },
  (_, index) => `p1:hand-test:${index + 1}`
);

function cardsByInstanceId(): Record<string, CatalogCard> {
  const fixedCards = Object.entries(IDS).map(([key, id]) => [id, {
    id, name: displayName(key), public_code: key.toUpperCase(),
    attributes: { energy: key.includes("Hand") ? 2 : 0, might: key.includes("Unit") ? 3 : null, power: key.includes("Hand") ? 1 : 0 },
    classification: { type: key.includes("bf") ? "Battlefield" : key.includes("Rune") ? "Rune" : key.includes("Legend") ? "Legend" : key.includes("Champion") || key.includes("Unit") ? "Unit" : "Spell", supertype: key.includes("Rune") ? "Basic" : null, domain: ["Mind"] },
    text: { plain: key.includes("bf") ? "Battlefield rules text." : "Card rules text." },
    set: { set_id: "TEST", label: "Parity" }, media: { image_url: cardBackImage.src }, tags: [], metadata: {}
  } as CatalogCard] as const);
  const handCards = HAND_CARD_IDS.map((id, index) => [id, {
    id,
    name: `Hand Card ${index + 1}`,
    public_code: `HAND-${index + 1}`,
    attributes: { energy: 2, might: null, power: 1 },
    classification: { type: "Spell", supertype: null, domain: ["Mind"] },
    text: { plain: "Card rules text." },
    set: { set_id: "TEST", label: "Parity" },
    media: { image_url: cardBackImage.src },
    tags: [],
    metadata: {}
  } as CatalogCard] as const);
  return Object.fromEntries([...fixedCards, ...handCards]);
}

function legacyProjection(variant: Variant): GameProjection {
  const zone = (
    ids: string[],
    visibility: "public" | "private" | "secret" = "public",
    count = ids.length
  ) => ({ cardInstanceIds: visibility === "secret" ? [] : ids, count, visibility });
  const playerHandIds = handIdsForVariant(variant);
  const player = (id: "p1" | "p2", viewer: boolean) => ({
    playerId: id, isViewer: viewer,
    runePool: { energy: viewer ? 2 : 0, power: (viewer ? { Mind: 1 } : {}) as Record<string, number>, conditionalEnergy: {} },
    availableAbilityIdsByCard: {}, availablePaymentModes: {}, legalTargetsByCard: {},
    zones: {
      legend: zone([IDS[`${id}Legend`]]), champion: zone([IDS[`${id}Champion`]]), mainDeck: zone([], "secret", 35), runeDeck: zone([], "secret", 10),
      hand: viewer ? zone(id === "p1" ? playerHandIds : [IDS.p2Hand], "private") : zone([], "private", 1), trash: zone([]), banishment: zone([]), base: zone([IDS[`${id}Rune`]])
    }
  });
  return {
    id: "parity-game", matchId: "parity-match", gameNumber: 1, status: "in_progress", stateVersion: 7, viewerPlayerId: "p1", winnerPlayerId: null,
    setup: { playerIds: ["p1", "p2"], startingPlayerChooserId: "p1", startingPlayerId: "p1", battlefieldChoices: {}, battlefieldPools: {}, mulliganChoices: {} },
    turn: { turnNumber: 2, activePlayerId: "p1", phase: "action", passedPlayerIds: [], completedStartOfTurnSteps: ["awaken", "beginning", "channel", "draw"] },
    showdown: variant === "showdown" ? { battlefieldId: IDS.bf1, relevantPlayerIds: ["p1", "p2"], focusPlayerId: "p1", priorityPlayerId: "p1", passedPlayerIds: [] } : null,
    chain: variant === "chain" ? { items: [{ id: "chain-1", controllerPlayerId: "p1", sourceCardInstanceId: IDS.p1Hand, cardInstanceId: IDS.p1Hand, label: "Parity Spell", kind: "spell", targetCardInstanceIds: [IDS.p2Unit] }], relevantPlayerIds: ["p1", "p2"], priorityPlayerId: "p2", passedPlayerIds: [] } : null,
    pendingChoice: null,
    players: { p1: player("p1", true), p2: player("p2", false) },
    battlefields: [
      { battlefieldId: IDS.bf1, selectedByPlayerId: "p1", cardInstanceId: IDS.bf1, units: [IDS.p1Unit], facedownSlot: null },
      { battlefieldId: IDS.bf2, selectedByPlayerId: "p2", cardInstanceId: IDS.bf2, units: [IDS.p2Unit], facedownSlot: null }
    ],
    cardStates: Object.fromEntries(Object.values(IDS).map((id) => [id, { exhausted: id === IDS.p1Rune, damage: id === IDS.p2Unit ? 1 : 0, ...(id.includes("unit") ? { computedMight: 3 } : {}) }]))
  };
}

function v2Projection(variant: Variant): GameProjectionV2 {
  const cards = Object.fromEntries([
    ...Object.entries(IDS).map(([key, id]) => [id, projectedCard(key, id)] as const),
    ...HAND_CARD_IDS.map((id, index) => [
      id,
      projectedHandCard(id, index)
    ] as const)
  ]);
  const playerHandIds = handIdsForVariant(variant);
  const zones = (id: "p1" | "p2", viewer: boolean): ProjectedZoneV2[] => [
    z("legend", [cards[IDS[`${id}Legend`]]!]), z("champion", [cards[IDS[`${id}Champion`]]!]), z("mainDeck", [], "secret", 35), z("runeDeck", [], "secret", 10),
    z("hand", viewer ? (id === "p1" ? playerHandIds : [IDS.p2Hand]).map((cardId) => cards[cardId]!) : [], viewer ? "private" : "secret", viewer && id === "p1" ? playerHandIds.length : 1), z("trash", []), z("banishment", []), z("base", [cards[IDS[`${id}Rune`]]!])
  ];
  const chainItem = { id: "chain-1", label: "Parity Spell", controllerPlayerId: "p1", sourceCardInstanceId: IDS.p1Hand, targetCardInstanceIds: [IDS.p2Unit], kind: "spell" as const, card: cards[IDS.p1Hand]! };
  return {
    id: "parity-game", matchId: "parity-match", gameNumber: 1, stateVersion: 7, status: "in_progress", viewerPlayerId: "p1", activePlayerId: "p1", winnerPlayerId: null,
    setup: { playerIds: ["p1", "p2"], startingPlayerChooserId: "p1", startingPlayerId: "p1", battlefieldChoices: {}, mulligans: {}, battlefieldPool: [], waitingReason: null },
    turn: { turnNumber: 2, activePlayerId: "p1", phase: "action", passedPlayerIds: [] },
    showdown: variant === "showdown" ? { battlefieldId: IDS.bf1, relevantPlayerIds: ["p1", "p2"], focusPlayerId: "p1", priorityPlayerId: "p1", passedPlayerIds: [] } : null,
    pendingChoice: null,
    players: [
      { playerId: "p1", isViewer: true, energy: 2, conditionalEnergy: 0, power: { Mind: 1 }, zones: zones("p1", true) },
      { playerId: "p2", isViewer: false, energy: 0, conditionalEnergy: 0, power: {}, zones: zones("p2", false) }
    ],
    battlefields: [
      { battlefieldId: IDS.bf1, selectedByPlayerId: "p1", card: cards[IDS.bf1]!, units: [cards[IDS.p1Unit]!], facedownCard: null },
      { battlefieldId: IDS.bf2, selectedByPlayerId: "p2", card: cards[IDS.bf2]!, units: [cards[IDS.p2Unit]!], facedownCard: null }
    ],
    chain: variant === "chain" ? { items: [chainItem], relevantPlayerIds: ["p1", "p2"], priorityPlayerId: "p2", passedPlayerIds: [] } : null,
    actions: [], logEntries: []
  };
}

function projectedCard(key: string, id: string): ProjectedCardView {
  return {
    instanceId: id, ownerPlayerId: id.startsWith("p2") ? "p2" : "p1", name: displayName(key), imageUrl: cardBackImage.src,
    rulesText: key.includes("bf") ? "Battlefield rules text." : "Card rules text.", publicCode: key.toUpperCase(),
    type: key.includes("bf") ? "Battlefield" : key.includes("Rune") ? "Rune" : key.includes("Legend") ? "Legend" : key.includes("Champion") || key.includes("Unit") ? "Unit" : "Spell",
    supertype: key.includes("Rune") ? "Basic" : null, domains: ["Mind"], energy: key.includes("Hand") ? 2 : 0,
    might: key.includes("Unit") ? 3 : null, power: key.includes("Hand") ? 1 : 0, computedMight: key.includes("Unit") ? 3 : null,
    damage: id === IDS.p2Unit ? 1 : 0, exhausted: id === IDS.p1Rune
  };
}
function projectedHandCard(id: string, index: number): ProjectedCardView {
  return {
    instanceId: id, ownerPlayerId: "p1", name: `Hand Card ${index + 1}`,
    imageUrl: cardBackImage.src, rulesText: "Card rules text.",
    publicCode: `HAND-${index + 1}`, type: "Spell", supertype: null,
    domains: ["Mind"], energy: 2, might: null, power: 1,
    computedMight: null, damage: 0, exhausted: false
  };
}
function handIdsForVariant(variant: Variant) {
  if (variant === "hand-small") return HAND_CARD_IDS.slice(0, 4);
  if (variant === "hand-large") return HAND_CARD_IDS;
  return [IDS.p1Hand];
}
function z(kind: ProjectedZoneV2["kind"], cards: ProjectedCardView[], visibility: ProjectedZoneV2["visibility"] = "public", count = cards.length): ProjectedZoneV2 { return { kind, cards, visibility, count }; }
function displayName(key: string) { return key.includes("bf") ? `Battlefield ${key.at(-1)}` : key.replace(/^p[12]/, "").replace(/([A-Z])/g, " $1").trim(); }
