import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { loadCardCatalog } from "../src/server/catalog";
import { validateDeckConstruction } from "../src/server/deck";

test("validates the normalized Garen ingestion deck against local set data", async () => {
  const catalog = await loadCardCatalog();
  const result = validateDeckConstruction(
    await readFile(path.join(process.cwd(), "data", "decks", "garen.dec.txt"), "utf8"),
    catalog,
    { ownerId: "garen" },
  );

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  if (!result.ok) return;

  assert.equal(result.snapshot.legend.name, "Garen, Might of Demacia - Starter");
  assert.equal(result.snapshot.legend.card.name, "Might of Demacia - Starter");
  assert.equal(result.snapshot.champion.name, "Garen, Rugged");
  assert.equal(result.snapshot.instances.length, 56);
});
