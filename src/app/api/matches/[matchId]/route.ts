import { NextResponse } from "next/server";
import type { Card } from "@/server/catalog";
import { createRepositories, getMongoDatabase, type Repositories } from "@/server/db";
import { projectGameEventsForPlayer } from "@/server/events";
import { projectGameForPlayer, verifyPlayerToken, type CardLookup } from "@/server/match";

export async function GET(
  request: Request,
  context: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await context.params;
  const url = new URL(request.url);
  const playerToken = url.searchParams.get("playerToken");

  if (!playerToken) {
    return NextResponse.json(
      {
        accepted: false,
        error: {
          code: "invalid_payload",
          message: "playerToken query parameter is required."
        }
      },
      { status: 400 }
    );
  }

  const db = await getMongoDatabase();
  const repositories = createRepositories(db);
  const match = await repositories.matches.findById(matchId);

  if (!match) {
    return NextResponse.json(
      {
        accepted: false,
        error: {
          code: "match_not_found",
          message: "Match was not found."
        }
      },
      { status: 404 }
    );
  }

  const seat = match.playerSeats.find((candidate) =>
    verifyPlayerToken(playerToken, candidate.tokenHash)
  );

  if (!seat) {
    return NextResponse.json(
      {
        accepted: false,
        error: {
          code: "invalid_player_token",
          message: "Player token is invalid for this match."
        }
      },
      { status: 403 }
    );
  }

  if (!match.currentGameId) {
    return NextResponse.json(
      {
        accepted: false,
        error: {
          code: "game_not_found",
          message: "Match does not have a current game."
        }
      },
      { status: 404 }
    );
  }

  const game = await repositories.games.findById(match.currentGameId);

  if (!game) {
    return NextResponse.json(
      {
        accepted: false,
        error: {
          code: "game_not_found",
          message: "Game was not found for this match."
        }
      },
      { status: 404 }
    );
  }

  const cardsByInstanceId = await loadCardsByInstanceIdForMatch(
    repositories,
    match
  );
  const events = await repositories.gameEvents.findByGameId(game.id);

  return NextResponse.json({
    accepted: true,
    matchId: match.id,
    gameId: game.id,
    projection: projectGameForPlayer(game, seat.playerId, cardsByInstanceId),
    cardsByInstanceId,
    logEntries: projectGameEventsForPlayer(events, seat.playerId)
  });
}

async function loadCardsByInstanceIdForMatch(
  repositories: Pick<Repositories, "deckSnapshots">,
  match: Awaited<ReturnType<Repositories["matches"]["findById"]>>
): Promise<CardLookup> {
  if (!match) {
    return {};
  }

  const deckSnapshots = await Promise.all(
    match.playerSeats.map((seat) =>
      seat.deckSnapshotId
        ? repositories.deckSnapshots.findById(seat.deckSnapshotId)
        : Promise.resolve(null)
    )
  );

  return Object.fromEntries(
    deckSnapshots.flatMap((document) =>
      document?.snapshot.instances.map((instance) => [
        instance.instanceId,
        instance.card
      ]) ?? []
    )
  ) satisfies Record<string, Card>;
}
