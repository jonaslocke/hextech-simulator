import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyStartOfTurn,
  type BehaviorBinding,
  type BehaviorClause,
  type DeckSnapshotDocument,
  gameplayActions,
  performGameplayAction,
  projectGame,
  type GameDocument,
} from "../src/server/game";
import { beginEffectResolution } from "../src/server/game/effect-resolution";
import { adaptProjectionToBoard } from "../src/features/game-board/board-view-model";
import { filterCardsForZone } from "../src/features/game-board/board-card-visibility";

const syntheticCardId = "p1:synthetic-unit-gear";

test("multi-type cards stay visible through every projected hand boundary", () => {
  const opening = fixture({
    hand: [syntheticCardId, "p1:unit", "p1:gear", "p1:spell"],
  });
  assertHandPresentation(opening, [
    syntheticCardId,
    "p1:unit",
    "p1:gear",
    "p1:spell",
  ]);

  const draw = fixture({
    hand: ["p1:unit", "p1:gear", "p1:spell"],
    mainDeck: [syntheticCardId],
    phase: "draw",
  });
  applyStartOfTurn(draw.game, draw.decks);
  assert.deepEqual(draw.game.state.players.p1!.zones.mainDeck, []);
  assertHandPresentation(draw, [
    "p1:unit",
    "p1:gear",
    "p1:spell",
    syntheticCardId,
  ]);

  const search = fixture({
    hand: ["p1:unit", "p1:gear", "p1:spell"],
    mainDeck: [syntheticCardId],
  });
  assert.equal(
    beginEffectResolution({
      game: search.game,
      controllerPlayerId: "p1",
      sourceCardInstanceId: "p1:search-source",
      clauseId: "synthetic",
      decks: search.decks,
    }),
    false,
  );
  const selection = gameplayActions(search.game, "p1", search.decks).find(
    (action) => action.choice?.kind === "effectSelection",
  );
  assert.ok(selection);
  assert.deepEqual(selection.targets[0]?.legalIds, [syntheticCardId]);
  const selected = performGameplayAction({
    game: search.game,
    actorPlayerId: "p1",
    actionId: selection.id,
    selectedIds: [syntheticCardId],
    decks: search.decks,
    now: "search-select",
  });
  search.game = selected;
  assert.deepEqual(search.game.state.players.p1!.zones.mainDeck, []);
  assertHandPresentation(search, [
    "p1:unit",
    "p1:gear",
    "p1:spell",
    syntheticCardId,
  ]);
});

function assertHandPresentation(
  input: ReturnType<typeof fixture>,
  expectedIds: string[],
) {
  // Authoritative state.
  assert.deepEqual(input.game.state.players.p1!.zones.hand, expectedIds);

  // Viewer projection and projection adaptation retain every exact identity.
  const projection = projectGame({
    game: input.game,
    viewerPlayerId: "p1",
    decks: input.decks,
  });
  const projectedHand = projection.players
    .find((player) => player.playerId === "p1")!
    .zones.find((zone) => zone.kind === "hand")!;
  assert.deepEqual(
    projectedHand.cards.map((card) => card.instanceId),
    expectedIds,
  );
  const adapted = adaptProjectionToBoard(projection);
  assert.deepEqual(
    adapted.projection.players.p1!.zones.hand.cardInstanceIds,
    expectedIds,
  );
  assert.deepEqual(
    Object.keys(adapted.cardsByInstanceId).filter((id) => expectedIds.includes(id)),
    expectedIds,
  );
  assert.equal(
    adapted.cardsByInstanceId[syntheticCardId]!.classification.type,
    "Unit / Gear",
  );

  // This is the Card[] filtering immediately before PlayerHandFan. No transfer
  // can hide these cards: it receives only the separate active-transfer ID set.
  const handCards = filterCardsForZone(
    "hand",
    expectedIds.map((instanceId) => ({
      instanceId,
      name: adapted.cardsByInstanceId[instanceId]!.name,
      type: adapted.cardsByInstanceId[instanceId]!.classification.type,
    })),
  );
  assert.deepEqual(
    handCards.map((card) => card.instanceId),
    expectedIds,
  );
}

