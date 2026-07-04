import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { cardSetFileSchema } from "../src/server/catalog";
import { parseDeckList } from "../src/server/deck";

test("combined MVP upload contains every Lux and Annie card exactly once", async () => {
  const cards = cardSetFileSchema.parse(
    JSON.parse(await readFile("data/catalog/mvp.json", "utf8")),
  );
  const names = new Set(cards.map((card) => card.name));
  const codes = cards.map((card) => card.public_code.split("/")[0]!);

  assert.equal(cards.length, 39);
  assert.equal(new Set(codes).size, 39);
  for (const deckPath of [
    "data/decks/lux.dec.txt",
    "data/decks/annie.dec.txt",
  ]) {
    const deck = parseDeckList(await readFile(deckPath, "utf8"));
    for (const entry of deck.entries) {
      assert.ok(names.has(entry.name), `${entry.name} is missing from MVP upload`);
    }
  }
});

