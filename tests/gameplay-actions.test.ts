import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addRuneResource,
  channelRunes,
  createGame,
  drawCards,
  endTurn,
  gameSchema,
  moveUnitToBattlefield,
  passPriority,
  passShowdown,
  playCard,
  projectGameForPlayer,
  recycleCards,
  startGame,
  type Game
} from "../src/server/match";
import type { Card } from "../src/server/catalog";

test("starts the game after starting player and mulligans are locked", () => {
  const game = createSetupCompleteGame();

  const result = startGame(game, {
    now: "2026-06-14T06:00:00.000Z"
  });

  assert.equal(result.status, "in_progress");
  assert.equal(result.stateVersion, game.stateVersion + 1);
  assert.deepEqual(result.canonicalState.turn, {
    turnNumber: 1,
    activePlayerId: "player-a",
    phase: "awaken",
    passedPlayerIds: []
  });
});

test("draw moves top main deck cards to hand", () => {
  const game = createInProgressGame();

  const result = drawCards(game, {
    actorPlayerId: "player-a",
    count: 2,
    now: "2026-06-14T07:00:00.000Z"
  });

  assert.deepEqual(result.canonicalState.players["player-a"]?.zones.mainDeck, [
    "a-main-3"
  ]);
  assert.deepEqual(result.canonicalState.players["player-a"]?.zones.hand, [
    "a-hand-1",
    "a-main-1",
    "a-main-2"
  ]);
});

test("draw projection hides drawn card identity from opponent", () => {
  const result = drawCards(createInProgressGame(), {
    actorPlayerId: "player-a"
  });

  const opponentProjection = projectGameForPlayer(result, "player-b");

  assert.deepEqual(opponentProjection.players["player-a"]?.zones.hand, {
    cardInstanceIds: [],
    count: 2,
    visibility: "private"
  });
});

test("channel moves top rune cards to base", () => {
  const game = createInProgressGame();

  const result = channelRunes(game, {
    actorPlayerId: "player-a",
    count: 2
  });

  assert.deepEqual(result.canonicalState.players["player-a"]?.zones.runeDeck, [
    "a-rune-3"
  ]);
  assert.deepEqual(result.canonicalState.players["player-a"]?.zones.base, [
    "a-base-1",
    "a-base-2",
    "a-rune-1",
    "a-rune-2"
  ]);
});

test("adding Energy exhausts a ready rune and updates the rune pool", () => {
  const game = createInProgressGameWithRunes();

  const result = addRuneResource(
    game,
    {
      actorPlayerId: "player-a",
      runeCardInstanceId: "a-rune-base-1",
      resourceType: "energy"
    },
    cardLookup
  );

  assert.equal(result.canonicalState.players["player-a"]?.runePool.energy, 1);
  assert.deepEqual(result.canonicalState.cardStates["a-rune-base-1"], {
    exhausted: true
  });
});

test("adding Power recycles a rune and updates the rune pool", () => {
  const game = createInProgressGameWithRunes();

  const result = addRuneResource(
    game,
    {
      actorPlayerId: "player-a",
      runeCardInstanceId: "a-rune-base-1",
      resourceType: "power"
    },
    cardLookup
  );

  assert.deepEqual(result.canonicalState.players["player-a"]?.runePool.power, {
    Chaos: 1
  });
  assert.deepEqual(result.canonicalState.players["player-a"]?.zones.base, [
    "a-rune-base-2"
  ]);
  assert.deepEqual(result.canonicalState.players["player-a"]?.zones.runeDeck, [
    "a-rune-deck-1",
    "a-rune-base-1"
  ]);
  assert.equal(result.canonicalState.cardStates["a-rune-base-1"], undefined);
});

