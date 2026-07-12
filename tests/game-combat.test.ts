import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cleanupBoard,
  createRuntimeCardIndex,
  gameplayActions,
  performGameplayAction,
  performGameplayTransition,
  projectGame,
  type DeckSnapshotDocument,
  type BehaviorBinding,
  type GameDocument
} from "../src/server/game";

test("resolves one-on-one combat simultaneously and conquers with a survivor", () => {
  const { game: initial, decks } = combatFixture({
    attackerMight: 4,
    defenders: [{ id: "defender", might: 2 }]
  });
  let game = moveAttacker(initial, decks);
  assert.equal(game.state.showdown?.kind, "combat");
  assert.equal(game.state.combat?.attackerPlayerId, "p1");
  game = passShowdown(game, decks);

  assert.equal(game.state.combat, null);
  assert.equal(game.state.showdown, null);
  assert.equal(game.state.battlefields[0]!.controllerPlayerId, "p1");
  assert.equal(game.state.players.p1!.points, 1);
  assert.ok(game.state.battlefields[0]!.units.includes("attacker"));
  assert.ok(game.state.players.p2!.zones.trash.includes("defender"));
  assert.equal(game.state.cardStates.attacker!.damage, 0);
  assert.equal(game.state.cardStates.attacker!.combatRole, null);
});

test("keeps conquer triggers after combat resolves", () => {
  const { game: initial, decks } = combatFixture({
    attackerMight: 4,
    defenders: [{ id: "defender", might: 2 }],
  });
  const battlefield = decks[1]!.snapshot.cards.find(
    (card) => card.cardCode === "BF",
  )!;
  battlefield.behaviorModel.clauses = [
    {
      id: "conquer",
      sequence: 0,
      sourceText: "When you conquer here, draw 1.",
      normalizedText: "When you conquer here, draw 1.",
      abilities: [],
      triggers: [
        {
          behaviorId: "trigger.conquer_battlefield",
          parameters: {},
          confidence: "high",
          order: 0,
        },
      ],
      conditions: [],
      selectors: [],
      choices: [],
      costs: [],
      timings: [],
      effects: [
        {
          behaviorId: "action.draw_cards",
          parameters: { player: "controller", count: 1 },
          confidence: "high",
          order: 1,
        },
      ],
      keywords: [],
    },
  ];

  const game = passShowdown(moveAttacker(initial, decks), decks);

  assert.equal(game.state.chain?.items.length, 1);
  assert.equal(game.state.chain?.items[0]?.sourceCardInstanceId, "battlefield");
});

test("projects a unit's temporary keyword modifier with its duration", () => {
  const { game, decks } = combatFixture({
    attackerMight: 2,
    defenders: [],
  });
  game.state.modifiers.push({
    id: "cleave:assault",
    sourceCardInstanceId: "cleave",
    controllerPlayerId: "p1",
    targetCardInstanceId: "attacker",
    targetScope: "unit",
    attribute: "keyword.assault",
    operation: "increase",
    amount: 3,
    minimum: null,
    duration: "thisTurn",
    createdAtTurn: 1,
  });

  const projection = projectGame({ game, viewerPlayerId: "p1", decks });
  const attacker = projection.players
    .find((player) => player.playerId === "p1")!
    .zones.find((zone) => zone.kind === "base")!
    .cards.find((card) => card.instanceId === "attacker");

  assert.deepEqual(attacker?.activeModifiers, [
    { label: "Assault 3", duration: "This turn" },
  ]);
});

