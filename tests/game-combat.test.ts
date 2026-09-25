import assert from "node:assert/strict";
import { test } from "node:test";
import { autoAssignCombatDamage } from "../src/features/game-board/combat-damage-assignment";
import { buildPlayerDecisionRequest } from "../src/features/game-board/decisions/use-player-decision-request";
import { createCombatDamageIntent } from "../src/features/game-board/decisions/player-decision-intent";
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

test("preserves a generic Battlefield conquer trigger's target choice after combat scoring", () => {
  const { game: initial, decks } = combatFixture({
    attackerMight: 4,
    defenders: [{ id: "defender", might: 2 }],
  });
  const battlefieldDefinition = decks[0]!.snapshot.cards.find(
    (card) => card.cardCode === "BF",
  );
  assert.ok(battlefieldDefinition);
  battlefieldDefinition.behaviorModel.clauses = [{
    id: "conquer-selects-friendly-unit",
    sequence: 0,
    sourceText: "When you conquer here, choose a friendly unit.",
    normalizedText: "",
    abilities: [],
    triggers: [{
      behaviorId: "trigger.conquer_battlefield",
      parameters: {},
      confidence: "high",
      order: 0,
    }],
    conditions: [],
    selectors: [{
      behaviorId: "selector.friendly_unit",
      parameters: {
        minimumCount: 1,
        maximumCount: 1,
        area: "board",
        locationRelation: "any",
        controller: "controller",
      },
      confidence: "high",
      order: 1,
    }],
    choices: [],
    costs: [],
    timings: [],
    effects: [],
    keywords: [],
  }];

  const game = passShowdown(moveAttacker(initial, decks), decks);

  assert.equal(game.state.battlefields[0]!.controllerPlayerId, "p1");
  assert.equal(game.state.players.p1!.points, 1);
  assert.equal(game.state.pendingChoice?.type, "effectSelection");
  assert.equal(
    game.state.pendingChoice?.type === "effectSelection"
      ? game.state.pendingChoice.chainItem?.sourceCardInstanceId
      : null,
    "battlefield",
  );
  assert.deepEqual(
    game.state.pendingChoice?.type === "effectSelection"
      ? game.state.pendingChoice.legalCardIds
      : [],
    ["attacker"],
  );
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

test("combat suggestions use projected effective Might and marked damage through the decision and submission pipeline", () => {
  const { game: initial, decks } = combatFixture({
    attackerMight: 1,
    attackerAssault: 2,
    defenders: [{ id: "large", might: 6 }, { id: "damaged", might: 2, shield: 3 }],
  });
  const showdown = moveAttacker(initial, decks);
  showdown.state.cardStates.damaged!.damage = 2;
  const game = passShowdown(showdown, decks);
  assert.equal(game.state.cardStates.attacker!.computedMight, 3);
  assert.equal(game.state.cardStates.damaged!.computedMight, 5);
  const projection = projectGame({ game, decks, viewerPlayerId: "p1" });
  const decision = buildPlayerDecisionRequest({ sourceProjection: projection, cardsByInstanceId: {} });
  assert.equal(decision?.kind, "combatDamage");
  if (decision?.kind !== "combatDamage") return;
  assert.equal(decision.choice.totalDamage, 3);
  assert.deepEqual(decision.choice.targets, [
    { unitId: "large", lethalAmount: 6, hasTank: false },
    { unitId: "damaged", lethalAmount: 3, hasTank: false },
  ]);
  const allocations = autoAssignCombatDamage(decision.choice.totalDamage, decision.choice.targets.map((target) => ({ ...target, priorityOrder: target.hasTank ? 0 : 1 })));
  assert.deepEqual(allocations, [{ targetUnitId: "damaged", amount: 3 }]);
  const intent = createCombatDamageIntent(decision.actionId, allocations);
  const next = performGameplayAction({ game, decks, actorPlayerId: "p1", ...intent, selectedIds: intent.selectedIds ?? [], now: "suggested" });
  assert.ok(next.state.players.p2!.zones.trash.includes("damaged"));
  assert.ok(next.state.battlefields[0]!.units.includes("large"));

  // A suggestion is only a default. Another legal distribution remains valid.
  const manual = createCombatDamageIntent(decision.actionId, [{ targetUnitId: "large", amount: 3 }]);
  const overridden = performGameplayAction({ game, decks, actorPlayerId: "p1", ...manual, selectedIds: manual.selectedIds ?? [], now: "manual" });
  assert.ok(overridden.state.battlefields[0]!.units.includes("damaged"));
  assert.ok(overridden.state.battlefields[0]!.units.includes("large"));
});

test("lethal-damage modifiers lower projected and validated combat thresholds", () => {
  const { game: initial, decks } = combatFixture({
    attackerMight: 2,
    attackerLethalDamage: true,
    defenders: [
      { id: "tank", might: 8, tank: true },
      { id: "other", might: 7 },
    ],
  });
  const game = passShowdown(moveAttacker(initial, decks), decks);
  const action = gameplayActions(game, "p1", decks).find((candidate) => candidate.choice?.kind === "combatDamage")!;
  assert.equal(action.choice?.kind, "combatDamage");
  if (action.choice?.kind !== "combatDamage") return;
  assert.deepEqual(action.choice.targets.map(({ unitId, lethalAmount, hasTank }) => ({ unitId, lethalAmount, hasTank })), [
    { unitId: "tank", lethalAmount: 1, hasTank: true },
    { unitId: "other", lethalAmount: 1, hasTank: false },
  ]);
  assert.throws(() => performGameplayAction({
    game, decks, actorPlayerId: "p1", actionId: action.id, selectedIds: [],
    allocations: [{ targetUnitId: "other", amount: 1 }, { targetUnitId: "tank", amount: 1 }], now: "lethal-invalid-order",
  }), /Tank units must be assigned lethal damage first/);
  const next = performGameplayAction({
    game, decks, actorPlayerId: "p1", actionId: action.id, selectedIds: [],
    allocations: [{ targetUnitId: "tank", amount: 1 }, { targetUnitId: "other", amount: 1 }], now: "lethal-valid-order",
  });
  assert.ok(next.state.players.p2!.zones.trash.includes("tank"));
  assert.ok(next.state.players.p2!.zones.trash.includes("other"));
});

test("combat auto-assignment and manual overrides remain subject to server Tank and allocation validation", () => {
  const { game: initial, decks } = combatFixture({
    attackerMight: 5,
    defenders: [{ id: "tank", might: 3, tank: true }, { id: "other", might: 3 }],
  });
  const game = passShowdown(moveAttacker(initial, decks), decks);
  const action = gameplayActions(game, "p1", decks).find((entry) => entry.choice?.kind === "combatDamage")!;
  assert.equal(action.choice?.kind, "combatDamage");
  if (action.choice?.kind !== "combatDamage") return;
  const allocations = autoAssignCombatDamage(action.choice.totalDamage, action.choice.targets.map((target) => ({ ...target, priorityOrder: target.hasTank ? 0 : 1 })));
  assert.deepEqual(allocations, [{ targetUnitId: "tank", amount: 3 }, { targetUnitId: "other", amount: 2 }]);
  const submit = (values: typeof allocations) => performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: action.id, selectedIds: [], allocations: values, now: "assign" });
  assert.doesNotThrow(() => submit(allocations));
  assert.throws(() => submit([{ targetUnitId: "tank", amount: 2 }, { targetUnitId: "other", amount: 3 }]), /Tank units must be assigned lethal damage first/);
  assert.throws(() => submit([{ targetUnitId: "other", amount: 2 }, { targetUnitId: "tank", amount: 3 }]), /Tank units must be assigned lethal damage first/);
  assert.throws(() => submit([{ targetUnitId: "tank", amount: 4 }]), /All available combat damage/);
  assert.throws(() => submit([{ targetUnitId: "tank", amount: 6 }]), /All available combat damage/);
  assert.throws(() => submit([{ targetUnitId: "unknown", amount: 5 }]), /invalid target or amount/);
  assert.throws(() => submit([{ targetUnitId: "tank", amount: 2.5 }, { targetUnitId: "other", amount: 2.5 }]), /invalid target or amount/);
  assert.throws(() => submit([{ targetUnitId: "tank", amount: 2 }, { targetUnitId: "tank", amount: 3 }]), /only once/);
});

test("the server still rejects nonlethal spreads between ordinary combat recipients", () => {
  const { game: initial, decks } = combatFixture({ attackerMight: 3, defenders: [{ id: "first", might: 3 }, { id: "second", might: 3 }] });
  const game = passShowdown(moveAttacker(initial, decks), decks);
  const action = gameplayActions(game, "p1", decks).find((entry) => entry.choice?.kind === "combatDamage")!;
  assert.throws(() => performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: action.id, selectedIds: [], allocations: [{ targetUnitId: "first", amount: 1 }, { targetUnitId: "second", amount: 2 }], now: "spread" }), /lethal damage before assigning another unit/);
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
  attackerLethalDamage?: boolean;
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
      input.attackerAssault,
      undefined,
      input.attackerLethalDamage,
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
  shield?: number,
  lethalDamage?: boolean,
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
  if (lethalDamage) {
    keywords.push({
      behaviorId: "keyword.lethal_damage",
      parameters: {},
      confidence: "high",
      order: keywords.length,
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
