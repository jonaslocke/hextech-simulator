import { NextResponse } from "next/server";
import { createMatchRequestSchema } from "@/shared/game";
import { getMongoDatabase } from "@/server/db";
import {
  createGameRepositories,
  createMatch,
} from "@/server/game";
import {
  DeckCatalogUnavailableError,
  getPlayableDeckOptions,
} from "@/server/services/deck-catalog-service";

export async function GET() {
  try {
    const db = await getMongoDatabase();
    return NextResponse.json({
      deckOptions: await getPlayableDeckOptions(db),
    });
  } catch (error) {
    if (error instanceof DeckCatalogUnavailableError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: 503 },
      );
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const parsed = createMatchRequestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ accepted: false, error: { code: "invalid_payload", message: "Match creation payload is malformed." } }, { status: 400 });
  try {
    const db = await getMongoDatabase();
    const result = await createMatch({
      db,
      repositories: createGameRepositories(db),
      rngSeed: parsed.data.rngSeed,
      playerDecks: parsed.data.playerDecks,
    });
    return NextResponse.json({ accepted: true, ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ accepted: false, error: { code: "match_creation_failed", message: error instanceof Error ? error.message : "Unable to create match." } }, { status: 409 });
  }
}
