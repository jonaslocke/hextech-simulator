import assert from "node:assert/strict";
import { test } from "node:test";
import type { Card } from "../src/server/catalog";
import {
  activateAbility,
  endTurn,
  gameSchema,
  passPriority,
  playCard,
  projectGameForPlayer,
  submitChoice,
  type Game
} from "../src/server/match";

test("Lux Crownguard ability adds spell-only Energy that pays spells before generic Energy", () => {
  const game = createLuxGame({
    playerARunePool: {
      energy: 6,
      power: {}
    },
    playerABase: ["player-a:lux-crownguard"],
    playerAHand: ["player-a:final-spark"],
    playerBBase: ["player-b:target-unit"]
  });

  const withSpellEnergy = activateAbility(
    game,
    {
      actorPlayerId: "player-a",
      abilityId: "lux-crownguard-add-spell-energy",
      sourceCardInstanceId: "player-a:lux-crownguard"
    },
    cardsByInstanceId
  );

  assert.deepEqual(
    withSpellEnergy.canonicalState.players["player-a"]?.runePool.conditionalEnergy,
    {
      "lux-crownguard-spell-energy": {
        amount: 2,
        restriction: "spell"
      }
    }
  );
  assert.equal(
    withSpellEnergy.canonicalState.cardStates["player-a:lux-crownguard"]?.exhausted,
    true
  );

  const result = playCard(
    withSpellEnergy,
    {
      actorPlayerId: "player-a",
      cardInstanceId: "player-a:final-spark",
      choices: {
        targetCardInstanceIds: ["player-b:target-unit"]
      }
    },
    cardsByInstanceId
  );

  assert.deepEqual(result.payment.resourcePayments.slice(0, 2), [
    {
      type: "spendConditionalEnergy",
      amount: 2,
      sourceId: "lux-crownguard-spell-energy",
      restriction: "spell"
    },
    {
      type: "spendEnergy",
      amount: 6
    }
  ]);
  assert.equal(
    result.game.canonicalState.players["player-a"]?.runePool.conditionalEnergy,
    undefined
  );
});

test("spell-only Energy expires at the next start of turn", () => {
  const game = createLuxGame({
    playerABase: ["player-a:lux-crownguard"],
    playerBMainDeck: ["player-b:draw-card"]
  });
  const withSpellEnergy = activateAbility(
    game,
    {
      actorPlayerId: "player-a",
      abilityId: "lux-crownguard-add-spell-energy",
      sourceCardInstanceId: "player-a:lux-crownguard"
    },
    cardsByInstanceId
  );

  const nextTurn = endTurn(withSpellEnergy, {
    actorPlayerId: "player-a"
  });

  assert.deepEqual(nextTurn.canonicalState.players["player-a"]?.runePool, {
    energy: 0,
    power: {}
  });
});

test("Stupefy resolves through the chain, modifies Might this turn, draws, and goes to trash", () => {
  const game = createLuxGame({
    playerARunePool: {
      energy: 1,
      power: {}
    },
    playerAHand: ["player-a:stupefy"],
    playerAMainDeck: ["player-a:draw-card"],
    playerBBase: ["player-b:target-unit"]
  });
  const played = playCard(
    game,
    {
      actorPlayerId: "player-a",
      cardInstanceId: "player-a:stupefy",
      choices: {
        targetCardInstanceIds: ["player-b:target-unit"]
      }
    },
    cardsByInstanceId
  ).game;

  assert.equal(played.canonicalState.chain?.items[0]?.label, "Stupefy");

  const resolved = resolveChain(played);

  assert.equal(resolved.canonicalState.chain, null);
  assert.deepEqual(resolved.canonicalState.players["player-a"]?.zones.trash, [
    "player-a:stupefy"
  ]);
  assert.deepEqual(resolved.canonicalState.players["player-a"]?.zones.hand, [
    "player-a:draw-card"
  ]);
  assert.equal(
    resolved.canonicalState.modifiers.find(
      (modifier) => modifier.targetCardInstanceId === "player-b:target-unit"
    )?.amount,
    -1
  );
});

