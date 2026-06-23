import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  canonicalCardPublicationInputSchema,
  loadBehaviorDefinitions,
  publishCanonicalCard
} from "@/server/card-catalog";
import { getMongoDatabase } from "@/server/db";

export async function POST(request: Request) {
  try {
    const input = canonicalCardPublicationInputSchema.parse(await request.json());
    const db = await getMongoDatabase();
    const behaviorCatalog = await loadBehaviorDefinitions(db);
    const canonicalCard = await publishCanonicalCard(
      db,
      input,
      undefined,
      behaviorCatalog
    );

    return NextResponse.json({
      accepted: true,
      behavior: {
        cardCode: canonicalCard.cardCode,
        modelingStatus: canonicalCard.modelingStatus,
        runtimeSupportStatus: canonicalCard.runtimeSupportStatus,
        sourceTextHash: canonicalCard.sourceTextHash,
        updatedAt: canonicalCard.updatedAt
      }
    });
  } catch (caught) {
    if (caught instanceof ZodError) {
      return NextResponse.json(
        {
          accepted: false,
          error: {
            code: "invalid_approval_payload",
            message: "Canonical card publication payload is malformed.",
            details: caught.issues.slice(0, 12).map((issue) => issue.message)
          }
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        accepted: false,
        error: {
          code: "approval_failed",
          message:
            caught instanceof Error
              ? caught.message
              : "Unable to persist approved card behavior."
        }
      },
      { status: 500 }
    );
  }
}
