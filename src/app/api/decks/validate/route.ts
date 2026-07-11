import { NextResponse } from "next/server";
import { deckValidationRequestSchema } from "@/shared/deck-validation";
import { getMongoDatabase } from "@/server/db";
import { validateRegisteredDeckCandidate } from "@/server/deck/deck-validation-service";
import { createGameRepositories } from "@/server/game";

export async function POST(request: Request) {
  const parsed = deckValidationRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_payload",
          message: "Deck validation payload is malformed.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const db = await getMongoDatabase();
    const repositories = createGameRepositories(db);
    const deckSnapshotId = deriveDeckSnapshotId(parsed.data);
    const registeredDeck = await repositories.deckSnapshots.findById(
      deckSnapshotId,
    );

    if (!registeredDeck) {
      return NextResponse.json(
        {
          error: {
            code: "deck.notFound",
            message: "Registered deck snapshot was not found.",
          },
        },
        { status: 404 },
      );
    }

    return NextResponse.json(
      validateRegisteredDeckCandidate({
        registeredDeck,
        request: parsed.data,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "deck.validationFailed",
          message:
            error instanceof Error ? error.message : "Deck validation failed.",
        },
      },
      { status: 400 },
    );
  }
}

function deriveDeckSnapshotId(request: {
  deck: { legendRegisteredCardId: string };
}) {
  const [matchId, playerId] = request.deck.legendRegisteredCardId.split(":");
  if (!matchId || !playerId) {
    throw new Error("Registered card identity does not identify a match deck.");
  }

  return `${matchId}:deck:${playerId}`;
}