test.skip("requires lethal Tank assignment before non-Tank combat damage", () => {
  const { game: initial, decks } = combatFixture({
    attackerMight: 5,
    defenders: [
      { id: "tank", might: 3, tank: true },
      { id: "other", might: 3 }
    ]
  });
  let game = passShowdown(moveAttacker(initial, decks), decks);
  assert.equal(game.state.pendingChoice?.type, "assignCombatDamage");
  const actorProjection = projectGame({
    game,
    viewerPlayerId: "p1",
    decks
  });
  const waitingProjection = projectGame({
    game,
    viewerPlayerId: "p2",
    decks
  });
  assert.deepEqual(actorProjection.pendingChoice, {
    type: "assignCombatDamage",
    id: game.state.pendingChoice?.id,
    playerId: "p1",
    totalDamage: 5
  });
  assert.deepEqual(waitingProjection.pendingChoice, actorProjection.pendingChoice);
  assert.equal(waitingProjection.actions.length, 0);
  const assignment = gameplayActions(game, "p1", decks)[0]!;
  assert.equal(assignment.choice?.kind, "combatDamage");
  assert.throws(() => performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: assignment.id,
    selectedIds: [],
    allocations: [
      { targetUnitId: "tank", amount: 2 },
      { targetUnitId: "other", amount: 3 }
    ],
    decks,
    now: "invalid"
  }), /Tank units must be assigned lethal damage first/);

  game = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: assignment.id,
    selectedIds: [],
    allocations: [
      { targetUnitId: "tank", amount: 3 },
      { targetUnitId: "other", amount: 2 }
    ],
    decks,
    now: "valid"
  });
  assert.equal(game.state.combat, null);
  assert.ok(game.state.players.p2!.zones.trash.includes("tank"));
  assert.ok(game.state.battlefields[0]!.units.includes("other"));
});

test.skip("allows Tank ordering but requires every Tank before non-Tank damage", () => {
  const { game: initial, decks } = combatFixture({
    attackerMight: 8,
    defenders: [
      { id: "tank-a", might: 3, tank: true },
      { id: "tank-b", might: 2, tank: true },
      { id: "other", might: 3 }
    ]
  });
  const game = passShowdown(moveAttacker(initial, decks), decks);
  const assignment = gameplayActions(game, "p1", decks)[0]!;

  assert.throws(() => performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: assignment.id,
    selectedIds: [],
    allocations: [
      { targetUnitId: "tank-b", amount: 2 },
      { targetUnitId: "other", amount: 3 },
      { targetUnitId: "tank-a", amount: 3 }
    ],
    decks,
    now: "invalid-multiple-tanks"
  }), /Tank units must be assigned lethal damage first/);

  assert.doesNotThrow(() => performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: assignment.id,
    selectedIds: [],
    allocations: [
      { targetUnitId: "tank-b", amount: 2 },
      { targetUnitId: "tank-a", amount: 3 },
      { targetUnitId: "other", amount: 3 }
    ],
    decks,
    now: "valid-multiple-tanks"
  }));
});

test("locks Assault and Shield modifiers into combat Might totals", () => {
  const { game: initial, decks } = combatFixture({
    attackerMight: 2,
    attackerAssault: 2,
    defenders: [
      { id: "shield", might: 2, shield: 3 },
      { id: "support", might: 2 }
    ]
  });
  const showdown = moveAttacker(initial, decks);
  assert.equal(showdown.state.cardStates.attacker!.computedMight, 4);
  assert.equal(showdown.state.cardStates.shield!.computedMight, 5);
  assert.equal(showdown.state.cardStates.support!.computedMight, 2);

  const game = passShowdown(showdown, decks);
  assert.equal(game.state.combat?.attackerMight, 4);
  assert.equal(game.state.combat?.defenderMight, 7);
  assert.equal(game.state.pendingChoice?.type, "assignCombatDamage");
});

test("emits structured showdown and combat transition events", () => {
  const { game, decks } = combatFixture({
    attackerMight: 3,
    defenders: [{ id: "defender", might: 3 }]
  });
  const move = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "attacker"
  )!;
  const transition = performGameplayTransition({
    game,
    actorPlayerId: "p1",
    actionId: move.id,
    selectedIds: [],
    decks,
    now: "events"
  });
  assert.deepEqual(
    transition.events.map((event) => event.type),
    ["game.action.accepted", "showdown.started", "combat.started"]
  );
});

test("leaves an empty battlefield when equal units kill each other", () => {
  const { game: initial, decks } = combatFixture({
    attackerMight: 2,
    defenders: [{ id: "defender", might: 2 }]
  });
  const game = passShowdown(moveAttacker(initial, decks), decks);
  assert.equal(game.state.battlefields[0]!.units.length, 0);
  assert.equal(game.state.battlefields[0]!.controllerPlayerId, null);
  assert.ok(game.state.players.p1!.zones.trash.includes("attacker"));
  assert.ok(game.state.players.p2!.zones.trash.includes("defender"));
});

