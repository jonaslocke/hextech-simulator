import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cleanupBoard,
  createRuntimeCardIndex,
  gameplayActions,
  payCardCost,
  performGameplayAction,
  recomputeAllMight,
  type BehaviorBinding,
  type DeckSnapshotDocument,
  type GameCardDefinition,
  type GameDocument,
} from "../src/server/game";

test("Highlander recall replacement clears lethal marked damage", () => {
  const { decks, game } = fixture([
    unit("UNIT", "Unit", 2),
    spell("SPELL", "Highlander", []),
    battlefield("BF", "Battlefield"),
  ]);
  game.state.battlefields[0]!.units = ["unit"];
  game.state.players.p1!.zones.base = [];
  game.state.cardStates.unit!.damage = 2;
  game.state.ongoingEffects.push({
    id: "highlander-replacement",
    behaviorId: "replacement.recall_on_next_death",
    controllerPlayerId: "p1",
    sourceCardInstanceId: "highlander",
    targetCardInstanceIds: ["unit"],
    duration: "thisTurn",
    createdAtTurn: 1,
  });

  cleanupBoard(game, createRuntimeCardIndex(decks));

  assert.deepEqual(game.state.battlefields[0]!.units, []);
  assert.ok(game.state.players.p1!.zones.base.includes("unit"));
  assert.equal(game.state.cardStates.unit!.damage, 0);
  assert.equal(game.state.cardStates.unit!.exhausted, true);
  assert.equal(game.state.cardStates.unit!.lethalSuppressedDamage, null);
  assert.equal(game.state.cardStates.unit!.lethalSuppressedMight, null);
  assert.ok(!game.state.players.p1!.zones.trash.includes("unit"));
});

test("Meditation optional cost projects only ready friendly units with optional-cost metadata", () => {
  const meditation = spell("MEDITATION", "Meditation", [
    clause("meditation", {
      selectors: [
        binding("selector.friendly_unit", 0, {
          minimumCount: 0,
          maximumCount: 1,
          area: "board",
          readyOnly: true,
          selectionKey: "optionalCost",
          selectionPurpose: "optionalCost",
        }),
      ],
      costs: [
        binding("cost.exhaust_selected_unit", 1, {
          selectionKey: "optionalCost",
          optional: true,
        }),
      ],
      effects: [
        binding("action.draw_by_optional_cost", 2, {
          selectionKey: "optionalCost",
          paidCount: 2,
          unpaidCount: 1,
        }),
      ],
    }),
  ]);
  const { decks, game } = fixture([
    meditation,
    unit("FRIENDLY_READY", "Ready Friendly", 2),
    unit("FRIENDLY_EXHAUSTED", "Exhausted Friendly", 2),
    unit("ENEMY_READY", "Enemy Ready", 2),
    battlefield("BF", "Battlefield"),
  ]);
  decks[1]!.instances.push({
    instanceId: "enemy-ready",
    ownerPlayerId: "p2",
    source: "mainDeck",
    cardCode: "ENEMY_READY",
  });
  game.state.cardStates["enemy-ready"] = {
    exhausted: false,
    damage: 0,
    computedMight: 2,
    combatRole: null,
  };
  game.state.players.p1!.zones.hand.push("meditation");
  game.state.players.p1!.zones.base.push("ready-friendly", "exhausted-friendly");
  game.state.players.p2!.zones.base.push("enemy-ready");
  game.state.cardStates["exhausted-friendly"]!.exhausted = true;

  const action = gameplayActions(game, "p1", decks).find(
    (candidate) => candidate.sourceCardInstanceId === "meditation",
  );

  assert.ok(action);
  assert.equal(action.targets[0]?.selectionPurpose, "optionalCost");
  assert.equal(action.targets[0]?.label, "ready friendly unit to exhaust (optional)");
  assert.deepEqual(action.targets[0]?.legalIds, ["ready-friendly"]);
  assert.equal(action.targets[0]?.minimum, 0);
  assert.equal(action.targets[0]?.maximum, 1);
});

