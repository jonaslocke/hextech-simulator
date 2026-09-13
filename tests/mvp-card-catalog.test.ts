import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { cardSetFileSchema } from "../src/server/catalog";
import { parseDeckList, resolveDeckCard } from "../src/server/deck";

test("combined MVP upload contains every playable deck card exactly once", async () => {
  const cards = cardSetFileSchema.parse(
    JSON.parse(await readFile("data/catalog/mvp.json", "utf8")),
  );
  const byName = new Map(cards.map((card) => [card.name, card]));
  const codes = cards.map((card) => card.public_code.split("/")[0]!);

  assert.equal(cards.length, 83);
  assert.equal(new Set(codes).size, 83);
  for (const deckPath of [
    "data/decks/lux.dec.txt",
    "data/decks/annie.dec.txt",
    "data/decks/masteryi.dec.txt",
    "data/decks/Ornn, Fire Below the Mountain , a deck by MICE TheMаnLаnd.txt",
  ]) {
    const deck = parseDeckList(await readFile(deckPath, "utf8"));
    for (const entry of deck.entries) {
      assert.ok(
        resolveDeckCard({ byName }, entry.name),
        `${entry.name} is missing from MVP upload`,
      );
    }
  }
});
