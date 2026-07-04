import { NextResponse } from "next/server";
import { createMatchRequestSchema } from "@/shared/game";
import { getMongoDatabase } from "@/server/db";
import {
  createGameRepositories,
  createMatch,
  DECK_IDS,
  loadDeckSnapshot,
} from "@/server/game";

export async function GET() {
  const db = await getMongoDatabase();
  const availability = await Promise.all(
    DECK_IDS.map(async (id) => {
      try {
        await loadDeckSnapshot(db, id);
        return { id, label: id === "lux" ? "Lux" : "Annie" };
      } catch {
        return null;
      }
    }),
  );
  return NextResponse.json({
    deckOptions: availability.filter(
      (option): option is NonNullable<typeof option> => option !== null,
    ),
  });
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
