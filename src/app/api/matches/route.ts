import { NextResponse } from "next/server";
import { createMatchRequestSchema } from "@/shared/game";
import { getMongoDatabase } from "@/server/db";
import { createGameRepositories, createMatch } from "@/server/game";

export function GET() { return NextResponse.json({ deckOptions: [{ id: "lux", label: "Lux" }] }); }

export async function POST(request: Request) {
  const parsed = createMatchRequestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ accepted: false, error: { code: "invalid_payload", message: "Match creation payload is malformed." } }, { status: 400 });
  try {
    const db = await getMongoDatabase();
    const result = await createMatch({ db, repositories: createGameRepositories(db), rngSeed: parsed.data.rngSeed });
    return NextResponse.json({ accepted: true, ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ accepted: false, error: { code: "match_creation_failed", message: error instanceof Error ? error.message : "Unable to create match." } }, { status: 409 });
  }
}
