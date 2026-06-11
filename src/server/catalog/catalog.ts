import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { cardSetFileSchema, type Card } from "./schemas";

export type CardCatalog = {
  cards: Card[];
  byName: Map<string, Card>;
  byPublicCode: Map<string, Card>;
  versionHash: string;
};

export async function loadCardCatalog(
  setsDir = path.join(process.cwd(), "data", "sets")
): Promise<CardCatalog> {
  const filenames = (await readdir(setsDir))
    .filter((filename) => filename.endsWith(".json"))
    .sort();

  const cards: Card[] = [];
  const hash = createHash("sha256");

  for (const filename of filenames) {
    const fullPath = path.join(setsDir, filename);
    const raw = await readFile(fullPath, "utf8");
    hash.update(filename);
    hash.update(raw);

    const parsed = cardSetFileSchema.parse(JSON.parse(raw));
    cards.push(...parsed);
  }

  const byName = new Map<string, Card>();
  const byPublicCode = new Map<string, Card>();

  for (const card of cards) {
    if (!byName.has(card.name)) {
      byName.set(card.name, card);
    }

    byPublicCode.set(card.public_code, card);
  }

  return {
    cards,
    byName,
    byPublicCode,
    versionHash: hash.digest("hex")
  };
}

export function requireCardByName(catalog: CardCatalog, name: string): Card {
  const card = catalog.byName.get(name);

  if (!card) {
    throw new Error(`Unknown card: ${name}`);
  }

  return card;
}