function fixture({
  hand = [],
  mainDeck = [],
  phase = "action",
}: {
  hand?: string[];
  mainDeck?: string[];
  phase?: "action" | "draw";
} = {}): { game: GameDocument; decks: DeckSnapshotDocument[] } {
  const cards = [
    definition("SYNTHETIC_UNIT_GEAR", "Synthetic Unit Gear", "Unit", [
      binding("type.additional", 0, { type: "Gear" }),
    ]),
    definition("UNIT", "Unit", "Unit"),
    definition("GEAR", "Gear", "Gear"),
    definition("SPELL", "Spell", "Spell"),
    definition("SEARCH_SOURCE", "Search Source", "Battlefield", [], [
      binding("action.search_top_deck", 0, {
        cardType: "Gear",
        count: 1,
        maximumSelect: 1,
        revealSelected: true,
      }),
    ]),
  ];
  const instances = [
    {
      instanceId: syntheticCardId,
      ownerPlayerId: "p1",
      source: "mainDeck" as const,
      cardCode: "SYNTHETIC_UNIT_GEAR",
    },
    { instanceId: "p1:unit", ownerPlayerId: "p1", source: "mainDeck" as const, cardCode: "UNIT" },
    { instanceId: "p1:gear", ownerPlayerId: "p1", source: "mainDeck" as const, cardCode: "GEAR" },
    { instanceId: "p1:spell", ownerPlayerId: "p1", source: "mainDeck" as const, cardCode: "SPELL" },
    { instanceId: "p1:search-source", ownerPlayerId: "p1", source: "battlefield" as const, cardCode: "SEARCH_SOURCE" },
  ];
  const snapshot = { sourceText: "", catalogDigest: "synthetic", entries: [], cards };
  const decks: DeckSnapshotDocument[] = [
    { id: "p1-deck", createdAt: "a", updatedAt: "a", matchId: "m", playerId: "p1", snapshot, instances },
    { id: "p2-deck", createdAt: "a", updatedAt: "a", matchId: "m", playerId: "p2", snapshot, instances: [] },
  ];
  const zones = (currentHand: string[], currentMainDeck: string[]) => ({
    legend: null,
    champion: null,
    mainDeck: currentMainDeck,
    runeDeck: [],
    hand: currentHand,
    trash: [],
    banishment: [],
    base: [],
  });
  const game: GameDocument = {
    id: "synthetic-hand-visibility",
    matchId: "m",
    createdAt: "a",
    updatedAt: "a",
    gameNumber: 1,
    stateVersion: 0,
    status: "in_progress",
    winnerPlayerId: null,
    completionReason: null,
    state: {
      setup: {
        playerIds: ["p1", "p2"],
        startingPlayerChooserId: "p1",
        startingPlayerId: "p1",
        battlefieldPools: {},
        battlefieldChoices: {},
        mulligans: {},
      },
      players: {
        p1: { playerId: "p1", energy: 0, conditionalEnergy: 0, power: {}, zones: zones(hand, mainDeck) },
        p2: { playerId: "p2", energy: 0, conditionalEnergy: 0, power: {}, zones: zones([], []) },
      },
      battlefields: [
        {
          battlefieldId: "p1:search-source",
          cardInstanceId: "p1:search-source",
          selectedByPlayerId: "p1",
          units: [],
        },
      ],
      cardStates: Object.fromEntries(
        instances.map((instance) => [
          instance.instanceId,
          { exhausted: false, damage: 0, computedMight: null },
        ]),
      ),
      turn: { turnNumber: 3, activePlayerId: "p1", phase },
      chain: null,
      showdown: null,
      combat: null,
      modifiers: [],
      ongoingEffects: [],
      delayedEffects: [],
      effectResolutions: [],
      pendingChoice: null,
      queuedTriggerChoices: [],
    },
  };
  return { game, decks };
}

function definition(
  cardCode: string,
  name: string,
  type: "Unit" | "Gear" | "Spell" | "Battlefield",
  keywords: BehaviorBinding[] = [],
  effects: BehaviorBinding[] = [],
) {
  return {
    cardCode,
    sourceTextHash: "synthetic",
    behaviorModel: {
      playTimings: [],
      clauses: [clause("synthetic", { effects, keywords })],
    },
    card: {
      id: cardCode,
      name,
      public_code: `${cardCode}/1`,
      attributes: { energy: 0, might: type === "Unit" ? 1 : null, power: null },
      classification: { type, supertype: null, domain: ["Mind"] },
      text: { plain: "" },
      set: { set_id: "synthetic", label: "Synthetic" },
      media: {},
      tags: [],
      metadata: {},
    },
  };
}

function binding(
  behaviorId: string,
  order: number,
  parameters: Record<string, string | number | boolean | null>,
): BehaviorBinding {
  return { behaviorId, parameters, confidence: "high", order };
}

function clause(
  id: string,
  input: Partial<BehaviorClause>,
): BehaviorClause {
  return {
    id,
    sequence: 0,
    sourceText: "",
    normalizedText: "",
    abilities: [],
    triggers: [],
    conditions: [],
    selectors: [],
    choices: [],
    costs: [],
    timings: [],
    effects: [],
    keywords: [],
    ...input,
  };
}