test("playCard automatically uses pool and ready runes to pay Energy", () => {
  const game = gameSchema.parse({
    ...createInProgressGameWithRunes(),
    canonicalState: {
      ...createInProgressGameWithRunes().canonicalState,
      players: {
        ...createInProgressGameWithRunes().canonicalState.players,
        "player-a": {
          ...createInProgressGameWithRunes().canonicalState.players["player-a"]!,
          runePool: {
            energy: 1,
            power: {}
          },
          zones: {
            ...createInProgressGameWithRunes().canonicalState.players["player-a"]!
              .zones,
            hand: ["a-unit-hand-1"]
          }
        }
      }
    }
  });

  const result = playCard(
    game,
    {
      actorPlayerId: "player-a",
      cardInstanceId: "a-unit-hand-1"
    },
    cardLookup
  );

  assert.deepEqual(result.payment, {
    selectedModeId: "regular",
    resourceCosts: {
      energy: 2,
      power: []
    },
    resourcePayments: [
      {
        type: "spendEnergy",
        amount: 1
      },
      {
        type: "exhaustRuneForEnergy",
        cardInstanceId: "a-rune-base-1"
      }
    ],
    nonResourceCosts: [],
    optionalCostsChosen: [],
    costModifiersApplied: []
  });
  assert.equal(result.game.canonicalState.players["player-a"]?.runePool.energy, 0);
  assert.deepEqual(result.game.canonicalState.players["player-a"]?.zones.hand, []);
  assert.deepEqual(result.game.canonicalState.players["player-a"]?.zones.base, [
    "a-rune-base-1",
    "a-rune-base-2",
    "a-unit-hand-1"
  ]);
  assert.deepEqual(result.game.canonicalState.cardStates["a-unit-hand-1"], {
    exhausted: true
  });
});

test("playCard spends multi-domain Power in card metadata domain order", () => {
  const game = gameSchema.parse({
    ...createInProgressGameWithRunes(),
    canonicalState: {
      ...createInProgressGameWithRunes().canonicalState,
      players: {
        ...createInProgressGameWithRunes().canonicalState.players,
        "player-a": {
          ...createInProgressGameWithRunes().canonicalState.players["player-a"]!,
          runePool: {
            energy: 0,
            power: {
              Calm: 1,
              Chaos: 1,
              Rainbow: 1
            }
          },
          zones: {
            ...createInProgressGameWithRunes().canonicalState.players["player-a"]!
              .zones,
            hand: ["a-multi-domain-unit-hand"]
          }
        }
      }
    }
  });

  const result = playCard(
    game,
    {
      actorPlayerId: "player-a",
      cardInstanceId: "a-multi-domain-unit-hand"
    },
    cardLookup
  );

  assert.deepEqual(result.payment.resourcePayments, [
    {
      type: "spendPower",
      domain: "Calm",
      amount: 1
    }
  ]);
  assert.deepEqual(result.game.canonicalState.players["player-a"]?.runePool.power, {
    Chaos: 1,
    Rainbow: 1
  });
});

test("playCard uses Rainbow Power only after specific domains", () => {
  const game = gameSchema.parse({
    ...createInProgressGameWithRunes(),
    canonicalState: {
      ...createInProgressGameWithRunes().canonicalState,
      players: {
        ...createInProgressGameWithRunes().canonicalState.players,
        "player-a": {
          ...createInProgressGameWithRunes().canonicalState.players["player-a"]!,
          runePool: {
            energy: 0,
            power: {
              Rainbow: 1
            }
          },
          zones: {
            ...createInProgressGameWithRunes().canonicalState.players["player-a"]!
              .zones,
            hand: ["a-multi-domain-unit-hand"]
          }
        }
      }
    }
  });

  const result = playCard(
    game,
    {
      actorPlayerId: "player-a",
      cardInstanceId: "a-multi-domain-unit-hand"
    },
    cardLookup
  );

  assert.deepEqual(result.payment.resourcePayments, [
    {
      type: "spendPower",
      domain: "Rainbow",
      amount: 1
    }
  ]);
  assert.deepEqual(result.game.canonicalState.players["player-a"]?.runePool.power, {});
});

test("playCard recycles runes for Power using card metadata domain order", () => {
  const baseGame = createInProgressGameWithRunes();
  const game = gameSchema.parse({
    ...baseGame,
    canonicalState: {
      ...baseGame.canonicalState,
      cardStates: {
        ...baseGame.canonicalState.cardStates,
        "a-chaos-rune-base": {
          exhausted: false
        },
        "a-calm-rune-base": {
          exhausted: false
        }
      },
      players: {
        ...baseGame.canonicalState.players,
        "player-a": {
          ...baseGame.canonicalState.players["player-a"]!,
          zones: {
            ...baseGame.canonicalState.players["player-a"]!.zones,
            hand: ["a-multi-domain-unit-hand"],
            base: ["a-chaos-rune-base", "a-calm-rune-base"]
          }
        }
      }
    }
  });

  const result = playCard(
    game,
    {
      actorPlayerId: "player-a",
      cardInstanceId: "a-multi-domain-unit-hand"
    },
    cardLookup
  );

  assert.deepEqual(result.payment.resourcePayments, [
    {
      type: "recycleRuneForPower",
      cardInstanceId: "a-calm-rune-base",
      producedDomain: "Calm"
    }
  ]);
  assert.deepEqual(result.game.canonicalState.players["player-a"]?.zones.base, [
    "a-chaos-rune-base",
    "a-multi-domain-unit-hand"
  ]);
  assert.deepEqual(result.game.canonicalState.players["player-a"]?.zones.runeDeck, [
    "a-rune-deck-1",
    "a-calm-rune-base"
  ]);
});