test("a paid optional play cost remains locked through Chain resolution", () => {
  const meditation = spell("MEDITATION", "Meditation", [
    clause("meditation", {
      selectors: [
        binding("selector.friendly_unit", 0, {
          minimumCount: 0,
          maximumCount: 1,
          area: "board",
          readyOnly: true,
          selectionKey: "optionalCost",
          selectionPurpose: "optionalCost",
        }),
      ],
      costs: [
        binding("cost.exhaust_selected_unit", 1, {
          selectionKey: "optionalCost",
          optional: true,
        }),
      ],
      effects: [
        binding("action.draw_by_optional_cost", 2, {
          selectionKey: "optionalCost",
          paidCount: 2,
          unpaidCount: 1,
        }),
      ],
    }),
  ]);
  const { decks, game } = fixture([
    meditation,
    unit("FRIENDLY", "Friendly", 2),
    unit("DRAW_A", "Draw A", 1),
    unit("DRAW_B", "Draw B", 1),
    battlefield("BF", "Battlefield"),
  ]);
  game.state.players.p1!.zones.hand.push("meditation");
  game.state.players.p1!.zones.base.push("friendly");
  game.state.players.p1!.zones.mainDeck.push("draw-a", "draw-b");

  const meditationAction = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "meditation",
  );
  assert.ok(meditationAction);
  let next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: meditationAction.id,
    selectedIds: ["friendly"],
    decks,
    now: "play-meditation",
  });

  assert.equal(next.state.cardStates.friendly!.exhausted, true);
  assert.deepEqual(
    next.state.chain?.items[0]?.lockedSelectionsByBinding,
    { "meditation:selectors:0": ["friendly"] },
  );

  next = passPriority(next, "p1", decks);
  next = passPriority(next, "p2", decks);

  assert.deepEqual(next.state.players.p1!.zones.hand, ["draw-a", "draw-b"]);
});

test("targeted temporary Might reductions apply after Wuju Bladesman continuous bonuses", () => {
  const wuju = legend("WUJU", "Wuju", [
    clause("wuju", {
      selectors: [
        binding("selector.friendly_unit", 0, {
          area: "board",
          automatic: true,
          selectionKey: "affected",
        }),
      ],
      effects: [
        binding("modifier.modify_numeric_value", 1, {
          attribute: "might",
          operation: "increase",
          amount: 2,
          target: "friendly_unit",
          duration: "whileSourceOnBoard",
          condition: "friendlyDefendsAlone",
          selectionKey: "affected",
        }),
      ],
    }),
  ]);
  const poro = unit("PORO", "Poro", 2, [
    binding("keyword.shield", 0, { amount: 1 }),
  ]);
  const { decks, game } = fixture([wuju, poro, battlefield("BF", "Battlefield")]);
  game.state.players.p1!.zones.legend = "wuju";
  game.state.players.p1!.zones.base = [];
  game.state.battlefields[0]!.units = ["poro"];
  game.state.cardStates.poro!.combatRole = "defender";
  game.state.modifiers.push({
    id: "stupefy",
    sourceCardInstanceId: null,
    controllerPlayerId: "p2",
    targetCardInstanceId: "poro",
    targetScope: "unit",
    attribute: "might",
    operation: "reduce",
    amount: 1,
    minimum: 1,
    duration: "thisTurn",
    createdAtTurn: 1,
  });

  recomputeAllMight(game, createRuntimeCardIndex(decks));

  assert.equal(game.state.cardStates.poro!.computedMight, 4);
});

