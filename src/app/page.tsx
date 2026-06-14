import {
  loadCardCatalog,
  requireCardByName,
  type Card,
} from "@/server/catalog";
import { gameEventTypes, projectGameEventsForPlayer } from "@/server/events";
import { createGame, gameSchema, projectGameForPlayer } from "@/server/match";
import { GameBoard } from "../../features/game-board";
import { GameObject } from "../../features/game-board/types";
import { ComponentProps } from "react";
import { BattlefieldBoard } from "../../features/game-board/components/battlefield-board";

const EMPERORS_DAIS = {
  name: "Emperor's Dais",
  description:
    "When you conquer here, you may pay [1] and return a unit you control here to its owner's hand. If you do, play a 2 [Might] Sand Soldier unit token here.",
  opponentUnits: [],
  playerUnits: [],
  img: "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/c1ea4f6f58a62fc2b62647aa3459109e3d10297a-1039x744.png",
} as ComponentProps<typeof BattlefieldBoard>["battlefield"];

const ASPIRANTS_CLIMB = {
  name: "Aspirant's Climb",
  description: "Increase the points needed to win the game by 1.",
  opponentUnits: [],
  playerUnits: [],
  img: "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/9301593f3800e68427469d38181b578a672473c3-1038x744.png",
} as ComponentProps<typeof BattlefieldBoard>["battlefield"];

const GAME_OBJECT = {
  opponent: {
    name: "Alanzq1",
    score: 0,
    battlefield: EMPERORS_DAIS,
  },
  player: {
    name: "Prismaticician",
    score: 1,
    battlefield: ASPIRANTS_CLIMB,
  },
} as GameObject;

export default async function Home() {
  const catalog = await loadCardCatalog();
  const cardsByInstanceId = createFixtureCards(catalog);
  const baseGame = createGame({
    id: "ui-game-1",
    matchId: "ui-match-1",
    gameNumber: 1,
    playerIds: ["player-a", "player-b"],
    rngSeed: "ui-fixture-seed",
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
      showdown: {
        battlefieldId: "battlefield-a",
        relevantPlayerIds: ["player-a", "player-b"],
        focusPlayerId: "player-a",
        priorityPlayerId: "player-a",
        passedPlayerIds: [],
      },
      battlefields: [
        {
          battlefieldId: "battlefield-a",
          selectedByPlayerId: "player-a",
          cardInstanceId: "player-a-battlefield",
          units: ["player-a-unit-1"],
          facedownSlot: null,
        },
        {
          battlefieldId: "battlefield-b",
          selectedByPlayerId: "player-b",
          cardInstanceId: "player-b-battlefield",
          units: ["player-b-unit-1"],
          facedownSlot: null,
        },
      ],
      players: {
        "player-a": {
          playerId: "player-a",
          zones: {
            legend: "player-a-legend",
            champion: "player-a-champion",
            mainDeck: ["player-a-main-1", "player-a-main-2", "player-a-main-3"],
            runeDeck: ["player-a-rune-deck-1", "player-a-rune-deck-2"],
            hand: [
              "player-a-hand-1",
              "player-a-hand-2",
              "player-a-hand-3",
              "player-a-hand-4",
            ],
            trash: [],
            banishment: [],
            base: ["player-a-rune-1", "player-a-rune-2", "player-a-unit-2"],
          },
        },
        "player-b": {
          playerId: "player-b",
          zones: {
            legend: "player-b-legend",
            champion: "player-b-champion",
            mainDeck: ["player-b-main-1", "player-b-main-2"],
            runeDeck: ["player-b-rune-deck-1"],
            hand: ["player-b-hand-1", "player-b-hand-2", "player-b-hand-3"],
            trash: [],
            banishment: [],
            base: ["player-b-rune-1", "player-b-unit-2"],
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
              unitCardInstanceId: "player-a-unit-1",
              battlefieldId: "battlefield-a",
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

  return <GameBoard {...GAME_OBJECT} />;
}

function createFixtureCards(
  catalog: Awaited<ReturnType<typeof loadCardCatalog>>,
) {
  const cards = {
    annieChampion: requireCardByName(catalog, "Annie, Stubborn"),
    annieLegend: requireCardByName(catalog, "Dark Child - Starter"),
    chaosRune: requireCardByName(catalog, "Chaos Rune"),
    furyRune: requireCardByName(catalog, "Fury Rune"),
    gust: requireCardByName(catalog, "Gust"),
    incinerate: requireCardByName(catalog, "Incinerate"),
    luxChampion: requireCardByName(catalog, "Lux, Crownguard"),
    luxLegend: requireCardByName(catalog, "Lady of Luminosity - Starter"),
    morbidReturn: requireCardByName(catalog, "Morbid Return"),
    mysticPoro: requireCardByName(catalog, "Mystic Poro"),
    obelisk: requireCardByName(catalog, "Obelisk of Power"),
    reaversRow: requireCardByName(catalog, "Reaver's Row"),
    sneakyDeckhand: requireCardByName(catalog, "Sneaky Deckhand"),
  };

  return {
    "player-a-battlefield": cards.obelisk,
    "player-a-champion": cards.annieChampion,
    "player-a-hand-1": cards.gust,
    "player-a-hand-2": cards.incinerate,
    "player-a-hand-3": cards.morbidReturn,
    "player-a-hand-4": cards.sneakyDeckhand,
    "player-a-legend": cards.annieLegend,
    "player-a-rune-1": cards.furyRune,
    "player-a-rune-2": cards.chaosRune,
    "player-a-unit-1": cards.mysticPoro,
    "player-a-unit-2": cards.sneakyDeckhand,
    "player-b-battlefield": cards.reaversRow,
    "player-b-champion": cards.luxChampion,
    "player-b-legend": cards.luxLegend,
    "player-b-rune-1": cards.chaosRune,
    "player-b-unit-1": cards.luxChampion,
    "player-b-unit-2": cards.mysticPoro,
  } satisfies Record<string, Card>;
}
