import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { loadSourceCardCatalog, type CardCatalog } from "../src/server/catalog";
import { parseDeckList, validateDeckConstruction } from "../src/server/deck";
import { CORE_DECK_IDS, PERMANENT_DECK_DEFINITIONS } from "../src/server/game/deck-definition";

const deckDirectory = path.join(process.cwd(), "data", "decks");

async function loadDeck(filename: string) {
  return readFile(path.join(deckDirectory, filename), "utf8");
}

async function permanentCatalog(): Promise<CardCatalog> { return loadSourceCardCatalog(); }

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
    const result = validateDeckConstruction(source, catalog, { ownerId: definition.id });
    assert.equal(result.ok, true, `${definition.id}: ${JSON.stringify(result.issues, null, 2)}`);
  }
});

test("the Hidden manual deck is a legal Ornn derivative with one exact 3-copy substitution", async () => {
  const original = await loadDeck("Ornn, Fire Below the Mountain , a deck by MICE TheMаnLаnd.txt");
  const derived = await loadDeck("ornn-hidden-test.dec.txt");
  assert.equal(derived, original.replace(/^3 Poro Snax$/m, "3 Consult the Past"));
  const sourceList = parseDeckList(original);
  const hiddenList = parseDeckList(derived);
  assert.equal(sourceList.entries.find((entry) => entry.name === "Poro Snax")?.quantity, 3);
  assert.equal(hiddenList.entries.find((entry) => entry.name === "Poro Snax"), undefined);
  assert.equal(hiddenList.entries.find((entry) => entry.name === "Consult the Past")?.quantity, 3);
  const sourceCount = sourceList.entries.filter((entry) => entry.section === "MainDeck").reduce((total, entry) => total + entry.quantity, 0);
  const hiddenCount = hiddenList.entries.filter((entry) => entry.section === "MainDeck").reduce((total, entry) => total + entry.quantity, 0);
  assert.equal(hiddenCount, sourceCount);
  const validation = validateDeckConstruction(derived, await permanentCatalog(), { ownerId: "ornn-hidden-test" });
  assert.equal(validation.ok, true, JSON.stringify(validation.issues, null, 2));
  assert.equal(PERMANENT_DECK_DEFINITIONS.find((definition) => definition.id === "ornn-hidden-test")?.sourcePath, "data/decks/ornn-hidden-test.dec.txt");
});

test("accepts the official Rune Pool heading", async () => {
  const source = (await loadDeck("annie.dec.txt")).replace("Runes:", "Rune Pool:");
  const result = validateDeckConstruction(source, await permanentCatalog());
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  if (result.ok) assert.equal(result.snapshot.runes.reduce((total, entry) => total + entry.quantity, 0), 12);
});

test("rejects malformed section headings and unknown cards", async () => {
  const catalog = await permanentCatalog();
  const source = await loadDeck("annie.dec.txt");
  assert.equal(validateDeckConstruction(source.replace("MainDeck:", "Main Deck:"), catalog).issues[0]?.code, "deck.parse");
  const unknown = validateDeckConstruction(source.replace("3 Gust", "3 Missing Card"), catalog);
  assert.equal(unknown.issues.some((issue) => issue.code === "deck.unknownCard"), true);
});

test("rejects a Champion that does not match the Legend tag", async () => {
  const catalog = await permanentCatalog();
  const source = (await loadDeck("annie.dec.txt")).replace("1 Annie, Stubborn", "1 Lux, Crownguard");
  const result = validateDeckConstruction(source, catalog);
  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.code === "deck.championTag"), true);
});

test("counts Sideboard quantities against the common capacity", async () => {
  const catalog = await permanentCatalog();
  const template = catalog.byName.get("Gust")!;
  const extraCards = Array.from({ length: 4 }, (_, index) => ({
    ...template,
    name: `Validation reserve ${index}`,
    public_code: `TEST-${index.toString().padStart(3, "0")}`,
    metadata: {},
  }));
  for (const card of extraCards) {
    catalog.cards.push(card);
    catalog.byName.set(card.name, card);
    catalog.byPublicCode.set(card.public_code, card);
  }
  const source = `${await loadDeck("annie.dec.txt")}\nSideboard:\n${extraCards.map((card, index) => `${index === 3 ? 2 : 3} ${card.name}`).join("\n")}`;
  const result = validateDeckConstruction(source, catalog);
  assert.equal(result.issues.some((issue) => issue.code === "deck.sideboardSize"), true);
});

test("rejects a Main Deck above the tournament exact-40 requirement", async () => {
  const source = (await loadDeck("annie.dec.txt")).replace("2 Flash", "3 Flash");
  const result = validateDeckConstruction(source, await permanentCatalog());
  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.code === "deck.mainDeckSize"), true);
});