test("open chain timing rejects Units and does not project them as playable", () => {
  const game = createLuxGame({
    playerARunePool: {
      energy: 3,
      power: {}
    },
    playerAHand: ["player-a:stupefy", "player-a:unit-during-chain"],
    playerAMainDeck: ["player-a:draw-card"],
    playerBBase: ["player-b:target-unit"]
  });
  const withChain = playCard(
    game,
    {
      actorPlayerId: "player-a",
      cardInstanceId: "player-a:stupefy",
      choices: {
        targetCardInstanceIds: ["player-b:target-unit"]
      }
    },
    cardsByInstanceId
  ).game;

  assert.throws(
    () =>
      playCard(
        withChain,
        {
          actorPlayerId: "player-a",
          cardInstanceId: "player-a:unit-during-chain"
        },
        cardsByInstanceId
      ),
    /Only Reaction spells/
  );

  const projection = projectGameForPlayer(
    withChain,
    "player-a",
    cardsByInstanceId
  );

  assert.equal(
    projection.players["player-a"]?.availablePaymentModes[
      "player-a:unit-during-chain"
    ],
    undefined
  );
});

test("Back to Back requires exactly two friendly units and buffs both this turn", () => {
  const game = createLuxGame({
    playerARunePool: {
      energy: 3,
      power: {}
    },
    playerAHand: ["player-a:back-to-back"],
    playerABase: ["player-a:friendly-one", "player-a:friendly-two"]
  });

  assert.throws(
    () =>
      playCard(
        game,
        {
          actorPlayerId: "player-a",
          cardInstanceId: "player-a:back-to-back",
          choices: {
            targetCardInstanceIds: ["player-a:friendly-one"]
          }
        },
        cardsByInstanceId
      ),
    /exact number of friendly targets/
  );

  const resolved = resolveChain(
    playCard(
      game,
      {
        actorPlayerId: "player-a",
        cardInstanceId: "player-a:back-to-back",
        choices: {
          targetCardInstanceIds: ["player-a:friendly-one", "player-a:friendly-two"]
        }
      },
      cardsByInstanceId
    ).game
  );

  assert.deepEqual(
    resolved.canonicalState.modifiers
      .map((modifier) => ({
        amount: modifier.amount,
        target: modifier.targetCardInstanceId
      })),
    [
      {
        amount: 2,
        target: "player-a:friendly-one"
      },
      {
        amount: 2,
        target: "player-a:friendly-two"
      }
    ]
  );
});

test("Falling Comet marks damage and cleanup kills a lethally damaged battlefield unit", () => {
  const game = createLuxGame({
    playerARunePool: {
      energy: 5,
      power: {}
    },
    playerAHand: ["player-a:falling-comet"],
    battlefieldUnits: ["player-b:battlefield-unit"]
  });

  const resolved = resolveChain(
    playCard(
      game,
      {
        actorPlayerId: "player-a",
        cardInstanceId: "player-a:falling-comet",
        choices: {
          targetCardInstanceIds: ["player-b:battlefield-unit"]
        }
      },
      cardsByInstanceId
    ).game
  );

  assert.deepEqual(resolved.canonicalState.battlefields[0]?.units, []);
  assert.deepEqual(resolved.canonicalState.players["player-b"]?.zones.trash, [
    "player-b:battlefield-unit"
  ]);
  assert.equal(resolved.canonicalState.cardStates["player-b:battlefield-unit"], undefined);
});

test("Blast of Power kills a chosen battlefield unit", () => {
  const game = createLuxGame({
    playerARunePool: {
      energy: 6,
      power: {
        Order: 1
      }
    },
    playerAHand: ["player-a:blast-of-power"],
    battlefieldUnits: ["player-b:battlefield-unit"]
  });

  const resolved = resolveChain(
    playCard(
      game,
      {
        actorPlayerId: "player-a",
        cardInstanceId: "player-a:blast-of-power",
        choices: {
          targetCardInstanceIds: ["player-b:battlefield-unit"]
        }
      },
      cardsByInstanceId
    ).game
  );

  assert.deepEqual(resolved.canonicalState.battlefields[0]?.units, []);
  assert.deepEqual(resolved.canonicalState.players["player-b"]?.zones.trash, [
    "player-b:battlefield-unit"
  ]);
  assert.deepEqual(resolved.canonicalState.players["player-a"]?.zones.trash, [
    "player-a:blast-of-power"
  ]);
});

test("Singularity allows zero to two unit targets", () => {
  const game = createLuxGame({
    playerARunePool: {
      energy: 6,
      power: {
        Mind: 2
      }
    },
    playerAHand: ["player-a:singularity"],
    playerBBase: ["player-b:target-unit", "player-b:target-unit-two"]
  });

  const noTargets = playCard(
    game,
    {
      actorPlayerId: "player-a",
      cardInstanceId: "player-a:singularity",
      choices: {
        targetCardInstanceIds: []
      }
    },
    cardsByInstanceId
  ).game;

  assert.equal(noTargets.canonicalState.chain?.items[0]?.label, "Singularity");

  assert.throws(
    () =>
      playCard(
        game,
        {
          actorPlayerId: "player-a",
          cardInstanceId: "player-a:singularity",
          choices: {
            targetCardInstanceIds: [
              "player-b:target-unit",
              "player-b:target-unit-two",
              "player-a:friendly-one"
            ]
          }
        },
        cardsByInstanceId
      ),
    /too many targets/
  );
});

