import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { cardSetFileSchema, type Card } from "./schemas";

const CANONICAL_PRINTING_PREFERENCES = new Map([
  ["Lux, Crownguard", "OGS-014/024"],
]);

export type CardCatalog = {
  cards: Card[];
  byName: Map<string, Card>;
  /** Preferred standard printing when multiple entries share a gameplay identity. */
  canonicalByName?: Map<string, Card>;
  byPublicCode: Map<string, Card>;
  setFiles: string[];
  versionHash: string;
};

export async function loadCardCatalog(): Promise<CardCatalog> {
  const directory = path.join(process.cwd(), "data", "sets");
  const setFiles = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  const cardsByCode = new Map((await Promise.all(setFiles.map(async (filename) =>
    cardSetFileSchema.parse(JSON.parse(await readFile(path.join(directory, filename), "utf8"))),
  ))).flat().map((card) => [card.public_code, card] as const));
  const cards = [...cardsByCode.values()];
  const cardsByName = new Map<string, Card[]>();
  for (const card of cards) {
    cardsByName.set(card.name, [...(cardsByName.get(card.name) ?? []), card]);
  }

  const canonicalByName = new Map<string, Card>();
  for (const [name, printings] of cardsByName) {
    const identities = new Set(printings.map(cardIdentitySignature));
    if (identities.size !== 1) continue;
    const standardPrintings = printings.filter(isStandardPrinting);
    canonicalByName.set(
      name,
      (standardPrintings.length > 0 ? standardPrintings : printings)[0]!,
    );
  }
  for (const [name, publicCode] of CANONICAL_PRINTING_PREFERENCES) {
    const preferred = cardsByCode.get(publicCode);
    if (!preferred || preferred.name !== name) {
      throw new Error(`Canonical printing preference is not present in local set data: ${name}.`);
    }
    canonicalByName.set(name, preferred);
  }
  const byName = new Map(canonicalByName);
  for (const card of cards) if (!byName.has(card.name)) byName.set(card.name, card);
  const byPublicCode = new Map(cards.map((card) => [card.public_code, card]));

  return {
    cards,
    byName,
    byPublicCode,
    canonicalByName,
    setFiles,
    versionHash: createHash("sha256").update(JSON.stringify(cards)).digest("hex"),
  };
}

export function requireCardByName(catalog: CardCatalog, name: string): Card {
  const card = catalog.byName.get(name);

  if (!card) {
    throw new Error(`Unknown card: ${name}`);
  }

  return card;
}

function isStandardPrinting(card: Card) {
  return (
    !card.metadata.alternate_art &&
    !card.metadata.overnumbered &&
    !card.metadata.signature
  );
}

function cardIdentitySignature(card: Card) {
  return JSON.stringify({
    type: card.classification.type,
    supertype: card.classification.supertype,
    domain: card.classification.domain,
    attributes: card.attributes,
    text: card.text.plain === "[NO TEXT]" ? "" : card.text.plain,
    tags: card.tags,
    signature: card.metadata.signature === true,
  });
}
