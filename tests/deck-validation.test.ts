import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { loadCardCatalog, cardSchema, type CardCatalog } from "../src/server/catalog";
import { validateDeckList } from "../src/server/deck";
import { CORE_DECK_IDS, PERMANENT_DECK_DEFINITIONS } from "../src/server/game/deck-definition";

const deckDirectory = path.join(process.cwd(), "data", "decks");

async function loadDeck(filename: string) {
  return readFile(path.join(deckDirectory, filename), "utf8");
}

async function permanentCatalog(): Promise<CardCatalog> {
  const mvp = await loadCardCatalog();
  const setDirectory = path.join(process.cwd(), "data", "sets");
  const setCards = (await Promise.all(
    (await readdir(setDirectory)).map(async (filename) =>
      cardSchema.array().parse(JSON.parse(await readFile(path.join(setDirectory, filename), "utf8"))),
    ),
  )).flat();
  const cards = [...mvp.cards, ...setCards.filter((card) => !mvp.byPublicCode.has(card.public_code))];
  return {
    ...mvp,
    cards,
    byName: new Map(cards.map((card) => [card.name, card])),
    byPublicCode: new Map(cards.map((card) => [card.public_code, card])),
  };
}

test("validates every permanent deck source through the shared pipeline", async () => {
  assert.deepEqual(
    CORE_DECK_IDS,
    PERMANENT_DECK_DEFINITIONS.map(({ id }) => id),
    "the validation corpus is the production permanent-deck registry",
  );
  const catalog = await permanentCatalog();
  for (const definition of PERMANENT_DECK_DEFINITIONS) {
    const source = await readFile(
      path.join(process.cwd(), definition.sourcePath),
      "utf8",
    );
    const result = validateDeckList(source, catalog, { ownerId: definition.id });
    assert.equal(result.ok, true, `${definition.id}: ${JSON.stringify(result.issues, null, 2)}`);
  }
});

test("accepts the official Rune Pool heading", async () => {
  const source = (await loadDeck("annie.dec.txt")).replace("Runes:", "Rune Pool:");
  const result = validateDeckList(source, await permanentCatalog());
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  if (result.ok) assert.equal(result.snapshot.runes.reduce((total, entry) => total + entry.quantity, 0), 12);
});

test("rejects malformed section headings and unknown cards", async () => {
  const catalog = await permanentCatalog();
  const source = await loadDeck("annie.dec.txt");
  assert.equal(validateDeckList(source.replace("MainDeck:", "Main Deck:"), catalog).issues[0]?.code, "deck.parse");
  const unknown = validateDeckList(source.replace("3 Gust", "3 Missing Card"), catalog);
  assert.equal(unknown.issues.some((issue) => issue.code === "deck.unknownCard"), true);
});

test("rejects a Champion that does not match the Legend tag", async () => {
  const catalog = await permanentCatalog();
  const source = (await loadDeck("annie.dec.txt")).replace("1 Annie, Stubborn", "1 Lux, Crownguard");
  const result = validateDeckList(source, catalog);
  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.code === "deck.championTag"), true);
});