test("Yi, Meditative recomputes when rune count changes during payment", () => {
  const yi = unit("YI", "Yi", 4, [], [
    clause("yi", {
      conditions: [
        binding("condition.compare_numeric_value", 0, {
          valueSource: "controller.boardRuneCount",
          operator: "greaterThanOrEqual",
          comparisonValue: 8,
        }),
      ],
      effects: [
        binding("modifier.modify_numeric_value", 1, {
          attribute: "might",
          operation: "increase",
          amount: 4,
          target: "source",
          duration: "whileSourceOnBoard",
        }),
      ],
    }),
  ]);
  const runeDefinition = rune("RUNE", "Mind Rune");
  const paidSpell = spell("PAID", "Paid", [], 0, 1);
  const { decks, game } = fixture([yi, runeDefinition, paidSpell, battlefield("BF", "Battlefield")]);
  game.state.players.p1!.zones.base = ["yi", ...Array.from({ length: 8 }, (_, index) => `rune-${index}`)];
  game.state.players.p1!.zones.hand.push("paid");
  for (let index = 0; index < 8; index += 1) {
    const instanceId = `rune-${index}`;
    decks[0]!.instances.push({
      instanceId,
      ownerPlayerId: "p1",
      source: "runeDeck",
      cardCode: "RUNE",
    });
    game.state.cardStates[instanceId] = {
      exhausted: false,
      damage: 0,
      computedMight: null,
    };
  }
  const runtimeIndex = createRuntimeCardIndex(decks);
  recomputeAllMight(game, runtimeIndex);
  assert.equal(game.state.cardStates.yi!.computedMight, 8);

  payCardCost(
    game,
    "p1",
    decks[0]!.snapshot.cards.find((definition) => definition.cardCode === "PAID")!,
    0,
    createRuntimeCardIndex(decks),
  );

  assert.equal(game.state.players.p1!.zones.base.filter((id) => id.startsWith("rune-")).length, 7);
  assert.equal(game.state.cardStates.yi!.computedMight, 4);
});

test("triggered ability Chain priority resets to the trigger controller after spell resolution", () => {
  const lady = legend("LADY", "Lady", [
    clause("lady", {
      triggers: [
        binding("trigger.on_play", 0, {
          subject: "spell",
        }),
      ],
      conditions: [
        binding("condition.compare_numeric_value", 1, {
          valueSource: "eventSubject.effectiveEnergyCost",
          operator: "greaterThanOrEqual",
          comparisonValue: 5,
        }),
      ],
      effects: [binding("action.draw_cards", 2, { player: "controller", count: 1 })],
    }),
  ]);
  const expensiveSpell = spell("EXPENSIVE", "Expensive", [], 5);
  const { decks, game } = fixture([lady, expensiveSpell, battlefield("BF", "Battlefield")]);
  game.state.players.p1!.zones.legend = "lady";
  game.state.chain = {
    items: [
      {
        id: "chain:spell",
        kind: "spell",
        label: "Expensive Spell",
        controllerPlayerId: "p1",
        sourceCardInstanceId: "expensive",
        targetCardInstanceIds: [],
        targetObjectVersions: {},
        lockedSelectionsByBinding: {},
        behaviorClauseId: null,
        activatedBehaviorId: null,
        behaviorEvent: {
          type: "card.played",
          actorPlayerId: "p1",
          subjectCardInstanceId: "expensive",
          values: {
            "eventSubject.printedEnergyCost": 5,
            "eventSubject.effectiveEnergyCost": 5,
          },
        },
      },
    ],
    relevantPlayerIds: ["p1", "p2"],
    priorityPlayerId: "p2",
    passedPlayerIds: [],
  };

  let next = passPriority(game, "p2", decks);
  next = passPriority(next, "p1", decks);

  assert.equal(next.state.chain?.items.at(-1)?.label, "Lady");
  assert.equal(next.state.chain?.priorityPlayerId, "p1");
  assert.deepEqual(next.state.chain?.passedPlayerIds, []);
});

test("triggered items preserve a card play's showdown Focus continuation", () => {
  const { decks, game } = fixture([battlefield("BF", "Battlefield")]);
  game.state.showdown = {
    kind: "combat",
    battlefieldId: game.state.battlefields[0]!.battlefieldId,
    relevantPlayerIds: ["p1", "p2"],
    focusPlayerId: "p2",
    passedPlayerIds: [],
  };

  // The original card play was made by p2, so its normal showdown
  // continuation is p1. A triggered item added during that Chain must retain
  // this parent continuation even when p2 controls the triggered ability.
  game.state.chain = {
    items: [
      {
        id: "trigger:response",
        kind: "trigger",
        label: "Response trigger",
        controllerPlayerId: "p2",
        sourceCardInstanceId: null,
        targetCardInstanceIds: [],
        targetObjectVersions: {},
        lockedSelectionsByBinding: {},
        behaviorClauseId: null,
        activatedBehaviorId: null,
        behaviorEvent: null,
      },
    ],
    relevantPlayerIds: ["p1", "p2"],
    priorityPlayerId: "p2",
    passedPlayerIds: [],
    resumeFocusPlayerId: "p1",
  };

  let next = passPriority(game, "p2", decks);
  next = passPriority(next, "p1", decks);

  assert.equal(next.state.chain, null);
  assert.equal(next.state.showdown?.focusPlayerId, "p1");
  assert.deepEqual(next.state.showdown?.passedPlayerIds, []);
});

