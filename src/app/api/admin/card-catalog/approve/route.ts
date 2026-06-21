import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  approvedCardBehaviorInputSchema,
  saveApprovedCardBehavior
} from "@/server/card-catalog";
import { getMongoDatabase } from "@/server/db";

export async function POST(request: Request) {
  try {
    const input = approvedCardBehaviorInputSchema.parse(await request.json());
    const db = await getMongoDatabase();
    const behavior = await saveApprovedCardBehavior(db, input);

    return NextResponse.json({
      accepted: true,
      behavior: {
        cardCode: behavior.cardCode,
        schemaVersion: behavior.schemaVersion,
        status: behavior.status,
        sourceTextHash: behavior.sourceTextHash,
        updatedAt: behavior.updatedAt
      }
    });
  } catch (caught) {
    if (caught instanceof ZodError) {
      return NextResponse.json(
        {
          accepted: false,
          error: {
            code: "invalid_approval_payload",
            message: "Approved behavior payload is malformed.",
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
