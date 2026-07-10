import { NextResponse } from "next/server";
import { matchIntentRequestSchema } from "@/shared/game";
import { getMongoDatabase } from "@/server/db";
import { createGameRepositories, MatchServiceError, performMatchAction } from "@/server/game";

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  const parsed = matchIntentRequestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ accepted: false, error: { code: "invalid_payload", message: "Intent payload is malformed." } }, { status: 400 });
  try {
    const db = await getMongoDatabase();
    const projection = await performMatchAction(createGameRepositories(db), {
      db,
      matchId: (await context.params).matchId,
      playerToken: parsed.data.playerToken,
      stateVersion: parsed.data.stateVersion,
      intent: parsed.data.intent,
    });
    return NextResponse.json({ accepted: true, projection });
  } catch (error) {
    return NextResponse.json(
      {
        accepted: false,
        error: {
          code:
            error instanceof MatchServiceError
              ? error.code
              : "action_rejected",
          message:
            error instanceof Error ? error.message : "Action was rejected.",
        },
      },
      { status: 400 },
    );
  }
}