test("playCard rejects unsupported immediate play behavior", () => {
  const game = gameSchema.parse({
    ...createInProgressGameWithRunes(),
    canonicalState: {
      ...createInProgressGameWithRunes().canonicalState,
      players: {
        ...createInProgressGameWithRunes().canonicalState.players,
        "player-a": {
          ...createInProgressGameWithRunes().canonicalState.players["player-a"]!,
          zones: {
            ...createInProgressGameWithRunes().canonicalState.players["player-a"]!
              .zones,
            hand: ["a-unit-on-play"]
          }
        }
      }
    }
  });

  assert.throws(
    () =>
      playCard(
        game,
        {
          actorPlayerId: "player-a",
          cardInstanceId: "a-unit-on-play"
        },
        cardLookup
      ),
    /immediate play behavior/
  );
});

test("recycle puts one main deck card on bottom without RNG", () => {
  const game = createInProgressGame();

  const result = recycleCards(game, {
    actorPlayerId: "player-a",
    ownerPlayerId: "player-a",
    sourceZone: "hand",
    destinationDeck: "mainDeck",
    cardInstanceIds: ["a-hand-1"]
  });

  assert.deepEqual(result.randomOperations, []);
  assert.deepEqual(result.game.canonicalState.players["player-a"]?.zones.hand, []);
  assert.deepEqual(result.game.canonicalState.players["player-a"]?.zones.mainDeck, [
    "a-main-1",
    "a-main-2",
    "a-main-3",
    "a-hand-1"
  ]);
});

test("recycle randomizes simultaneous main deck recycle order with seeded RNG", () => {
  const game = gameSchema.parse({
    ...createInProgressGame(),
    canonicalState: {
      ...createInProgressGame().canonicalState,
      players: {
        ...createInProgressGame().canonicalState.players,
        "player-a": {
          ...createInProgressGame().canonicalState.players["player-a"]!,
          zones: {
            ...createInProgressGame().canonicalState.players["player-a"]!.zones,
            hand: ["a-hand-1", "a-hand-2", "a-hand-3"]
          }
        }
      }
    }
  });

  const result = recycleCards(game, {
    actorPlayerId: "player-a",
    ownerPlayerId: "player-a",
    sourceZone: "hand",
    destinationDeck: "mainDeck",
    cardInstanceIds: ["a-hand-1", "a-hand-2", "a-hand-3"]
  });

  assert.equal(result.randomOperations.length, 1);
  assert.equal(result.randomOperations[0]?.purpose, "recycle-main-deck:player-a");
  assert.equal(result.game.canonicalState.rng.rngStep, 2);
  assert.deepEqual(result.game.canonicalState.players["player-a"]?.zones.hand, []);
  assert.deepEqual(
    result.game.canonicalState.players["player-a"]?.zones.mainDeck.slice(0, 3),
    ["a-main-1", "a-main-2", "a-main-3"]
  );
  assert.deepEqual(
    new Set(
      result.game.canonicalState.players["player-a"]?.zones.mainDeck.slice(3)
    ),
    new Set(["a-hand-1", "a-hand-2", "a-hand-3"])
  );
});

test("recycle preserves chosen order for rune deck recycle", () => {
  const game = createInProgressGame();

  const result = recycleCards(game, {
    actorPlayerId: "player-a",
    ownerPlayerId: "player-a",
    sourceZone: "base",
    destinationDeck: "runeDeck",
    cardInstanceIds: ["a-base-2", "a-base-1"]
  });

  assert.deepEqual(result.randomOperations, []);
  assert.deepEqual(result.game.canonicalState.players["player-a"]?.zones.base, []);
  assert.deepEqual(result.game.canonicalState.players["player-a"]?.zones.runeDeck, [
    "a-rune-1",
    "a-rune-2",
    "a-rune-3",
    "a-base-2",
    "a-base-1"
  ]);
});

test("pass records the acting player for the current turn", () => {
  const game = createInProgressGame();

  const result = passPriority(game, {
    actorPlayerId: "player-b"
  });

  assert.deepEqual(result.canonicalState.turn?.passedPlayerIds, ["player-b"]);
});