test("Eager Apprentice reduces spell Energy costs only while at a battlefield", () => {
  const baseGame = createLuxGame({
    playerARunePool: {
      energy: 7,
      power: {}
    },
    playerAHand: ["player-a:final-spark"],
    playerBBase: ["player-b:target-unit"]
  });

  assert.throws(
    () =>
      playCard(
        baseGame,
        {
          actorPlayerId: "player-a",
          cardInstanceId: "player-a:final-spark",
          choices: {
            targetCardInstanceIds: ["player-b:target-unit"]
          }
        },
        cardsByInstanceId
      ),
    /Not enough Energy/
  );

  const discountedGame = createLuxGame({
    playerARunePool: {
      energy: 7,
      power: {}
    },
    playerAHand: ["player-a:final-spark"],
    playerBBase: ["player-b:target-unit"],
    battlefieldUnits: ["player-a:eager-apprentice"]
  });
  const result = playCard(
    discountedGame,
    {
      actorPlayerId: "player-a",
      cardInstanceId: "player-a:final-spark",
      choices: {
        targetCardInstanceIds: ["player-b:target-unit"]
      }
    },
    cardsByInstanceId
  );

  assert.equal(result.payment.resourceCosts.energy, 7);
});

test("Deflect adds mandatory any-domain Power when a spell chooses an opponent unit", () => {
  const game = createLuxGame({
    playerARunePool: {
      energy: 1,
      power: {
        Rainbow: 1
      }
    },
    playerAHand: ["player-a:stupefy"],
    playerBBase: ["player-b:pouty-poro"]
  });

  const result = playCard(
    game,
    {
      actorPlayerId: "player-a",
      cardInstanceId: "player-a:stupefy",
      choices: {
        targetCardInstanceIds: ["player-b:pouty-poro"]
      }
    },
    cardsByInstanceId
  );

  assert.deepEqual(result.payment.resourceCosts.power, [
    {
      amount: 1,
      payableBy: "any"
    }
  ]);
  assert.deepEqual(
    result.payment.resourcePayments.filter((payment) => payment.type === "spendPower"),
    [
      {
        type: "spendPower",
        domain: "Rainbow",
        amount: 1
      }
    ]
  );
});

test("spell-cost triggers create a pending trigger-order choice after chain resolution", () => {
  const game = createLuxGame({
    playerARunePool: {
      energy: 8,
      power: {}
    },
    playerAHand: ["player-a:final-spark"],
    playerABase: [
      "player-a:ravenbloom-student",
      "player-a:lux-illuminated"
    ],
    playerBBase: ["player-b:target-unit"]
  });

  const withTriggers = resolveChain(
    playCard(
      game,
      {
        actorPlayerId: "player-a",
        cardInstanceId: "player-a:final-spark",
        choices: {
          targetCardInstanceIds: ["player-b:target-unit"]
        }
      },
      cardsByInstanceId
    ).game
  );

  assert.equal(withTriggers.canonicalState.pendingChoice?.type, "orderTriggers");
  assert.equal(withTriggers.canonicalState.chain?.items.length, 3);
  assert.deepEqual(
    projectGameForPlayer(withTriggers, "player-a", cardsByInstanceId).chain?.items.map(
      (item) => item.sourceCardInstanceId
    ),
    [
      "player-a:legend",
      "player-a:ravenbloom-student",
      "player-a:lux-illuminated"
    ]
  );

  const optionIds = withTriggers.canonicalState.pendingChoice?.optionIds ?? [];
  const reordered = submitChoice(
    withTriggers,
    {
      actorPlayerId: "player-a",
      choiceId: withTriggers.canonicalState.pendingChoice!.id,
      orderedIds: [...optionIds].reverse()
    },
    cardsByInstanceId
  );

  assert.deepEqual(
    reordered.canonicalState.chain?.items.map((item) => item.id),
    [...optionIds].reverse()
  );
  assert.equal(reordered.canonicalState.pendingChoice, null);
});

function resolveChain(game: Game): Game {
  const firstPass = passPriority(game, {
    actorPlayerId: "player-a",
    cardsByInstanceId
  });

  return passPriority(firstPass, {
    actorPlayerId: "player-b",
    cardsByInstanceId
  });
}

