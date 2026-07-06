import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { cardSetFileSchema, type Card } from "../src/server/catalog";
import { parseDeckList } from "../src/server/deck";

const DECK_PATHS = [
  path.join("data", "decks", "lux.dec.txt"),
  path.join("data", "decks", "annie.dec.txt"),
  path.join("data", "decks", "masteryi.dec.txt"),
] as const;
const OUTPUT_PATH = path.join("data", "catalog", "mvp.json");
const GENERATED_OUTPUT_PATH = path.join(
  "src",
  "server",
  "catalog",
  "fixed-mvp-cards.generated.ts",
);
const EXPECTED_CARD_COUNT = 57;

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
const names: string[] = [];
for (const deckPath of DECK_PATHS) {
  const deck = parseDeckList(await readFile(deckPath, "utf8"));
  for (const entry of deck.entries) {
    if (!names.includes(entry.name)) names.push(entry.name);
  }
}

const cards = names.map((name) => {
  const card = byName.get(name);
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
const generatedOutput =
  `import type { Card } from "./schemas";\n\n` +
  `export const fixedMvpCards = ${JSON.stringify(cards, null, 2)} satisfies Card[];\n`;
if (process.argv.includes("--check")) {
  const current = await readFile(OUTPUT_PATH, "utf8").catch(() => "");
  const currentGenerated = await readFile(GENERATED_OUTPUT_PATH, "utf8").catch(
    () => "",
  );
  if (current !== output || currentGenerated !== generatedOutput) {
    throw new Error(`${OUTPUT_PATH} is not synchronized. Run npm run catalog:build-mvp.`);
  }
} else {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, output, "utf8");
  await writeFile(GENERATED_OUTPUT_PATH, generatedOutput, "utf8");
}