test("cleanup clears stale battlefield control and contest after units die", () => {
  const { game, decks } = combatFixture({
    attackerMight: 2,
    defenders: [{ id: "defender", might: 2 }]
  });
  const battlefield = game.state.battlefields[0]!;
  battlefield.units.push("attacker");
  battlefield.contestedByPlayerId = "p1";
  game.state.cardStates.attacker!.damage = 2;
  game.state.cardStates.defender!.damage = 2;

  cleanupBoard(game, createRuntimeCardIndex(decks));

  assert.deepEqual(battlefield.units, []);
  assert.equal(battlefield.controllerPlayerId, null);
  assert.equal(battlefield.contestedByPlayerId, null);
});

test("cleanup clears a dead challenger's contest while preserving the controller", () => {
  const { game, decks } = combatFixture({
    attackerMight: 2,
    defenders: [{ id: "defender", might: 2 }]
  });
  const battlefield = game.state.battlefields[0]!;
  battlefield.units.push("attacker");
  battlefield.contestedByPlayerId = "p1";
  game.state.cardStates.attacker!.damage = 2;

  cleanupBoard(game, createRuntimeCardIndex(decks));

  assert.deepEqual(battlefield.units, ["defender"]);
  assert.equal(battlefield.controllerPlayerId, "p2");
  assert.equal(battlefield.contestedByPlayerId, null);
});

test("clears surviving damage before temporary Might expires at end of turn", () => {
  const { game: initial, decks } = combatFixture({
    attackerMight: 2,
    defenders: []
  });
  initial.state.cardStates.attacker!.damage = 2;
  initial.state.cardStates.attacker!.computedMight = 4;
  initial.state.modifiers.push({
    id: "temporary-might",
    sourceCardInstanceId: null,
    controllerPlayerId: "p1",
    targetCardInstanceId: "attacker",
    targetScope: "unit",
    attribute: "might",
    operation: "increase",
    amount: 2,
    minimum: null,
    duration: "thisTurn",
    createdAtTurn: 1
  });

  const endTurn = gameplayActions(initial, "p1", decks).find(
    (action) => action.label === "End turn"
  )!;
  const game = performGameplayAction({
    game: initial,
    actorPlayerId: "p1",
    actionId: endTurn.id,
    selectedIds: [],
    decks,
    now: "end-turn-expiration"
  });

  assert.ok(game.state.players.p1!.zones.base.includes("attacker"));
  assert.ok(!game.state.players.p1!.zones.trash.includes("attacker"));
  assert.equal(game.state.cardStates.attacker!.damage, 0);
  assert.equal(game.state.cardStates.attacker!.computedMight, 2);
  assert.equal(game.state.modifiers.length, 0);
});

function moveAttacker(
  initial: GameDocument,
  decks: DeckSnapshotDocument[]
) {
  const move = gameplayActions(initial, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "attacker"
  )!;
  return performGameplayAction({
    game: initial,
    actorPlayerId: "p1",
    actionId: move.id,
    selectedIds: [],
    decks,
    now: "move"
  });
}

function passShowdown(
  initial: GameDocument,
  decks: DeckSnapshotDocument[]
) {
  let game = initial;
  while (game.state.showdown) {
    const playerId = game.state.showdown.focusPlayerId;
    const pass = gameplayActions(game, playerId, decks).find(
      (action) => action.label === "Pass focus"
    )!;
    game = performGameplayAction({
      game,
      actorPlayerId: playerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: "pass"
    });
  }
  return game;
}

