import { NextResponse } from "next/server";
import { gameV2IntentRequestSchema } from "@/shared/game-v2";
import { getMongoDatabase } from "@/server/db";
import { createGameV2Repositories, performMatchActionV2 } from "@/server/game-v2";

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  const parsed = gameV2IntentRequestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ accepted: false, error: { code: "invalid_payload", message: "Intent payload is malformed." } }, { status: 400 });
  try {
    const db = await getMongoDatabase();
    const projection = await performMatchActionV2(createGameV2Repositories(db), {
      matchId: (await context.params).matchId, playerToken: parsed.data.playerToken,
      stateVersion: parsed.data.stateVersion, actionId: parsed.data.intent.payload.actionId,
      selectedIds: parsed.data.intent.payload.selectedIds
    });
    return NextResponse.json({ accepted: true, projection });
  } catch (error) {
    return NextResponse.json({ accepted: false, error: { code: "action_rejected", message: error instanceof Error ? error.message : "Action was rejected." } }, { status: 400 });
  }
}

