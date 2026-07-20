import { NextResponse } from "next/server";
import { getMongoDatabase } from "@/server/db";
import {
  createGameRepositories,
  createGameplayDebugBundle,
} from "@/server/game";

export async function GET(
  request: Request,
  context: { params: Promise<{ matchId: string }> },
) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { accepted: false, error: { code: "not_found", message: "Not found." } },
      { status: 404 },
    );
  }

  const playerToken = new URL(request.url).searchParams.get("playerToken");
  if (!playerToken) {
    return NextResponse.json(
      {
        accepted: false,
        error: { code: "invalid_payload", message: "playerToken is required." },
      },
      { status: 400 },
    );
  }

  try {
    const repositories = createGameRepositories(await getMongoDatabase());
    const bundle = await createGameplayDebugBundle(repositories, {
      matchId: (await context.params).matchId,
      playerToken,
    });
    return NextResponse.json({ accepted: true, bundle });
  } catch (error) {
    return NextResponse.json(
      {
        accepted: false,
        error: {
          code: "debug_bundle_failed",
          message:
            error instanceof Error
              ? error.message
              : "Unable to create debug bundle.",
        },
      },
      { status: 404 },
    );
  }
}
