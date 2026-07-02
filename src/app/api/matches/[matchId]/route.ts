import { NextResponse } from "next/server";
import { getMongoDatabase } from "@/server/db";
import { createGameRepositories, getViewerState } from "@/server/game";

export async function GET(request: Request, context: { params: Promise<{ matchId: string }> }) {
  const token = new URL(request.url).searchParams.get("playerToken");
  if (!token) return NextResponse.json({ accepted: false, error: { code: "invalid_payload", message: "playerToken is required." } }, { status: 400 });
  try {
    const db = await getMongoDatabase();
    const projection = await getViewerState(createGameRepositories(db), (await context.params).matchId, token);
    return NextResponse.json({ accepted: true, projection });
  } catch (error) {
    return NextResponse.json({ accepted: false, error: { code: "viewer_state_failed", message: error instanceof Error ? error.message : "Unable to load match." } }, { status: 404 });
  }
}
