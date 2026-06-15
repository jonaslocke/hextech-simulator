import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadCardCatalog, type Card, type CardCatalog } from "@/server/catalog";
import { validateDeckList, type DeckSnapshot } from "@/server/deck";
import { gameEventTypes, projectGameEventsForPlayer } from "@/server/events";
import { createGame, gameSchema, projectGameForPlayer } from "@/server/match";
import { GameBoard } from "../../features/game-board";

export default async function Home() {
  const catalog = await loadCardCatalog();
  const fixture = await createFixture(catalog);
  const baseGame = createGame({
    id: "ui-game-1",
    matchId: "ui-match-1",
    gameNumber: 1,
    battlefieldCardInstanceIdsByPlayer: {
      "player-a": fixture.playerA.battlefieldPool,
      "player-b": fixture.playerB.battlefieldPool,
    },
    mainDeckCardInstanceIdsByPlayer: {
      "player-a": fixture.playerA.allMainDeck,
      "player-b": fixture.playerB.allMainDeck,
    },
    playerIds: ["player-a", "player-b"],
    rngSeed: "ui-fixture-seed",
    runeDeckCardInstanceIdsByPlayer: {
      "player-a": fixture.playerA.allRunes,
      "player-b": fixture.playerB.allRunes,
    },
  });
  const game = gameSchema.parse({
    ...baseGame,
    status: "in_progress",
    stateVersion: 12,
    canonicalState: {
      ...baseGame.canonicalState,
      turn: {
        turnNumber: 3,
        activePlayerId: "player-a",
        phase: "action",
        passedPlayerIds: [],
      },
      showdown: null,
      setup: {
        ...baseGame.canonicalState.setup,
        startingPlayerChooserId: "player-a",
        startingPlayerId: "player-a",
        battlefieldChoices: {
          "player-a": {
            playerId: "player-a",
            status: "revealed",
            cardInstanceId: fixture.playerA.selectedBattlefield,
            lockedAt: "2026-06-14T08:59:00.000Z",
            revealedAt: "2026-06-14T08:59:01.000Z",
          },
          "player-b": {
            playerId: "player-b",
            status: "revealed",
            cardInstanceId: fixture.playerB.selectedBattlefield,
            lockedAt: "2026-06-14T08:59:00.000Z",
            revealedAt: "2026-06-14T08:59:01.000Z",
          },
        },
        battlefieldPools: {
          "player-a": {
            ...baseGame.canonicalState.setup.battlefieldPools["player-a"]!,
            usedCardInstanceIds: [fixture.playerA.selectedBattlefield],
          },
          "player-b": {
            ...baseGame.canonicalState.setup.battlefieldPools["player-b"]!,
            usedCardInstanceIds: [fixture.playerB.selectedBattlefield],
          },
        },
        mulliganChoices: {
          "player-a": {
            playerId: "player-a",
            status: "locked",
            selectedCardInstanceIds: [],
            lockedAt: "2026-06-14T08:59:30.000Z",
          },
          "player-b": {
            playerId: "player-b",
            status: "locked",
            selectedCardInstanceIds: [],
            lockedAt: "2026-06-14T08:59:30.000Z",
          },
        },
      },
      battlefields: [
        {
          battlefieldId: "ui-game-1:battlefield:player-a",
          selectedByPlayerId: "player-a",
          cardInstanceId: fixture.playerA.selectedBattlefield,
          units: [fixture.playerA.battlefieldUnit],
          facedownSlot: null,
        },
        {
          battlefieldId: "ui-game-1:battlefield:player-b",
          selectedByPlayerId: "player-b",
          cardInstanceId: fixture.playerB.selectedBattlefield,
          units: [fixture.playerB.battlefieldUnit],
          facedownSlot: null,
        },
      ],
      players: {
        "player-a": {
          playerId: "player-a",
          zones: {
            legend: fixture.playerA.legend,
            champion: fixture.playerA.champion,
            mainDeck: fixture.playerA.mainDeck,
            runeDeck: fixture.playerA.runeDeck,
            hand: fixture.playerA.hand,
            trash: fixture.playerA.trash,
            banishment: fixture.playerA.banishment,
            base: fixture.playerA.base,
          },
        },
        "player-b": {
          playerId: "player-b",
          zones: {
            legend: fixture.playerB.legend,
            champion: fixture.playerB.champion,
            mainDeck: fixture.playerB.mainDeck,
            runeDeck: fixture.playerB.runeDeck,
            hand: fixture.playerB.hand,
            trash: fixture.playerB.trash,
            banishment: fixture.playerB.banishment,
            base: fixture.playerB.base,
          },
        },
      },
    },
  });
  const projection = projectGameForPlayer(game, "player-a");
  const logEntries = projectGameEventsForPlayer(
    [
      {
        id: "ui-event-1",
        createdAt: "2026-06-14T09:00:00.000Z",
        updatedAt: "2026-06-14T09:00:00.000Z",
        matchId: game.matchId,
        gameId: game.id,
        sequence: 1,
        type: gameEventTypes.playerIntentAccepted,
        actorPlayerId: "player-a",
        payload: {
          intent: {
            type: "game.moveUnitToBattlefield",
            payload: {
              unitCardInstanceId: fixture.playerA.battlefieldUnit,
              battlefieldId: "ui-game-1:battlefield:player-a",
            },
          },
        },
      },
      {
        id: "ui-event-2",
        createdAt: "2026-06-14T09:00:01.000Z",
        updatedAt: "2026-06-14T09:00:01.000Z",
        matchId: game.matchId,
        gameId: game.id,
        sequence: 2,
        type: gameEventTypes.serverDecision,
        actorPlayerId: null,
        payload: {
          decision: {
            type: "showdown.enter",
          },
        },
      },
    ],
    "player-a",
  );

  return (
    <GameBoard
      chainCardInstanceIds={fixture.playerA.chain}
      cardsByInstanceId={fixture.cardsByInstanceId}
      logEntries={logEntries}
      playerNames={{
        "player-a": "Prismaticician",
        "player-b": "Alanzq1",
      }}
      projection={projection}
      scores={{
        "player-a": 1,
        "player-b": 0,
      }}
    />
  );
}

