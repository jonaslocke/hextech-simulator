import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Card, CardCatalog } from "../catalog";
import type { Repositories } from "../db";
import {
  persistDeckSnapshot,
  validateDeckList,
  type DeckSnapshot
} from "../deck";
import { projectGameEventsForPlayer, type GameLogEntry } from "../events";
import {
  createAnonymousPlayerSeat,
  createBestOfThreeMatch,
  matchSchema,
  type Match
} from ".";
import {
  createGame,
  type CardLookup,
  type Game
} from "./game";
import { projectGameForPlayer, type GameProjection } from "./projections";

export const fixedDeckIds = ["annie", "lux"] as const;

export const fixedDeckMatchRequestSchema = z.object({
  playerDecks: z.object({
    player1: z.enum(fixedDeckIds),
    player2: z.enum(fixedDeckIds)
  }),
  rngSeed: z.string().min(1).optional()
});

export type FixedDeckId = (typeof fixedDeckIds)[number];
export type FixedDeckMatchRequest = z.infer<typeof fixedDeckMatchRequestSchema>;

export type FixedDeckOption = {
  id: FixedDeckId;
  label: string;
};

export type CreateFixedDeckMatchInput = FixedDeckMatchRequest & {
  catalog: CardCatalog;
  matchId?: string;
  now?: string;
};

export type CreatedFixedDeckPlayer = {
  playerId: string;
  seat: "player-1" | "player-2";
  deckId: FixedDeckId;
  playerToken: string;
};

export type CreateFixedDeckMatchResult = {
  match: Match;
  game: Game;
  players: {
    player1: CreatedFixedDeckPlayer;
    player2: CreatedFixedDeckPlayer;
  };
  cardsByInstanceId: CardLookup;
  projections: Record<string, GameProjection>;
  logEntries: Record<string, GameLogEntry[]>;
};

const fixedDeckOptions = {
  annie: {
    id: "annie",
    label: "Annie",
    filename: "annie.dec.txt"
  },
  lux: {
    id: "lux",
    label: "Lux",
    filename: "lux.dec.txt"
  }
} satisfies Record<FixedDeckId, FixedDeckOption & { filename: string }>;

const playerOneId = "player-1";
const playerTwoId = "player-2";

export function listFixedDeckOptions(): FixedDeckOption[] {
  return fixedDeckIds.map((id) => ({
    id,
    label: fixedDeckOptions[id].label
  }));
}

export async function createFixedDeckMatch(
  repositories: Repositories,
  input: CreateFixedDeckMatchInput
): Promise<CreateFixedDeckMatchResult> {
  const now = input.now ?? new Date().toISOString();
  const matchId = input.matchId ?? randomUUID();
  const gameId = `${matchId}:game:1`;
  const rngSeed = input.rngSeed ?? matchId;

  const player1Snapshot = await loadAndValidateFixedDeck({
    catalog: input.catalog,
    deckId: input.playerDecks.player1,
    ownerId: playerOneId
  });
  const player2Snapshot = await loadAndValidateFixedDeck({
    catalog: input.catalog,
    deckId: input.playerDecks.player2,
    ownerId: playerTwoId
  });
  const player1Deck = await persistDeckSnapshot(repositories.deckSnapshots, {
    snapshot: player1Snapshot,
    playerId: playerOneId,
    matchId,
    now: new Date(now)
  });
  const player2Deck = await persistDeckSnapshot(repositories.deckSnapshots, {
    snapshot: player2Snapshot,
    playerId: playerTwoId,
    matchId,
    now: new Date(now)
  });
  const player1Seat = createAnonymousPlayerSeat({
    playerId: playerOneId,
    seat: "player-1",
    deckSnapshotId: player1Deck.id
  });
  const player2Seat = createAnonymousPlayerSeat({
    playerId: playerTwoId,
    seat: "player-2",
    deckSnapshotId: player2Deck.id
  });
  let match = matchSchema.parse({
    ...createBestOfThreeMatch({
      id: matchId,
      now,
      playerSeats: [player1Seat.seat, player2Seat.seat]
    }),
    currentGameId: gameId,
    gameIds: [gameId]
  });
  const initialGame = createGame({
    id: gameId,
    now,
    matchId,
    gameNumber: 1,
    playerIds: [playerOneId, playerTwoId],
    rngSeed,
    battlefieldCardInstanceIdsByPlayer: {
      [playerOneId]: findInstanceIds(player1Snapshot, "battlefield"),
      [playerTwoId]: findInstanceIds(player2Snapshot, "battlefield")
    },
    mainDeckCardInstanceIdsByPlayer: {
      [playerOneId]: findInstanceIds(player1Snapshot, "mainDeck"),
      [playerTwoId]: findInstanceIds(player2Snapshot, "mainDeck")
    },
    runeDeckCardInstanceIdsByPlayer: {
      [playerOneId]: findInstanceIds(player1Snapshot, "runeDeck"),
      [playerTwoId]: findInstanceIds(player2Snapshot, "runeDeck")
    }
  });

  await repositories.matches.upsert(match);
  await repositories.games.upsert(initialGame);

  const game = initialGame;
  const events = await repositories.gameEvents.findByGameId(gameId);
  match = (await repositories.matches.findById(matchId)) ?? match;

  const cardsByInstanceId = createCardsByInstanceId(
    player1Snapshot,
    player2Snapshot
  );

  return {
    match,
    game,
    players: {
      player1: {
        playerId: playerOneId,
        seat: "player-1",
        deckId: input.playerDecks.player1,
        playerToken: player1Seat.token
      },
      player2: {
        playerId: playerTwoId,
        seat: "player-2",
        deckId: input.playerDecks.player2,
        playerToken: player2Seat.token
      }
    },
    cardsByInstanceId,
    projections: {
      [playerOneId]: projectGameForPlayer(game, playerOneId, cardsByInstanceId),
      [playerTwoId]: projectGameForPlayer(game, playerTwoId, cardsByInstanceId)
    },
    logEntries: {
      [playerOneId]: projectGameEventsForPlayer(events, playerOneId),
      [playerTwoId]: projectGameEventsForPlayer(events, playerTwoId)
    }
  };
}

async function loadAndValidateFixedDeck({
  catalog,
  deckId,
  ownerId
}: {
  catalog: CardCatalog;
  deckId: FixedDeckId;
  ownerId: string;
}): Promise<DeckSnapshot> {
  const sourceText = await readFile(
    path.join(process.cwd(), "data", "decks", fixedDeckOptions[deckId].filename),
    "utf8"
  );
  const result = validateDeckList(sourceText, catalog, {
    ownerId
  });

  if (!result.ok) {
    throw new Error(
      `${fixedDeckOptions[deckId].label} deck is invalid: ${result.issues
        .map((issue) => issue.message)
        .join("; ")}`
    );
  }

  return result.snapshot;
}

function findInstanceIds(
  snapshot: DeckSnapshot,
  source: DeckSnapshot["instances"][number]["source"]
): string[] {
  return snapshot.instances
    .filter((instance) => instance.source === source)
    .map((instance) => instance.instanceId);
}

function createCardsByInstanceId(...snapshots: DeckSnapshot[]): CardLookup {
  return Object.fromEntries(
    snapshots.flatMap((snapshot) =>
      snapshot.instances.map((instance) => [instance.instanceId, instance.card])
    )
  ) satisfies Record<string, Card>;
}
