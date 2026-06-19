import { readFile } from "node:fs/promises";
import path from "node:path";
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
    bundledSet?: string;
    cards?: unknown;
    uploadedFileName?: string;
  };

  if (body.bundledSet) {
    const cards = await readBundledSet(body.bundledSet);

    return {
      cards,
      uploadedFileName: `${body.bundledSet}.json`
    };
  }

  if (body.cards) {
    return {
      cards: cardSetFileSchema.parse(body.cards),
      uploadedFileName: body.uploadedFileName ?? "uploaded-set.json"
    };
  }

  throw new Error("Expected multipart file, bundledSet, or cards payload.");
}

export async function readBundledSet(setCode: string): Promise<Card[]> {
  const filename =
    setCode === "all" ? null : `${setCode.toLowerCase().replace(/\.json$/, "")}.json`;

  if (filename === null) {
    const sets = await Promise.all(["ogn", "ogs", "sfd"].map((set) => readBundledSet(set)));
    return sets.flat();
  }

  const filePath = path.join(process.cwd(), "data", "sets", filename);
  const raw = await readFile(filePath, "utf8");

  return parseCardsJson(raw);
}

function parseCardsJson(raw: string): Card[] {
  return cardSetFileSchema.parse(JSON.parse(raw));
}

