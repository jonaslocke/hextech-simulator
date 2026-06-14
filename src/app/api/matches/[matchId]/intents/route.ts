import { NextResponse } from "next/server";
import { createRepositories, getMongoDatabase } from "@/server/db";
import { handleMatchIntent } from "@/server/match";
import { matchIntentRequestBodySchema } from "@/shared/intents";

export async function POST(
  request: Request,
  context: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await context.params;
  const body = await request.json();
  const parsed = matchIntentRequestBodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        accepted: false,
        error: {
          code: "invalid_payload",
          message: "Intent request payload is malformed."
        }
      },
      { status: 400 }
    );
  }

  const db = await getMongoDatabase();
  const repositories = createRepositories(db);
  const result = await handleMatchIntent(repositories, {
    ...parsed.data,
    matchId
  });

  return NextResponse.json(result, { status: result.accepted ? 200 : 400 });
}
