import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadCardCatalog, cardSetFileSchema } from "../src/server/catalog";
import { parseDeckList } from "../src/server/deck";

const DECK_PATHS = [
  path.join("data", "decks", "lux.dec.txt"),
  path.join("data", "decks", "annie.dec.txt"),
] as const;
const OUTPUT_PATH = path.join("data", "catalog", "mvp.json");
const EXPECTED_CARD_COUNT = 39;

const catalog = await loadCardCatalog();
const names: string[] = [];
for (const deckPath of DECK_PATHS) {
  const deck = parseDeckList(await readFile(deckPath, "utf8"));
  for (const entry of deck.entries) {
    if (!names.includes(entry.name)) names.push(entry.name);
  }
}

const cards = names.map((name) => {
  const card = catalog.byName.get(name);
  if (!card) throw new Error(`MVP card is missing from the local catalog: ${name}`);
  return card;
});
cardSetFileSchema.parse(cards);
const codes = cards.map((card) => card.public_code.split("/")[0]!);
if (cards.length !== EXPECTED_CARD_COUNT || new Set(codes).size !== cards.length) {
  throw new Error(
    `MVP catalog must contain ${EXPECTED_CARD_COUNT} unique canonical cards; found ${cards.length}.`,
  );
}

const output = `${JSON.stringify(cards, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const current = await readFile(OUTPUT_PATH, "utf8").catch(() => "");
  if (current !== output) {
    throw new Error(`${OUTPUT_PATH} is not synchronized. Run npm run catalog:build-mvp.`);
  }
} else {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, output, "utf8");
}