function createLuxGame(input: {
  battlefieldUnits?: string[];
  playerABase?: string[];
  playerAHand?: string[];
  playerAMainDeck?: string[];
  playerARunePool?: {
    energy: number;
    power: Record<string, number>;
    conditionalEnergy?: Record<string, { amount: number; restriction: "spell" }>;
  };
  playerBBase?: string[];
  playerBMainDeck?: string[];
} = {}): Game {
  return gameSchema.parse({
    id: "lux-game",
    createdAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z",
    matchId: "lux-match",
    gameNumber: 1,
    status: "in_progress",
    stateVersion: 1,
    winnerPlayerId: null,
    canonicalState: {
      battlefields: [
        {
          battlefieldId: "battlefield-a",
          selectedByPlayerId: "player-a",
          cardInstanceId: "player-a:battlefield",
          units: input.battlefieldUnits ?? [],
          facedownSlot: null
        }
      ],
      cardStates: Object.fromEntries(
        [
          ...(input.playerABase ?? []),
          ...(input.playerBBase ?? []),
          ...(input.battlefieldUnits ?? [])
        ].map((cardInstanceId) => [
          cardInstanceId,
          {
            exhausted: false
          }
        ])
      ),
      chain: null,
      modifiers: [],
      pendingChoice: null,
      rng: {
        rngAlgorithm: "seedrandom",
        seed: "lux-seed",
        rngStep: 1
      },
      setup: {
        playerIds: ["player-a", "player-b"],
        startingPlayerChooserId: "player-a",
        startingPlayerId: "player-a",
        battlefieldChoices: {
          "player-a": {
            playerId: "player-a",
            status: "revealed",
            cardInstanceId: "player-a:battlefield",
            lockedAt: "2026-06-18T00:00:00.000Z",
            revealedAt: "2026-06-18T00:00:00.000Z"
          },
          "player-b": {
            playerId: "player-b",
            status: "revealed",
            cardInstanceId: "player-b:battlefield",
            lockedAt: "2026-06-18T00:00:00.000Z",
            revealedAt: "2026-06-18T00:00:00.000Z"
          }
        },
        battlefieldPools: {
          "player-a": {
            playerId: "player-a",
            registeredCardInstanceIds: ["player-a:battlefield"],
            usedCardInstanceIds: []
          },
          "player-b": {
            playerId: "player-b",
            registeredCardInstanceIds: ["player-b:battlefield"],
            usedCardInstanceIds: []
          }
        },
        mulliganChoices: {
          "player-a": {
            playerId: "player-a",
            status: "locked",
            selectedCardInstanceIds: [],
            lockedAt: "2026-06-18T00:00:00.000Z"
          },
          "player-b": {
            playerId: "player-b",
            status: "locked",
            selectedCardInstanceIds: [],
            lockedAt: "2026-06-18T00:00:00.000Z"
          }
        }
      },
      showdown: null,
      turn: {
        turnNumber: 1,
        activePlayerId: "player-a",
        phase: "action",
        passedPlayerIds: [],
        completedStartOfTurnSteps: ["awaken", "beginning", "channel", "draw"]
      },
      players: {
        "player-a": {
          playerId: "player-a",
          runePool: input.playerARunePool ?? {
            energy: 0,
            power: {}
          },
          zones: {
            legend: "player-a:legend",
            champion: null,
            mainDeck: input.playerAMainDeck ?? [],
            runeDeck: [],
            hand: input.playerAHand ?? [],
            trash: [],
            banishment: [],
            base: input.playerABase ?? []
          }
        },
        "player-b": {
          playerId: "player-b",
          runePool: {
            energy: 0,
            power: {}
          },
          zones: {
            legend: "player-b:legend",
            champion: null,
            mainDeck: input.playerBMainDeck ?? ["player-b:draw-card"],
            runeDeck: [],
            hand: [],
            trash: [],
            banishment: [],
            base: input.playerBBase ?? []
          }
        }
      }
    }
  });
}