test("trigger-order choices retain their originating showdown Focus continuation", () => {
  const { decks, game } = fixture([battlefield("BF", "Battlefield")]);
  game.state.showdown = {
    kind: "combat",
    battlefieldId: game.state.battlefields[0]!.battlefieldId,
    relevantPlayerIds: ["p1", "p2"],
    // The original p1 spell has resolved, so its normal continuation is p2.
    focusPlayerId: "p2",
    passedPlayerIds: [],
  };
  game.state.pendingChoice = {
    id: "choice:trigger-order",
    playerId: "p1",
    type: "orderTriggers",
    optionIds: ["trigger:first", "trigger:second"],
    pendingItems: ["trigger:first", "trigger:second"].map((id) => ({
      id,
      kind: "trigger" as const,
      label: id,
      controllerPlayerId: "p1",
      sourceCardInstanceId: null,
      targetCardInstanceIds: [],
      targetObjectVersions: {},
      lockedSelectionsByBinding: {},
      behaviorClauseId: null,
      activatedBehaviorId: null,
      behaviorEvent: null,
      resumeFocusPlayerId: "p2",
    })),
  };

  const submit = gameplayActions(game, "p1", decks).find(
    (action) => action.label === "Submit trigger order",
  );
  assert.ok(submit);
  let next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: submit.id,
    selectedIds: ["trigger:first", "trigger:second"],
    decks,
    now: "submit-trigger-order",
  });

  assert.equal(next.state.chain?.resumeFocusPlayerId, "p2");
  next = passPriority(next, "p1", decks);
  next = passPriority(next, "p2", decks);
  next = passPriority(next, "p1", decks);
  next = passPriority(next, "p2", decks);

  assert.equal(next.state.chain, null);
  assert.equal(next.state.showdown?.focusPlayerId, "p2");
  assert.deepEqual(next.state.showdown?.passedPlayerIds, []);
});

function passPriority(
  game: GameDocument,
  playerId: string,
  decks: DeckSnapshotDocument[],
) {
  const pass = gameplayActions(game, playerId, decks).find(
    (action) => action.label === "Pass priority",
  );
  assert.ok(pass);
  return performGameplayAction({
    game,
    actorPlayerId: playerId,
    actionId: pass.id,
    selectedIds: [],
    decks,
    now: `${playerId}-pass`,
  });
}

function fixture(definitions: GameCardDefinition[]) {
  const instances = definitions.map((definition) => ({
    instanceId: instanceIdForDefinition(definition),
    ownerPlayerId: definition.card.classification.type === "Battlefield" ? "p1" : "p1",
    source: sourceForType(definition.card.classification.type),
    cardCode: definition.cardCode,
  }));
  const snapshot = {
    sourceText: "",
    catalogDigest: "after-masteryi",
    entries: [],
    cards: definitions,
  };
  const decks: DeckSnapshotDocument[] = [
    {
      id: "p1-deck",
      createdAt: "a",
      updatedAt: "a",
      matchId: "m",
      playerId: "p1",
      snapshot,
      instances,
    },
    {
      id: "p2-deck",
      createdAt: "a",
      updatedAt: "a",
      matchId: "m",
      playerId: "p2",
      snapshot,
      instances: [],
    },
  ];
  const allInstances = [...instances];
  const battlefieldId =
    instances.find((instance) => instance.source === "battlefield")?.instanceId ??
    "battlefield";
  const game: GameDocument = {
    id: "g",
    matchId: "m",
    createdAt: "a",
    updatedAt: "a",
    gameNumber: 1,
    stateVersion: 1,
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
        p1: playerState(),
        p2: { ...playerState(), playerId: "p2" },
      },
      battlefields: [
        {
          battlefieldId,
          cardInstanceId: battlefieldId,
          selectedByPlayerId: "p1",
          controllerPlayerId: null,
          contestedByPlayerId: null,
          units: [],
        },
      ],
      cardStates: Object.fromEntries(
        allInstances.map((instance) => {
          const definition = definitions.find(
            (candidate) => candidate.cardCode === instance.cardCode,
          )!;
          return [
            instance.instanceId,
            {
              exhausted: false,
              damage: 0,
              computedMight: definition.card.attributes.might,
              combatRole: null,
            },
          ];
        }),
      ),
      turn: { turnNumber: 1, activePlayerId: "p1", phase: "action" },
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
  return { decks, game };
}

