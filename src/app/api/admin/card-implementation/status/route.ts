import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  CardImplementationStatusError,
  cardImplementationStatusUpdateSchema,
  updateCardImplementationStatus,
} from "@/server/services/card-implementation-status-service";

export async function POST(request: Request) {
  try {
    const input = cardImplementationStatusUpdateSchema.parse(await request.json());
    const result = await updateCardImplementationStatus(input);

    return NextResponse.json({
      accepted: true,
      ...result,
    });
  } catch (caught) {
    if (caught instanceof SyntaxError) {
      return NextResponse.json(
        {
          accepted: false,
          error: {
            code: "invalid_status_update_payload",
            message: "Request body must contain valid JSON.",
          },
        },
        { status: 400 },
      );
    }

    if (caught instanceof ZodError) {
      return NextResponse.json(
        {
          accepted: false,
          error: {
            code: "invalid_status_update_payload",
            message: "Card implementation status payload is malformed.",
            details: caught.issues.slice(0, 12).map((issue) => issue.message),
          },
        },
        { status: 400 },
      );
    }

    if (caught instanceof CardImplementationStatusError) {
      return NextResponse.json(
        {
          accepted: false,
          error: {
            code: caught.code,
            message: caught.message,
          },
        },
        { status: caught.httpStatus },
      );
    }

    return NextResponse.json(
      {
        accepted: false,
        error: {
          code: "status_update_failed",
          message: "Unable to update card implementation status.",
        },
      },
      { status: 500 },
    );
  }
}