test("end turn advances active player and clears passes", () => {
  const game = passPriority(createInProgressGame(), {
    actorPlayerId: "player-b"
  });

  const result = endTurn(game, {
    actorPlayerId: "player-a"
  });

  assert.deepEqual(result.canonicalState.turn, {
    turnNumber: 2,
    activePlayerId: "player-b",
    phase: "awaken",
    passedPlayerIds: []
  });
});

test("end turn clears rune pools and readies next player's board cards", () => {
  const game = gameSchema.parse({
    ...createInProgressGameWithRunes(),
    canonicalState: {
      ...createInProgressGameWithRunes().canonicalState,
      cardStates: {
        "b-rune-base-1": {
          exhausted: true
        }
      },
      players: {
        ...createInProgressGameWithRunes().canonicalState.players,
        "player-a": {
          ...createInProgressGameWithRunes().canonicalState.players["player-a"]!,
          runePool: {
            energy: 2,
            power: {
              Chaos: 1
            }
          }
        },
        "player-b": {
          ...createInProgressGameWithRunes().canonicalState.players["player-b"]!,
          zones: {
            ...createInProgressGameWithRunes().canonicalState.players["player-b"]!
              .zones,
            base: ["b-rune-base-1"]
          }
        }
      }
    }
  });

  const result = endTurn(game, {
    actorPlayerId: "player-a"
  });

  assert.deepEqual(result.canonicalState.players["player-a"]?.runePool, {
    energy: 0,
    power: {}
  });
  assert.deepEqual(result.canonicalState.cardStates["b-rune-base-1"], {
    exhausted: false
  });
});

test("moving a unit to an empty battlefield opens a showdown", () => {
  const game = createInProgressGameWithBattlefield();

  const result = moveUnitToBattlefield(game, {
    actorPlayerId: "player-a",
    unitCardInstanceId: "a-base-1",
    battlefieldId: "battlefield-a"
  });

  assert.deepEqual(result.canonicalState.players["player-a"]?.zones.base, [
    "a-base-2"
  ]);
  assert.deepEqual(result.canonicalState.battlefields[0]?.units, ["a-base-1"]);
  assert.deepEqual(result.canonicalState.showdown, {
    battlefieldId: "battlefield-a",
    relevantPlayerIds: ["player-a", "player-b"],
    focusPlayerId: "player-a",
    priorityPlayerId: "player-a",
    passedPlayerIds: []
  });
});

test("showdown pass moves focus to the next relevant player", () => {
  const showdownGame = moveUnitToBattlefield(createInProgressGameWithBattlefield(), {
    actorPlayerId: "player-a",
    unitCardInstanceId: "a-base-1",
    battlefieldId: "battlefield-a"
  });

  const result = passShowdown(showdownGame, {
    actorPlayerId: "player-a"
  });

  assert.deepEqual(result.canonicalState.showdown, {
    battlefieldId: "battlefield-a",
    relevantPlayerIds: ["player-a", "player-b"],
    focusPlayerId: "player-b",
    priorityPlayerId: "player-b",
    passedPlayerIds: ["player-a"]
  });
});

test("showdown closes after all relevant players pass", () => {
  const firstPass = passShowdown(
    moveUnitToBattlefield(createInProgressGameWithBattlefield(), {
      actorPlayerId: "player-a",
      unitCardInstanceId: "a-base-1",
      battlefieldId: "battlefield-a"
    }),
    {
      actorPlayerId: "player-a"
    }
  );

  const result = passShowdown(firstPass, {
    actorPlayerId: "player-b"
  });

  assert.equal(result.canonicalState.showdown, null);
});

function createSetupCompleteGame(): Game {
  const base = createGame({
    id: "game-1",
    matchId: "match-1",
    gameNumber: 1,
    playerIds: ["player-a", "player-b"],
    rngSeed: "gameplay-seed"
  });

  return gameSchema.parse({
    ...base,
    stateVersion: 5,
    canonicalState: {
      ...base.canonicalState,
      setup: {
        ...base.canonicalState.setup,
        startingPlayerId: "player-a",
        mulliganChoices: {
          "player-a": {
            playerId: "player-a",
            status: "locked",
            selectedCardInstanceIds: [],
            lockedAt: "2026-06-14T05:00:00.000Z"
          },
          "player-b": {
            playerId: "player-b",
            status: "locked",
            selectedCardInstanceIds: [],
            lockedAt: "2026-06-14T05:00:00.000Z"
          }
        }
      }
    }
  });
}