function playerState() {
  return {
    playerId: "p1",
    points: 0,
    scoredBattlefieldIdsThisTurn: [],
    energy: 0,
    conditionalEnergy: 0,
    power: {},
    zones: {
      legend: null,
      champion: null,
      mainDeck: [],
      runeDeck: [],
      hand: [],
      trash: [],
      banishment: [],
      base: [],
    },
  };
}

function sourceForType(type: GameCardDefinition["card"]["classification"]["type"]) {
  if (type === "Legend") return "legend" as const;
  if (type === "Battlefield") return "battlefield" as const;
  if (type === "Rune") return "runeDeck" as const;
  return "mainDeck" as const;
}

function instanceIdForDefinition(definition: GameCardDefinition) {
  return definition.card.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function binding(
  behaviorId: string,
  order: number,
  parameters: Record<string, string | number | boolean> = {},
): BehaviorBinding {
  return { behaviorId, order, parameters, confidence: "high" };
}

function clause(
  id: string,
  groups: Partial<
    Record<
      "abilities" | "conditions" | "costs" | "effects" | "keywords" | "selectors" | "timings" | "triggers",
      BehaviorBinding[]
    >
  >,
) {
  return {
    id,
    sequence: 0,
    sourceText: "",
    normalizedText: "",
    abilities: groups.abilities ?? [],
    triggers: groups.triggers ?? [],
    conditions: groups.conditions ?? [],
    selectors: groups.selectors ?? [],
    choices: [],
    costs: groups.costs ?? [],
    timings: groups.timings ?? [],
    effects: groups.effects ?? [],
    keywords: groups.keywords ?? [],
  };
}

function legend(code: string, name: string, clauses: ReturnType<typeof clause>[]) {
  return definition(code, name, "Legend", null, clauses);
}

function unit(
  code: string,
  name: string,
  might: number,
  keywords: BehaviorBinding[] = [],
  clauses: ReturnType<typeof clause>[] = [],
) {
  return definition(
    code,
    name,
    "Unit",
    might,
    keywords.length > 0
      ? [
          ...clauses,
          clause(`${code.toLowerCase()}-keywords`, { keywords }),
        ]
      : clauses,
  );
}

function spell(
  code: string,
  name: string,
  clauses: ReturnType<typeof clause>[],
  energy = 0,
  power = 0,
) {
  return definition(code, name, "Spell", null, clauses, energy, power);
}

function rune(code: string, name: string) {
  return definition(
    code,
    name,
    "Rune",
    null,
    [
      clause("rune", {
        abilities: [
          binding("ability.recycle_for_power", 0, {}),
          binding("ability.exhaust_for_resource", 1, {
            resourceType: "energy",
            usage: "any",
            amount: 1,
          }),
        ],
      }),
    ],
  );
}

function battlefield(code: string, name: string) {
  return definition(code, name, "Battlefield", null, []);
}

function definition(
  code: string,
  name: string,
  type: "Battlefield" | "Legend" | "Rune" | "Spell" | "Unit",
  might: number | null,
  clauses: ReturnType<typeof clause>[],
  energy = 0,
  power = 0,
): GameCardDefinition {
  return {
    cardCode: code,
    sourceTextHash: "hash",
    behaviorModel: { playTimings: [], clauses },
    card: {
      id: code,
      name,
      public_code: `${code}/1`,
      attributes: { energy, might, power },
      classification: {
        type,
        supertype: type === "Rune" ? "Basic" : null,
        domain: ["Mind"],
      },
      text: { plain: "" },
      set: { set_id: "T", label: "Test" },
      media: {},
      tags: [],
      metadata: {},
    },
  };
}