async function createFixture(catalog: CardCatalog) {
  const playerA = await loadFixtureDeck({
    battlefieldName: "Aspirant's Climb",
    catalog,
    deckFile: "annie.dec.txt",
    ownerId: "player-a",
  });
  const playerB = await loadFixtureDeck({
    battlefieldName: "Targon's Peak",
    catalog,
    deckFile: "lux.dec.txt",
    ownerId: "player-b",
  });

  return {
    cardsByInstanceId: Object.fromEntries(
      [...playerA.snapshot.instances, ...playerB.snapshot.instances].map((instance) => [
        instance.instanceId,
        instance.card,
      ]),
    ) satisfies Record<string, Card>,
    playerA,
    playerB,
  };
}

async function loadFixtureDeck({
  battlefieldName,
  catalog,
  deckFile,
  ownerId,
}: {
  battlefieldName: string;
  catalog: CardCatalog;
  deckFile: string;
  ownerId: string;
}) {
  const deckSource = await readFile(
    path.join(process.cwd(), "data", "decks", deckFile),
    "utf8",
  );
  const validation = validateDeckList(deckSource, catalog, { ownerId });

  if (!validation.ok) {
    throw new Error(
      `${deckFile} is invalid: ${validation.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }

  return createPlayerFixture(validation.snapshot, battlefieldName);
}

function createPlayerFixture(snapshot: DeckSnapshot, battlefieldName: string) {
  const legend = sourceIds(snapshot, "legend")[0];
  const champion = sourceIds(snapshot, "champion")[0];
  const allMainDeck = sourceIds(snapshot, "mainDeck");
  const allRunes = sourceIds(snapshot, "runeDeck");
  const battlefieldPool = sourceIds(snapshot, "battlefield");
  const selectedBattlefield = requireInstanceByName(
    snapshot,
    "battlefield",
    battlefieldName,
  );

  if (!legend || !champion) {
    throw new Error("Fixture deck must include one legend and one champion.");
  }

  const hand = allMainDeck.slice(0, 4);
  const battlefieldUnit = allMainDeck
    .slice(4)
    .find((instanceId) => cardFor(snapshot, instanceId).classification.type === "Unit");

  if (!battlefieldUnit) {
    throw new Error("Fixture deck must include a main-deck unit for battlefield state.");
  }

  const unavailableMainDeckIds = new Set([battlefieldUnit, ...hand]);
  const baseUnit = firstLegalCard(
    snapshot,
    allMainDeck,
    unavailableMainDeckIds,
    (card) => card.classification.type === "Unit",
  );

  if (!baseUnit) {
    throw new Error("Fixture deck must include a main-deck unit for base state.");
  }

  unavailableMainDeckIds.add(baseUnit);

  const trashCard = firstLegalCard(
    snapshot,
    allMainDeck,
    unavailableMainDeckIds,
    isMainDeckCard,
  );

  if (!trashCard) {
    throw new Error("Fixture deck must include a main-deck card for trash state.");
  }

  unavailableMainDeckIds.add(trashCard);

  const banishmentCard = firstLegalCard(
    snapshot,
    allMainDeck,
    unavailableMainDeckIds,
    isMainDeckCard,
  );

  if (!banishmentCard) {
    throw new Error("Fixture deck must include a main-deck card for banishment state.");
  }

  unavailableMainDeckIds.add(banishmentCard);

  const chain = allMainDeck
    .filter((instanceId) => !unavailableMainDeckIds.has(instanceId))
    .filter((instanceId) => cardFor(snapshot, instanceId).classification.type === "Spell")
    .slice(0, 2);

  const mainDeck = allMainDeck.filter(
    (instanceId) => !unavailableMainDeckIds.has(instanceId),
  );
  const runesInPlay = allRunes.slice(0, 2);
  const runeDeck = allRunes.slice(2);

  return {
    allMainDeck,
    allRunes,
    banishment: [banishmentCard],
    base: [...runesInPlay, baseUnit],
    battlefieldPool,
    battlefieldUnit,
    champion,
    chain,
    hand,
    legend,
    mainDeck,
    runeDeck,
    runesInPlay,
    selectedBattlefield,
    snapshot,
    trash: [trashCard],
  };
}

function firstLegalCard(
  snapshot: DeckSnapshot,
  instanceIds: string[],
  unavailableInstanceIds: Set<string>,
  isLegal: (card: Card) => boolean,
) {
  return instanceIds.find((instanceId) => {
    if (unavailableInstanceIds.has(instanceId)) {
      return false;
    }

    return isLegal(cardFor(snapshot, instanceId));
  });
}

function isMainDeckCard(card: Card) {
  return (
    card.classification.type === "Gear" ||
    card.classification.type === "Spell" ||
    card.classification.type === "Unit"
  );
}

function sourceIds(
  snapshot: DeckSnapshot,
  source: DeckSnapshot["instances"][number]["source"],
) {
  return snapshot.instances
    .filter((instance) => instance.source === source)
    .map((instance) => instance.instanceId);
}

function requireInstanceByName(
  snapshot: DeckSnapshot,
  source: DeckSnapshot["instances"][number]["source"],
  name: string,
) {
  const instance = snapshot.instances.find(
    (candidate) => candidate.source === source && candidate.card.name === name,
  );

  if (!instance) {
    throw new Error(`Fixture deck is missing ${source} card "${name}".`);
  }

  return instance.instanceId;
}

function cardFor(snapshot: DeckSnapshot, instanceId: string) {
  const instance = snapshot.instances.find(
    (candidate) => candidate.instanceId === instanceId,
  );

  if (!instance) {
    throw new Error(`Fixture deck is missing instance "${instanceId}".`);
  }

  return instance.card;
}
