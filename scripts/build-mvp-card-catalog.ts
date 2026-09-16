import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { cardSetFileSchema, loadCardCatalog, type Card } from "../src/server/catalog";
import { parseDeckList, resolveDeckCard } from "../src/server/deck";
import { deriveCardCodeFromCard } from "../src/server/card-catalog/identity";

const DECK_PATHS = [
  path.join("data", "decks", "lux.dec.txt"),
  path.join("data", "decks", "annie.dec.txt"),
  path.join("data", "decks", "masteryi.dec.txt"),
  path.join(
    "data",
    "decks",
    "Ornn, Fire Below the Mountain , a deck by MICE TheMаnLаnd.txt",
  ),
] as const;
const OUTPUT_PATH = path.join("data", "catalog", "mvp.json");
const GENERATED_OUTPUT_PATH = path.join(
  "src",
  "server",
  "catalog",
  "fixed-mvp-cards.generated.ts",
);

const setFiles = (await readdir(path.join("data", "sets")))
  .filter((name) => name.endsWith(".json"))
  .sort();
const sourceCards = (
  await Promise.all(
    setFiles.map(async (name) =>
      cardSetFileSchema.parse(
        JSON.parse(await readFile(path.join("data", "sets", name), "utf8")),
      ),
    ),
  )
).flat();
const byName = new Map<string, Card>();
for (const card of sourceCards) {
  const current = byName.get(card.name);
  if (!current || (current.metadata.alternate_art && !card.metadata.alternate_art)) {
    byName.set(card.name, card);
  }
}
const maintainedCatalog = await loadCardCatalog();
const canonicalByName = new Map(sourceCards.flatMap((card) =>
  maintainedCatalog.byName.get(card.name)?.public_code === card.public_code
    ? [[card.name, card] as const] : [],
));
const cardsByCode = new Map<string, Card>();
for (const deckPath of DECK_PATHS) {
  const deck = parseDeckList(await readFile(deckPath, "utf8"));
  for (const entry of deck.entries) {
    const card = resolveDeckCard({ byName, canonicalByName, cards: sourceCards }, entry);
    if (!card) throw new Error(`MVP card is missing or ambiguous in the local catalog: ${entry.name}`);
    cardsByCode.set(deriveCardCodeFromCard(card), card);
  }
}

const cards = [...cardsByCode.values()];
cardSetFileSchema.parse(cards);
const codes = cards.map((card) => card.public_code.split("/")[0]!);
if (new Set(codes).size !== cards.length) {
  throw new Error(
    `MVP catalog must contain one source definition per deck card; found ${cards.length} entries with ${new Set(codes).size} codes.`,
  );
}

const output = `${JSON.stringify(cards, null, 2)}\n`;
const generatedOutput =
  `import type { Card } from "./schemas";\n\n` +
  `export const fixedMvpCards = ${JSON.stringify(cards, null, 2)} satisfies Card[];\n`;
if (process.argv.includes("--check")) {
  const current = await readFile(OUTPUT_PATH, "utf8").catch(() => "");
  const currentGenerated = await readFile(GENERATED_OUTPUT_PATH, "utf8").catch(
    () => "",
  );
  if (
    normalizeLineEndings(current) !== output ||
    normalizeLineEndings(currentGenerated) !== generatedOutput
  ) {
    throw new Error(`${OUTPUT_PATH} is not synchronized. Run npm run catalog:build-mvp.`);
  }
} else {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, output, "utf8");
  await writeFile(GENERATED_OUTPUT_PATH, generatedOutput, "utf8");
}

function normalizeLineEndings(value: string) {
  return value.replaceAll("\r\n", "\n");
}