function createInProgressGame(): Game {
  const base = createSetupCompleteGame();

  return gameSchema.parse({
    ...base,
    status: "in_progress",
    canonicalState: {
      ...base.canonicalState,
      turn: {
        turnNumber: 1,
        activePlayerId: "player-a",
        phase: "action",
        passedPlayerIds: []
      },
      players: {
        "player-a": {
          playerId: "player-a",
          zones: {
            legend: "a-legend",
            champion: "a-champion",
            mainDeck: ["a-main-1", "a-main-2", "a-main-3"],
            runeDeck: ["a-rune-1", "a-rune-2", "a-rune-3"],
            hand: ["a-hand-1"],
            trash: [],
            banishment: [],
            base: ["a-base-1", "a-base-2"]
          }
        },
        "player-b": {
          playerId: "player-b",
          zones: {
            legend: "b-legend",
            champion: "b-champion",
            mainDeck: ["b-main-1"],
            runeDeck: ["b-rune-1"],
            hand: [],
            trash: [],
            banishment: [],
            base: []
          }
        }
      }
    }
  });
}

function createInProgressGameWithBattlefield(): Game {
  const game = createInProgressGame();

  return gameSchema.parse({
    ...game,
    canonicalState: {
      ...game.canonicalState,
      battlefields: [
        {
          battlefieldId: "battlefield-a",
          selectedByPlayerId: "player-a",
          cardInstanceId: "battlefield-card-a",
          units: [],
          facedownSlot: null
        }
      ]
    }
  });
}

function createInProgressGameWithRunes(): Game {
  const game = createInProgressGame();

  return gameSchema.parse({
    ...game,
    canonicalState: {
      ...game.canonicalState,
      cardStates: {
        "a-rune-base-1": {
          exhausted: false
        },
        "a-rune-base-2": {
          exhausted: false
        }
      },
      players: {
        ...game.canonicalState.players,
        "player-a": {
          ...game.canonicalState.players["player-a"]!,
          zones: {
            ...game.canonicalState.players["player-a"]!.zones,
            runeDeck: ["a-rune-deck-1"],
            base: ["a-rune-base-1", "a-rune-base-2"]
          }
        }
      }
    }
  });
}

const cardLookup: Record<string, Card> = {
  "a-rune-base-1": createCard({
    domain: ["Chaos"],
    energy: null,
    name: "Chaos Rune",
    power: null,
    type: "Rune"
  }),
  "a-rune-base-2": createCard({
    domain: ["Chaos"],
    energy: null,
    name: "Chaos Rune",
    power: null,
    type: "Rune"
  }),
  "a-rune-deck-1": createCard({
    domain: ["Chaos"],
    energy: null,
    name: "Chaos Rune",
    power: null,
    type: "Rune"
  }),
  "a-chaos-rune-base": createCard({
    domain: ["Chaos"],
    energy: null,
    name: "Chaos Rune",
    power: null,
    type: "Rune"
  }),
  "a-calm-rune-base": createCard({
    domain: ["Calm"],
    energy: null,
    name: "Calm Rune",
    power: null,
    type: "Rune"
  }),
  "b-rune-base-1": createCard({
    domain: ["Order"],
    energy: null,
    name: "Order Rune",
    power: null,
    type: "Rune"
  }),
  "a-unit-hand-1": createCard({
    domain: ["Chaos"],
    energy: 2,
    name: "Simple Unit",
    power: null,
    type: "Unit"
  }),
  "a-multi-domain-unit-hand": createCard({
    domain: ["Calm", "Chaos"],
    energy: 0,
    name: "Multi Domain Unit",
    power: 1,
    type: "Unit"
  }),
  "a-unit-on-play": createCard({
    domain: ["Chaos"],
    energy: 1,
    name: "On Play Unit",
    power: null,
    text: "When you play me, draw 1.",
    type: "Unit"
  })
};

function createCard(input: {
  domain: string[];
  energy: number | null;
  name: string;
  power: number | null;
  text?: string;
  type: Card["classification"]["type"];
}): Card {
  return {
    id: input.name,
    name: input.name,
    public_code: input.name,
    attributes: {
      energy: input.energy,
      might: input.type === "Unit" ? 2 : null,
      power: input.power
    },
    classification: {
      type: input.type,
      supertype: null,
      rarity: null,
      domain: input.domain
    },
    text: {
      plain: input.text ?? ""
    },
    set: {
      set_id: "test",
      label: "Test"
    },
    media: {},
    tags: [],
    metadata: {}
  };
}
