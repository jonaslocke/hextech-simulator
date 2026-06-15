import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  generateAnonymousPlayerToken,
  type AnonymousPlayerToken
} from "./tokens";

export * from "./game";
export * from "./intent-service";
export * from "./payment";
export * from "./projections";
export * from "./setup-service";
export * from "./tokens";

export const matchFormats = ["best-of-3"] as const;
export const matchStatuses = ["setup_pending", "ready", "in_progress", "complete"] as const;
export const playerSeatIds = ["player-1", "player-2"] as const;

export const playerSeatSchema = z.object({
  playerId: z.string().min(1),
  seat: z.enum(playerSeatIds),
  tokenHash: z.string().min(1),
  deckSnapshotId: z.string().min(1).nullable()
});

export const matchSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  format: z.enum(matchFormats),
  status: z.enum(matchStatuses),
  playerSeats: z.tuple([playerSeatSchema, playerSeatSchema]),
  currentGameId: z.string().min(1).nullable(),
  gameIds: z.array(z.string().min(1)),
  matchScore: z.record(z.string().min(1), z.number().int().min(0)),
  winnerPlayerId: z.string().min(1).nullable()
});

export type MatchFormat = (typeof matchFormats)[number];
export type MatchStatus = (typeof matchStatuses)[number];
export type PlayerSeatId = (typeof playerSeatIds)[number];
export type PlayerSeat = z.infer<typeof playerSeatSchema>;
export type Match = z.infer<typeof matchSchema>;

export type CreatePlayerSeatInput = {
  playerId?: string;
  seat: PlayerSeatId;
  tokenHash: string;
  deckSnapshotId?: string | null;
};

export type CreateBestOfThreeMatchInput = {
  id?: string;
  now?: string;
  playerSeats: [CreatePlayerSeatInput, CreatePlayerSeatInput];
};

export type CreateAnonymousPlayerSeatInput = Omit<CreatePlayerSeatInput, "tokenHash">;

export type AnonymousPlayerSeat = {
  seat: PlayerSeat;
  token: AnonymousPlayerToken["token"];
};

export function createPlayerSeat(input: CreatePlayerSeatInput): PlayerSeat {
  return playerSeatSchema.parse({
    playerId: input.playerId ?? randomUUID(),
    seat: input.seat,
    tokenHash: input.tokenHash,
    deckSnapshotId: input.deckSnapshotId ?? null
  });
}

export function createAnonymousPlayerSeat(
  input: CreateAnonymousPlayerSeatInput
): AnonymousPlayerSeat {
  const token = generateAnonymousPlayerToken();

  return {
    seat: createPlayerSeat({
      ...input,
      tokenHash: token.tokenHash
    }),
    token: token.token
  };
}

export function createBestOfThreeMatch(input: CreateBestOfThreeMatchInput): Match {
  const now = input.now ?? new Date().toISOString();
  const playerSeats = input.playerSeats.map((seat) =>
    createPlayerSeat(seat)
  ) as [PlayerSeat, PlayerSeat];

  assertDistinctSeats(playerSeats);

  return matchSchema.parse({
    id: input.id ?? randomUUID(),
    createdAt: now,
    updatedAt: now,
    format: "best-of-3",
    status: "setup_pending",
    playerSeats,
    currentGameId: null,
    gameIds: [],
    matchScore: {
      [playerSeats[0].playerId]: 0,
      [playerSeats[1].playerId]: 0
    },
    winnerPlayerId: null
  });
}

function assertDistinctSeats(playerSeats: [PlayerSeat, PlayerSeat]) {
  if (playerSeats[0].seat === playerSeats[1].seat) {
    throw new Error("A match must contain one player-1 seat and one player-2 seat.");
  }

  if (playerSeats[0].playerId === playerSeats[1].playerId) {
    throw new Error("A match cannot use the same playerId for both seats.");
  }
}
