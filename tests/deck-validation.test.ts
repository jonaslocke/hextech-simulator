import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { loadCardCatalog, cardSchema, type CardCatalog } from "../src/server/catalog";
import { validateDeckList } from "../src/server/deck";

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

async function ornnSourceName() {
  const names = await readdir(deckDirectory);
  const name = names.find((candidate) => candidate.startsWith("Ornn,"));
  assert.ok(name, "the permanent Ornn deck source must exist");
  return name;
}

test("validates every permanent deck source through the shared pipeline", async () => {
  const catalog = await permanentCatalog();
  const permanentDecks = [
    ["annie", "annie.dec.txt"],
    ["lux", "lux.dec.txt"],
    ["master-yi", "masteryi.dec.txt"],
    ["garen", "garen.dec.txt"],
    ["ornn", await ornnSourceName()],
  ] as const;
  for (const [ownerId, filename] of permanentDecks) {
    const result = validateDeckList(await loadDeck(filename), catalog, { ownerId });
    assert.equal(result.ok, true, `${ownerId}: ${JSON.stringify(result.issues, null, 2)}`);
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
