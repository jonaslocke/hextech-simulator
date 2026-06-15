import { NextResponse } from "next/server";
import { loadCardCatalog } from "@/server/catalog";
import { createRepositories, getMongoDatabase } from "@/server/db";
import {
  createFixedDeckMatch,
  fixedDeckMatchRequestSchema,
  listFixedDeckOptions
} from "@/server/match/fixed-deck-match-service";

export async function GET() {
  return NextResponse.json({
    deckOptions: listFixedDeckOptions()
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = fixedDeckMatchRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        accepted: false,
        error: {
          code: "invalid_payload",
          message: "Match creation payload is malformed."
        }
      },
      { status: 400 }
    );
  }

  const db = await getMongoDatabase();
  const repositories = createRepositories(db);
  const catalog = await loadCardCatalog();
  const result = await createFixedDeckMatch(repositories, {
    ...parsed.data,
    catalog
  });

  return NextResponse.json(
    {
      accepted: true,
      matchId: result.match.id,
      gameId: result.game.id,
      gameStatus: result.game.status,
      stateVersion: result.game.stateVersion,
      players: result.players,
      projections: result.projections,
      cardsByInstanceId: result.cardsByInstanceId,
      logEntries: result.logEntries
    },
    { status: 201 }
  );
}