function combatFixture(input: {
  attackerMight: number;
  attackerAssault?: number;
  defenders: Array<{
    id: string;
    might: number;
    tank?: boolean;
    shield?: number;
  }>;
}) {
  const cards = [
    definition(
      "ATTACKER",
      "Attacker",
      "Unit",
      input.attackerMight,
      false,
      input.attackerAssault
    ),
    ...input.defenders.map((unit) =>
      definition(
        unit.id.toUpperCase(),
        unit.id,
        "Unit",
        unit.might,
        unit.tank,
        undefined,
        unit.shield
      )
    ),
    definition("BF", "Arena", "Battlefield", 0)
  ];
  const instances = [
    {
      instanceId: "attacker",
      ownerPlayerId: "p1",
      source: "mainDeck" as const,
      cardCode: "ATTACKER"
    },
    ...input.defenders.map((unit) => ({
      instanceId: unit.id,
      ownerPlayerId: "p2",
      source: "mainDeck" as const,
      cardCode: unit.id.toUpperCase()
    })),
    {
      instanceId: "battlefield",
      ownerPlayerId: "p2",
      source: "battlefield" as const,
      cardCode: "BF"
    }
  ];
  const snapshot = {
    sourceText: "",
    catalogDigest: "combat",
    entries: [],
    cards
  };
  const decks: DeckSnapshotDocument[] = [
    {
      id: "p1-deck",
      createdAt: "a",
      updatedAt: "a",
      matchId: "m",
      playerId: "p1",
      snapshot,
      instances: instances.filter((item) => item.ownerPlayerId === "p1")
    },
    {
      id: "p2-deck",
      createdAt: "a",
      updatedAt: "a",
      matchId: "m",
      playerId: "p2",
      snapshot,
      instances: instances.filter((item) => item.ownerPlayerId === "p2")
    }
  ];
  const zones = (base: string[]) => ({
    legend: null,
    champion: null,
    mainDeck: [],
    runeDeck: [],
    hand: [],
    trash: [],
    banishment: [],
    base
  });
  const game: GameDocument = {
    id: "g",
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
        mulligans: {}
      },
      players: {
        p1: {
          playerId: "p1",
          points: 0,
          scoredBattlefieldIdsThisTurn: [],
          energy: 0,
          conditionalEnergy: 0,
          power: {},
          zones: zones(["attacker"])
        },
        p2: {
          playerId: "p2",
          points: 0,
          scoredBattlefieldIdsThisTurn: [],
          energy: 0,
          conditionalEnergy: 0,
          power: {},
          zones: zones([])
        }
      },
      battlefields: [{
        battlefieldId: "battlefield",
        cardInstanceId: "battlefield",
        selectedByPlayerId: "p2",
        controllerPlayerId: "p2",
        contestedByPlayerId: null,
        units: input.defenders.map((unit) => unit.id)
      }],
      cardStates: Object.fromEntries([
        ["attacker", input.attackerMight],
        ...input.defenders.map((unit) => [unit.id, unit.might] as const),
        ["battlefield", null]
      ].map(([id, might]) => [id, {
        exhausted: false,
        damage: 0,
        computedMight: might,
        combatRole: null
      }])),
      turn: { turnNumber: 1, activePlayerId: "p1", phase: "action" },
      chain: null,
      showdown: null,
      combat: null,
      modifiers: [],
      ongoingEffects: [],
      delayedEffects: [],
      effectResolutions: [],
      pendingChoice: null,
      queuedTriggerChoices: []
    }
  };
  return { game, decks };
}

function definition(
  code: string,
  name: string,
  type: "Unit" | "Battlefield",
  might: number,
  tank = false,
  assault?: number,
  shield?: number
) {
  const keywords: BehaviorBinding[] = [];
  if (tank) {
    keywords.push({
      behaviorId: "keyword.tank",
      parameters: {},
      confidence: "high",
      order: keywords.length
    });
  }
  if (assault) {
    keywords.push({
      behaviorId: "keyword.assault",
      parameters: { amount: assault },
      confidence: "high",
      order: keywords.length
    });
  }
  if (shield) {
    keywords.push({
      behaviorId: "keyword.shield",
      parameters: { amount: shield },
      confidence: "high",
      order: keywords.length
    });
  }
  return {
    cardCode: code,
    sourceTextHash: "hash",
    behaviorModel: {
      playTimings: [],
      clauses: keywords.length ? [{
        id: "keywords",
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
        keywords
      }] : []
    },
    card: {
      id: code,
      name,
      public_code: `${code}/1`,
      attributes: { energy: 0, might, power: 0 },
      classification: {
        type,
        supertype: null,
        domain: ["Colorless"]
      },
      text: { plain: "" },
      set: { set_id: "T", label: "Test" },
      media: {},
      tags: [],
      metadata: {}
    }
  };
}
