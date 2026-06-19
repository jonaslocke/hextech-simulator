import { NextResponse } from "next/server";
import {
  CardCatalogImportPreviewError,
  createMongoCardValidationLookup,
  previewCardCatalogImport
} from "@/server/card-catalog";
import { getMongoDatabase } from "@/server/db";

export async function POST(request: Request) {
  try {
    const upload = await readUploadRequest(request);
    const db = await getMongoDatabase();
    const preview = await previewCardCatalogImport({
      ...upload,
      existingCardLookup: createMongoCardValidationLookup(db)
    });

    return NextResponse.json({
      accepted: true,
      preview
    });
  } catch (caught) {
    if (caught instanceof CardCatalogImportPreviewError) {
      return NextResponse.json(
        {
          accepted: false,
          error: {
            code: caught.code,
            message: caught.message,
            details: caught.details
          }
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        accepted: false,
        error: {
          code: "preview_failed",
          message:
            caught instanceof Error
              ? caught.message
              : "Unable to preview uploaded card catalog."
        }
      },
      { status: 500 }
    );
  }
}

async function readUploadRequest(request: Request): Promise<{
  sourceLabel: string;
  rawJson: string;
}> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new CardCatalogImportPreviewError(
        "Upload must include a JSON file.",
        "invalid_card_set"
      );
    }

    return {
      sourceLabel: file.name || "uploaded-card-set.json",
      rawJson: await file.text()
    };
  }

  const body = (await request.json()) as {
    sourceLabel?: unknown;
    rawJson?: unknown;
  };

  if (typeof body.rawJson !== "string") {
    throw new CardCatalogImportPreviewError(
      "Request must include rawJson.",
      "invalid_json"
    );
  }

  return {
    sourceLabel:
      typeof body.sourceLabel === "string" && body.sourceLabel.trim().length > 0
        ? body.sourceLabel
        : "uploaded-card-set.json",
    rawJson: body.rawJson
  };
}