const cardsByInstanceId: Record<string, Card> = {
  "player-a:back-to-back": createCard({
    domain: ["Order"],
    energy: 3,
    name: "Back to Back",
    text: "[Reaction] Give two friendly units each +2 :rb_might: this turn.",
    type: "Spell"
  }),
  "player-a:battlefield": createCard({
    domain: [],
    energy: null,
    name: "Aspirant's Climb",
    type: "Battlefield"
  }),
  "player-a:blast-of-power": createCard({
    domain: ["Order"],
    energy: 6,
    name: "Blast of Power",
    power: 1,
    text: "[Action] Kill a unit at a battlefield.",
    type: "Spell"
  }),
  "player-a:draw-card": createCard({
    domain: ["Mind"],
    energy: 1,
    name: "Drawn Card",
    type: "Unit"
  }),
  "player-a:eager-apprentice": createCard({
    domain: ["Mind"],
    energy: 3,
    might: 3,
    name: "Eager Apprentice",
    text: "While I'm at a battlefield, the Energy costs for spells you play is reduced by :rb_energy_1:, to a minimum of :rb_energy_1:.",
    type: "Unit"
  }),
  "player-a:falling-comet": createCard({
    domain: ["Mind"],
    energy: 5,
    name: "Falling Comet",
    text: "[Action] Deal 6 to a unit at a battlefield.",
    type: "Spell"
  }),
  "player-a:final-spark": createCard({
    domain: ["Mind", "Order"],
    energy: 8,
    name: "Final Spark",
    text: "[Action] Deal 8 to a unit.",
    type: "Spell"
  }),
  "player-a:friendly-one": createCard({
    domain: ["Order"],
    energy: 1,
    name: "Friendly One",
    type: "Unit"
  }),
  "player-a:friendly-two": createCard({
    domain: ["Order"],
    energy: 1,
    name: "Friendly Two",
    type: "Unit"
  }),
  "player-a:legend": createCard({
    domain: ["Mind", "Order"],
    energy: null,
    name: "Lady of Luminosity - Starter",
    text: "When you play a spell that costs :rb_energy_5: or more, draw 1.",
    type: "Legend"
  }),
  "player-a:lux-crownguard": createCard({
    domain: ["Order"],
    energy: 4,
    might: 2,
    name: "Lux, Crownguard",
    text: ":rb_exhaust:: [Reaction] — [Add] :rb_energy_2:. Use only to play spells.",
    type: "Unit"
  }),
  "player-a:lux-illuminated": createCard({
    domain: ["Mind"],
    energy: 6,
    might: 5,
    name: "Lux, Illuminated",
    text: "When you play a spell that costs :rb_energy_5: or more, give me +3 :rb_might: this turn.",
    type: "Unit"
  }),
  "player-a:ravenbloom-student": createCard({
    domain: ["Mind"],
    energy: 2,
    name: "Ravenbloom Student",
    text: "When you play a spell, give me +1 :rb_might: this turn.",
    type: "Unit"
  }),
  "player-a:singularity": createCard({
    domain: ["Mind"],
    energy: 6,
    name: "Singularity",
    power: 2,
    text: "Deal 6 to each of up to two units.",
    type: "Spell"
  }),
  "player-a:stupefy": createCard({
    domain: ["Mind"],
    energy: 1,
    name: "Stupefy",
    text: "[Reaction] Give a unit -1 :rb_might: this turn, to a minimum of 1 :rb_might:. Draw 1.",
    type: "Spell"
  }),
  "player-a:unit-during-chain": createCard({
    domain: ["Mind"],
    energy: 1,
    name: "Unit During Chain",
    type: "Unit"
  }),
  "player-b:battlefield-unit": createCard({
    domain: ["Fury"],
    energy: 2,
    might: 2,
    name: "Enemy Battlefield Unit",
    type: "Unit"
  }),
  "player-b:draw-card": createCard({
    domain: ["Fury"],
    energy: 1,
    name: "Opponent Drawn Card",
    type: "Unit"
  }),
  "player-b:legend": createCard({
    domain: ["Fury"],
    energy: null,
    name: "Enemy Legend",
    type: "Legend"
  }),
  "player-b:pouty-poro": createCard({
    domain: ["Fury"],
    energy: 2,
    might: 2,
    name: "Pouty Poro",
    text: "[Deflect] (Opponents must pay :rb_rune_rainbow: to choose me with a spell or ability.)",
    type: "Unit"
  }),
  "player-b:target-unit": createCard({
    domain: ["Fury"],
    energy: 2,
    might: 2,
    name: "Target Unit",
    type: "Unit"
  }),
  "player-b:target-unit-two": createCard({
    domain: ["Fury"],
    energy: 2,
    might: 2,
    name: "Target Unit Two",
    type: "Unit"
  })
};

function createCard(input: {
  domain: string[];
  energy: number | null;
  might?: number | null;
  name: string;
  power?: number | null;
  text?: string;
  type: Card["classification"]["type"];
}): Card {
  return {
    id: input.name,
    name: input.name,
    public_code: input.name,
    attributes: {
      energy: input.energy,
      might: input.type === "Unit" ? (input.might ?? 2) : null,
      power: input.power ?? null
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
