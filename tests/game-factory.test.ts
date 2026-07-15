import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createInitialDeckConfiguration,
  createMatchGame,
  registeredBattlefieldIds,
  resolveActiveGameDeck,
} from "../src/server/game";
import type { DeckSnapshotDocument } from "../src/server/game/repositories";
import type { CardInstance, DeckConfiguration, MatchSeat } from "../src/server/game/state";
import type { GameCardDefinition } from "../src/server/game/schemas";

test("builds a deck configuration from registered card sources", () => {
  const copies = registeredCopies("p1");
  const configuration = createInitialDeckConfiguration(copies);

  assert.equal(configuration.chosenChampionRegisteredCardId, "p1:champion");
  assert.deepEqual(configuration.mainDeckRegisteredCardIds, ["p1:main"]);
  assert.deepEqual(configuration.sideboardRegisteredCardIds, ["p1:side"]);
  assert.deepEqual(registeredBattlefieldIds(copies), ["p1:battlefield"]);
});

test("resolves only the configured active deck and available battlefields", () => {
  const copies = registeredCopies("p1");
  const configuration: DeckConfiguration = {
    chosenChampionRegisteredCardId: "p1:champion",
    mainDeckRegisteredCardIds: ["p1:main"],
    sideboardRegisteredCardIds: ["p1:side"],
  };

  assert.deepEqual(resolveActiveGameDeck({
    registeredCopies: copies,
    configuration,
    availableBattlefieldRegisteredCardIds: ["p1:battlefield"],
  }), {
    legendRegisteredCardId: "p1:legend",
    chosenChampionRegisteredCardId: "p1:champion",
    mainDeckRegisteredCardIds: ["p1:main"],
    runeDeckRegisteredCardIds: ["p1:rune"],
    availableBattlefieldRegisteredCardIds: ["p1:battlefield"],
    sideboardRegisteredCardIds: ["p1:side"],
  });
});

test("creates a game with runtime instances only for the active configuration", () => {
  const p1 = deck("p1");
  const p2 = deck("p2");
  const seats = [seat("p1", "player-1"), seat("p2", "player-2")] as [
    MatchSeat,
    MatchSeat,
  ];
  const configuration = (playerId: string): DeckConfiguration => ({
    chosenChampionRegisteredCardId: `${playerId}:champion`,
    mainDeckRegisteredCardIds: [`${playerId}:main`],
    sideboardRegisteredCardIds: [`${playerId}:side`],
  });

  const game = createMatchGame({
    matchId: "match",
    gameNumber: 1,
    now: "now",
    players: seats,
    registeredDecksByPlayerId: { p1, p2 },
    activeConfigurationsByPlayerId: {
      p1: configuration("p1"),
      p2: configuration("p2"),
    },
    startingPlayerChooserId: "p1",
    availableBattlefieldRegisteredIdsByPlayerId: {
      p1: ["p1:battlefield"],
      p2: ["p2:battlefield"],
    },
  });

  assert.equal(game.status, "setup_pending");
  assert.deepEqual(game.state.players.p1!.zones.mainDeck, ["p1:main"]);
  assert.deepEqual(game.state.players.p1!.zones.runeDeck, ["p1:rune"]);
  assert.deepEqual(game.state.setup.battlefieldPools.p1, ["p1:battlefield"]);
  assert.equal(game.state.cardStates["p1:side"], undefined);
  assert.ok(game.state.cardStates["p1:main"]);
});

function deck(playerId: string): DeckSnapshotDocument {
  const copies = registeredCopies(playerId);
  const cards = [...new Set(copies.map((copy) => copy.cardCode))].map((cardCode) => card(cardCode));
  return {
    id: `${playerId}:deck`,
    createdAt: "now",
    updatedAt: "now",
    matchId: "match",
    playerId,
    snapshot: {
      sourceText: "synthetic",
      catalogDigest: "synthetic",
      entries: [],
      cards,
    },
    instances: copies,
  };
}

function registeredCopies(playerId: string): CardInstance[] {
  return [
    copy(`${playerId}:legend`, playerId, "legend"),
    copy(`${playerId}:champion`, playerId, "champion"),
    copy(`${playerId}:main`, playerId, "mainDeck"),
    copy(`${playerId}:rune`, playerId, "runeDeck"),
    copy(`${playerId}:battlefield`, playerId, "battlefield"),
    copy(`${playerId}:side`, playerId, "sideboard"),
  ];
}

function copy(
  registeredCardId: string,
  playerId: string,
  source: CardInstance["source"],
): CardInstance {
  return {
    instanceId: registeredCardId,
    registeredCardId,
    ownerPlayerId: playerId,
    source,
    cardCode: registeredCardId,
  };
}

function card(cardCode: string): GameCardDefinition {
  const type = cardCode.includes("legend")
    ? "Legend"
    : cardCode.includes("champion")
      ? "Unit"
      : cardCode.includes("rune")
        ? "Rune"
        : cardCode.includes("battlefield")
          ? "Battlefield"
          : "Spell";
  return {
    cardCode,
    sourceTextHash: `hash:${cardCode}`,
    card: {
      id: cardCode,
      name: `Synthetic ${cardCode}`,
      public_code: cardCode,
      attributes: { energy: type === "Spell" ? 1 : null, might: type === "Unit" ? 1 : null, power: null },
      classification: {
        type,
        supertype: type === "Unit" ? "Champion" : null,
        rarity: null,
        domain: ["Colorless"],
      },
      text: { plain: "" },
      set: { set_id: "synthetic", label: "Synthetic" },
      media: {},
      tags: [],
      metadata: {},
    },
    behaviorModel: { playTimings: [], clauses: [] },
  } as GameCardDefinition;
}

function seat(playerId: string, seatId: MatchSeat["seat"]): MatchSeat {
  return {
    playerId,
    seat: seatId,
    tokenHash: `${playerId}:token`,
    registeredDeckSnapshotId: `${playerId}:deck`,
    displayName: playerId,
    currentDeckConfiguration: {
      chosenChampionRegisteredCardId: `${playerId}:champion`,
      mainDeckRegisteredCardIds: [`${playerId}:main`],
      sideboardRegisteredCardIds: [`${playerId}:side`],
    },
  };
}
