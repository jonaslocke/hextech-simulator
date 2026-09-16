import { NextResponse } from "next/server";
import { deckValidationRequestSchema } from "@/shared/deck-validation";
import { getMongoClient, getMongoDatabaseName } from "@/server/db";
import {
  loadRegisteredDeckReadiness, validateDeckText, validateRegisteredDeckCandidate,
} from "@/server/deck/deck-validation-service";
import { createGameRepositories } from "@/server/game/repositories";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return invalidPayload();
  }
  const parsed = deckValidationRequestSchema.safeParse(payload);
  if (!parsed.success) return invalidPayload();

  try {
    if (parsed.data.input === "text") {
      return NextResponse.json(await validateDeckText({
        loadDatabase: readOnlyDatabase, sourceText: parsed.data.sourceText,
      }));
    }

    const [matchId, playerId] = parsed.data.deck.legendRegisteredCardId.split(":");
    if (!matchId || !playerId) return invalidPayload();
    const db = await readOnlyDatabase();
    const registeredDeck = await createGameRepositories(db).deckSnapshots.findById(
      `${matchId}:deck:${playerId}`,
    );
    if (!registeredDeck) {
      return NextResponse.json({
        error: { code: "deck.notFound", message: "Registered deck snapshot was not found." },
      }, { status: 404 });
    }
    const readinessReasons = await loadRegisteredDeckReadiness(db, registeredDeck);
    return NextResponse.json(validateRegisteredDeckCandidate({
      registeredDeck, request: parsed.data, readinessReasons,
    }));
  } catch {
    return NextResponse.json({
      error: {
        code: "deck.validationUnavailable",
        message: "Deck validation is temporarily unavailable. Please retry.",
      },
    }, { status: 503 });
  }
}

async function readOnlyDatabase() {
  // Validation performs reads only, including on an uninitialized database.
  return (await getMongoClient()).db(getMongoDatabaseName());
}

function invalidPayload() {
  return NextResponse.json({
    error: { code: "invalid_payload", message: "Deck validation payload is malformed." },
  }, { status: 400 });
}
