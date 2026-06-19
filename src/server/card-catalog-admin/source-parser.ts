import { cardSetFileSchema, type Card } from "../catalog";

export async function parseCardSetRequest(request: Request): Promise<{
  cards: Card[];
  uploadedFileName: string;
}> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new Error("A JSON file field named `file` is required.");
    }

    return {
      cards: parseCardsJson(await file.text()),
      uploadedFileName: file.name
    };
  }

  const body = (await request.json()) as {
    cards?: unknown;
    uploadedFileName?: string;
  };

  if (body.cards) {
    return {
      cards: cardSetFileSchema.parse(body.cards),
      uploadedFileName: body.uploadedFileName ?? "uploaded-set.json"
    };
  }

  throw new Error("Expected multipart file or cards payload.");
}

function parseCardsJson(raw: string): Card[] {
  return cardSetFileSchema.parse(JSON.parse(raw));
}
