import { NextResponse } from "next/server";
import { gameIntentRequestSchema } from "@/shared/game";
import { getMongoDatabase } from "@/server/db";
import { createGameRepositories, performMatchAction } from "@/server/game";

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  const parsed = gameIntentRequestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ accepted: false, error: { code: "invalid_payload", message: "Intent payload is malformed." } }, { status: 400 });
  try {
    const db = await getMongoDatabase();
    const projection = await performMatchAction(createGameRepositories(db), {
      matchId: (await context.params).matchId, playerToken: parsed.data.playerToken,
      stateVersion: parsed.data.stateVersion, actionId: parsed.data.intent.payload.actionId,
      selectedIds: parsed.data.intent.payload.selectedIds
    });
    return NextResponse.json({ accepted: true, projection });
  } catch (error) {
    return NextResponse.json({ accepted: false, error: { code: "action_rejected", message: error instanceof Error ? error.message : "Action was rejected." } }, { status: 400 });
  }
}
